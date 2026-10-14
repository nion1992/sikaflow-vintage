import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireActiveBusiness } from "./authz";

/**
 * The report room for SikaFlow.
 *
 * Everything is computed server-side from the raw ledger (invoices, payments,
 * quotes, customers) inside one date range:
 *  - Revenue: invoiced totals (draft & cancelled excluded)
 *  - Collected: payments received in the range
 *  - Outstanding: current balances of invoices issued in the range
 *  - Quote funnel: quoted value + acceptance rate
 *  - Customer rollup and a month-by-month series for the ledger view
 *
 * Notes on period correctness (V1):
 *  - "Paid" figures come from payment rows in the range (cash-basis).
 *  - Per-invoice outstanding uses the invoice's current balance, which the
 *    payment register keeps in sync.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map((n) => parseInt(n, 10));
  return `${MONTH_LABELS[(m ?? 1) - 1]} ${y}`;
}

export const summary = query({
  args: {
    from: v.optional(v.number()), // epoch ms, inclusive
    to: v.optional(v.number()), // epoch ms, inclusive
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const [invoiceRows, paymentRows, quoteRows, customerRows] =
      await Promise.all([
        ctx.db
          .query("invoices")
          .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
          .collect(),
        ctx.db
          .query("payments")
          .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
          .collect(),
        ctx.db
          .query("quotes")
          .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
          .collect(),
        ctx.db
          .query("customers")
          .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
          .collect(),
      ]);

    const from = args.from ?? 0;
    const to = args.to ?? Number.MAX_SAFE_INTEGER;
    const inRange = (ts: number) => ts >= from && ts <= to;

    /* ── Invoices ─────────────────────────────────────────────────── */
    const liveInvoices = invoiceRows.filter((i) => i.deletedAt === undefined);
    const rangedInvoices = liveInvoices.filter((i) => inRange(i.invoiceDate));
    const billable = rangedInvoices.filter(
      (i) => i.status !== "draft" && i.status !== "cancelled",
    );

    const invoicedCents = billable.reduce((s, i) => s + i.grandTotalCents, 0);
    const invoicedCount = billable.length;

    const outstandingCents = billable.reduce(
      (s, i) =>
        s + (i.status === "paid" ? 0 : Math.max(0, i.grandTotalCents - i.amountPaidCents)),
      0,
    );
    const outstandingCount = billable.filter(
      (i) => i.status !== "paid" && i.grandTotalCents - i.amountPaidCents > 0,
    ).length;

    const overdueCents = billable.reduce(
      (s, i) =>
        i.status === "overdue"
          ? s + Math.max(0, i.grandTotalCents - i.amountPaidCents)
          : s,
      0,
    );
    const overdueCount = billable.filter((i) => i.status === "overdue").length;

    const paidInvoices = billable.filter(
      (i) => i.status === "paid" || i.amountPaidCents >= i.grandTotalCents,
    );
    const paidInvoiceCount = paidInvoices.length;
    const paidInvoiceCents = paidInvoices.reduce(
      (s, i) => s + i.grandTotalCents,
      0,
    );

    const draftCount = rangedInvoices.filter((i) => i.status === "draft").length;
    const cancelledCount = rangedInvoices.filter(
      (i) => i.status === "cancelled",
    ).length;

    /* ── Payments (cash-basis collections) ────────────────────────── */
    const rangedPayments = paymentRows.filter(
      (p) => p.deletedAt === undefined && inRange(p.paymentDate),
    );
    const collectedCents = rangedPayments.reduce((s, p) => s + p.amountCents, 0);
    const collectedCount = rangedPayments.length;

    /* ── Quotes ───────────────────────────────────────────────────── */
    const liveQuotes = quoteRows.filter((q) => q.deletedAt === undefined);
    const rangedQuotes = liveQuotes.filter((q) => inRange(q.quoteDate));
    const quotedCents = rangedQuotes.reduce((s, q) => s + q.grandTotalCents, 0);
    const decided = rangedQuotes.filter(
      (q) => q.status === "accepted" || q.status === "rejected",
    );
    const acceptedCount = rangedQuotes.filter((q) => q.status === "accepted").length;
    const acceptanceRateBps =
      decided.length > 0
        ? Math.round((acceptedCount / decided.length) * 10_000)
        : null;

    const quoteCounts = {
      draft: rangedQuotes.filter((q) => q.status === "draft").length,
      sent: rangedQuotes.filter((q) => q.status === "sent").length,
      accepted: acceptedCount,
      rejected: rangedQuotes.filter((q) => q.status === "rejected").length,
      expired: rangedQuotes.filter((q) => q.status === "expired").length,
    };

    /* ── Monthly series ───────────────────────────────────────────── */
    const monthlyMap = new Map<
      string,
      { invoicedCents: number; collectedCents: number }
    >();
    const bucket = (ts: number) => {
      const key = monthKey(ts);
      let entry = monthlyMap.get(key);
      if (!entry) {
        entry = { invoicedCents: 0, collectedCents: 0 };
        monthlyMap.set(key, entry);
      }
      return entry;
    };
    for (const i of billable) bucket(i.invoiceDate).invoicedCents += i.grandTotalCents;
    for (const p of rangedPayments) bucket(p.paymentDate).collectedCents += p.amountCents;

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        key,
        label: monthLabel(key),
        invoicedCents: v.invoicedCents,
        collectedCents: v.collectedCents,
      }));

    /* ── Per-customer rollup ──────────────────────────────────────── */
    const customerNameById = new Map<Id<"customers">, string>();
    for (const c of customerRows) {
      if (c.deletedAt === undefined) customerNameById.set(c._id, c.name);
    }

    const customerMap = new Map<
      Id<"customers">,
      { invoicedCents: number; paidCents: number; outstandingCents: number }
    >();
    const touchCustomer = (id: Id<"customers">) => {
      let entry = customerMap.get(id);
      if (!entry) {
        entry = { invoicedCents: 0, paidCents: 0, outstandingCents: 0 };
        customerMap.set(id, entry);
      }
      return entry;
    };
    for (const i of billable) {
      const entry = touchCustomer(i.customerId);
      entry.invoicedCents += i.grandTotalCents;
      if (i.status !== "paid") {
        entry.outstandingCents += Math.max(
          0,
          i.grandTotalCents - i.amountPaidCents,
        );
      }
    }
    for (const p of rangedPayments) {
      touchCustomer(p.customerId).paidCents += p.amountCents;
    }

    const customers = Array.from(customerMap.entries())
      .map(([customerId, v]) => ({
        customerId,
        name: customerNameById.get(customerId) ?? "Unknown customer",
        ...v,
      }))
      .sort((a, b) => b.invoicedCents - a.invoicedCents)
      .slice(0, 10);

    return {
      range: { from: args.from ?? null, to: args.to ?? null },
      invoices: {
        invoicedCents,
        invoicedCount,
        outstandingCents,
        outstandingCount,
        overdueCents,
        overdueCount,
        paidInvoiceCount,
        paidInvoiceCents,
        draftCount,
        cancelledCount,
      },
      payments: { collectedCents, collectedCount },
      quotes: { quotedCents, count: rangedQuotes.length, quoteCounts, acceptanceRateBps },
      monthly,
      customers,
    };
  },
});
