import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PurchaseHandoffRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** The current balance. A purchase or usage (an AI job's charge/refund) changes it, so keep this short-lived. */
export function useCreditsBalance() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.creditsBalance(),
    queryFn: () => client.getCreditsBalance(),
    staleTime: 0,
  });
}

export function useCreditPurchases(query: { limit?: number; offset?: number } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.creditPurchases(query),
    queryFn: () => client.listCreditPurchases(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useCreditUsages(query: { limit?: number; offset?: number } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.creditUsages(query),
    queryFn: () => client.listCreditUsages(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

/** Public: the priced catalog for the purchase sheet. Works signed out too. */
export function useCreditProducts() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.creditProducts(),
    queryFn: () => client.listCreditProducts(),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

/** Mints a single-use URL that sends a platform with no in-app purchase (Windows) to buy credits on the web. */
export function useCreatePurchaseHandoff() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseHandoffRequest) => client.createPurchaseHandoff(body),
    // the balance may change once the web purchase completes and the RevenueCat webhook lands
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creditsBalance() }),
  });
}
