import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import {
  requireActiveBusiness,
  requireMembership,
  getAuthorizedDoc,
  allocateDocumentNumber,
} from "./authz";
import { quoteStatus, type QuoteStatus } from "./shared";
import {
  MS_PER_DAY,
  lineInput,
  validateLines,
  totalsPatchFrom,
} from "./docMath";
import { assertDocumentQuota } from "./billing";
import { bounded, TEXT_LIMITS } from "./text";

/**
 * Quotations for SikaFlow.
 *
 * Money rules live in `./docMath` (mirroring `src/lib/money.ts`): integer
 * thebe amounts, basis-point percentages, server-computed totals snapshotted
 * on the document. The free-plan document quota is enforced in Phase XIII.
 */

/* ── Queries ─────────────────────────────────────────────────────── */

/** List a business's quotations, newest first, with search + status filter. */
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(quoteStatus),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const [quoteRows, customerRows] = await Promise.all([
      ctx.db
        .query("quotes")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
      ctx.db
        .query("customers")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
    ]);

    const customerNameById = new Map<Id<"customers">, string>();
    for (const c of customerRows) {
      customerNameById.set(c._id, c.name);
    }

    const live = quoteRows
      .filter((q) => q.deletedAt === undefined)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((q) => ({
        ...q,
        customerName: customerNameById.get(q.customerId) ?? "Unknown customer",
      }));

    const counts: Record<QuoteStatus, number> = {
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
    };
    for (const q of live) counts[q.status]++;

    const search = args.search?.trim().toLowerCase() ?? "";
    const filtered = live
      .filter((q) => (args.status ? q.status === args.status : true))
      .filter((q) => {
        if (!search) return true;
        return `${q.documentNumber} ${q.customerName}`
          .toLowerCase()
          .includes(search);
      });

    return { quotes: filtered, total: filtered.length, counts };
  },
});

/** Get one quotation with its lines and customer. */
export const get = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.id);

    const items = await ctx.db
      .query("quoteItems")
      .withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id))
      .collect();
    items.sort((a, b) => a.order - b.order);

    const customer = await ctx.db.get(quote.customerId);

    return { quote, items, customer };
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

/** Create a draft quotation. Totals are computed server-side. */
export const create = mutation({
  args: {
    customerId: v.id("customers"),
    quoteDate: v.number(),
    expiryDate: v.number(),
    notes: v.optional(v.string()),
    terms: v.optional(v.string()),
    lines: v.array(lineInput),
  },
  handler: async (ctx, args) => {
    const { userId, businessId } = await requireActiveBusiness(ctx);
    await requireMembership(ctx, businessId, { write: true });
    await assertDocumentQuota(ctx, businessId);

    const customer = await ctx.db.get(args.customerId);
    if (
      !customer ||
      customer.businessId !== businessId ||
      customer.deletedAt !== undefined
    ) {
      throw new Error("Choose a customer from your customer book.");
    }

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .first();
    if (!settings) throw new Error("Business settings are missing.");

    if (args.expiryDate < args.quoteDate) {
      throw new Error("The expiry date cannot be before the quote date.");
    }

    const { validated, docTotals } = validateLines(
      args.lines,
      settings.defaultTaxRateBps,
    );

    const documentNumber = await allocateDocumentNumber(ctx, businessId, "quote");

    const quoteId = await ctx.db.insert("quotes", {
      businessId,
      customerId: args.customerId,
      documentNumber,
      status: "draft",
      quoteDate: args.quoteDate,
      expiryDate: args.expiryDate,
      ...totalsPatchFrom(docTotals),
      notes: bounded(args.notes, TEXT_LIMITS.documentNotes, "Notes"),
      terms: bounded(args.terms, TEXT_LIMITS.documentTerms, "Terms"),
      createdById: userId,
    });

    for (const [index, line] of validated.entries()) {
      await ctx.db.insert("quoteItems", {
        businessId,
        quoteId,
        productId: line.productId,
        order: index,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        discountBps: line.discountBps,
        taxRateBps: line.taxRateBps,
        lineSubtotalCents: line.lineSubtotalCents,
        discountCents: line.discountCents,
        taxCents: line.taxCents,
        lineTotalCents: line.lineTotalCents,
      });
    }

    return { quoteId, documentNumber };
  },
});

