/**
 * One-shot PWA icon generator — run with: bun scripts/generate-icons.ts
 * Rasterizes the SikaFlow archival seal (public/logo.svg) into PNGs with zero
 * image dependencies: SDF shapes + analytic anti-aliasing, PNG encoder with
 * node:zlib for IDAT compression. Safe to delete after generation.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// ── Palette (matches logo.svg) ────────────────────────────────────────────
const LEATHER = [143, 107, 66]; // #8F6B42 rim
const PAPER = [234, 224, 198]; // #EAE0C6 ground
const INK = [74, 54, 32]; // #4A3620 engraving
const BRASS = [176, 138, 90]; // #B08A5A flow & bar

// ── PNG encoding ──────────────────────────────────────────────────────────
let crcTable: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!table()) throw new Error("unreachable");
  function table() {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    return crcTable;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable![(c ^ buf[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = 1 + w * 4;
  const raw = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const total = sig.length + chunk("IHDR", ihdr).length + chunk("IDAT", idat).length + chunk("IEND", new Uint8Array(0)).length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

// ── Canvas with straight-alpha source-over blending ───────────────────────
class Canvas {
  w: number;
  h: number;
  private r: Float32Array;
  private g: Float32Array;
  private b: Float32Array;
  private a: Float32Array;

  constructor(size: number) {
    this.w = size;
    this.h = size;
    const n = size * size;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
  }

  /** sdf: negative inside. mode "fill" fills f<0; "stroke" outlines f=0. */
  draw(
    sdf: (x: number, y: number) => number,
    bounds: [number, number, number, number],
    color: number[],
    mode: "fill" | "stroke",
    strokeW = 0,
  ) {
    const [x0, y0, x1, y1] = [
      Math.max(0, Math.floor(bounds[0])),
      Math.max(0, Math.floor(bounds[1])),
      Math.min(this.w, Math.ceil(bounds[2])),
      Math.min(this.h, Math.ceil(bounds[3])),
    ];
    const half = mode === "stroke" ? strokeW / 2 : 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const f = sdf(x + 0.5, y + 0.5);
        const d = mode === "fill" ? f : Math.abs(f) - half;
        const cov = Math.min(1, Math.max(0, 0.5 - d));
        if (cov <= 0) continue;
        const i = y * this.w + x;
        const dstA = this.a[i];
        const outA = cov + dstA * (1 - cov);
        if (outA <= 0) continue;
        this.r[i] = (color[0] * cov + this.r[i] * dstA * (1 - cov)) / outA;
        this.g[i] = (color[1] * cov + this.g[i] * dstA * (1 - cov)) / outA;
        this.b[i] = (color[2] * cov + this.b[i] * dstA * (1 - cov)) / outA;
        this.a[i] = outA;
      }
    }
  }

  toRgba(): Uint8Array {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      out[i * 4] = Math.round(this.r[i]);
      out[i * 4 + 1] = Math.round(this.g[i]);
      out[i * 4 + 2] = Math.round(this.b[i]);
      out[i * 4 + 3] = Math.round(this.a[i] * 255);
    }
    return out;
  }
}

// ── SDF primitives ────────────────────────────────────────────────────────
const sdRoundRect =
  (cx: number, cy: number, hw: number, hh: number, r: number) =>
  (x: number, y: number) => {
    const qx = Math.abs(x - cx) - (hw - r);
    const qy = Math.abs(y - cy) - (hh - r);
    return (
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
      Math.min(Math.max(qx, qy), 0) -
      r
    );
  };

const sdSegment =
  (ax: number, ay: number, bx: number, by: number) =>
  (x: number, y: number) => {
    const pax = x - ax;
    const pay = y - ay;
    const bax = bx - ax;
    const bay = by - ay;
    const len2 = bax * bax + bay * bay || 1;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / len2));
    return Math.hypot(pax - bax * h, pay - bay * h);
  };

// ── Seal artwork ──────────────────────────────────────────────────────────
const FLOW: [number, number][] = [
  [256, 96],
  [306, 156],
  [216, 196],
  [262, 250],
  [300, 294],
  [328, 322],
  [322, 366],
];

type Variant = "any" | "maskable" | "minimal";

