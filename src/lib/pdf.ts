/**
 * Minimal, dependency-free PDF writer.
 *
 * Wraps a single JPEG (e.g. a rasterised document sheet) into a valid
 * single-page PDF whose page is A4-width and grows in height with the
 * image, so long documents are never cropped.
 *
 * The output is a standards-compliant PDF 1.4 file: header, five objects
 * (catalog, pages, page, image XObject, content stream), an xref table
 * with byte-exact offsets, and a trailer.
 */

/** A4 width in PostScript points (1/72 in). Page height follows the image. */
const A4_WIDTH_PT = 595.28;

const textEncoder = new TextEncoder();

/** Formats a number as a compact PDF numeric literal (max 2 decimals). */
function fmt(value: number): string {
  return value
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

/**
 * Builds a one-page PDF that displays `jpeg` filling a page of
 * A4 width scaled to the image's aspect ratio.
 *
 * @param jpeg       Raw JPEG bytes (image/jpeg).
 * @param pixelWidth  Image width in pixels.
 * @param pixelHeight Image height in pixels.
 * @returns The complete PDF file bytes.
 */
export function buildPdfFromJpeg(
  jpeg: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
): Uint8Array<ArrayBuffer> {
  if (jpeg.length === 0) throw new Error("Empty JPEG data.");
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0
  ) {
    throw new Error("Invalid image dimensions.");
  }

  const pageWidth = A4_WIDTH_PT;
  const pageHeight = Math.max(1, pixelHeight * (pageWidth / pixelWidth));

  const parts: Uint8Array[] = [];
  let length = 0;
  /** Byte offset of each object's header (1-based object numbers). */
  const offsets = [0, 0, 0, 0, 0, 0];

  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const beginObject = (objectNumber: number) => {
    offsets[objectNumber] = length;
    write(`${objectNumber} 0 obj\n`);
  };

  // Header + binary marker comment (signals binary-safe file).
  write("%PDF-1.4\n");
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog
  beginObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  beginObject(2);
  write("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // 3: Page — sized to the image aspect at A4 width.
  beginObject(3);
  write(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}] ` +
      "/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> " +
      "/Contents 5 0 R >>\nendobj\n",
  );

  // 4: Image XObject (JPEG bytes pass through via DCTDecode).
  beginObject(4);
  write(
    `<< /Type /XObject /Subtype /Image /Width ${Math.round(pixelWidth)} ` +
      `/Height ${Math.round(pixelHeight)} /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  write(jpeg);
  write("\nendstream\nendobj\n");

  // 5: Content stream — draw the image over the whole page.
  const content = `q\n${fmt(pageWidth)} 0 0 ${fmt(pageHeight)} 0 0 cm\n/Im0 Do\nQ\n`;
  beginObject(5);
  write(`<< /Length ${textEncoder.encode(content).length} >>\nstream\n`);
  write(content);
  write("endstream\nendobj\n");

  // Cross-reference table — each entry is exactly 20 bytes.
  const xrefOffset = length;
  write("xref\n0 6\n0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
    write(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }
  write(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const pdf = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    pdf.set(part, cursor);
    cursor += part.length;
  }
  return pdf;
}
