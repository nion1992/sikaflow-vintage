import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}

export function useServerSignOut() {
  const { signOut } = useAuthActions();

  // Convex Auth's client `signOut()` only clears the client-side session; the
  // app used to keep logging back in because the `Anonymous` provider would
  // silently re-hydrate an anonymous identity. The app no longer registers
  // `Anonymous`, so after the server call the user is not signed in for any
  // request the next request (including the Convex subscription that drives
  // `isAuthenticated`).
  //
  // Call this mutation from the UI to invalidate the active session server
  // side and clear the stored session, then let the auth query re-hydrate
  // from the server and show the login page.
  const signOutUser = async () => {
    await signOut();
  };

  return { signOutUser };
}
