/**
 * Shared validators, enums and constants for SikaFlow.
 *
 * This module is client-safe (no server-only imports) so both the Convex
 * functions and the React UI can import the same vocabulary.
 *
 * Money rules:
 *  - All monetary amounts are stored as integer thebe/cents (1 E = 100 thebe).
 *  - Percentages (tax, discount) are stored as integer basis points:
 *    15% = 1500 bps, 10% discount = 1000 bps. No floats in money.
 */

import { v } from "convex/values";
import { Infer } from "convex/values";

/* ── Business member roles ───────────────────────────────────────── */

export const businessRoles = ["owner", "admin", "member"] as const;
export const businessRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);
export type BusinessRole = Infer<typeof businessRole>;

/* ── Document statuses ───────────────────────────────────────────── */

export const quoteStatuses = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;
export const quoteStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("expired"),
);
export type QuoteStatus = Infer<typeof quoteStatus>;

export const invoiceStatuses = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
] as const;
export const invoiceStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("partially_paid"),
  v.literal("paid"),
  v.literal("overdue"),
  v.literal("cancelled"),
);
export type InvoiceStatus = Infer<typeof invoiceStatus>;

/* ── Payments ────────────────────────────────────────────────────── */

export const paymentMethods = [
  "cash",
  "bank_transfer",
  "mobile_money",
  "card",
  "other",
] as const;
export const paymentMethod = v.union(
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("mobile_money"),
  v.literal("card"),
  v.literal("other"),
);
export type PaymentMethod = Infer<typeof paymentMethod>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile Money",
  card: "Card",
  other: "Other",
};

/* ── Subscriptions (architecture only in V1 — no gateway) ────────── */

export const planIds = ["free", "business", "pro"] as const;
export const planId = v.union(
  v.literal("free"),
  v.literal("business"),
  v.literal("pro"),
);
export type PlanId = Infer<typeof planId>;

export const subscriptionStatuses = [
  "active",
  "trialing",
  "past_due",
  "canceled",
] as const;
export const subscriptionStatus = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("canceled"),
);
export type SubscriptionStatus = Infer<typeof subscriptionStatus>;

/** Document quotas used by the free plan gate (enforced server-side later). */
export const PLAN_LIMITS: Record<PlanId, { documentsPerMonth: number }> = {
  free: { documentsPerMonth: 5 },
  business: { documentsPerMonth: Number.MAX_SAFE_INTEGER },
  pro: { documentsPerMonth: Number.MAX_SAFE_INTEGER },
};

/* ── Documents & numbers ─────────────────────────────────────────── */

export const DOC_PREFIXES = ["QT", "INV"] as const;
export type DocPrefix = (typeof DOC_PREFIXES)[number];

/** Basis points per whole percent (100 bps = 1%). */
export const BPS_PER_PERCENT = 100;

/** Basis points per 100 percent (10 000 bps = 100%). */
export const BPS_MAX = 10_000;

/** Default VAT rate for Eswatini: 15% = 1500 bps. Configurable per business. */
export const DEFAULT_TAX_RATE_BPS = 1500;

/** Default currency — architecture supports more later. */
export const DEFAULT_CURRENCY = "SZL";

/* ── Admin system roles (kept separate from business roles) ──────── */

export const ADMIN_SYSTEM_ROLES = ["platform_admin"] as const;
