import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "./use-auth";

export interface MyBusiness {
  business: {
    _id: string;
    _creationTime: number;
    name: string;
    description?: string;
    logoStorageId?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    website?: string;
    taxNumber?: string;
    currency: string;
  };
  role: "owner" | "admin" | "member";
  settings?: {
    defaultTaxRateBps: number;
    defaultPaymentTermsDays: number;
    defaultQuoteValidityDays: number;
    defaultNotes?: string;
    defaultTerms?: string;
    quotePrefix: string;
    invoicePrefix: string;
  };
  subscription?: {
    plan: "free" | "business" | "pro";
    status: "active" | "trialing" | "past_due" | "canceled";
  };
  logoUrl: string | null;
}

/**
 * Business context for the signed-in user.
 *
 * - `isLoading` true while auth or the business query is still resolving.
 * - `needsOnboarding` true when the user is signed in but has no business.
 */
export function useBusiness() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const data = useQuery(api.businesses.getMyBusiness, isAuthenticated ? {} : "skip");

  const isLoading = authLoading || (isAuthenticated && data === undefined);
  const needsOnboarding = Boolean(
    isAuthenticated && !authLoading && data === null,
  );

  return {
    isLoading,
    needsOnboarding,
    hasBusiness: data !== null && data !== undefined,
    business: data?.business ?? null,
    role: data?.role ?? null,
    settings: data?.settings ?? null,
    subscription: data?.subscription ?? null,
    logoUrl: data?.logoUrl ?? null,
  };
}
