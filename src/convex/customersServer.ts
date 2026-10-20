import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireActiveBusiness,
  requireMembership,
  AuthzError,
} from "./authz";
import type { Id } from "./_generated/dataModel";

export interface CustomerAccountDetail {
  customerAccountId: Id<"customerAccounts">;
  accountUserId: string;
  businessId: Id<"businesses">;
  customerId: Id<"customers">;
  displayName: string;
  email: string;
  invitedBy?: string | null;
  createdAt: number;
  deletedAt?: number | null;
}

export class CustomerPortalError extends AuthzError {
  constructor(message = "Not authorized for this customer account.") {
    super(message);
    this.name = "CustomerPortalError";
  }
}

/**
 * Self-serve customer accounts.
 *
 * This is the customer-facing seam for the new portal. Each row is owned by a
 * customer account (one Convex user) and grants that account read access to a
 * single company's products and to its own requested RFQs.
 */

/** Look up a customer account by the customer's id inside a business. */
export const lookupByCustomer = query({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const { businessId, customerId } = args;

    const account = await ctx.db
      .query("customerAccounts")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", businessId).eq("customerId", customerId),
      )
      .first();

    if (!account || account.deletedAt !== undefined) return null;
    return { customerAccountId: account._id, ...account } as CustomerAccountDetail;
  },
});

/** Look up a customer account by its own account user id. */
export const lookupByAccount = query({
  args: { accountUserId: v.string() },
  handler: async (ctx, args) => {
    const { accountUserId } = args;

    const account = await ctx.db
      .query("customerAccounts")
      .withIndex("by_accountUserId", (q) => q.eq("accountUserId", accountUserId))
      .first();

    if (!account || account.deletedAt !== undefined) return null;
    return { customerAccountId: account._id, ...account } as CustomerAccountDetail;
  },
});

/** Create a customer account. The invited account must belong to the same business. */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
    accountUserId: v.string(),
    displayName: v.string(),
    email: v.string(),
    invitedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessId, customerId, accountUserId, displayName, email } = args;

    // The customer account belongs to the customer's own Supabase auth user.
    // accountUserId is a string (Supabase auth id), not a Convex doc id.
    // No db.get() needed — just validate it's non-empty.

    const existing = await ctx.db
      .query("customerAccounts")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();
    const duplicate = existing.some(
      (a) =>
        a.deletedAt === undefined &&
        a.businessId === businessId &&
        a.customerId === customerId,
    );
    if (duplicate) {
      throw new AuthzError("A customer account for this customer already exists.");
    }

    const customer = await ctx.db.get(customerId);
    if (!customer || customer.businessId !== businessId) {
      throw new AuthzError("Customer does not belong to this business.");
    }

    const id = await ctx.db.insert("customerAccounts", {
      businessId,
      customerId,
      accountUserId,
      displayName,
      email,
      invitedBy: args.invitedBy ?? undefined,
      createdAt: Date.now(),
    });

    return { customerAccountId: id };
  },
});

/** Delete a customer account (soft delete). */
export const remove = mutation({
  args: { id: v.id("customerAccounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account || account.deletedAt !== undefined) {
      throw new AuthzError("Customer account not found.");
    }
    const { businessId } = account;
    await requireActiveBusiness(ctx);
    await requireMembership(ctx, businessId);

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return args.id;
  },
});

// ---------------------------------------------------------------------------
// Requested RFQs
// ---------------------------------------------------------------------------

/** A customer-facing request for a quotation on a product. */
export const listForCustomer = query({
  args: {
    businessId: v.id("businesses"),
    customerAccountId: v.id("customerAccounts"),
  },
  handler: async (ctx, args) => {
    const { businessId, customerAccountId } = args;

    // A customer account may only see RFQs it created through a granted
    // business/account link (customerBusinessAccess).
    const grant = await ctx.db
      .query("customerBusinessAccess")
      .withIndex("by_customerAccountId", (q) =>
        q.eq("customerAccountId", customerAccountId),
      )
      .first();
    if (!grant) {
      throw new CustomerPortalError();
    }
    if (grant.businessId !== businessId) {
      throw new CustomerPortalError();
    }

    const rows = await ctx.db
      .query("requestedRfqs")
      .withIndex("by_businessId_customerAccountId", (q) =>
        q.eq("businessId", businessId).eq("customerAccountId", customerAccountId),
      )
      .collect();

    return rows
      .filter((r) => r.deletedAt === undefined)
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

// ---------------------------------------------------------------------------
// Customer lens: only their products + their own RFQs.
// ---------------------------------------------------------------------------

/** Products visible to a customer account (owned by their business). */
export const listProductsForCustomer = query({
  args: {
    businessId: v.id("businesses"),
    customerAccountId: v.id("customerAccounts"),
  },
  handler: async (ctx, args) => {
    const { businessId, customerAccountId } = args;

    const account = await ctx.db.get(customerAccountId);
    if (!account || account.deletedAt !== undefined) throw new CustomerPortalError();
    if (account.businessId !== businessId) throw new CustomerPortalError();

    const rows = await ctx.db
      .query("products")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    return rows
      .filter((p) => p.deletedAt === undefined && p.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** A customer's own requested RFQs, with product details attached. */
export const listMyRfqs = query({
  args: { customerAccountId: v.id("customerAccounts") },
  handler: async (ctx, args) => {
    const { customerAccountId } = args;

    const account = await ctx.db.get(customerAccountId);
    if (!account || account.deletedAt !== undefined) throw new CustomerPortalError();

    const rows = await ctx.db
      .query("requestedRfqs")
      .withIndex("by_businessId", (q) => q.eq("businessId", account.businessId))
      .collect();

    const products = new Map<Id<"products">, any>();
    const productRows = await ctx.db
      .query("products")
      .withIndex("by_businessId", (q) => q.eq("businessId", account.businessId))
      .collect();
    for (const p of productRows) {
      if (p.deletedAt === undefined && p.active) products.set(p._id, p);
    }

    return rows
      .filter((r) => r.customerAccountId === customerAccountId && r.deletedAt === undefined)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((r) => ({
        ...r,
        product: products.get(r.productId) ?? null,
      }));
  },
});
