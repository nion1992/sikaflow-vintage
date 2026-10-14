import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { requireActiveBusiness, requireMembership, getAuthorizedDoc } from "./authz";

/**
 * Payment register for SikaFlow.
 *
 * Every payment mutates the invoice's denormalized `amountPaidCents` and, when
 * warranted, its status (sent → partially_paid → paid). Deleting a payment
 * reverses both, so the balance can always be trusted. No gateway in V1 —
 * this is the ledger of record for cash, MoMo and bank receipts.
 */

const MAX_AMOUNT_CENTS = 900_000_000_00;

/* ── Queries ─────────────────────────────────────────────────────── */

/** List a business's payments with search + collected-money rollups. */
export const list = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const [paymentRows, invoiceRows, customerRows] = await Promise.all([
      ctx.db
        .query("payments")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
      ctx.db
        .query("customers")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
    ]);

    const invoiceById = new Map<Id<"invoices">, (typeof invoiceRows)[number]>();
    for (const inv of invoiceRows) invoiceById.set(inv._id, inv);

    const customerNameById = new Map<Id<"customers">, string>();
    for (const c of customerRows) customerNameById.set(c._id, c.name);

    const live = paymentRows
      .filter((p) => p.deletedAt === undefined)
      .sort((a, b) => b.paymentDate - a.paymentDate)
      .map((p) => ({
        ...p,
        invoiceNumber: invoiceById.get(p.invoiceId)?.documentNumber ?? "—",
        customerName: customerNameById.get(p.customerId) ?? "Unknown customer",
      }));

    // Rollups: all-time and calendar-month (UTC) collections
    const now = new Date();
    const monthStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
    );
    let totalCents = 0;
    let thisMonthCents = 0;
    for (const p of live) {
      totalCents += p.amountCents;
      if (p.paymentDate >= monthStart) thisMonthCents += p.amountCents;
    }

    const search = args.search?.trim().toLowerCase() ?? "";
    const filtered = search
      ? live.filter((p) =>
          `${p.invoiceNumber} ${p.customerName} ${p.reference ?? ""}`
            .toLowerCase()
            .includes(search),
        )
      : live;

    return {
      payments: filtered,
      total: filtered.length,
      totalCents,
      thisMonthCents,
    };
  },
});

/** Payments recorded against one invoice, newest first. */
export const byInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.invoiceId);

    const rows = await ctx.db
      .query("payments")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
      .collect();

    return rows
      .filter((p) => p.deletedAt === undefined)
      .sort((a, b) => b.paymentDate - a.paymentDate);
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

/** Record a payment against an issued invoice and update its balance. */
export const create = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentDate: v.number(),
    amountCents: v.number(),
    method: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("mobile_money"),
      v.literal("card"),
      v.literal("other"),
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await getAuthorizedDoc(ctx, "invoices", args.invoiceId);
    const { userId } = await requireMembership(ctx, invoice.businessId, {
      write: true,
    });

    if (invoice.status === "draft") {
      throw new Error("Issue the invoice before recording payments.");
    }
    if (invoice.status === "cancelled") {
      throw new Error("This invoice was cancelled — payments are closed.");
    }
    if (
      !Number.isInteger(args.amountCents) ||
      args.amountCents <= 0 ||
      args.amountCents > MAX_AMOUNT_CENTS
    ) {
      throw new Error("Enter a valid payment amount.");
    }

    const balance = invoice.grandTotalCents - invoice.amountPaidCents;
    if (args.amountCents > balance) {
      throw new Error(
        `That is more than the outstanding balance. At most E${(balance / 100).toFixed(2)} is due.`,
      );
    }

    if (args.paymentDate < invoice.invoiceDate) {
      throw new Error("The payment date cannot be before the invoice date.");
    }

    const reference = args.reference?.trim();
    if (reference && reference.length > 60) {
      throw new Error("Reference is too long (60 characters max).");
    }
    const notes = args.notes?.trim();
    if (notes && notes.length > 300) {
      throw new Error("Notes are too long (300 characters max).");
    }

    const paymentId = await ctx.db.insert("payments", {
      businessId: invoice.businessId,
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      paymentDate: args.paymentDate,
      amountCents: args.amountCents,
      method: args.method,
      reference: reference || undefined,
      notes: notes || undefined,
      recordedById: userId,
    });

    // Maintain the denormalized balance + status
    const newPaid = invoice.amountPaidCents + args.amountCents;
    let nextStatus = invoice.status;
    if (newPaid >= invoice.grandTotalCents) {
      nextStatus = "paid";
    } else if (invoice.status === "sent") {
      nextStatus = "partially_paid";
    }
    await ctx.db.patch(invoice._id, {
      amountPaidCents: newPaid,
      status: nextStatus,
    });

    return { paymentId, amountPaidCents: newPaid, invoiceStatus: nextStatus };
  },
});

/** Soft-delete a payment and restore the invoice balance/status. */
export const remove = mutation({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    const payment = await getAuthorizedDoc(ctx, "payments", args.id);
    await requireMembership(ctx, payment.businessId, { write: true });

    const invoice = await ctx.db.get(payment.invoiceId);
    if (!invoice || invoice.deletedAt !== undefined) {
      throw new Error("The invoice for this payment no longer exists.");
    }

    const newPaid = Math.max(0, invoice.amountPaidCents - payment.amountCents);
    const patch: Record<string, unknown> = { amountPaidCents: newPaid };

    // Restore an honest status unless the invoice was manually cancelled
    if (invoice.status !== "cancelled") {
      if (newPaid === 0) {
        patch.status = invoice.status === "overdue" ? "overdue" : "sent";
      } else if (newPaid < invoice.grandTotalCents) {
        patch.status = invoice.status === "overdue" ? "overdue" : "partially_paid";
      } else {
        patch.status = "paid";
      }
    }

    await ctx.db.patch(invoice._id, patch);
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return args.id;
  },
});
