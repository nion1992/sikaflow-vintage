import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireUserId,
  requireBusinessAdmin,
  AuthzError,
} from "./authz";
import { DEFAULT_CURRENCY, DEFAULT_TAX_RATE_BPS, BPS_MAX } from "./shared";
import { bounded, TEXT_LIMITS } from "./text";

/**
 * Business accounts for SikaFlow.
 *
 * Phase 3: create-onboarding and read-your-business.
 * Phase 4: profile updates, logo upload and document settings.
 */

/* ── Queries ─────────────────────────────────────────────────────── */

/** The caller's active business, or null when onboarding hasn't happened. */
export const getMyBusiness = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("businessMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    for (const membership of memberships) {
      if (membership.deletedAt !== undefined) continue;
      const business = await ctx.db.get(membership.businessId);
      if (business && business.deletedAt === undefined) {
        const settings = await ctx.db
          .query("businessSettings")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .first();
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .first();
        const logoUrl = business.logoStorageId
          ? await ctx.storage.getUrl(business.logoStorageId)
          : null;

        return {
          business,
          role: membership.role,
          settings,
          subscription,
          logoUrl,
        };
      }
    }
    return null;
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

/**
 * Create a business for the signed-in user. Provisions everything a working
 * ledger needs in one transaction: business, owner membership, document
 * settings and a free-plan subscription.
 */
export const createBusiness = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Business name must be at least 2 characters.");
    }
    if (name.length > 80) {
      throw new Error("Business name is too long.");
    }

    // Guard: exactly one business per user in V1 (active or soft-deleted)
    const existing = await ctx.db
      .query("businessMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    if (existing.length > 0) {
      throw new Error(
        "You already have a business. Only one business is supported for now.",
      );
    }

    const businessId = await ctx.db.insert("businesses", {
      name,
      description: args.description?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      whatsapp: args.whatsapp?.trim() || undefined,
      email: args.email?.trim() || undefined,
      address: args.address?.trim() || undefined,
      taxNumber: args.taxNumber?.trim() || undefined,
      currency: DEFAULT_CURRENCY,
      createdById: userId,
    });

    await ctx.db.insert("businessMembers", {
      businessId,
      userId,
      role: "owner",
    });

    await ctx.db.insert("businessSettings", {
      businessId,
      defaultTaxRateBps: DEFAULT_TAX_RATE_BPS, // 15% VAT
      defaultPaymentTermsDays: 30,
      defaultQuoteValidityDays: 14,
      quotePrefix: "QT",
      invoicePrefix: "INV",
      nextQuoteNumber: 1,
      nextInvoiceNumber: 1,
    });

    await ctx.db.insert("subscriptions", {
      businessId,
      plan: "free",
      status: "active",
      currentPeriodStart: Date.now(),
    });

    return businessId;
  },
});

/* ── Phase 4: profile & settings ─────────────────────────────────── */

/** Trim helper: empty string → undefined. */
function trimOrUndefined(value?: string | null): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/** Update the business profile (owner/admin only). */
export const updateBusiness = mutation({
  args: {
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    website: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Brand-level change: owner/admin only
    const { businessId } = await requireBusinessAdmin(ctx);

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new Error("Business name must be at least 2 characters.");
      }
      if (name.length > 80) {
        throw new Error("Business name is too long.");
      }
      patch.name = name;
    }
    if (args.description !== undefined)
      patch.description = bounded(args.description, TEXT_LIMITS.profileDescription, "Description");
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
    if (args.website !== undefined) {
      const site = trimOrUndefined(args.website);
      if (site && !/^https?:\/\/|^\w+([.-]?\w+)*\.[a-z]{2,}$/i.test(site)) {
        throw new Error("Enter a valid website address.");
      }
      patch.website = site;
    }
    if (args.taxNumber !== undefined)
      patch.taxNumber = bounded(args.taxNumber, TEXT_LIMITS.taxNumber, "VAT number");

    await ctx.db.patch(businessId, patch);
    return businessId;
  },
});

