/** Capture a document sheet (`.quote-sheet`) as a real PDF and hand it
 * to WhatsApp through the most capable channel the browser offers:
 *
 * 1. Web Share API with a file  → OS share sheet (Android/iOS); the
 *    user picks WhatsApp and the PDF arrives in the chat.
 * 2. Fallback (no file sharing) → the PDF is downloaded, then WhatsApp
 *    opens with the cover message so the file can be attached.
 * 3. Last resort (capture failed) → WhatsApp opens with the message only.
 *
 * `wa.me` links cannot carry attachments, so option 1 is the only way
 * to deliver a file straight into WhatsApp from a web app.
 */

import { snapdom } from "@zumer/snapdom";
import { toast } from "sonner";
import { buildPdfFromJpeg } from "./pdf";

/** Turns an external logo URL into a data URL so snapdom can render it without
 * cross-origin restrictions. Same-origin fetch succeeds; cross-origin without
 * CORS falls back to the original URL (capture then shows the usual placeholder). */
async function logoToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: "force-cache", mode: "cors" });
  if (!res.ok) return url;
  const blob = await res.blob();
  if (!blob.type || !blob.type.startsWith("image/")) return url;
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const u8 = new Uint8Array(buffer);
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  const mime = blob.type.startsWith("jpeg") ? "jpeg" : "png";
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Inject a logo <img> at the top-left of the sheet (for sheets that render
 * no logo at all). Absolute positioning keeps it out of the flow. */
function injectLogo(sheet: HTMLElement, src: string): HTMLImageElement {
  const logo = document.createElement("img");
  logo.alt = "Company logo";
  logo.src = src;
  logo.className =
    "absolute top-2 left-2 max-w-[96px] max-h-[56px] rounded-md object-contain";
  sheet.appendChild(logo);
  return logo;
}

/** Prepare the sheet's logo for reliable snapdom capture. If the sheet already
 * contains a logo image whose source matches `logoUrl`, swap its src to a data
 * URL (so the clone can be rasterised without CORS); otherwise inject a logo at
 * the top-left. Returns the elements whose src must be restored/removed on
 * cleanup. */
async function prepareSheetLogo(
  sheet: HTMLElement,
  logoUrl: string,
): Promise<{
  changedSrc: HTMLImageElement | null;
  originalSrc: string | null;
  injectedLogo: HTMLImageElement | null;
}> {
  const imgs = Array.from(sheet.querySelectorAll("img"));
  const logoImg = imgs.find(
    (img) => img.getAttribute("src") === logoUrl || img.src === logoUrl,
  );
  if (logoImg) {
    const dataUrl = await logoToDataUrl(logoUrl);
    logoImg.src = dataUrl;
    return { changedSrc: logoImg, originalSrc: logoUrl, injectedLogo: null };
  }
  const injectedLogo = injectLogo(sheet, logoUrl);
  return { changedSrc: null, originalSrc: null, injectedLogo };
}

/** Rasterises a DOM node into a single-page PDF blob (A4 width). When a
 * `logoUrl` is provided it is prepared for reliable capture (data URL) before
 * snapdom runs; otherwise the sheet's own logo is relied on. */
export async function documentToPdfBlob(
  sheet: HTMLElement,
  logoUrl?: string,
): Promise<Blob> {
  let changedSrc: HTMLImageElement | null = null;
  let originalSrc: string | null = null;
  let injectedLogo: HTMLImageElement | null = null;

  if (logoUrl && logoUrl.length > 0) {
    const prepared = await prepareSheetLogo(sheet, logoUrl);
    changedSrc = prepared.changedSrc;
    originalSrc = prepared.originalSrc;
    injectedLogo = prepared.injectedLogo;
  }

  try {
    const capture = await snapdom(sheet, {
      scale: 2,
      dpr: 1,
      backgroundColor: "#ffffff",
    });
    const captured = await capture.toBlob({ type: "jpeg", quality: 0.92 });
    if (captured.size === 0) throw new Error("Empty capture.");

    const bitmap = await createImageBitmap(captured);
    try {
      const pixelWidth = bitmap.width;
      const pixelHeight = bitmap.height;
      if (pixelWidth < 2 || pixelHeight < 2) {
        throw new Error("Capture has no usable size.");
      }

      const probe = document.createElement("canvas");
      probe.width = 48;
      probe.height = 48;
      const probeCtx = probe.getContext("2d", { willReadFrequently: true });
      if (probeCtx) {
        probeCtx.drawImage(bitmap, 0, 0, 48, 48);
        const { data } = probeCtx.getImageData(0, 0, 48, 48);
        let min = 255;
        let max = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luminance =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (luminance < min) min = luminance;
          if (luminance > max) max = luminance;
        }
        if (max - min < 10) {
          throw new Error("Capture was blank.");
        }
      }

      let jpegBytes = new Uint8Array(await captured.arrayBuffer());
      if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
        const canvas = document.createElement("canvas");
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D unavailable.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pixelWidth, pixelHeight);
        ctx.drawImage(bitmap, 0, 0);
        const reencoded = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error("JPEG encode failed.")),
            "image/jpeg",
            0.92,
          );
        });
        jpegBytes = new Uint8Array(await reencoded.arrayBuffer());
        if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
          throw new Error("Could not produce JPEG bytes for the PDF.");
        }
      }

      const pdfBytes = buildPdfFromJpeg(jpegBytes, pixelWidth, pixelHeight);
      return new Blob([pdfBytes], { type: "application/pdf" });
    } finally {
      bitmap.close();
    }
  } finally {
    if (changedSrc && originalSrc != null) {
      changedSrc.src = originalSrc;
    }
    if (injectedLogo) {
      injectedLogo.remove();
    }
  }
}

/** Saves a blob to the user's downloads. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type WhatsAppShareOutcome =
  | "shared"
  | "cancelled"
  | "saved"
  | "message-only";

export async function shareDocumentOnWhatsApp({
  sheet,
  logoUrl,
  filename,
  text,
}: {
  sheet: HTMLElement | null;
  logoUrl?: string;
  filename: string;
  text: string;
}): Promise<WhatsAppShareOutcome> {
  let pdf: Blob | null = null;
  if (sheet) {
    try {
      pdf = await documentToPdfBlob(sheet, logoUrl);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Could not build the PDF — opening WhatsApp with the message only.");
    }
  }

  if (pdf) {
    const file = new File([pdf], filename, { type: "application/pdf" });
    const canShareFiles =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], text });
        return "shared";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return "cancelled";
        }
        console.error("Web Share failed:", err);
      }
    }

    downloadBlob(pdf, filename);
    toast.success(`PDF saved as ${filename} — attach it in the chat.`);
  }

  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
  return pdf ? "saved" : "message-only";
}