function paintSeal(size: number, variant: Variant): Uint8Array {
  const c = new Canvas(size);
  const baseR = variant === "maskable" ? 0 : (96 / 512) * size;
  c.draw(sdRoundRect(size / 2, size / 2, size / 2, size / 2, baseR), [0, 0, size, size], LEATHER, "fill");

  // Inner artwork scale: maskable keeps content inside the ~80% safe zone.
  const k = (size / 512) * (variant === "maskable" ? 0.62 : 1);
  const m = (p: number) => (p - 256) * k + size / 2;
  const box = (hw: number, hh: number, pad: number): [number, number, number, number] => [
    m(256 - hw) - pad,
    m(256 - hh) - pad,
    m(256 + hw) + pad,
    m(256 + hh) + pad,
  ];

  // Aged-paper ground + ink rim
  c.draw(sdRoundRect(m(256), m(256), 244 * k, 244 * k, 86 * k), box(244, 244, 2), PAPER, "fill");
  c.draw(sdRoundRect(m(256), m(256), 244 * k, 244 * k, 86 * k), box(244, 244, 8), INK, "stroke", 10 * k);

  // Dashed inner frame (rounded-cap dashes on each side)
  if (variant !== "minimal") {
    const hw = 212 * k;
    const r = 66 * k;
    const on = 18 * k;
    const off = 10 * k;
    const cx = m(256);
    const cy = m(256);
    const sides: [number, number, number, number][] = [
      [cx - hw + r, cy - hw, cx + hw - r, cy - hw],
      [cx + hw, cy - hw + r, cx + hw, cy + hw - r],
      [cx + hw - r, cy + hw, cx - hw + r, cy + hw],
      [cx - hw, cy + hw - r, cx - hw, cy - hw + r],
    ];
    for (const [ax, ay, bx, by] of sides) {
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d < len; d += on + off) {
        const t = Math.min(d + on, len);
        if (t <= d) break;
        const px = (p: number) => ax + (bx - ax) * (p / len);
        const py = (p: number) => ay + (by - ay) * (p / len);
        c.draw(
          sdSegment(px(d), py(d), px(t), py(t)),
          [
            Math.min(px(d), px(t)) - 4,
            Math.min(py(d), py(t)) - 4,
            Math.max(px(d), px(t)) + 4,
            Math.max(py(d), py(t)) + 4,
          ],
          BRASS,
          "stroke",
          4 * k,
        );
      }
    }

    // Flow line
    for (let i = 0; i < FLOW.length - 1; i++) {
      const [ax, ay] = FLOW[i];
      const [bx, by] = FLOW[i + 1];
      c.draw(
        sdSegment(m(ax), m(ay), m(bx), m(by)),
        [
          Math.min(m(ax), m(bx)) - 8 * k,
          Math.min(m(ay), m(by)) - 8 * k,
          Math.max(m(ax), m(bx)) + 8 * k,
          Math.max(m(ay), m(by)) + 8 * k,
        ],
        BRASS,
        "stroke",
        12 * k,
      );
    }
  }

  // Engraved "S" — a smooth sine-S, sampled as chained segments
  const N = 64;
  const sR = 60;
  const sCy = 230;
  const sH = 105;
  for (let i = 0; i < N - 1; i++) {
    const t0 = i / (N - 1);
    const t1 = (i + 1) / (N - 1);
    const pt = (t: number): [number, number] => [
      m(256 + sR * Math.sin(2 * Math.PI * t)),
      m(sCy - sH * (1 - 2 * t)),
    ];
    const [ax, ay] = pt(t0);
    const [bx, by] = pt(t1);
    c.draw(
      sdSegment(ax, ay, bx, by),
      [Math.min(ax, bx) - 20 * k, Math.min(ay, by) - 20 * k, Math.max(ax, bx) + 20 * k, Math.max(ay, by) + 20 * k],
      INK,
      "stroke",
      33 * k,
    );
  }

  // Underline bar
  c.draw(sdRoundRect(m(256), m(417), 106 * k, 7 * k, 7 * k), box(106, 7 + 8, 4), BRASS, "fill");

  return c.toRgba();
}

// ── Emit ──────────────────────────────────────────────────────────────────
mkdirSync("public/icons", { recursive: true });

const targets: [string, number, Variant][] = [
  ["public/icons/icon-192.png", 192, "any"],
  ["public/icons/icon-512.png", 512, "any"],
  ["public/icons/maskable-192.png", 192, "maskable"],
  ["public/icons/maskable-512.png", 512, "maskable"],
  ["public/apple-touch-icon.png", 180, "maskable"],
  ["public/favicon-32.png", 32, "minimal"],
];

for (const [path, size, variant] of targets) {
  const png = encodePng(size, size, paintSeal(size, variant));
  writeFileSync(path, png);
  console.log(`${path} — ${size}x${size} ${variant}, ${(png.length / 1024).toFixed(1)} KB`);
}
console.log("done");
