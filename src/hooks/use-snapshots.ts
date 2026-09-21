import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SnapshotCreateRequest, SnapshotForkRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";
import { invalidateDocumentLists } from "./use-documents";

export function useSnapshots(did: string | undefined, opts: { includeAutomatic?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshots(did ?? "", opts),
    queryFn: () => client.listSnapshots(did as string, opts),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

export function useSnapshot(sid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshot(sid ?? ""),
    queryFn: () => client.getSnapshot(sid as string),
    staleTime: STALE_TIMES.IMMUTABLE,
    enabled: !!sid,
  });
}

export function useSnapshotState(sid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshotState(sid ?? ""),
    queryFn: () => client.getSnapshotState(sid as string),
    staleTime: STALE_TIMES.IMMUTABLE,
    enabled: !!sid,
  });
}

export function useSnapshotContent(sid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshotContent(sid ?? ""),
    queryFn: () => client.getSnapshotContent(sid as string),
    staleTime: STALE_TIMES.IMMUTABLE,
    enabled: !!sid,
  });
}

/** Creating a snapshot re-parents the live document and adds a marker to the version list. */
export function useCreateSnapshot(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SnapshotCreateRequest) => client.createSnapshot(did, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.versionsOf(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.document(did) }),
      ]),
  });
}

/** Opening bumps the document epoch (connected sync clients get `epochChanged`). */
export function useOpenSnapshot(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => client.openSnapshot(sid),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.versionsOf(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }),
        invalidateDocumentLists(qc),
      ]),
  });
}

export function useForkSnapshot() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { snapshotId: string } & SnapshotForkRequest) => {
      const { snapshotId, ...body } = v;
      return client.forkSnapshot(snapshotId, body);
    },
    onSuccess: () => invalidateDocumentLists(qc),
  });
}
