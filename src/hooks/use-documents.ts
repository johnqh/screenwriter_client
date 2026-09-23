import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CursorQuery,
  DocumentApplyTemplateRequest,
  DocumentCreateRequest,
  DocumentDuplicateRequest,
  DocumentListQuery,
  DocumentMoveRequest,
  DocumentUpdateRequest,
  WorkspaceDocumentsQuery,
} from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

type DocumentFilters = Partial<CursorQuery> & Partial<DocumentListQuery>;

/** Document lists and the project detail (which embeds its documents) go stale together. */
export const invalidateDocumentLists = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.documentLists() }),
    qc.invalidateQueries({ queryKey: queryKeys.projectsAll() }),
  ]);

export function useDocuments(pid: string | undefined, filters: DocumentFilters = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documents(pid ?? "", filters),
    queryFn: () => client.listDocuments(pid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!pid,
  });
}

export function useDocument(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.document(did ?? ""),
    queryFn: () => client.getDocument(did as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did,
  });
}

/** Raw Yjs V2 state bytes plus epoch. Not cached across mounts: the live doc moves on. */
export function useDocumentState(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentState(did ?? ""),
    queryFn: () => client.getDocumentState(did as string),
    staleTime: 0,
    gcTime: 0,
    enabled: !!did,
  });
}

export function useDocumentContent(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentContent(did ?? ""),
    queryFn: () => client.getDocumentContent(did as string),
    staleTime: 0,
    enabled: !!did,
  });
}

export function useCreateDocument(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentCreateRequest) => client.createDocument(pid, body),
    onSuccess: () => invalidateDocumentLists(qc),
  });
}

export function useUpdateDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: DocumentUpdateRequest) => client.updateDocument(did, patch),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: queryKeys.document(did) }), invalidateDocumentLists(qc)]),
  });
}

export function useTrashDocument() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (did: string) => client.trashDocument(did),
    onSuccess: (_r, did) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.document(did) }),
        invalidateDocumentLists(qc),
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
      ]),
  });
}

export function useRestoreDocument() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (did: string) => client.restoreDocument(did),
    onSuccess: (_r, did) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.document(did) }),
        invalidateDocumentLists(qc),
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
      ]),
  });
}

/** Documents across a workspace (dashboard "recent", "starred", "with label"; MCP `list_documents`). */
export function useWorkspaceDocuments(wid: string | undefined, filters: Partial<WorkspaceDocumentsQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceDocuments(wid ?? "", filters),
    queryFn: () => client.listWorkspaceDocuments(wid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

/** Permanently delete a trashed document (admin); a job, so lists and the trash refresh now and settle when it ran. */
export function usePurgeDocument() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (did: string) => client.purgeDocument(did),
    onSuccess: (_r, did) =>
      Promise.all([
        invalidateDocumentLists(qc),
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
        qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }),
      ]),
  });
}

/** Moves the document to another project of its workspace: both project lists and the document itself refresh. */
export function useMoveDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentMoveRequest) => client.moveDocument(did, body),
    onSuccess: () =>
      Promise.all([invalidateDocumentLists(qc), qc.invalidateQueries({ queryKey: queryKeys.document(did) })]),
  });
}

export function useDuplicateDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentDuplicateRequest) => client.duplicateDocument(did, body),
    onSuccess: () => invalidateDocumentLists(qc),
  });
}

/**
 * `dryRun` answers `{unmappedStyles, pageDelta}`; a real apply starts the `doc.applyTemplate` job (`isApplyTemplateJob`).
 * The document's template facts change when the job finishes, so pair it with `useJob` and refresh `queryKeys.documentFamily(did)`.
 */
export function useApplyTemplate(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentApplyTemplateRequest) => client.applyTemplate(did, body),
    onSuccess: (_r, body) =>
      body.dryRun
        ? undefined
        : Promise.all([qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }), qc.invalidateQueries({ queryKey: queryKeys.jobs() })]),
  });
}
