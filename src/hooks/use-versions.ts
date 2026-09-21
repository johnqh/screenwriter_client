import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorQuery, VersionSnapshotRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";
import { invalidateDocumentLists } from "./use-documents";

export function useVersions(did: string | undefined, filters: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.versions(did ?? "", filters),
    queryFn: () => client.listVersions(did as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

export function useVersionState(did: string | undefined, vid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.versionState(did ?? "", vid ?? ""),
    queryFn: () => client.getVersionState(did as string, vid as string),
    staleTime: STALE_TIMES.IMMUTABLE,
    enabled: !!did && !!vid,
  });
}

/** Restoring bumps the document epoch, so everything about the document is stale afterwards. */
export function useRestoreVersion(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vid: string) => client.restoreVersion(did, vid),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.versionsOf(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }),
        invalidateDocumentLists(qc),
      ]),
  });
}

export function useSnapshotVersion(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { versionId: string } & VersionSnapshotRequest) => {
      const { versionId, ...body } = v;
      return client.snapshotVersion(did, versionId, body);
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.versionsOf(did) }),
      ]),
  });
}
