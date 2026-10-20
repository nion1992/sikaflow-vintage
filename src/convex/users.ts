import { query } from "./_generated/server";
import { getAuthUserId } from "./supabaseAuth";
import { findProfileRow } from "./supabaseUsers";

/**
 * The signed-in user's local profile. Returns null when signed out or before
 * the profile row exists (mid-onboarding).
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const supabaseUserId = await getAuthUserId(ctx);
    if (!supabaseUserId) return null;
    return await findProfileRow(ctx, supabaseUserId);
  },
});
