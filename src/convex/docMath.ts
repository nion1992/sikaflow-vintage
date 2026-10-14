import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { BPS_MAX } from "./shared";

/**
 * Shared document math for SikaFlow (quotations & invoices).
 *
 * Mirrors `src/lib/money.ts` — Convex functions only import inside the convex
 * folder, so the integer math lives here once and both document modules use it:
 *  - amounts are integer thebe; percentages are integer basis points
 *  - line total = round(qty × price) − discount + VAT, all rounding to thebe
 *
 * Totals are always recomputed server-side on write and snapshotted on the
 * document, so a document can never show a total that disagrees with its lines.
 */

export const MS_PER_DAY = 86_400_000;

/* ── Line math ───────────────────────────────────────────────────── */

export interface ComputedLine {
  lineSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  lineTotalCents: number;
}

export function computeLineTotals(
  quantity: number,
  unitPriceCents: number,
  discountBps: number,
  taxRateBps: number,
): ComputedLine {
  const lineSubtotalCents = Math.round(quantity * unitPriceCents);
  const discountCents = Math.round((lineSubtotalCents * discountBps) / BPS_MAX);
  const taxable = lineSubtotalCents - discountCents;
  const taxCents = Math.round((taxable * taxRateBps) / BPS_MAX);
  return {
    lineSubtotalCents,
    discountCents,
    taxCents,
    lineTotalCents: taxable + taxCents,
  };
}

/* ── Line validation ─────────────────────────────────────────────── */

export const lineInput = v.object({
  productId: v.optional(v.id("products")),
  name: v.string(),
  description: v.optional(v.string()),
  quantity: v.number(),
  unit: v.optional(v.string()),
  unitPriceCents: v.number(),
  discountBps: v.number(),
  taxRateBps: v.number(),
});

export interface RawLine {
  productId?: Id<"products">;
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPriceCents: number;
  discountBps: number;
  taxRateBps: number;
}

/** Validate one line and compute its cached totals. Throws on bad input. */
export function validateLine(line: RawLine): RawLine & ComputedLine {
  const name = line.name.trim();
  if (name.length < 2) {
    throw new Error("Every line needs a description (at least 2 characters).");
  }
  if (name.length > 150) {
    throw new Error("Line descriptions must be 150 characters or fewer.");
  }
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error(`Quantity must be greater than zero (line: ${name}).`);
  }
  if (line.quantity > 1_000_000) {
    throw new Error(`Quantity is too large (line: ${name}).`);
  }
  if (
    !Number.isInteger(line.unitPriceCents) ||
    line.unitPriceCents < 0 ||
    line.unitPriceCents > 900_000_000_00
  ) {
    throw new Error(`Enter a valid price for "${name}".`);
  }
  const discountBps = Math.round(line.discountBps);
  const taxRateBps = Math.round(line.taxRateBps);
  if (discountBps < 0 || discountBps > BPS_MAX) {
    throw new Error(`Discount for "${name}" must be between 0 and 100%.`);
  }
  if (taxRateBps < 0 || taxRateBps > BPS_MAX) {
    throw new Error(`VAT for "${name}" must be between 0 and 100%.`);
  }

  const totals = computeLineTotals(
    line.quantity,
    line.unitPriceCents,
    discountBps,
    taxRateBps,
  );

  return {
    productId: line.productId,
    name,
    description: line.description?.trim() || undefined,
    quantity: line.quantity,
    unit: line.unit?.trim() || undefined,
    unitPriceCents: line.unitPriceCents,
    discountBps,
    taxRateBps,
    ...totals,
  };
}

/** Validate a whole set of lines and roll up document totals. */
export function validateLines(
  lines: RawLine[],
  defaultTaxRateBps: number,
): { validated: (RawLine & ComputedLine)[]; docTotals: ComputedLine } {
  if (lines.length === 0) {
    throw new Error("Add at least one line to the document.");
  }
  const validated = lines.map((line) =>
    validateLine({ ...line, taxRateBps: line.taxRateBps ?? defaultTaxRateBps }),
  );

  const docTotals = validated.reduce(
    (acc, l) => ({
      lineSubtotalCents: acc.lineSubtotalCents + l.lineSubtotalCents,
      discountCents: acc.discountCents + l.discountCents,
      taxCents: acc.taxCents + l.taxCents,
      lineTotalCents: acc.lineTotalCents + l.lineTotalCents,
    }),
    { lineSubtotalCents: 0, discountCents: 0, taxCents: 0, lineTotalCents: 0 },
  );
  return { validated, docTotals };
}

/** Fields shared by every document totals snapshot. */
export interface TotalsPatch {
  subtotalCents: number;
  discountTotalCents: number;
  taxTotalCents: number;
  grandTotalCents: number;
}

export function totalsPatchFrom(docTotals: ComputedLine): TotalsPatch {
  return {
    subtotalCents: docTotals.lineSubtotalCents,
    discountTotalCents: docTotals.discountCents,
    taxTotalCents: docTotals.taxCents,
    grandTotalCents: docTotals.lineTotalCents,
  };
}