/** Update a draft quotation. Sent/accepted quotes are immutable — duplicate instead. */
export const update = mutation({
  args: {
    id: v.id("quotes"),
    customerId: v.optional(v.id("customers")),
    quoteDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    terms: v.optional(v.string()),
    lines: v.optional(v.array(lineInput)),
  },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.id);
    await requireMembership(ctx, quote.businessId, { write: true });

    if (quote.convertedInvoiceId !== undefined) {
      throw new Error("This quote has been converted to an invoice.");
    }
    if (quote.status !== "draft") {
      throw new Error("Only draft quotations can be edited. Duplicate it instead.");
    }

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", quote.businessId))
      .first();
    if (!settings) throw new Error("Business settings are missing.");

    const quoteDate = args.quoteDate ?? quote.quoteDate;
    const expiryDate = args.expiryDate ?? quote.expiryDate;
    if (expiryDate < quoteDate) {
      throw new Error("The expiry date cannot be before the quote date.");
    }

    const patch: Record<string, unknown> = {
      quoteDate,
      expiryDate,
    };

    if (args.customerId !== undefined && args.customerId !== quote.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (
        !customer ||
        customer.businessId !== quote.businessId ||
        customer.deletedAt !== undefined
      ) {
        throw new Error("Choose a customer from your customer book.");
      }
      patch.customerId = args.customerId;
    }

    if (args.notes !== undefined)
      patch.notes = bounded(args.notes, TEXT_LIMITS.documentNotes, "Notes");
    if (args.terms !== undefined)
      patch.terms = bounded(args.terms, TEXT_LIMITS.documentTerms, "Terms");

    if (args.lines !== undefined) {
      const { validated, docTotals } = validateLines(
        args.lines,
        settings.defaultTaxRateBps,
      );

      // Replace the line items wholesale
      const existingItems = await ctx.db
        .query("quoteItems")
        .withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id))
        .collect();
      for (const item of existingItems) {
        await ctx.db.delete(item._id);
      }
      for (const [index, line] of validated.entries()) {
        await ctx.db.insert("quoteItems", {
          businessId: quote.businessId,
          quoteId: quote._id,
          productId: line.productId,
          order: index,
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          discountBps: line.discountBps,
          taxRateBps: line.taxRateBps,
          lineSubtotalCents: line.lineSubtotalCents,
          discountCents: line.discountCents,
          taxCents: line.taxCents,
          lineTotalCents: line.lineTotalCents,
        });
      }

      Object.assign(patch, totalsPatchFrom(docTotals));
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Duplicate a quotation as a fresh draft with a new number and validity window. */
export const duplicate = mutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.id);
    const { userId } = await requireMembership(ctx, quote.businessId, {
      write: true,
    });
    await assertDocumentQuota(ctx, quote.businessId);

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", quote.businessId))
      .first();

    const now = Date.now();
    const validityDays = settings?.defaultQuoteValidityDays ?? 14;
    const documentNumber = await allocateDocumentNumber(
      ctx,
      quote.businessId,
      "quote",
    );

    const items = await ctx.db
      .query("quoteItems")
      .withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id))
      .collect();
    items.sort((a, b) => a.order - b.order);

    const newQuoteId = await ctx.db.insert("quotes", {
      businessId: quote.businessId,
      customerId: quote.customerId,
      documentNumber,
      status: "draft",
      quoteDate: now,
      expiryDate: now + validityDays * MS_PER_DAY,
      subtotalCents: quote.subtotalCents,
      discountTotalCents: quote.discountTotalCents,
      taxTotalCents: quote.taxTotalCents,
      grandTotalCents: quote.grandTotalCents,
      notes: quote.notes,
      terms: quote.terms,
      createdById: userId,
    });

    for (const [index, item] of items.entries()) {
      await ctx.db.insert("quoteItems", {
        businessId: quote.businessId,
        quoteId: newQuoteId,
        productId: item.productId,
        order: index,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        discountBps: item.discountBps,
        taxRateBps: item.taxRateBps,
        lineSubtotalCents: item.lineSubtotalCents,
        discountCents: item.discountCents,
        taxCents: item.taxCents,
        lineTotalCents: item.lineTotalCents,
      });
    }

    return { quoteId: newQuoteId, documentNumber };
  },
});

/** Move a quotation through its workflow: draft → sent → accepted/rejected/expired. */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent", "accepted", "rejected", "expired"],
  sent: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: ["sent"],
  expired: ["sent"],
};

export const setStatus = mutation({
  args: { id: v.id("quotes"), status: quoteStatus },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.id);
    await requireMembership(ctx, quote.businessId, { write: true });

    if (quote.status === args.status) return args.id;

    const allowed = ALLOWED_TRANSITIONS[quote.status];
    if (!allowed.includes(args.status)) {
      throw new Error(
        `A ${quote.status} quotation cannot move to ${args.status}.`,
      );
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "sent") patch.sentAt = now;
    if (args.status === "accepted") patch.acceptedAt = now;
    if (args.status === "rejected") patch.rejectedAt = now;

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Soft-delete a quotation. Converted quotes are kept for the audit trail. */
export const remove = mutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.id);
    await requireMembership(ctx, quote.businessId, { write: true });

    if (quote.convertedInvoiceId !== undefined) {
      throw new Error(
        "This quote has been converted to an invoice and cannot be deleted.",
      );
    }

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return args.id;
  },
});
