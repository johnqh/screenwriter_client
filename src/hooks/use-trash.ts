import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorQuery } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** Trashed projects and documents of a workspace, each with the date it is purged. */
export function useTrash(wid: string | undefined, filters: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.trash(wid ?? "", filters),
    queryFn: () => client.listTrash(wid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

/** Starts the `system.purge` job for the whole trash (admin); follow it with `useJob`. Refreshes the trash and every list when started. */
export function useEmptyTrash(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.emptyTrash(wid),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
        qc.invalidateQueries({ queryKey: queryKeys.jobs() }),
        qc.invalidateQueries({ queryKey: queryKeys.documentLists() }),
        qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
      ]),
  });
}
