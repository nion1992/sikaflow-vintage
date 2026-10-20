import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { requireActiveBusiness } from "./authz";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Off-site backup data layer (Supabase snapshots).
 *
 * `collect` and `record` are internal: they run only from the
 * `supabaseSync` actions, which authenticate the caller first (an action's
 * downstream runQuery/runMutation calls carry no auth context, so
 * authorization happens once in the action itself).
 */

/** Everything needed to reconstruct the ledger, as one JSON-safe snapshot. */
type Snapshot = {
  businessId: Id<"businesses">;
  business: Doc<"businesses"> | null;
  settings: Doc<"businessSettings"> | null;
  customers: Doc<"customers">[];
  products: Doc<"products">[];
  quotes: Doc<"quotes">[];
  quoteItems: Doc<"quoteItems">[];
  invoices: Doc<"invoices">[];
  invoiceItems: Doc<"invoiceItems">[];
  payments: Doc<"payments">[];
};

/**
 * Resolve the caller's primary business and confirm they may manage
 * backups (owner or admin only). Used by the node actions, which receive
 * only a userId.
 */
export const resolveAdminMembership = internalQuery({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("businessMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.supabaseUserId))
      .collect();

    for (const membership of memberships) {
      if (membership.deletedAt !== undefined) continue;
      if (membership.role !== "owner" && membership.role !== "admin") continue;
      const business = await ctx.db.get(membership.businessId);
      if (business && business.deletedAt === undefined) {
        return {
          userId: args.supabaseUserId,
          businessId: business._id,
          role: membership.role,
          businessName: business.name,
        };
      }
    }
    return null;
  },
});

/** Gather every record for one business into a single snapshot object. */
export const collect = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args): Promise<Snapshot> => {
    const businessId = args.businessId;

    const business = await ctx.db.get(businessId);

    const settings =
      (await ctx.db
        .query("businessSettings")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .unique()) ?? null;

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_businessId_name", (q) => q.eq("businessId", businessId))
      .collect();

    const products = await ctx.db
      .query("products")
      .withIndex("by_businessId_name", (q) => q.eq("businessId", businessId))
      .collect();

    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_businessId_documentNumber", (q) =>
        q.eq("businessId", businessId),
      )
      .collect();

    const quoteItems = await ctx.db
      .query("quoteItems")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId_documentNumber", (q) =>
        q.eq("businessId", businessId),
      )
      .collect();

    const invoiceItems = await ctx.db
      .query("invoiceItems")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    return {
      businessId,
      business,
      settings,
      customers,
      products,
      quotes,
      quoteItems,
      invoices,
      invoiceItems,
      payments,
    };
  },
});

/** Record one backup attempt and keep only the four most recent runs. */
export const record = internalMutation({
  args: {
    businessId: v.id("businesses"),
    status: v.union(v.literal("ok"), v.literal("error")),
    totalRecords: v.number(),
    tableCounts: v.record(v.string(), v.number()),
    snapshotJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("backupRuns", {
      businessId: args.businessId,
      createdAt: Date.now(),
      status: args.status,
      totalRecords: args.totalRecords,
      tableCounts: args.tableCounts,
      snapshotJson: args.snapshotJson,
      error: args.error,
    });

    // Prune: keep the newest four runs per business.
    const runs = await ctx.db
      .query("backupRuns")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .collect();
    for (const run of runs.slice(4)) {
      await ctx.db.delete(run._id);
    }

    return id;
  },
});

/** Recent backup runs + whether Supabase keys are present, for the UI. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { businessId } = await requireActiveBusiness(ctx);
    const runs = await ctx.db
      .query("backupRuns")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .order("desc")
      .collect();

    return {
      configured: Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      runs: runs.slice(0, 5).map((run) => ({
        id: run._id,
        createdAt: run.createdAt,
        status: run.status,
        totalRecords: run.totalRecords,
        tableCounts: run.tableCounts,
        error: run.error,
      })),
    };
  },
});
