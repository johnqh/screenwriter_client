import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyCreateRequest, ApiKeyUpdateRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useApiKeys() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.apiKeys(),
    queryFn: () => client.listApiKeys(),
    staleTime: STALE_TIMES.LISTS,
  });
}

/**
 * The mutation result carries the one-time full key. Do not persist it: `reset()` the mutation once the user
 * has dismissed it. The query cache only ever gets the list (summaries), never the secret.
 */
export function useCreateApiKey() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiKeyCreateRequest) => client.createApiKey(body),
    gcTime: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys() }),
  });
}

export function useUpdateApiKey() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kid: string } & ApiKeyUpdateRequest) => {
      const { kid, ...body } = v;
      return client.updateApiKey(kid, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys() }),
  });
}

export function useRevokeApiKey() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kid: string) => client.revokeApiKey(kid),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys() }),
  });
}
