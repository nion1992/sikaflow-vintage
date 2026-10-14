import Stripe from "stripe";
import { v } from "convex/values";
import { httpAction, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireBusinessAdmin } from "./authz";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Stripe checkout & webhooks for SikaFlow plans.
 *
 * Flow:
 *  1. Owner/admin clicks a paid plan → `createCheckoutSession` mutation
 *     (authenticated) creates a Stripe Checkout Session with client_reference
 *     = businessId and returns the hosted checkout URL.
 *  2. Customer pays on Stripe's hosted page (cards; EFT/MoMo per account
 *     settings). Stripe redirects back to /settings?upgraded=1.
 *  3. Stripe POSTs signed webhook events to /stripe/webhook. The handler
 *     verifies the signature with STRIPE_WEBHOOK_SECRET, then activates the
 *     plan through the same billing seam used by manual activation.
 *
 * Env vars (Keys/API keys tab):
 *  - STRIPE_SECRET_KEY      — sk_live_… / sk_test_…
 *  - STRIPE_WEBHOOK_SECRET  — whsec_… (from the webhook endpoint settings)
 *
 * Plans/prices are defined in code (PRICE_MAP). To rotate prices, create the
 * Price in the Stripe dashboard and paste its id here — no deploy needed
 * beyond a Convex push.
 */

const PRICE_MAP: Record<"business" | "pro", string | undefined> = {
  // Create these prices in the Stripe dashboard, then paste the price ids:
  business: process.env.STRIPE_PRICE_BUSINESS,
  pro: process.env.STRIPE_PRICE_PRO,
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it in the Keys tab.");
  }
  return new Stripe(key);
}

/**
 * Whether real Stripe checkout is configured for a plan. The upgrade dialog
 * uses this to choose between hosted checkout and the direct-activation
 * fallback — without leaking any key material.
 */
export const checkoutConfigured = query({
  args: {},
  handler: async () => {
    return {
      business: Boolean(
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_BUSINESS,
      ),
      pro: Boolean(
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO,
      ),
    };
  },
});

/** Authenticated mutation: create a hosted checkout session for a paid plan. */
export const createCheckoutSession = mutation({
  args: { plan: v.union(v.literal("business"), v.literal("pro")) },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const { businessId, business } = await requireBusinessAdmin(ctx);

    const priceId = PRICE_MAP[args.plan];
    if (!priceId) {
      throw new Error(
        "This plan is not wired to a Stripe price yet (STRIPE_PRICE_BUSINESS / STRIPE_PRICE_PRO).",
      );
    }

    const stripe = getStripe();
    const origin = process.env.APP_ORIGIN ?? "https://sikaflow.app";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: businessId,
      customer_email: business.email ?? undefined,
      metadata: { businessId, plan: args.plan },
      subscription_data: { metadata: { businessId, plan: args.plan } },
      success_url: `${origin}/settings?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?upgraded=0`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL. Try again.");
    }
    return { url: session.url };
  },
});

/** Stripe webhook: verify signature, then apply the plan via billing seam. */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("[stripe] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Only trust plan transitions from verified events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.metadata?.businessId) {
        const plan = session.metadata.plan;
        if (plan === "business" || plan === "pro") {
          await ctx.runMutation(internal.billing.applyPaidPlan, {
            businessId: session.metadata.businessId as Id<"businesses">,
            plan,
            reference: session.subscription
              ? String(session.subscription)
              : session.id,
          });
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      if (subscription.metadata?.businessId) {
        await ctx.runMutation(internal.billing.applyPaidPlan, {
          businessId: subscription.metadata.businessId as Id<"businesses">,
          plan: "free",
          reference: subscription.id,
        });
      }
      break;
    }
    default:
      // Unhandled event types are acknowledged so Stripe stops retrying
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
