// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, isAuthenticated } = convexAuth({
  providers: [emailOtp],
});

/**
 * Sign the current user out and invalidate their active session on the
 * server. Convex Auth's `signOut()` nulls the client-side session, but the
 * app used to keep logging back in because the `Anonymous` provider would
 * silently re-hydrate an anonymous identity. Removing that provider and
 * forcing the server-side session to be deleted makes `signOut()` the
 * authoritative operation: after it returns, the user is not signed in for
 * any request the next request (including the Convex subscription that
 * drives `isAuthenticated`).
 */
export const signOutUser = async (ctx: Parameters<typeof auth.signOut>[0]) => {
  await ctx.runMutation(auth.signOut);
};
