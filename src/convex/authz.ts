import { getAuthUserId } from "./supabaseAuth";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import type { BusinessRole } from "./shared";

/**
 * Server-side authorization for SikaFlow.
 *
 * This is the Row-Level-Security equivalent for Convex: every function that
 * touches business data MUST go through these helpers. Client-side checks are
 * never trusted.
 */
export class AuthzError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * The caller's identity is a Supabase auth user id (a string), not a Convex
 * doc id. The `supabaseUsers` table maps supabaseUserId -> app profile.
 * We use `string` here instead of `Id<"supabaseUsers">` because the auth
 * context carries the Supabase id, and we look up the mapping row on demand.
 */
export interface BusinessContext {
  userId: string;
  businessId: Id<"businesses">;
  business: Doc<"businesses">;
  role: BusinessRole;
  membership: Doc<"businessMembers">;
}

/** Roles allowed to create/modify records. `member` is read-mostly in V1. */
const WRITE_ROLES: BusinessRole[] = ["owner", "admin", "member"];

/** Throw unless the caller is signed in. Returns the Convex user id. */
export async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new AuthzError("You must be signed in to do that.");
  }
  return userId;
}

/**
 * Require an active membership of the given business.
 * Returns the membership role. Throws if the user does not belong.
 */
export async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
  opts?: { write?: boolean },
): Promise<{ userId: string; role: BusinessRole }> {
  const userId = await requireUserId(ctx);

  const membership = await ctx.db
    .query("businessMembers")
    .withIndex("by_businessId_userId", (q) =>
      q.eq("businessId", businessId).eq("userId", userId),
    )
    .first();

  if (!membership || membership.deletedAt !== undefined) {
    throw new AuthzError("You do not have access to this business.");
  }

  if (opts?.write && !WRITE_ROLES.includes(membership.role)) {
    throw new AuthzError("Your role cannot make this change.");
  }

  return { userId, role: membership.role };
}

/**
 * Require the caller to be an owner or admin of their active business.
 * Used for brand-level and billing-level changes (profile, settings, logo,
 * plan) that ordinary members should not be able to perform.
 */
export async function requireBusinessAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<BusinessContext> {
  const context = await requireActiveBusiness(ctx);
  if (context.role !== "owner" && context.role !== "admin") {
    throw new AuthzError("Only an owner or admin can make this change.");
  }
  return context;
}

/**
 * Load the caller's primary business (first active membership), throwing
 * if they have none. Onboarding creates the business, so this should only
 * fail for users who somehow lost their membership.
 */
/**
 * Non-throwing variant of `requireActiveBusiness`: returns null when the
 * caller is signed in but has not finished onboarding yet. Lets shell-level
 * queries (e.g. usage) degrade gracefully during that window instead of
 * crashing the page.
 */
export async function findActiveBusiness(
  ctx: QueryCtx | MutationCtx,
): Promise<BusinessContext | null> {
  const userId = await requireUserId(ctx);

  const memberships = await ctx.db
    .query("businessMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  for (const membership of memberships) {
    if (membership.deletedAt !== undefined) continue;
    const business = await ctx.db.get(membership.businessId);
    if (business && business.deletedAt === undefined) {
      return {
        userId,
        businessId: business._id,
        business,
        role: membership.role,
        membership,
      };
    }
  }

  return null;
}

export async function requireActiveBusiness(
  ctx: QueryCtx | MutationCtx,
): Promise<BusinessContext> {
  const context = await findActiveBusiness(ctx);
  if (!context) {
    throw new AuthzError("No active business found. Finish onboarding first.");
  }
  return context;
}

/** Fetch a business-owned record only if the caller has access to it. */
export async function getAuthorizedDoc<
  T extends "customers" | "products" | "quotes" | "invoices" | "payments",
>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(id);
  if (!doc || doc.deletedAt !== undefined) {
    throw new AuthzError("Record not found.");
  }
  await requireMembership(ctx, doc.businessId);
  return doc;
}

/**
 * Allocate the next sequential document number and bump the counter.
 * Must be called inside a mutation that already verified membership.
 * Returns e.g. "QT-2026-0001".
 */
export async function allocateDocumentNumber(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  kind: "quote" | "invoice",
): Promise<string> {
  const settings = await ctx.db
    .query("businessSettings")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .first();

  if (!settings) {
    throw new AuthzError("Business settings are missing.");
  }

  const year = new Date().getFullYear();

  if (kind === "quote") {
    const seq = settings.nextQuoteNumber;
    await ctx.db.patch(settings._id, { nextQuoteNumber: seq + 1 });
    return `${settings.quotePrefix}-${year}-${String(seq).padStart(4, "0")}`;
  }

  const seq = settings.nextInvoiceNumber;
  await ctx.db.patch(settings._id, { nextInvoiceNumber: seq + 1 });
  return `${settings.invoicePrefix}-${year}-${String(seq).padStart(4, "0")}`;
}
