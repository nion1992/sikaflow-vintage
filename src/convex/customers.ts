import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireActiveBusiness,
  requireMembership,
  getAuthorizedDoc,
} from "./authz";
import { bounded, TEXT_LIMITS } from "./text";

/**
 * Customer book for SikaFlow.
 *
 * All records are business-scoped; every read and write is authorization-
 * checked server-side (the RLS equivalent). Deletes are soft so document
 * history is never lost.
 */

/* ── Queries ─────────────────────────────────────────────────────── */

/** List a business's customers, newest first, with optional search. */
export const list = query({
  args: {
    search: v.optional(v.string()),
    /** Simple pagination cursor: number of rows to skip. */
    paginationOffset: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 200);
    const search = args.search?.trim().toLowerCase() ?? "";

    const rows = await ctx.db
      .query("customers")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    // Sort newest first (Convex _creationTime ordering is ascending, reverse it)
    const sorted = rows
      .filter((c) => c.deletedAt === undefined)
      .sort((a, b) => b._creationTime - a._creationTime);

    const filtered = search
      ? sorted.filter((c) => {
          const haystack = [
            c.name,
            c.company,
            c.phone,
            c.whatsapp,
            c.email,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : sorted;

    const offset = args.paginationOffset ?? 0;
    const page = filtered.slice(offset, offset + pageSize);

    return {
      customers: page,
      total: filtered.length,
      hasMore: offset + page.length < filtered.length,
    };
  },
});

/** Get one customer with counts and recent document history. */
export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await getAuthorizedDoc(ctx, "customers", args.id);

    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", customer.businessId).eq("customerId", customer._id),
      )
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", customer.businessId).eq("customerId", customer._id),
      )
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", customer.businessId).eq("customerId", customer._id),
      )
      .collect();

    const liveQuotes = quotes.filter((q) => q.deletedAt === undefined);
    const liveInvoices = invoices.filter((i) => i.deletedAt === undefined);
    const livePayments = payments.filter((p) => p.deletedAt === undefined);

    const invoicedCents = liveInvoices
      .filter((i) => i.status !== "cancelled" && i.status !== "draft")
      .reduce((sum, i) => sum + i.grandTotalCents, 0);
    const paidCents = livePayments.reduce((sum, p) => sum + p.amountCents, 0);

    return {
      customer,
      stats: {
        quoteCount: liveQuotes.length,
        invoiceCount: liveInvoices.length,
        invoicedCents,
        paidCents,
        outstandingCents: Math.max(0, invoicedCents - paidCents),
      },
      recentQuotes: liveQuotes
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 5),
      recentInvoices: liveInvoices
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 5),
      recentPayments: livePayments
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 5),
    };
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

const NAME_MAX = 100;

/** Create a customer. */
export const create = mutation({
  args: {
    name: v.string(),
    company: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);
    await requireMembership(ctx, businessId, { write: true });

    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Customer name must be at least 2 characters.");
    }
    if (name.length > NAME_MAX) {
      throw new Error("Customer name is too long.");
    }
    if (args.email) {
      const email = bounded(args.email, TEXT_LIMITS.email, "Email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
      }
    }
    if (args.phone) {
      const phone = bounded(args.phone, TEXT_LIMITS.contact, "Phone");
      if (phone && !/^[+0-9 ()-]{7,18}$/.test(phone)) {
        throw new Error("Enter a valid phone number.");
      }
    }

    // Guard against exact duplicates
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();
    const duplicate = existing.some(
      (c) =>
        c.deletedAt === undefined &&
        c.name.toLowerCase() === name.toLowerCase() &&
        (c.company ?? "") === (args.company?.trim() ?? ""),
    );
    if (duplicate) {
      throw new Error(
        "A customer with this name and company already exists.",
      );
    }

    return await ctx.db.insert("customers", {
      businessId,
      name,
      company: bounded(args.company, TEXT_LIMITS.company, "Company"),
      phone: bounded(args.phone, TEXT_LIMITS.contact, "Phone"),
      whatsapp: bounded(args.whatsapp, TEXT_LIMITS.contact, "WhatsApp"),
      email: bounded(args.email, TEXT_LIMITS.email, "Email"),
      address: bounded(args.address, TEXT_LIMITS.address, "Address"),
      notes: bounded(args.notes, TEXT_LIMITS.customerNotes, "Notes"),
    });
  },
});

/** Update a customer. */
export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await getAuthorizedDoc(ctx, "customers", args.id);
    await requireMembership(ctx, customer.businessId, { write: true });

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new Error("Customer name must be at least 2 characters.");
      }
      if (name.length > NAME_MAX) {
        throw new Error("Customer name is too long.");
      }
      patch.name = name;
    }
    if (args.company !== undefined)
      patch.company = bounded(args.company, TEXT_LIMITS.company, "Company");
    if (args.phone !== undefined)
      patch.phone = bounded(args.phone, TEXT_LIMITS.contact, "Phone");
    if (args.whatsapp !== undefined)
      patch.whatsapp = bounded(args.whatsapp, TEXT_LIMITS.contact, "WhatsApp");
    if (args.email !== undefined) {
      const email = bounded(args.email, TEXT_LIMITS.email, "Email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
      }
      patch.email = email;
    }
    if (args.address !== undefined)
      patch.address = bounded(args.address, TEXT_LIMITS.address, "Address");
    if (args.notes !== undefined)
      patch.notes = bounded(args.notes, TEXT_LIMITS.customerNotes, "Notes");

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Soft-delete a customer. History is preserved. */
export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await getAuthorizedDoc(ctx, "customers", args.id);
    await requireMembership(ctx, customer.businessId, { write: true });

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return args.id;
  },
});