/** Update document settings: VAT, terms, prefixes, numbering. */
export const updateBusinessSettings = mutation({
  args: {
    defaultTaxRateBps: v.optional(v.number()),
    defaultPaymentTermsDays: v.optional(v.number()),
    defaultQuoteValidityDays: v.optional(v.number()),
    defaultNotes: v.optional(v.string()),
    defaultTerms: v.optional(v.string()),
    quotePrefix: v.optional(v.string()),
    invoicePrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Document defaults print on every customer-facing document: owner/admin only
    const { businessId } = await requireBusinessAdmin(ctx);

    const settings = await ctx.db
      .query("businessSettings")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .first();
    if (!settings) throw new AuthzError("Business settings are missing.");

    const patch: Record<string, unknown> = {};

    if (args.defaultTaxRateBps !== undefined) {
      const bps = Math.round(args.defaultTaxRateBps);
      if (bps < 0 || bps > BPS_MAX) {
        throw new Error("Tax rate must be between 0 and 100%.");
      }
      patch.defaultTaxRateBps = bps;
    }
    if (args.defaultPaymentTermsDays !== undefined) {
      const days = Math.round(args.defaultPaymentTermsDays);
      if (days < 0 || days > 365) {
        throw new Error("Payment terms must be between 0 and 365 days.");
      }
      patch.defaultPaymentTermsDays = days;
    }
    if (args.defaultQuoteValidityDays !== undefined) {
      const days = Math.round(args.defaultQuoteValidityDays);
      if (days < 1 || days > 365) {
        throw new Error("Quote validity must be between 1 and 365 days.");
      }
      patch.defaultQuoteValidityDays = days;
    }
    if (args.defaultNotes !== undefined)
      patch.defaultNotes = bounded(args.defaultNotes, TEXT_LIMITS.documentNotes, "Default notes");
    if (args.defaultTerms !== undefined)
      patch.defaultTerms = bounded(args.defaultTerms, TEXT_LIMITS.documentTerms, "Default terms");
    if (args.quotePrefix !== undefined) {
      const prefix = args.quotePrefix.trim().toUpperCase();
      if (!/^[A-Z]{2,5}$/.test(prefix)) {
        throw new Error("Quote prefix must be 2–5 letters, e.g. QT.");
      }
      patch.quotePrefix = prefix;
    }
    if (args.invoicePrefix !== undefined) {
      const prefix = args.invoicePrefix.trim().toUpperCase();
      if (!/^[A-Z]{2,5}$/.test(prefix)) {
        throw new Error("Invoice prefix must be 2–5 letters, e.g. INV.");
      }
      patch.invoicePrefix = prefix;
    }

    await ctx.db.patch(settings._id, patch);
    return settings._id;
  },
});

/* ── Logo upload (Convex Storage) ────────────────────────────────── */

const LOGO_MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Phase 1 of a logo upload: get a short-lived upload URL for the client.
 * The client POSTs the file there, then calls setBusinessLogo with the id.
 */
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireBusinessAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Phase 2 of a logo upload: attach a just-uploaded file as the business logo.
 * Validates type & size, replaces any previous logo, then stores metadata.
 */
export const setBusinessLogo = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { businessId } = await requireBusinessAdmin(ctx);

    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      throw new Error("Upload not found. Please try again.");
    }
    const contentType = metadata.contentType ?? "";
    if (!LOGO_TYPES.includes(contentType)) {
      throw new Error("Logo must be a PNG, JPG, WEBP or SVG image.");
    }
    if (metadata.size > LOGO_MAX_BYTES) {
      throw new Error("Logo must be smaller than 1 MB.");
    }

    const business = await ctx.db.get(businessId);
    if (!business) throw new AuthzError("Business not found.");

    // Best-effort cleanup of the previous logo to avoid orphaned files
    if (
      business.logoStorageId &&
      business.logoStorageId !== args.storageId
    ) {
      try {
        await ctx.storage.delete(business.logoStorageId);
      } catch {
        // ignore — the old file may already be gone
      }
    }

    await ctx.db.patch(businessId, { logoStorageId: args.storageId });
    return businessId;
  },
});

/** Remove the business logo. */
export const removeBusinessLogo = mutation({
  args: {},
  handler: async (ctx) => {
    const { businessId } = await requireBusinessAdmin(ctx);

    const business = await ctx.db.get(businessId);
    if (business?.logoStorageId) {
      try {
        await ctx.storage.delete(business.logoStorageId);
      } catch {
        // ignore
      }
      await ctx.db.patch(businessId, { logoStorageId: undefined });
    }
    return businessId;
  },
});
