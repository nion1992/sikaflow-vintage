import { ConvexReactClient } from "convex/react";
import { getAccessToken, isSupabaseConfigured } from "./supabase";

/**
 * Convex client shared by the whole app.
 *
 * Convex authenticates the caller with the Supabase access token: `setAuth`
 * hands the token to the backend, which verifies it against the Supabase JWKS
 * configured in `src/convex/auth.config.ts` and exposes the result through
 * `ctx.auth.getUserIdentity()`.
 */
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!convexUrl) {
  console.warn("[convex] VITE_CONVEX_URL is not set — the backend is unreachable.");
}

export const convex = new ConvexReactClient(convexUrl ?? "http://127.0.0.1:3210");

/** Fetch the current Supabase token for Convex (null when signed out). */
export const fetchConvexToken = () => getAccessToken();

/**
 * Tell Convex who is signed in. Call on mount and whenever Supabase reports an
 * auth change (sign-in, token refresh, sign-out).
 */
export function syncConvexAuth(): void {
  if (!isSupabaseConfigured) return;
  convex.setAuth(fetchConvexToken);
}
