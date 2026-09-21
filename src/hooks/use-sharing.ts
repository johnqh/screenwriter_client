/** Tenancy, roles and sharing hooks (B8). Keys live under `queryKeys.sharing()`; public link reads under `queryKeys.shareLink(token)`. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CursorQuery,
  GrantUpdateRequest,
  InvitationCreateRequest,
  Role,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
  ShareTarget,
  WorkspaceAuditQuery,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
} from "@sudobility/screenwriter_types";
import { ApiError } from "../errors";
import type { ShareLinkTargetRef } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

const invalidateSharing = (qc: QueryClient) => qc.invalidateQueries({ queryKey: queryKeys.sharing() });
/** A change of role or membership also changes what the caller sees of workspaces, projects and documents. */
const invalidateAccess = (qc: QueryClient) =>
  Promise.all([
    invalidateSharing(qc),
    qc.invalidateQueries({ queryKey: queryKeys.workspaces() }),
    qc.invalidateQueries({ queryKey: [...queryKeys.all(), "workspace"] }),
    qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
    qc.invalidateQueries({ queryKey: queryKeys.projectsAll() }),
    qc.invalidateQueries({ queryKey: queryKeys.documentsAll() }),
  ]);

// ─── workspaces ─────────────────────────────────────────────────────────────

export function useCreateWorkspace() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkspaceCreateRequest) => client.createWorkspace(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspaces() }),
  });
}

export function useUpdateWorkspace(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WorkspaceUpdateRequest) => client.updateWorkspace(wid, patch),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: queryKeys.workspace(wid) }), qc.invalidateQueries({ queryKey: queryKeys.workspaces() })]),
  });
}

export function useDeleteWorkspace(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) => client.deleteWorkspace(wid, confirmName),
    onSuccess: () => invalidateAccess(qc),
  });
}

export function useTransferWorkspace(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toUserId: string) => client.transferWorkspace(wid, toUserId),
    onSuccess: () => invalidateAccess(qc),
  });
}

export function useLeaveWorkspace(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.leaveWorkspace(wid),
    onSuccess: () => invalidateAccess(qc),
  });
}

export function useWorkspaceUsage(wid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceUsage(wid ?? ""),
    queryFn: () => client.getWorkspaceUsage(wid as string),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

/** Not a query: an audit export is an explicit user action, so it is a mutation that resolves to the CSV text. */
export function useDownloadWorkspaceAudit(wid: string) {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (range: WorkspaceAuditQuery = {}) => client.downloadWorkspaceAudit(wid, range), gcTime: 0 });
}

// ─── members ────────────────────────────────────────────────────────────────

export function useMembers(wid: string | undefined, query: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: [...queryKeys.members(wid ?? ""), query],
    queryFn: () => client.listMembers(wid as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

export function useUpdateMemberRole(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { uid: string; role: Role }) => client.updateMemberRole(wid, v.uid, v.role),
    onSuccess: () => invalidateAccess(qc),
  });
}

export function useRemoveMember(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => client.removeMember(wid, uid),
    onSuccess: () => invalidateAccess(qc),
  });
}

// ─── invitations ────────────────────────────────────────────────────────────

export function useWorkspaceInvitations(wid: string | undefined, query: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: [...queryKeys.workspaceInvitations(wid ?? ""), query],
    queryFn: () => client.listWorkspaceInvitations(wid as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

export function useMyInvitations() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.myInvitations(),
    queryFn: () => client.listMyInvitations(),
    staleTime: STALE_TIMES.LISTS,
  });
}

/** `mutate({target, body})`: target is a workspace, project or document. */
export function useInviteMember() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: ShareTarget; body: InvitationCreateRequest }) => client.inviteMember(v.target, v.body),
    onSuccess: () => invalidateSharing(qc),
  });
}

export function useRenewInvitation() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (iid: string) => client.renewInvitation(iid), onSuccess: () => invalidateSharing(qc) });
}

