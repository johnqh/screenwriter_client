import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WorkspaceContactPatchRequest,
  WorkspaceContactsCreateRequest,
  WorkspaceContactsQuery,
  WorkspaceDefaults,
} from "@sudobility/screenwriter_types";
import type { WorkspaceDefaultsUpdate } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** What *New document* copies (tag categories, revision colour sets, note types), worksheets, the default project role. */
export function useWorkspaceDefaults(wid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceDefaults(wid ?? ""),
    queryFn: () => client.getWorkspaceDefaults(wid as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!wid,
  });
}

/**
 * Sets some top-level keys (`null` resets one). The cached defaults are the base, so a second call in a row skips the read;
 * the result replaces the cache. A lost race is merged and retried once by the client, then reaches `onError` as `StaleWriteError`.
 */
export function useSetWorkspaceDefaults(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: WorkspaceDefaultsUpdate) =>
      client.setWorkspaceDefaults(wid, update, qc.getQueryData<WorkspaceDefaults>(queryKeys.workspaceDefaults(wid))),
    onSuccess: r => qc.setQueryData(queryKeys.workspaceDefaults(wid), r),
  });
}

export function useContacts(wid: string | undefined, filters: Partial<WorkspaceContactsQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.contacts(wid ?? "", filters),
    queryFn: () => client.listContacts(wid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

const refreshContacts = (qc: ReturnType<typeof useQueryClient>, wid?: string) =>
  qc.invalidateQueries({ queryKey: wid ? [...queryKeys.workspaceSettings(), "contacts", wid] : [...queryKeys.workspaceSettings(), "contacts"] });

export function useCreateContacts(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contacts: WorkspaceContactsCreateRequest["contacts"]) => client.createContacts(wid, contacts),
    onSuccess: () => refreshContacts(qc, wid),
  });
}

export function useUpdateContact() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, patch }: { cid: string; patch: WorkspaceContactPatchRequest }) => client.updateContact(cid, patch),
    onSuccess: () => refreshContacts(qc),
  });
}

export function useDeleteContact() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (cid: string) => client.deleteContact(cid), onSuccess: () => refreshContacts(qc) });
}
