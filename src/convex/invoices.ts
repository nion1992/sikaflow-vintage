import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import {
  requireActiveBusiness,
  requireMembership,
  getAuthorizedDoc,
  allocateDocumentNumber,
} from "./authz";
import { invoiceStatus, type InvoiceStatus } from "./shared";
import {
  MS_PER_DAY,
  lineInput,
  validateLines,
  totalsPatchFrom,
} from "./docMath";
import { assertDocumentQuota } from "./billing";
import { bounded, TEXT_LIMITS } from "./text";

/**
 * Invoices for SikaFlow.
 *
 * Money rules live in `./docMath` (mirroring `src/lib/money.ts`): integer
 * thebe amounts, basis-point percentages, server-computed totals snapshotted
 * on the document. `amountPaidCents` is denormalized and maintained by the
 * payment register (Phase X); manual "mark paid" also sets it.
 */

/* ── Queries ─────────────────────────────────────────────────────── */

/** List a business's invoices with search + status filter and money rollups. */
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(invoiceStatus),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const [invoiceRows, customerRows] = await Promise.all([
      ctx.db
        .query("invoices")
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

    const live = invoiceRows
      .filter((i) => i.deletedAt === undefined)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((i) => ({
        ...i,
        customerName: customerNameById.get(i.customerId) ?? "Unknown customer",
      }));

    const counts: Record<InvoiceStatus, number> = {
      draft: 0,
      sent: 0,
      partially_paid: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };
    let outstandingCents = 0;
    let paidCents = 0;
    for (const i of live) {
      counts[i.status]++;
      if (i.status !== "cancelled" && i.status !== "draft") {
        outstandingCents += Math.max(0, i.grandTotalCents - i.amountPaidCents);
        paidCents += i.amountPaidCents;
      }
    }

    const search = args.search?.trim().toLowerCase() ?? "";
    const filtered = live
      .filter((i) => (args.status ? i.status === args.status : true))
      .filter((i) => {
        if (!search) return true;
        return `${i.documentNumber} ${i.customerName}`
          .toLowerCase()
          .includes(search);
      });

    return {
      invoices: filtered,
      total: filtered.length,
      counts,
      outstandingCents,
      paidCents,
    };
  },
});

/** Get one invoice with its lines and customer. */
export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.id);

    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
      .collect();
    items.sort((a, b) => a.order - b.order);

    const customer = await ctx.db.get(invoice.customerId);

    // Where it came from, if converted
    const sourceQuote = invoice.sourceQuoteId
      ? await ctx.db.get(invoice.sourceQuoteId)
      : null;

    return { invoice, items, customer, sourceQuote };
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