export function useCancelInvitation() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (iid: string) => client.cancelInvitation(iid), onSuccess: () => invalidateSharing(qc) });
}

/** Accepting adds a membership or a grant: everything the user can see may change. */
export function useAcceptInvitation() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (token: string) => client.acceptInvitation(token), onSuccess: () => invalidateAccess(qc) });
}

export function useDeclineInvitation() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (iid: string) => client.declineInvitation(iid), onSuccess: () => invalidateSharing(qc) });
}

export function useSharedWithMe(query: Partial<CursorQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: [...queryKeys.sharedWithMe(), query],
    queryFn: () => client.listSharedWithMe(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

// ─── document lock ──────────────────────────────────────────────────────────

export function useLockDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => client.lockDocument(did), onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }) });
}

export function useUnlockDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => client.unlockDocument(did), onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }) });
}

/** The client remembers the token and sends it on that document's routes; refetch what was refused while it was locked. */
export function useCreateUnlockSession(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.createUnlockSession(did),
    gcTime: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) }),
  });
}

// ─── grants ─────────────────────────────────────────────────────────────────

export function useGrants(target: { type: "document" | "project"; id: string } | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.grants(target ?? { type: "document", id: "" }),
    queryFn: () => client.listGrants(target!),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!target?.id,
  });
}

export function useUpdateGrant() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { gid: string } & GrantUpdateRequest) => client.updateGrant(v.gid, { role: v.role }),
    onSuccess: () => invalidateSharing(qc),
  });
}

export function useRemoveGrant() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (gid: string) => client.removeGrant(gid), onSuccess: () => invalidateSharing(qc) });
}

// ─── share links (management) ───────────────────────────────────────────────

export function useShareLinks(target: { type: "document" | "project"; id: string } | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.shareLinks(target ?? { type: "document", id: "" }),
    queryFn: () => client.listShareLinks(target!),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!target?.id,
  });
}

/** The result carries the one-time token and URL. Do not persist it: `reset()` the mutation once it was copied. */
export function useCreateShareLink() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: ShareLinkTargetRef; body: ShareLinkCreateRequest }) => client.createShareLink(v.target, v.body),
    gcTime: 0,
    onSuccess: () => invalidateSharing(qc),
  });
}

export function useUpdateShareLink() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { lid: string } & ShareLinkUpdateRequest) => {
      const { lid, ...patch } = v;
      return client.updateShareLink(lid, patch);
    },
    onSuccess: () => Promise.all([invalidateSharing(qc), qc.invalidateQueries({ queryKey: [...queryKeys.all(), "share-link"] })]),
  });
}

export function useRevokeShareLink() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lid: string) => client.revokeShareLink(lid),
    onSuccess: () => Promise.all([invalidateSharing(qc), qc.invalidateQueries({ queryKey: [...queryKeys.all(), "share-link"] })]),
  });
}

// ─── public share links (no auth header, works signed out) ──────────────────

/** Resolve a link by token WITHOUT credentials. A dead link is a `ShareLinkExpiredError` (`.reason`); it is never retried. */
export function useShareLink(token: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.shareLink(token ?? ""),
    queryFn: () => client.resolveShareLink(token as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!token,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
  });
}

/** `mutate(password?)` -> `{linkSession, expiresAt, access}`. Keep the session in memory and renew it before it expires (15 min). */
export function useShareUnlock(token: string) {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (password?: string) => client.unlockShareLink(token, password), gcTime: 0 });
}

/** The Yjs state behind a link (a `linkSession` for a password link; a project link needs `documentId`). */
export function useSharedState(token: string | undefined, opts: { linkSession?: string; documentId?: string } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: [...queryKeys.sharedState(token ?? "", opts.documentId), opts.linkSession ?? null],
    queryFn: () => client.getSharedState(token as string, opts),
    staleTime: 0,
    enabled: !!token,
    retry: false,
  });
}
