import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeUpdateRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useMe(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => client.me(),
    staleTime: STALE_TIMES.ME,
    ...options,
  });
}

export function useUpdateMe() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MeUpdateRequest) => client.updateMe(patch),
    onSuccess: me => qc.setQueryData(queryKeys.me(), me),
  });
}

export function useManagedEntities(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.managedEntityList(),
    queryFn: () => client.listManagedEntities(),
    staleTime: STALE_TIMES.WORKSPACES,
    ...options,
  });
}

export function useEntityDetails(entityId: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.managedEntityDetails(entityId ?? ""),
    queryFn: () => client.getEntityDetails(entityId as string),
    staleTime: STALE_TIMES.WORKSPACES,
    enabled: !!entityId,
  });
}
