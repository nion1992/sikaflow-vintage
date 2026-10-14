import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireActiveBusiness } from "./authz";

/**
 * The reminder desk for SikaFlow.
 *
 * One read-only query that buckets everything worth chasing, so the owner can
 * work top-to-bottom: overdue invoices first, then bills due soon, quotes
 * about to expire, quotes awaiting a reply, and quotes that need a re-send.
 * No new tables — this is derived live from the invoices, quotes and
 * customers ledger, so it is always current.
 */

const MS_PER_DAY = 86_400_000;
/** "Soon" window for due dates and quote expiry. */
const SOON_DAYS = 7;

interface Contact {
  name: string;
  phone?: string;
  whatsapp?: string;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { businessId } = await requireActiveBusiness(ctx);
    const now = Date.now();

    const [invoiceRows, quoteRows, customerRows] = await Promise.all([
      ctx.db
        .query("invoices")
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

    const contactById = new Map<Id<"customers">, Contact>();
    for (const c of customerRows) {
      if (c.deletedAt === undefined) {
        contactById.set(c._id, {
          name: c.name,
          phone: c.phone,
          whatsapp: c.whatsapp,
        });
      }
    }
    const contactOf = (id: Id<"customers">): Contact =>
      contactById.get(id) ?? { name: "Unknown customer" };

    const liveInvoices = invoiceRows.filter((i) => i.deletedAt === undefined);
    const liveQuotes = quoteRows.filter((q) => q.deletedAt === undefined);

    /* ── Invoices: overdue & due soon (with an outstanding balance) ── */
    const overdueInvoices: {
      invoiceId: Id<"invoices">;
      documentNumber: string;
      status: string;
      balanceCents: number;
      grandTotalCents: number;
      amountPaidCents: number;
      dueDate: number;
      daysOverdue: number;
    }[] = [];
    const dueSoonInvoices: {
      invoiceId: Id<"invoices">;
      documentNumber: string;
      status: string;
      balanceCents: number;
      grandTotalCents: number;
      amountPaidCents: number;
      dueDate: number;
      daysUntilDue: number;
    }[] = [];

    for (const inv of liveInvoices) {
      if (inv.status === "draft" || inv.status === "cancelled") continue;
      const balanceCents = inv.grandTotalCents - inv.amountPaidCents;
      if (balanceCents <= 0) continue;

      if (inv.dueDate < now) {
        overdueInvoices.push({
          invoiceId: inv._id,
          documentNumber: inv.documentNumber,
          status: inv.status,
          balanceCents,
          grandTotalCents: inv.grandTotalCents,
          amountPaidCents: inv.amountPaidCents,
          dueDate: inv.dueDate,
          daysOverdue: Math.floor((now - inv.dueDate) / MS_PER_DAY),
        });
      } else if (inv.dueDate <= now + SOON_DAYS * MS_PER_DAY) {
        dueSoonInvoices.push({
          invoiceId: inv._id,
          documentNumber: inv.documentNumber,
          status: inv.status,
          balanceCents,
          grandTotalCents: inv.grandTotalCents,
          amountPaidCents: inv.amountPaidCents,
          dueDate: inv.dueDate,
          daysUntilDue: Math.max(
            0,
            Math.ceil((inv.dueDate - now) / MS_PER_DAY),
          ),
        });
      }
    }
    overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
    dueSoonInvoices.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    /* ── Quotes: expiring, awaiting reply, needs re-send ───────────── */
    const expiringQuotes: {
      quoteId: Id<"quotes">;
      documentNumber: string;
      status: "sent";
      grandTotalCents: number;
      quoteDate: number;
      expiryDate: number;
      daysSinceSent: number;
      daysUntilExpiry: number;
    }[] = [];
    const awaitingQuotes: {
      quoteId: Id<"quotes">;
      documentNumber: string;
      status: "sent";
      grandTotalCents: number;
      quoteDate: number;
      expiryDate: number;
      daysSinceSent: number;
      daysUntilExpiry: number;
    }[] = [];
    const needsResendQuotes: {
      quoteId: Id<"quotes">;
      documentNumber: string;
      status: "expired" | "rejected";
      grandTotalCents: number;
      quoteDate: number;
      expiryDate: number;
    }[] = [];

    for (const q of liveQuotes) {
      if (q.convertedInvoiceId !== undefined) continue;
      const daysSinceSent = Math.floor(
        (now - (q.sentAt ?? q.quoteDate)) / MS_PER_DAY,
      );
      const daysUntilExpiry = Math.ceil((q.expiryDate - now) / MS_PER_DAY);

      if (q.status === "sent") {
        const item = {
          quoteId: q._id,
          documentNumber: q.documentNumber,
          status: "sent" as const,
          grandTotalCents: q.grandTotalCents,
          quoteDate: q.quoteDate,
          expiryDate: q.expiryDate,
          daysSinceSent,
          daysUntilExpiry,
        };
        if (q.expiryDate < now) {
          // Sent long ago and silently past its validity — chase or re-issue.
          needsResendQuotes.push({
            quoteId: q._id,
            documentNumber: q.documentNumber,
            status: "expired",
            grandTotalCents: q.grandTotalCents,
            quoteDate: q.quoteDate,
            expiryDate: q.expiryDate,
          });
        } else if (q.expiryDate <= now + SOON_DAYS * MS_PER_DAY) {
          expiringQuotes.push(item);
        } else {
          awaitingQuotes.push(item);
        }
      } else if (q.status === "expired" || q.status === "rejected") {
        needsResendQuotes.push({
          quoteId: q._id,
          documentNumber: q.documentNumber,
          status: q.status,
          grandTotalCents: q.grandTotalCents,
          quoteDate: q.quoteDate,
          expiryDate: q.expiryDate,
        });
      }
    }
    awaitingQuotes.sort((a, b) => b.daysSinceSent - a.daysSinceSent);
    expiringQuotes.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    needsResendQuotes.sort((a, b) =>
      a.documentNumber.localeCompare(b.documentNumber),
    );

    /* ── Contacts + drafts ────────────────────────────────────── */
    const contactForInvoice = new Map<Id<"invoices">, Contact>();
    const contactForQuote = new Map<Id<"quotes">, Contact>();
    for (const inv of liveInvoices) {
      contactForInvoice.set(inv._id, contactOf(inv.customerId));
    }
    for (const q of liveQuotes) {
      contactForQuote.set(q._id, contactOf(q.customerId));
    }

    const draftQuoteCount = liveQuotes.filter(
      (q) => q.status === "draft",
    ).length;
    const draftInvoiceCount = liveInvoices.filter(
      (i) => i.status === "draft",
    ).length;

    return {
      overdueInvoices: overdueInvoices.map((i) => ({
        ...i,
        contact: contactForInvoice.get(i.invoiceId) ?? { name: "Unknown" },
      })),
      dueSoonInvoices: dueSoonInvoices.map((i) => ({
        ...i,
        contact: contactForInvoice.get(i.invoiceId) ?? { name: "Unknown" },
      })),
      expiringQuotes: expiringQuotes.map((q) => ({
        ...q,
        contact: contactForQuote.get(q.quoteId) ?? { name: "Unknown" },
      })),
      awaitingQuotes: awaitingQuotes.map((q) => ({
        ...q,
        contact: contactForQuote.get(q.quoteId) ?? { name: "Unknown" },
      })),
      needsResendQuotes: needsResendQuotes.map((q) => ({
        ...q,
        contact: contactForQuote.get(q.quoteId) ?? { name: "Unknown" },
      })),
      draftCounts: { quotes: draftQuoteCount, invoices: draftInvoiceCount },
      generatedAt: now,
    };
  },
});
