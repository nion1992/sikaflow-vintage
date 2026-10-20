import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Caller identity for Supabase-authenticated requests.
 *
 * The browser hands Convex its Supabase access token (`setAuth`), Convex
 * verifies the signature against the Supabase JWKS configured in
 * `auth.config.ts`, and exposes the claims through `ctx.auth.getUserIdentity()`.
 * `identity.subject` is the Supabase `auth.users` id.
 *
 * No service-role key is involved: verification is done by Convex, and the
 * token never has to be re-read from a request (queries have no Request object).
 */
type AuthedCtx = QueryCtx | MutationCtx | ActionCtx;

/** The verified Supabase auth user id, or null when signed out. */
export async function getAuthUserId(ctx: AuthedCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** The full identity (claims included), or null when signed out. */
export async function getUserIdentity(ctx: AuthedCtx) {
  return await ctx.auth.getUserIdentity();
}

/**
 * Look up the app's profile row for the given Supabase auth user.
 * Returns null when the mapping row doesn't exist yet (first sign-in before the
 * profile has been synced).
 */
export async function lookupSupabaseUser(
  ctx: QueryCtx | MutationCtx,
  supabaseUserId: string,
): Promise<{
  id: Id<"supabaseUsers">;
  supabaseUserId: string;
  email: string | null;
  name: string | null;
  image: string | null;
} | null> {
  const row = await ctx.db
    .query("supabaseUsers")
    .withIndex("by_supabaseUserId", (q) => q.eq("supabaseUserId", supabaseUserId))
    .first();
  if (!row) return null;
  return {
    id: row._id,
    supabaseUserId: row.supabaseUserId,
    email: row.email ?? null,
    name: row.name ?? null,
    image: row.image ?? null,
  };
}
