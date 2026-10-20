"use node";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./supabaseAuth";
import { AuthzError } from "./authz";

/**
 * Off-site snapshots to Supabase Postgres (actions only — the database
 * reads/writes live in backupsData.ts, which stays in the default runtime).
 *
 * Keys come from process.env (Keys tab) and never reach the frontend.
 * Create the sikaflow_snapshots table with the SQL in README.md.
 */

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Keys tab.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Authenticate once in the action (runQuery carries no auth downstream). */
async function requireAdminBusiness(
  ctx: ActionCtx,
  userId: string | null,
): Promise<{ businessId: Id<"businesses">; businessName: string }> {
  if (!userId) throw new AuthzError("You must be signed in to do that.");
  const result = await ctx.runQuery(internal.backupsData.resolveAdminMembership, {
    supabaseUserId: userId,
  });
  if (!result) {
    throw new AuthzError("Only the business owner or an admin can run backups.");
  }
  return result;
}

/** Cheap write test against Supabase — proves keys and table exist. */
export const testConnection = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const { businessId } = await requireAdminBusiness(ctx, userId);

    const supabase = getAdminClient();
    const { error } = await supabase.from("sikaflow_snapshots").upsert({
      business_id: businessId,
      kind: "connection_test",
      snapshot: {},
      record_count: 0,
      created_at: new Date().toISOString(),
    });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  },
});

/** Full snapshot → one row in Supabase, recorded in backupRuns. */
export const backupNow = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; error?: string; totalRecords?: number }> => {
    const userId = await getAuthUserId(ctx);
    const { businessId } = await requireAdminBusiness(ctx, userId);
    const supabase = getAdminClient();

    const snap = await ctx.runQuery(internal.backupsData.collect, {
      businessId,
    });

    const tableCounts = {
      customers: snap.customers.length,
      products: snap.products.length,
      quotes: snap.quotes.length,
      quoteItems: snap.quoteItems.length,
      invoices: snap.invoices.length,
      invoiceItems: snap.invoiceItems.length,
      payments: snap.payments.length,
    };
    const totalRecords = Object.values(tableCounts).reduce(
      (sum, n) => sum + n,
      0,
    );

    const { error } = await supabase.from("sikaflow_snapshots").upsert({
      business_id: businessId,
      kind: "backup",
      snapshot: snap,
      record_count: totalRecords,
      created_at: new Date().toISOString(),
    });

    if (error) {
      await ctx.runMutation(internal.backupsData.record, {
        businessId,
        status: "error",
        totalRecords,
        tableCounts,
        error: error.message,
      });
      return { ok: false as const, error: error.message };
    }

    await ctx.runMutation(internal.backupsData.record, {
      businessId,
      status: "ok",
      totalRecords,
      tableCounts,
    });
    return { ok: true, totalRecords };
  },
});
