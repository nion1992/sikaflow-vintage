import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

/**
 * The one Supabase client for the whole app.
 *
 * Auth (sign-in, sessions, OTP, magic link) lives in Supabase. Convex only sees
 * the resulting access token (forwarded by `ConvexReactClient.setAuth`).
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** False when the build has no Supabase env vars (auth is then disabled). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — auth is disabled.",
  );
}

/**
 * Auth signals read from the URL *before* the client consumes it.
 *
 * `detectSessionInUrl` parses and then strips the fragment asynchronously, so by
 * the time a component renders the hash may already be gone. Anything that needs
 * to know how the user arrived (reset link, expired link) must read it here.
 */
const initialAuthUrl =
  typeof window === "undefined"
    ? ""
    : `${window.location.hash}${window.location.search}`;

/** True when this page load came from a "reset your password" link. */
export const authLinkType = /[#&?]type=recovery/.test(initialAuthUrl)
  ? ("recovery" as const)
  : null;

/** True when the link failed (used or expired) instead of signing the user in. */
export const authLinkError = /[#&?](error_code|error=)/.test(initialAuthUrl);

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export { type SupabaseClient, type Session, type User };

/** Signed-in user's profile as the app sees it. */
export interface AppUser {
  id: string; // Supabase auth.users id
  email: string | null;
  name?: string | null;
  image?: string | null;
}

/** Map a Supabase user onto the app's user shape. */
export function toAppUser(user: User | null | undefined): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.user_metadata?.name ?? null,
    image: user.user_metadata?.avatar_url ?? user.user_metadata?.avatar ?? null,
  };
}

/** Current session, or null when signed out. Refreshes an expired token. */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

/** Access token to hand to Convex, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/** Current Supabase user (validated against the auth server), or null. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return toAppUser(data.user);
}

/** Whether a valid (non-expired) session exists. */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return !session.expires_at || session.expires_at * 1000 > Date.now();
}
