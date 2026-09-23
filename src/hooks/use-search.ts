import { useQuery } from "@tanstack/react-query";
import type { DocumentSearchQuery, SearchQuery } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** Search across everything the caller can read (scope with `workspaceId`, `projectId`, `documentId`). Idle for an empty `q`. */
export function useSearch(query: Partial<SearchQuery> & { q: string }, opts: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => client.search(query),
    staleTime: STALE_TIMES.LISTS,
    enabled: query.q.trim().length > 0 && (opts.enabled ?? true),
  });
}

export function useWorkspaceSearch(wid: string | undefined, query: Partial<Omit<SearchQuery, "workspaceId">> & { q: string }) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceSearch(wid ?? "", query),
    queryFn: () => client.searchWorkspace(wid as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid && query.q.trim().length > 0,
  });
}

/** In-document find (text or regex). A bad regex surfaces as an `ApiError` `INVALID_REGEX`. */
export function useDocumentSearch(did: string | undefined, query: Partial<DocumentSearchQuery> & { q: string }) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentSearch(did ?? "", query),
    queryFn: () => client.searchDocument(did as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && query.q.length > 0,
    retry: false,
  });
}
