import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveBusiness, findActiveBusiness, AuthzError } from "./authz";
import { planId, PLAN_LIMITS, type PlanId } from "./shared";

/**
 * Plans, usage and the upgrade path for SikaFlow.
 *
 * V1 rules:
 *  - The free plan allows a limited number of documents (quotes + invoices)
 *    per calendar month, enforced SERVER-SIDE before any document is created.
 *  - Deleted documents still count — soft-delete is history, not a loophole.
 *  - `activatePlan` is the seam where a real payment provider plugs in:
 *    replace the direct activation with a Paystack/Stripe webhook that
 *    verifies payment, then calls the same subscription patch.
 */

/* ── Usage counting ──────────────────────────────────────────────── */

function currentMonthStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

function currentMonthEnd(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
}

async function getPlan(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
): Promise<PlanId> {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .first();
  return subscription?.plan ?? "free";
}

/** Documents (quotes + invoices) created by the business this month. */
async function countDocumentsThisMonth(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
  monthStart: number,
): Promise<number> {
  const [quotes, invoices] = await Promise.all([
    ctx.db
      .query("quotes")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect(),
    ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect(),
  ]);
  const inMonth = (creationTime: number) => creationTime >= monthStart;
  return (
    quotes.filter((q) => inMonth(q._creationTime)).length +
    invoices.filter((i) => inMonth(i._creationTime)).length
  );
}

export interface UsageSnapshot {
  plan: PlanId;
  limit: number; // Number.MAX_SAFE_INTEGER means unlimited
  used: number;
  remaining: number;
  canCreate: boolean;
  monthStart: number;
  monthEnd: number;
}

/**
 * Usage snapshot for the caller's business.
 *
 * Degrades gracefully before onboarding (signed in, no business yet):
 * the shell subscribes to this on every page, so it must not throw —
 * it reports free-plan defaults with `onboarded: false` instead.
 */
export const getUsage = query({
  args: {},
  handler: async (ctx): Promise<UsageSnapshot & { onboarded: boolean }> => {
    const context = await findActiveBusiness(ctx);
    if (!context) {
      return {
        plan: "free",
        limit: PLAN_LIMITS.free.documentsPerMonth,
        used: 0,
        remaining: PLAN_LIMITS.free.documentsPerMonth,
        canCreate: true,
        monthStart: currentMonthStart(),
        monthEnd: currentMonthEnd(),
        onboarded: false,
      };
    }
    const { businessId } = context;
    const plan = await getPlan(ctx, businessId);
    const monthStart = currentMonthStart();
    const used = await countDocumentsThisMonth(ctx, businessId, monthStart);
    const limit = PLAN_LIMITS[plan].documentsPerMonth;
    const remaining = Math.max(0, limit - used);
    return {
      plan,
      limit,
      used,
      remaining,
      canCreate: used < limit,
      monthStart,
      monthEnd: currentMonthEnd(),
      onboarded: true,
    };
  },
});

/**
 * Server-side quota gate. Call at the top of every mutation that creates a
 * quote or invoice (create, duplicate, convert). Throws a friendly error
 * when the free plan is exhausted.
 */
export async function assertDocumentQuota(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<UsageSnapshot> {
  const plan = await getPlan(ctx, businessId);
  const monthStart = currentMonthStart();
  const used = await countDocumentsThisMonth(ctx, businessId, monthStart);
  const limit = PLAN_LIMITS[plan].documentsPerMonth;

  if (used >= limit) {
    throw new AuthzError(
      `You've reached the free plan's monthly limit of ${limit} documents. Upgrade to create more — your existing quotes and invoices are unaffected.`,
    );
  }

  return {
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    canCreate: true,
    monthStart,
    monthEnd: currentMonthEnd(),
  };
}

/* ── Activation seam (payment-provider ready) ────────────────────── */

/**
 * Webhook-trusted plan application. INTERNAL: callable only from server code
 * (the Stripe webhook after signature verification) — never from the client.
 */
export const applyPaidPlan = internalMutation({
  args: {
    businessId: v.id("businesses"),
    plan: planId,
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();
    if (!subscription) return null;

    const now = Date.now();
    const paid = args.plan !== "free";
    await ctx.db.patch(subscription._id, {
      plan: args.plan,
      status: "active",
      currentPeriodStart: paid ? now : undefined,
      currentPeriodEnd: paid ? now + 30 * 86_400_000 : undefined,
      externalSubscriptionId: args.reference,
    });
    return subscription._id;
  },
});

/**
 * Activate or switch a business's plan.
 *
 * V1 demo flow: the owner/admin activates directly. In production this
 * mutation becomes the webhook target — e.g. Paystack's `charge.success` or
 * Stripe's `invoice.paid` — where the provider's signature is verified and
 * the plan from the verified event is applied here instead.
 */
export const activatePlan = mutation({
  args: {
    plan: planId,
    /** Provider reference (payment id / subscription id) once a gateway is live. */
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessId, role } = await requireActiveBusiness(ctx);
    if (role !== "owner" && role !== "admin") {
      throw new AuthzError("Only an owner or admin can change the plan.");
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .first();
    if (!subscription) {
      throw new AuthzError("Subscription record is missing.");
    }

    const now = Date.now();
    const paid = args.plan !== "free";
    const periodEnd = paid ? now + 30 * 86_400_000 : undefined;

    await ctx.db.patch(subscription._id, {
      plan: args.plan,
      status: "active",
      currentPeriodStart: paid ? now : undefined,
      currentPeriodEnd: periodEnd,
      externalSubscriptionId: args.reference,
    });

    return { plan: args.plan };
  },
});
