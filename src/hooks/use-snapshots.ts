import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CompareRequest,
  CursorQuery,
  SnapshotCommentCreateRequest,
  SnapshotCreateRequest,
  SnapshotForkRequest,
} from "@sudobility/screenwriter_types";
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

// ─── B15: prefs, notes, comments, compare ───────────────────────────────────────────────────────────

/** Hide or show a snapshot for the caller: only the document's snapshot list (`hiddenForMe`) changes. */
export function useSetSnapshotPrefs(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { snapshotId: string; hidden: boolean }) => client.setSnapshotPrefs(v.snapshotId, v.hidden),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }),
  });
}

export function useSnapshotNotes(sid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshotNotes(sid ?? ""),
    queryFn: () => client.listSnapshotNotes(sid as string),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!sid,
  });
}

/** Append-only. Refreshes the note list and the snapshot list (`noteCount`). */
export function useAddSnapshotNote(sid: string, did?: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => client.addSnapshotNote(sid, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.snapshotNotes(sid) }),
        did ? qc.invalidateQueries({ queryKey: queryKeys.snapshotsOf(did) }) : undefined,
      ]),
  });
}

export function useSnapshotComments(sid: string | undefined, filters: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.snapshotComments(sid ?? "", filters),
    queryFn: () => client.listSnapshotComments(sid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!sid,
  });
}

/** `AnchorNotFoundError` when the anchor does not resolve in the snapshot. */
export function useAddSnapshotComment(sid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SnapshotCommentCreateRequest) => client.addSnapshotComment(sid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.snapshotSide(sid) }),
  });
}

/** `resolved: true|false`. */
export function useResolveSnapshotComment(sid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { commentId: string; resolved: boolean }) => client.resolveSnapshotComment(v.commentId, v.resolved),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.snapshotSide(sid) }),
  });
}

/** Creates a note in the LIVE document (a write to it): refreshes the comment list and the document family (notes reads). */
export function useCopyCommentToLive(sid: string, did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => client.copyCommentToLive(commentId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.snapshotSide(sid) }),
        qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }),
      ]),
  });
}

/**
 * Element-level diff of two sources. Idle until a request is given. Two immutable sides never change, a `live` side does (the
 * document family refreshes it). `CompareTooLargeError` is a typed answer, not retried.
 */
export function useCompare(did: string | undefined, request: CompareRequest | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.compare(did ?? "", request ?? {}),
    queryFn: () => client.compare(did as string, request as CompareRequest),
    staleTime: request && (request.base.kind === "live" || request.target.kind === "live") ? STALE_TIMES.DETAIL : STALE_TIMES.IMMUTABLE,
    enabled: !!did && !!request,
    retry: false,
  });
}
