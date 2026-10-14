import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "./use-auth";

/**
 * Plan usage for the signed-in business.
 *
 * `isLoading` covers auth + query resolution; the query is skipped when
 * signed out so the hook is safe on public pages.
 */
export function useUsage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const data = useQuery(
    api.billing.getUsage,
    isAuthenticated ? {} : "skip",
  );

  return {
    isLoading: authLoading || (isAuthenticated && data === undefined),
    plan: data?.plan ?? null,
    limit: data?.limit ?? null,
    used: data?.used ?? null,
    remaining: data?.remaining ?? null,
    canCreate: data?.canCreate ?? true,
  };
}
