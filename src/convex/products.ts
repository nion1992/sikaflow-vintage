import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireActiveBusiness,
  requireMembership,
  getAuthorizedDoc,
} from "./authz";
import { BPS_MAX } from "./shared";
import { bounded, TEXT_LIMITS } from "./text";
import { buildProductDeepLink, generateProductQRIdentifier } from "./qr";

/**
 * Item register for SikaFlow: reusable products & services.
 *
 * Prices are integer thebe; tax rates are integer basis points. All records
 * are business-scoped and authorization-checked server-side.
 */

const NAME_MAX = 120;

/** List a business's products with optional search and category filter. */
export const list = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);

    const rows = await ctx.db
      .query("products")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const search = args.search?.trim().toLowerCase() ?? "";
    const category = args.category?.trim() ?? "";

    const filtered = rows
      .filter((p) => p.deletedAt === undefined)
      .filter((p) => (args.activeOnly ? p.active : true))
      .filter((p) => (category ? p.category === category : true))
      .filter((p) => {
        if (!search) return true;
        const haystack = [p.name, p.description, p.sku, p.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  },
});

/** Distinct category labels for filter chips. */
export const categories = query({
  args: {},
  handler: async (ctx) => {
    const { businessId } = await requireActiveBusiness(ctx);
    const rows = await ctx.db
      .query("products")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const set = new Set<string>();
    for (const p of rows) {
      if (p.deletedAt === undefined && p.category) {
        set.add(p.category);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  },
});

/* ── Mutations ───────────────────────────────────────────────────── */

/** Validate shared product fields; returns trimmed values or throws. */
function validateFields(args: {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  unit?: string;
  unitPriceCents: number;
  taxRateBps?: number;
}): {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  unit?: string;
  unitPriceCents: number;
  taxRateBps?: number;
} {
  const name = args.name.trim();
  if (name.length < 2) {
    throw new Error("Item name must be at least 2 characters.");
  }
  if (name.length > NAME_MAX) {
    throw new Error("Item name is too long.");
  }
  if (!Number.isInteger(args.unitPriceCents) || args.unitPriceCents < 0) {
    throw new Error("Price must be a valid amount.");
  }
  if (args.unitPriceCents > 900_000_000_00) {
    throw new Error("Price is too large.");
  }
  const sku = args.sku?.trim();
  if (sku && sku.length > 40) {
    throw new Error("SKU/reference is too long (max 40 characters).");
  }
  const description = args.description
    ? bounded(args.description, TEXT_LIMITS.productDescription, "Description")
    : undefined;
  const category = args.category
    ? bounded(args.category, TEXT_LIMITS.category, "Category")
    : undefined;
  const unit = args.unit
    ? bounded(args.unit, TEXT_LIMITS.unit, "Unit")
    : undefined;
  if (args.taxRateBps !== undefined) {
    const bps = Math.round(args.taxRateBps);
    if (bps < 0 || bps > BPS_MAX) {
      throw new Error("Tax rate must be between 0 and 100%.");
    }
    return {
      ...args,
      name,
      sku,
      description,
      category,
      unit,
      unitPriceCents: args.unitPriceCents,
      taxRateBps: bps,
    };
  }
  return { name, sku, description, category, unit, unitPriceCents: args.unitPriceCents };
}

/** Create a product/service. */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    unitPriceCents: v.number(),
    taxRateBps: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessId } = await requireActiveBusiness(ctx);
    await requireMembership(ctx, businessId, { write: true });

    const validated = validateFields(args);
    const category = args.category?.trim();

    // Guard: same name + category in the register
    const existing = await ctx.db
      .query("products")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();
    const duplicate = existing.some(
      (p) =>
        p.deletedAt === undefined &&
        p.name.toLowerCase() === validated.name.toLowerCase() &&
        (p.category ?? "") === (category ?? ""),
    );
    if (duplicate) {
      throw new Error("An item with this name and category already exists.");
    }

    const productId = await ctx.db.insert("products", {
      businessId,
      name: validated.name,
      description: validated.description,
      sku: validated.sku || undefined,
      category: validated.category,
      unit: validated.unit,
      unitPriceCents: validated.unitPriceCents,
      taxRateBps: validated.taxRateBps,
      active: args.active ?? true,
    });

    // Generate and store QR identifier
    try {
      const baseUrl = process.env.CONVEX_SITE_URL || "https://sikaflow.app";
      const deepLink = buildProductDeepLink(baseUrl, productId);
      const qrIdentifier = generateProductQRIdentifier(productId, businessId);
      await ctx.db.patch(productId, { qrCode: qrIdentifier });
    } catch {
      // QR generation failed, continue without QR identifier
    }

    return productId;
  },
});

/** Update a product/service. */
export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    unitPriceCents: v.optional(v.number()),
    taxRateBps: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const product = await getAuthorizedDoc(ctx, "products", args.id);
    await requireMembership(ctx, product.businessId, { write: true });

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) {
        throw new Error("Item name must be at least 2 characters.");
      }
      if (name.length > NAME_MAX) {
        throw new Error("Item name is too long.");
      }
      patch.name = name;
    }
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined;
    if (args.sku !== undefined) {
      const sku = args.sku.trim();
      if (sku.length > 40) {
        throw new Error("SKU/reference is too long (max 40 characters).");
      }
      patch.sku = sku || undefined;
    }
    if (args.description !== undefined)
      patch.description = bounded(args.description, TEXT_LIMITS.productDescription, "Description");
    if (args.category !== undefined)
      patch.category = bounded(args.category, TEXT_LIMITS.category, "Category");
    if (args.unit !== undefined)
      patch.unit = bounded(args.unit, TEXT_LIMITS.unit, "Unit");
    if (args.unitPriceCents !== undefined) {
      if (
        !Number.isInteger(args.unitPriceCents) ||
        args.unitPriceCents < 0
      ) {
        throw new Error("Price must be a valid amount.");
      }
      if (args.unitPriceCents > 900_000_000_00) {
        throw new Error("Price is too large.");
      }
      patch.unitPriceCents = args.unitPriceCents;
    }
    if (args.taxRateBps !== undefined) {
      const bps = Math.round(args.taxRateBps);
      if (bps < 0 || bps > BPS_MAX) {
        throw new Error("Tax rate must be between 0 and 100%.");
      }
      patch.taxRateBps = bps;
    }
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.id, patch);

    // Update QR identifier if product details changed
    if (patch.name !== undefined || patch.sku !== undefined) {
      try {
        const baseUrl = process.env.CONVEX_SITE_URL || "https://sikaflow.app";
        const deepLink = buildProductDeepLink(baseUrl, args.id);
        // QR identifier stays the same since product ID doesn't change
        // The client will regenerate the QR using the deep link
      } catch {
        // ignore
      }
    }

    return args.id;
  },
});

/** Archive (deactivate) or restore a product. */
export const setActive = mutation({
  args: { id: v.id("products"), active: v.boolean() },
  handler: async (ctx, args) => {
    const product = await getAuthorizedDoc(ctx, "products", args.id);
    await requireMembership(ctx, product.businessId, { write: true });

    await ctx.db.patch(args.id, { active: args.active });
    return args.id;
  },
});

/** Soft-delete a product. Existing document lines keep their snapshot. */
export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await getAuthorizedDoc(ctx, "products", args.id);
    await requireMembership(ctx, product.businessId, { write: true });

    await ctx.db.patch(args.id, { deletedAt: Date.now(), active: false });
    return args.id;
  },
});