/** Create a draft invoice. Totals are computed server-side. */
export const create = mutation({
  args: {
    customerId: v.id("customers"),
    invoiceDate: v.number(),
    dueDate: v.number(),
    paymentTermsDays: v.optional(v.number()),
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

    if (args.dueDate < args.invoiceDate) {
      throw new Error("The due date cannot be before the invoice date.");
    }

    const { validated, docTotals } = validateLines(
      args.lines,
      settings.defaultTaxRateBps,
    );

    const documentNumber = await allocateDocumentNumber(
      ctx,
      businessId,
      "invoice",
    );

    const invoiceId = await ctx.db.insert("invoices", {
      businessId,
      customerId: args.customerId,
      documentNumber,
      status: "draft",
      invoiceDate: args.invoiceDate,
      dueDate: args.dueDate,
      paymentTermsDays: args.paymentTermsDays,
      ...totalsPatchFrom(docTotals),
      amountPaidCents: 0,
      notes: bounded(args.notes, TEXT_LIMITS.documentNotes, "Notes"),
      terms: bounded(args.terms, TEXT_LIMITS.documentTerms, "Terms"),
      createdById: userId,
    });

    for (const [index, line] of validated.entries()) {
      await ctx.db.insert("invoiceItems", {
        businessId,
        invoiceId,
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

    return { invoiceId, documentNumber };
  },
});

/** Update a draft invoice. Issued/paid invoices are immutable — duplicate instead. */
export const update = mutation({
  args: {
    id: v.id("invoices"),
    customerId: v.optional(v.id("customers")),
    invoiceDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    paymentTermsDays: v.optional(v.number()),
    notes: v.optional(v.string()),
    terms: v.optional(v.string()),
    lines: v.optional(v.array(lineInput)),
  },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.id);
    await requireMembership(ctx, invoice.businessId, { write: true });

    if (invoice.status !== "draft") {
      throw new Error(
        "Only draft invoices can be edited. Duplicate it instead.",
      );
    }
    if (invoice.amountPaidCents > 0) {
      throw new Error("This invoice already has payments recorded.");
    }

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", invoice.businessId))
      .first();
    if (!settings) throw new Error("Business settings are missing.");

    const invoiceDate = args.invoiceDate ?? invoice.invoiceDate;
    const dueDate = args.dueDate ?? invoice.dueDate;
    if (dueDate < invoiceDate) {
      throw new Error("The due date cannot be before the invoice date.");
    }

    const patch: Record<string, unknown> = { invoiceDate, dueDate };
    if (args.paymentTermsDays !== undefined) {
      patch.paymentTermsDays = args.paymentTermsDays;
    }

    if (args.customerId !== undefined && args.customerId !== invoice.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (
        !customer ||
        customer.businessId !== invoice.businessId ||
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

      const existingItems = await ctx.db
        .query("invoiceItems")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
        .collect();
      for (const item of existingItems) {
        await ctx.db.delete(item._id);
      }
      for (const [index, line] of validated.entries()) {
        await ctx.db.insert("invoiceItems", {
          businessId: invoice.businessId,
          invoiceId: invoice._id,
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

/** Duplicate an invoice as a fresh draft with a new number and due window. */
export const duplicate = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.id);
    const { userId } = await requireMembership(ctx, invoice.businessId, {
      write: true,
    });
    await assertDocumentQuota(ctx, invoice.businessId);

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", invoice.businessId))
      .first();

    const now = Date.now();
    const termsDays = invoice.paymentTermsDays ?? settings?.defaultPaymentTermsDays ?? 30;
    const documentNumber = await allocateDocumentNumber(
      ctx,
      invoice.businessId,
      "invoice",
    );

    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
      .collect();
    items.sort((a, b) => a.order - b.order);

    const newInvoiceId = await ctx.db.insert("invoices", {
      businessId: invoice.businessId,
      customerId: invoice.customerId,
      documentNumber,
      status: "draft",
      invoiceDate: now,
      dueDate: now + termsDays * MS_PER_DAY,
      paymentTermsDays: invoice.paymentTermsDays,
      subtotalCents: invoice.subtotalCents,
      discountTotalCents: invoice.discountTotalCents,
      taxTotalCents: invoice.taxTotalCents,
      grandTotalCents: invoice.grandTotalCents,
      amountPaidCents: 0,
      notes: invoice.notes,
      terms: invoice.terms,
      createdById: userId,
    });

    for (const [index, item] of items.entries()) {
      await ctx.db.insert("invoiceItems", {
        businessId: invoice.businessId,
        invoiceId: newInvoiceId,
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

    return { invoiceId: newInvoiceId, documentNumber };
  },
});

/** Turn an accepted/sent quotation into a numbered invoice, copying its lines. */
export const convertQuote = mutation({
  args: {
    quoteId: v.id("quotes"),
    invoiceDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const quote = await getAuthorizedDoc(ctx, "quotes", args.quoteId);
    const { userId } = await requireMembership(ctx, quote.businessId, {
      write: true,
    });
    await assertDocumentQuota(ctx, quote.businessId);

    if (quote.convertedInvoiceId !== undefined) {
      throw new Error(
        "This quotation was already converted — its invoice is on file.",
      );
    }
    if (quote.status === "draft") {
      throw new Error("Send or accept the quotation before converting it.");
    }
    if (quote.status === "rejected" || quote.status === "expired") {
      throw new Error(
        `A ${quote.status} quotation cannot be converted. Re-send it first.`,
      );
    }

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", quote.businessId))
      .first();
    if (!settings) throw new Error("Business settings are missing.");

    const now = args.invoiceDate ?? Date.now();
    const termsDays = settings.defaultPaymentTermsDays;
    const documentNumber = await allocateDocumentNumber(
      ctx,
      quote.businessId,
      "invoice",
    );

    const items = await ctx.db
      .query("quoteItems")
      .withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id))
      .collect();
    items.sort((a, b) => a.order - b.order);

    const invoiceId = await ctx.db.insert("invoices", {
      businessId: quote.businessId,
      customerId: quote.customerId,
      documentNumber,
      status: "draft",
      invoiceDate: now,
      dueDate: now + termsDays * MS_PER_DAY,
      paymentTermsDays: termsDays,
      subtotalCents: quote.subtotalCents,
      discountTotalCents: quote.discountTotalCents,
      taxTotalCents: quote.taxTotalCents,
      grandTotalCents: quote.grandTotalCents,
      amountPaidCents: 0,
      notes: quote.notes,
      terms: quote.terms,
      sourceQuoteId: quote._id,
      createdById: userId,
    });

    for (const [index, item] of items.entries()) {
      await ctx.db.insert("invoiceItems", {
        businessId: quote.businessId,
        invoiceId,
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

    // Link the quote to its invoice for the audit trail
    await ctx.db.patch(quote._id, { convertedInvoiceId: invoiceId });

    return { invoiceId, documentNumber };
  },
});

/**
 * Invoice workflow. Payments (Phase X) own partially_paid/paid in the long
 * run, but a manual "mark paid" is allowed for cash-in-hand situations and
 * sets amountPaidCents to the grand total.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "cancelled"],
  partially_paid: ["paid", "cancelled"],
  paid: [],
  overdue: ["paid", "cancelled"],
  cancelled: [],
};

export const setStatus = mutation({
  args: { id: v.id("invoices"), status: invoiceStatus },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.id);
    await requireMembership(ctx, invoice.businessId, { write: true });

    if (invoice.status === args.status) return args.id;

    const allowed = ALLOWED_TRANSITIONS[invoice.status];
    if (!allowed.includes(args.status)) {
      throw new Error(
        `A ${invoice.status.replace("_", " ")} invoice cannot move to ${args.status.replace("_", " ")}.`,
      );
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "sent") patch.sentAt = now;
    if (args.status === "cancelled") patch.cancelledAt = now;
    if (args.status === "paid") {
      patch.amountPaidCents = invoice.grandTotalCents;
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Soft-delete an invoice. Invoices with payments must be cancelled instead. */
export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.id);
    await requireMembership(ctx, invoice.businessId, { write: true });

    if (invoice.amountPaidCents > 0) {
      throw new Error(
        "This invoice has payments recorded — cancel it instead so the money trail stays intact.",
      );
    }
    if (invoice.status !== "draft") {
      // Issuing an invoice is an act of record; keep the numbering trail.
      throw new Error(
        "Only draft invoices can be deleted. Cancel issued invoices instead.",
      );
    }

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return args.id;
  },
});
