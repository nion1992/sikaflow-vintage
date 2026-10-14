/**
 * Money utilities for SikaFlow.
 *
 * Core rules:
 *  - Monetary values are stored as integer minor units (thebe/cents).
 *  - Financial calculations use a tiny explicit stack calculator (add/sub/mul/div)
 *    so arithmetic is auditable and never careless float math.
 *  - SZL formatting supports the "E" prefix used in Eswatini.
 */

import { z } from "zod";

/** Basis points per whole percent (100 bps = 1%). Mirrors convex/shared. */
export const BPS_PER_PERCENT = 100;

/* ── Calculator ──────────────────────────────────────────────────── */

/** A small integer-based stack calculator for exact financial math. */
export class Calculator {
  private stack: number[] = [];

  reset(): this {
    this.stack = [];
    return this;
  }

  push(value: number): this {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number: ${value}`);
    }
    this.stack.push(value);
    return this;
  }

  add(): number {
    const [b, a] = this.pop2();
    const result = a + b;
    this.stack.push(result);
    return result;
  }

  sub(): number {
    const [b, a] = this.pop2();
    const result = a - b;
    this.stack.push(result);
    return result;
  }

  mul(): number {
    const [b, a] = this.pop2();
    const result = a * b;
    this.stack.push(result);
    return result;
  }

  div(): number {
    const [b, a] = this.pop2();
    if (b === 0) throw new Error("Division by zero");
    const result = a / b;
    this.stack.push(result);
    return result;
  }

  result(): number {
    if (this.stack.length !== 1) {
      throw new Error("Calculator must end with exactly one value on the stack");
    }
    return this.stack[0];
  }

  private pop2(): [number, number] {
    if (this.stack.length < 2) throw new Error("Calculator underflow");
    const b = this.stack.pop() as number;
    const a = this.stack.pop() as number;
    return [b, a];
  }
}

/** Convenience: add a list of integer-cent amounts. */
export function sumCents(values: number[]): number {
  const calc = new Calculator();
  calc.push(0);
  for (const v of values) {
    calc.push(v);
    calc.add();
  }
  return calc.result();
}

/* ── Line-item math (all amounts in integer thebe/cents) ─────────── */

export interface LineTotals {
  /** qty * unitPrice, in thebe */
  lineSubtotal: number;
  /** discount amount, in thebe */
  discount: number;
  /** tax amount, in thebe */
  tax: number;
  /** lineSubtotal - discount + tax, in thebe */
  lineTotal: number;
}

/** Compute a single line's totals with integer math. */
export function computeLine(
  quantity: number,
  unitPriceCents: number,
  discountPercent: number,
  taxPercent: number,
): LineTotals {
  // Sanitize so a half-typed form (NaN/blank/negative) yields a zero line
  // instead of throwing — the live-totals memo must never crash the builder.
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const price =
    Number.isFinite(unitPriceCents) && unitPriceCents > 0
      ? Math.round(unitPriceCents)
      : 0;
  const disc =
    Number.isFinite(discountPercent) && discountPercent > 0
      ? discountPercent
      : 0;
  const taxPercentSafe =
    Number.isFinite(taxPercent) && taxPercent > 0 ? taxPercent : 0;

  const calc = new Calculator();

  // line subtotal = round(quantity * unitPriceCents)
  calc.push(qty);
  calc.push(price);
  const lineSubtotal = Math.round(calc.mul());
  calc.reset();

  // discount = round(lineSubtotal * discountPercent / 100)
  calc.push(lineSubtotal);
  calc.push(disc);
  const discount = Math.round(calc.mul() / 100);
  calc.reset();

  const taxable = lineSubtotal - discount;

  // tax = round(taxable * taxPercent / 100)
  calc.push(taxable);
  calc.push(taxPercentSafe);
  const taxCents = Math.round(calc.mul() / 100);
  calc.reset();

  return {
    lineSubtotal,
    discount,
    tax: taxCents,
    lineTotal: taxable + taxCents,
  };
}

export interface DocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: LineTotals[];
}

/** Compute full document totals from lines. */
export function computeTotals(
  lines: {
    quantity: number;
    unitPriceCents: number;
    discountPercent: number;
    taxPercent: number;
  }[],
): DocumentTotals {
  const lineResults = lines.map((l) =>
    computeLine(l.quantity, l.unitPriceCents, l.discountPercent, l.taxPercent),
  );
  const subtotal = sumCents(lineResults.map((r) => r.lineSubtotal));
  const discountTotal = sumCents(lineResults.map((r) => r.discount));
  const taxTotal = sumCents(lineResults.map((r) => r.tax));
  const grandTotal = sumCents(lineResults.map((r) => r.lineTotal));
  return { subtotal, discountTotal, taxTotal, grandTotal, lines: lineResults };
}

/* ── Formatting ──────────────────────────────────────────────────── */

const SZL_LOCALE = "en-SZ";

/** Format integer thebe/cents as an SZL currency string, e.g. "E1,250.50". */
export function formatMoney(cents: number, opts?: { compact?: boolean }): string {
  const major = cents / 100;
  if (opts?.compact && Number.isInteger(major)) {
    return `E${major.toLocaleString(SZL_LOCALE)}`;
  }
  return `E${major.toLocaleString(SZL_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse user input like "150" or "150.50" into integer thebe. */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim().replace(/^E\s*/i, "").replace(/,/g, "");
  if (!trimmed) return null;
  const match = /^\d+(\.\d{1,2})?$/.exec(trimmed);
  if (!match) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
}

/* ── Dates & numbers ─────────────────────────────────────────────── */

/** Sensible local date formatting: 12 Mar 2026. */
export function formatDate(value: number | Date): string {
  return new Date(value).toLocaleDateString(SZL_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Local date string for <input type="date"> (yyyy-mm-dd). */
export function toDateInputValue(value: number | Date): string {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse a yyyy-mm-dd input value to a UTC timestamp. */
export function fromDateInputValue(value: string): number {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return Date.now();
  return Date.UTC(y, m - 1, d);
}

/** Generate the next sequential document number, e.g. QT-2026-0007. */
export function generateDocNumber(
  prefix: "QT" | "INV" | "RCP",
  existing: string[],
): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix}-${year}-(\\d{4,})$`);
  let max = 0;
  for (const doc of existing) {
    const m = re.exec(doc);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

/* ── Validation helpers ──────────────────────────────────────────── */

export const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d+(\.\d{1,2})?$/, "Use a plain amount like 150 or 150.50")
  .refine((v) => parseMoneyToCents(v) !== null, "Invalid amount");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{7,18}$/, "Enter a valid phone number");

export const emailSchema = z.string().trim().email("Enter a valid email");
