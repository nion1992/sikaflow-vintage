import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { stripeWebhook } from "./stripe";

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe delivers signed subscription events here (signature verified in-code)
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
