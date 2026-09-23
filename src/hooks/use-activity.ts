/** Document and workspace activity feeds (B12, spec 05 §6.15). Read-only: no mutations. */
import { useQuery } from "@tanstack/react-query";
import type { ActivityQuery, WorkspaceActivityQuery } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useActivity(did: string, query: Partial<ActivityQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentActivity(did, query),
    queryFn: () => client.listDocumentActivity(did, query),
    enabled: !!did,
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useWorkspaceActivity(wid: string, query: Partial<WorkspaceActivityQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceActivity(wid, query),
    queryFn: () => client.listWorkspaceActivity(wid, query),
    enabled: !!wid,
    staleTime: STALE_TIMES.LISTS,
  });
}
