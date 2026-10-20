import { api } from "@/convex/_generated/api";
import { useSupabaseAuthContext } from "@/providers/supabase-auth-provider";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * App-wide auth hook.
 *
 * Backend: Supabase Auth (email OTP, magic link, password, OAuth). Convex sees
 * the Supabase access token and maps it to a local profile row in
 * `supabaseUsers` via `ctx.auth.getUserIdentity()`.
 *
 * The `user` returned here is the local profile row, so pages get the app's
 * fields (name, role, defaultBusinessId) instead of raw Supabase metadata.
 */
export function useAuth() {
  const auth = useSupabaseAuthContext();
  const profile = useQuery(
    api.supabaseUsers.currentProfile,
    auth.isAuthenticated ? {} : "skip",
  );
  const syncProfile = useMutation(api.supabaseUsers.syncProfile);
  const syncing = useRef(false);

  // First sign-in on a fresh backend: materialize the local profile from the
  // verified Supabase identity (email / name / avatar) so onboarding has a row.
  useEffect(() => {
    if (!auth.isAuthenticated || profile !== null || syncing.current) return;
    syncing.current = true;
    syncProfile({})
      .catch((error) => {
        console.error("[auth] Could not sync the local profile:", error);
      })
      .finally(() => {
        syncing.current = false;
      });
  }, [auth.isAuthenticated, profile, syncProfile]);

  const isLoading =
    auth.isLoading || (auth.isAuthenticated && profile === undefined);

  const user =
    auth.isAuthenticated && profile
      ? {
          id: profile._id,
          email: profile.email ?? auth.user?.email ?? null,
          name: profile.name ?? null,
          image: profile.image ?? null,
          supabaseUserId: profile.supabaseUserId,
          role: profile.role ?? null,
        }
      : null;

  return {
    isLoading,
    isAuthenticated: auth.isAuthenticated,
    user,
    /** Supabase identity (null while signed out). */
    supabaseUser: auth.user,
    signIn: async (provider?: string, options?: Record<string, unknown>) => {
      if (provider === "email" || provider === "email-otp" || provider === "magiclink") {
        const email = (options?.email as string | undefined)?.trim();
        if (!email) throw new Error("Enter an email address to receive a sign-in code.");
        const { error } = await auth.signInWithOtp(email);
        if (error) throw new Error(error);
        return;
      }
      const email = (options?.email as string | undefined)?.trim();
      const password = options?.password as string | undefined;
      if (email && password) {
        const { error } = await auth.signInWithPassword(email, password);
        if (error) throw new Error(error);
        return;
      }
      throw new Error(`Unsupported sign-in method: ${provider ?? "none"}`);
    },
    signOut: auth.signOut,
  };
}

/**
 * Server-side sign-out hook for the UI.
 *
 * Clears the Supabase session (local storage); Convex holds no session of its
 * own, it just stops receiving a token.
 */
export function useServerSignOut() {
  const { signOut } = useSupabaseAuthContext();
  return { signOutUser: signOut };
}
