import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  businessRole,
  quoteStatus,
  invoiceStatus,
  paymentMethod,
  planId,
  subscriptionStatus,
} from "./shared";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);

/**
 * SikaFlow relational schema.
 *
 * Conventions:
 *  - Money: integer thebe/cents (1 E = 100). Percentages: integer basis points.
 *  - Every business record carries `businessId`; authorization helpers in
 *    `src/convex/authz.ts` enforce membership (the RLS equivalent).
 *  - Denormalized `documentNumber` on quotes/invoices for search & display.
 *  - `deletedAt` marks soft-deleted records so history is never lost.
 */
const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // SikaFlow: phone for WhatsApp features; defaultBusiness is set after onboarding
      phone: v.optional(v.string()),
      defaultBusinessId: v.optional(v.id("businesses")),
    }).index("email", ["email"]),

    // Self-serve customer accounts. Each customer is their own Convex user; the
    // row below is the join table that gives an account access to the company's
    // products and requested RFQs (company-owned data). `email` is only used as a
    // login id / lookup hint together with the company id.
    customerAccounts: defineTable({
      // Owned by the customer account (its own user id)
      accountUserId: v.id("users"),
      // The company that owns the products / RFQs this customer is allowed to see
      businessId: v.id("businesses"),
      // The customer record in this company's customer book
      customerId: v.id("customers"),
      displayName: v.string(),
      email: v.string(), // used as a login hint; verified at sign-up / change of email
      invitedBy: v.optional(v.id("users")),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
      .index("by_accountUserId", ["accountUserId"])
      .index("by_businessId", ["businessId"])
      .index("by_businessId_customerId", ["businessId", "customerId"])
      .index("by_businessId_email", ["businessId", "email"]),

    // Links a customer account's Convex user to the products and RFQs its company
    // owns. A customer account's user may only read the rows it is granted here.
    customerBusinessAccess: defineTable({
      businessId: v.id("businesses"),
      accountUserId: v.id("users"),
      customerAccountId: v.id("customerAccounts"),
      access: v.union(v.literal("products"), v.literal("rfqs")),
      createdAt: v.number(),
    })
      .index("by_businessId", ["businessId"])
      .index("by_accountUserId", ["accountUserId"])
      .index("by_customerAccountId", ["customerAccountId"]),

    // Requested-for-quotation requests. A customer fills in a short form against a
    // product they are interested in; the company owns the product and can reply
    // with a full quotation. `customerId` is the customer's own id *within the
    // company's customer book*.
    requestedRfqs: defineTable({
      businessId: v.id("businesses"),
      customerId: v.id("customers"),
      customerAccountId: v.id("customerAccounts"),
      productId: v.id("products"),
      productName: v.string(),
      message: v.string(),
      status: v.union(
        v.literal("new"),
        v.literal("viewed"),
        v.literal("responded"),
        v.literal("rejected"),
      ),
      viewedAt: v.optional(v.number()),
      respondedAt: v.optional(v.number()),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_businessId_customerAccountId", ["businessId", "customerAccountId"])
      .index("by_businessId_productId", ["businessId", "productId"])
      .index("by_businessId_customerId", ["businessId", "customerId"]),

    /* ── Customers ──────────────────────────────────────────────── */

    /* ── Businesses ─────────────────────────────────────────────── */

    businesses: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      logoStorageId: v.optional(v.id("_storage")),
      phone: v.optional(v.string()),
      whatsapp: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      website: v.optional(v.string()),
      taxNumber: v.optional(v.string()), // VAT number
      currency: v.string(), // ISO 4217, e.g. "SZL"
      createdById: v.id("users"),
      deletedAt: v.optional(v.number()),
    })
      .index("by_createdBy", ["createdById"])
      .index("by_name", ["name"]),

    // Multi-user support: a user belongs to a business through membership rows
    businessMembers: defineTable({
      businessId: v.id("businesses"),
      userId: v.id("users"),
      role: businessRole, // owner | admin | member
      invitedEmail: v.optional(v.string()), // for future invites
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_userId", ["userId"])
      // Enforce one membership row per (business, user) pair at write time
      .index("by_businessId_userId", ["businessId", "userId"]),

    // Per-business document settings: VAT rate, prefixes, terms, numbering
    businessSettings: defineTable({
      businessId: v.id("businesses"),
      defaultTaxRateBps: v.number(), // 1500 = 15% VAT
      defaultPaymentTermsDays: v.number(), // invoice due window
      defaultQuoteValidityDays: v.number(), // quote expiry window
      defaultNotes: v.optional(v.string()),
      defaultTerms: v.optional(v.string()),
      quotePrefix: v.string(), // "QT"
      invoicePrefix: v.string(), // "INV"
      nextQuoteNumber: v.number(), // sequential counter, starts at 1
      nextInvoiceNumber: v.number(),
    }).index("by_businessId", ["businessId"]),

    /* ── Customers ──────────────────────────────────────────────── */

    customers: defineTable({
      businessId: v.id("businesses"),
      name: v.string(),
      company: v.optional(v.string()),
      phone: v.optional(v.string()),
      whatsapp: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      notes: v.optional(v.string()),
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_businessId_name", ["businessId", "name"]),

    /* ── Products & services ────────────────────────────────────── */

    products: defineTable({
      businessId: v.id("businesses"),
      name: v.string(),
      description: v.optional(v.string()),
      sku: v.optional(v.string()),
      category: v.optional(v.string()),
      unit: v.optional(v.string()), // "each", "hour", "m²", …
      unitPriceCents: v.number(), // integer thebe
      taxRateBps: v.optional(v.number()), // falls back to business default
      active: v.boolean(),
      qrCode: v.optional(v.string()), // QR code data URL for product deep-linking
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_businessId_active", ["businessId", "active"])
      .index("by_businessId_name", ["businessId", "name"]),

    /* ── Quotations ─────────────────────────────────────────────── */

    quotes: defineTable({
      businessId: v.id("businesses"),
      customerId: v.id("customers"),
      documentNumber: v.string(), // QT-2026-0001 (unique per business)
      status: quoteStatus,
      quoteDate: v.number(), // epoch ms
      expiryDate: v.number(),
      // Totals snapshot in integer thebe (kept in sync with items on write)
      subtotalCents: v.number(),
      discountTotalCents: v.number(),
      taxTotalCents: v.number(),
      grandTotalCents: v.number(),
      notes: v.optional(v.string()),
      terms: v.optional(v.string()),
      // Audit trail
      createdById: v.id("users"),
      sentAt: v.optional(v.number()),
      acceptedAt: v.optional(v.number()),
      rejectedAt: v.optional(v.number()),
      // When converted, points at the resulting invoice
      convertedInvoiceId: v.optional(v.id("invoices")),
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_businessId_status", ["businessId", "status"])
      .index("by_businessId_customerId", ["businessId", "customerId"])
      .index("by_businessId_documentNumber", ["businessId", "documentNumber"]),

    quoteItems: defineTable({
      businessId: v.id("businesses"),
      quoteId: v.id("quotes"),
      // Optional link back to the saved product it was picked from
      productId: v.optional(v.id("products")),
      order: v.number(), // sort order within the quote
      name: v.string(),
      description: v.optional(v.string()),
      quantity: v.number(), // integer units of the line
      unit: v.optional(v.string()),
      unitPriceCents: v.number(),
      discountBps: v.number(), // per-line discount, 1000 = 10%
      taxRateBps: v.number(), // per-line VAT, 1500 = 15%
      // Cached line totals (thebe) for fast document rendering
      lineSubtotalCents: v.number(),
      discountCents: v.number(),
      taxCents: v.number(),
      lineTotalCents: v.number(),
    })
      .index("by_quoteId", ["quoteId"])
      .index("by_businessId", ["businessId"]),

    /* ── Invoices ───────────────────────────────────────────────── */

    invoices: defineTable({
      businessId: v.id("businesses"),
      customerId: v.id("customers"),
      documentNumber: v.string(), // INV-2026-0001 (unique per business)
      status: invoiceStatus,
      invoiceDate: v.number(),
      dueDate: v.number(),
      // Totals snapshot in integer thebe
      subtotalCents: v.number(),
      discountTotalCents: v.number(),
      taxTotalCents: v.number(),
      grandTotalCents: v.number(),
      amountPaidCents: v.number(), // denormalized sum of payments
      notes: v.optional(v.string()),
      terms: v.optional(v.string()),
      paymentTermsDays: v.optional(v.number()),
      // Origin: quotes → invoices conversion
      sourceQuoteId: v.optional(v.id("quotes")),
      createdById: v.id("users"),
      sentAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      deletedAt: v.optional(v.number()),
    })
      .index("by_businessId", ["businessId"])
      .index("by_businessId_status", ["businessId", "status"])
      .index("by_businessId_customerId", ["businessId", "customerId"])
      .index("by_businessId_documentNumber", ["businessId", "documentNumber"])
      .index("by_sourceQuoteId", ["sourceQuoteId"]),

    invoiceItems: defineTable({
      businessId: v.id("businesses"),
      invoiceId: v.id("invoices"),
      productId: v.optional(v.id("products")),
      order: v.number(),
      name: v.string(),
      description: v.optional(v.string()),
      quantity: v.number(),
      unit: v.optional(v.string()),
      unitPriceCents: v.number(),
      discountBps: v.number(),
      taxRateBps: v.number(),
      lineSubtotalCents: v.number(),
      discountCents: v.number(),
      taxCents: v.number(),
      lineTotalCents: v.number(),
    })
      .index("by_invoiceId", ["invoiceId"])
      .index("by_businessId", ["businessId"]),

    /* ── Payments (tracking only — no gateway in V1) ────────────── */

    payments: defineTable({
      businessId: v.id("businesses"),
      invoiceId: v.id("invoices"),
      customerId: v.id("customers"), // denormalized for customer history
      paymentDate: v.number(),
      amountCents: v.number(),
      method: paymentMethod,
      reference: v.optional(v.string()),
      notes: v.optional(v.string()),
      recordedById: v.id("users"),
      deletedAt: v.optional(v.number()),
    })
      .index("by_invoiceId", ["invoiceId"])
      .index("by_businessId", ["businessId"])
      .index("by_businessId_customerId", ["businessId", "customerId"]),

    /* ── Subscriptions (architecture for future SaaS billing) ───── */

    subscriptions: defineTable({
      businessId: v.id("businesses"),
      plan: planId,
      status: subscriptionStatus,
      currentPeriodStart: v.optional(v.number()),
      currentPeriodEnd: v.optional(v.number()),
      // Placeholder fields for a future payment provider (e.g. Paystack/Stripe)
      externalCustomerId: v.optional(v.string()),
      externalSubscriptionId: v.optional(v.string()),
      cancelAtPeriodEnd: v.optional(v.boolean()),
    }).index("by_businessId", ["businessId"]),

    /* ── Off-site backups (Supabase snapshots) ─────────────────── */

    backupRuns: defineTable({
      businessId: v.id("businesses"),
      createdAt: v.number(), // epoch ms
      status: v.union(v.literal("ok"), v.literal("error")),
      totalRecords: v.number(),
      tableCounts: v.record(v.string(), v.number()),
      snapshotJson: v.optional(v.string()),
      error: v.optional(v.string()),
    }).index("by_businessId", ["businessId"]),

    /* ── Platform admin (separate from business users) ──────────── */

    systemSettings: defineTable({
      key: v.string(), // e.g. "default_trial_plan"
      value: v.optional(v.string()),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
