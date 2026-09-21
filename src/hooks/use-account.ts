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

export function useWorkspaces(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: () => client.listWorkspaces(),
    staleTime: STALE_TIMES.WORKSPACES,
    ...options,
  });
}

export function useWorkspace(wid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspace(wid ?? ""),
    queryFn: () => client.getWorkspace(wid as string),
    staleTime: STALE_TIMES.WORKSPACES,
    enabled: !!wid,
  });
}
