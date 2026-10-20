import {
  toAppUser,
  type AppUser,
  type SupabaseClient,
} from "@/lib/supabase";
import { authLinkType, supabase, isSupabaseConfigured } from "@/lib/supabase";
import { syncConvexAuth } from "@/lib/convex";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AppUser }
  | { status: "unauthenticated" };

type SignInResult = { error: string | null };

type SignUpResult = {
  error: string | null;
  /**
   * True when Supabase created the account but withheld a session because the
   * address still has to be confirmed by email.
   */
  needsEmailConfirmation: boolean;
};

export type SupabaseAuthContextValue = {
  client: SupabaseClient;
  isConfigured: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AppUser | null;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  signUp: (
    email: string,
    password: string,
    opts?: { name?: string; emailRedirectTo?: string },
  ) => Promise<SignUpResult>;
  resendConfirmation: (email: string) => Promise<SignInResult>;
  /**
   * True while a "reset password" link is being handled. The link signs the user
   * in, so screens must not treat that session as a normal sign-in until the new
   * password has been saved (or the user cancels).
   */
  isPasswordRecovery: boolean;
  resetPasswordForEmail: (email: string) => Promise<SignInResult>;
  updatePassword: (password: string) => Promise<SignInResult>;
  /** Drop the recovery state once the new password is saved (or cancelled). */
  finishPasswordRecovery: () => void;
  signInWithOtp: (
    email: string,
    opts?: { emailRedirectTo?: string },
  ) => Promise<SignInResult>;
  verifyOtp: (email: string, code: string) => Promise<SignInResult>;
  signInWithOAuth: (provider: "google" | "github") => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

export function useSupabaseAuthContext(): SupabaseAuthContextValue {
  const ctx = useContext(SupabaseAuthContext);
  if (!ctx) {
    throw new Error(
      "useSupabaseAuthContext must be used within a SupabaseAuthProvider.",
    );
  }
  return ctx;
}

/** Where Supabase should send the user back after a magic link. */
function authRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth`;
}

/** Survives a reload of the reset screen; holds no personal data. */
const RECOVERY_FLAG_KEY = "sikaflow:password-recovery";

function setRecoveryFlag(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG_KEY);
  } catch {
    // sessionStorage can be blocked (private mode, embedded contexts).
  }
}

function initialPasswordRecovery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(RECOVERY_FLAG_KEY) === "1") return true;
  } catch {
    // fall through to the URL check
  }
  // `authLinkType` is captured in lib/supabase before the client strips the URL.
  return authLinkType === "recovery";
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(initialPasswordRecovery);

  useEffect(() => {
    let cancelled = false;

    // Initial session (also restores the session from localStorage).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = toAppUser(data.session?.user);
      setState(user ? { status: "authenticated", user } : { status: "unauthenticated" });
      // Tell Convex who we are before the first query fires.
      syncConvexAuth();
    });

    // Supabase owns the session: mirror every change into React state and into
    // the Convex client's auth token.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryFlag(true);
        setIsPasswordRecovery(true);
      }
      const user = toAppUser(session?.user);
      setState(user ? { status: "authenticated", user } : { status: "unauthenticated" });
      syncConvexAuth();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      opts?: { name?: string; emailRedirectTo?: string },
    ): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: opts?.emailRedirectTo ?? authRedirectUrl(),
          data: opts?.name ? { name: opts.name } : undefined,
        },
      });
      if (error) return { error: error.message, needsEmailConfirmation: false };
      // Supabase returns a user with no session while email confirmation is on.
      return { error: null, needsEmailConfirmation: !data.session };
    },
    [],
  );

  const resendConfirmation = useCallback(
    async (email: string): Promise<SignInResult> => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const resetPasswordForEmail = useCallback(
    async (email: string): Promise<SignInResult> => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl(),
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<SignInResult> => {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error?.message ?? null };
    },
    [],
  );

  const finishPasswordRecovery = useCallback(() => {
    setRecoveryFlag(false);
    setIsPasswordRecovery(false);
  }, []);

  const signInWithOtp = useCallback(
    async (
      email: string,
      opts?: { emailRedirectTo?: string },
    ): Promise<SignInResult> => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: opts?.emailRedirectTo ?? authRedirectUrl() },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const verifyOtp = useCallback(
    async (email: string, code: string): Promise<SignInResult> => {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "github"): Promise<SignInResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authRedirectUrl() },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    // Drop the session *first*: clearing the recovery flag while a session is
    // still live would look like a normal sign-in and bounce the user to the app.
    await supabase.auth.signOut({ scope: "local" });
    // A half-finished reset must not linger across sessions.
    setRecoveryFlag(false);
    setIsPasswordRecovery(false);
  }, []);

  const value = useMemo<SupabaseAuthContextValue>(
    () => ({
      client: supabase,
      isConfigured: isSupabaseConfigured,
      isLoading: state.status === "loading",
      isAuthenticated: state.status === "authenticated",
      user: state.status === "authenticated" ? state.user : null,
      signInWithPassword,
      signUp,
      resendConfirmation,
      isPasswordRecovery,
      resetPasswordForEmail,
      updatePassword,
      finishPasswordRecovery,
      signInWithOtp,
      verifyOtp,
      signInWithOAuth,
      signOut,
    }),
    [
      state,
      isPasswordRecovery,
      signInWithPassword,
      signUp,
      resendConfirmation,
      resetPasswordForEmail,
      updatePassword,
      finishPasswordRecovery,
      signInWithOtp,
      verifyOtp,
      signInWithOAuth,
      signOut,
    ],
  );

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
