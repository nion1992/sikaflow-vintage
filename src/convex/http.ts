import { httpRouter } from "convex/server";
import { stripeWebhook } from "./stripe";

const http = httpRouter();

// Stripe delivers signed subscription events here (signature verified in-code)
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

// NOTE: Convex Auth routes (auth.addHttpRoutes) have been removed.
// Authentication is handled by Supabase Auth. ConvexReactClient.setAuth hands
// the Supabase access token to Convex, auth.config.ts verifies it against the
// Supabase JWKS, and functions read the caller via ctx.auth.getUserIdentity().

export default http;
