import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorQuery, ProjectBinCreateRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** The project's Shared Bin (frozen snippets shared by its documents). Online only. */
export function useProjectBin(pid: string | undefined, filters: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.projectBin(pid ?? "", filters),
    queryFn: () => client.listProjectBin(pid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!pid,
  });
}

export function useAddToProjectBin(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectBinCreateRequest) => client.addToProjectBin(pid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projectBin(pid) }),
  });
}

export function useRemoveFromProjectBin() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.removeFromProjectBin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projectBinAll() }),
  });
}
