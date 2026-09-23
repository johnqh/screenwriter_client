import { useQuery } from "@tanstack/react-query";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** The client-policy route (R31): `minClientVersion`, feature flags, price basis. Rarely changes. */
export function usePublicConfig() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.publicConfig(),
    queryFn: () => client.getPublicConfig(),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

export function usePublicTemplates(category?: string) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.publicTemplates(category),
    queryFn: () => client.listPublicTemplates(category),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

/** Immutable once published (the route itself sends a far-future `Cache-Control`): cache forever client-side too. */
export function useNamesDb(version: number | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.namesDb(version ?? 0),
    queryFn: () => client.getNamesDb(version as number),
    staleTime: Infinity,
    enabled: version != null,
  });
}

export function useDeepHealth() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.deepHealth(),
    queryFn: () => client.getDeepHealth(),
    staleTime: 0,
  });
}
