import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminJobKindPatchRequest, AdminJobListQuery, AdminJobRefundRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** Admin (spec 05 §6.23): used only by an admin page — `siteAdmin` on a user principal, checked server-side. */
export function useAdminUser(email: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.adminUser(email ?? ""),
    queryFn: () => client.adminLookupUser(email as string),
    staleTime: 0,
    enabled: !!email,
  });
}

export function useAdminRestoreUser() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (uid: string) => client.adminRestoreUser(uid) });
}

export function useAdminPurgeUser() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (uid: string) => client.adminPurgeUser(uid) });
}

export function useAdminJobs(query: AdminJobListQuery = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.adminJobs(query),
    queryFn: () => client.adminListJobs(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useAdminRetryJob() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => client.adminRetryJob(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminJobsFamily() }),
  });
}

export function useAdminRefundJob() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: ({ jobId, body }: { jobId: string; body?: AdminJobRefundRequest }) => client.adminRefundJob(jobId, body) });
}

export function useAdminUpdateJobKind() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: ({ kind, patch }: { kind: string; patch: AdminJobKindPatchRequest }) => client.adminUpdateJobKind(kind, patch) });
}

export function useAdminDocumentMeta(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.adminDocumentMeta(did ?? ""),
    queryFn: () => client.adminGetDocumentMeta(did as string),
    staleTime: 0,
    enabled: !!did,
  });
}
