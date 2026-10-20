import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthUserId } from "./supabaseAuth";
import { AuthzError } from "./authz";

/**
 * Local profile rows for Supabase auth users.
 *
 * Supabase Auth owns identity; this table owns the app's own fields (name,
 * role, default business). `supabaseUserId` is always the verified
 * `identity.subject` — it is never accepted from the client.
 */

type ProfileRow = {
  _id: import("./_generated/dataModel").Id<"supabaseUsers">;
  supabaseUserId: string;
  name?: string;
  image?: string;
  email?: string;
  emailVerificationTime?: number;
  role?: "admin" | "user" | "member";
  phone?: string;
  defaultBusinessId?: import("./_generated/dataModel").Id<"businesses">;
  createdAt: number;
  updatedAt?: number;
};

/** Plain lookup helper shared by the queries below. */
export async function findProfileRow(
  ctx: QueryCtx | MutationCtx,
  supabaseUserId: string,
): Promise<ProfileRow | null> {
  return await ctx.db
    .query("supabaseUsers")
    .withIndex("by_supabaseUserId", (q) => q.eq("supabaseUserId", supabaseUserId))
    .first();
}

/** The signed-in caller's profile, or null while signed out / before sync. */
export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    const supabaseUserId = await getAuthUserId(ctx);
    if (!supabaseUserId) return null;
    return await findProfileRow(ctx, supabaseUserId);
  },
});

/** Internal lookup by Supabase id (for server-side code only). */
export const findBySupabaseId = internalQuery({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => await findProfileRow(ctx, args.supabaseUserId),
});

/** Internal lookup by email (duplicate checks, invitations). */
export const findByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supabaseUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

/**
 * Create or refresh the caller's local profile from their verified Supabase
 * identity. Safe to call on every sign-in (upsert semantics).
 */
export const syncProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new AuthzError("You must be signed in to do that.");
    }

    const existing = await findProfileRow(ctx, identity.subject);
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        name: identity.name ?? existing.name,
        image: identity.pictureUrl ?? existing.image,
        updatedAt: now,
      });
      return { id: existing._id };
    }

    const id = await ctx.db.insert("supabaseUsers", {
      supabaseUserId: identity.subject,
      email: identity.email,
      name: identity.name,
      image: identity.pictureUrl,
      emailVerificationTime: identity.emailVerified ? now : undefined,
      createdAt: now,
    });

    return { id };
  },
});
