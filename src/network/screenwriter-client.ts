import {
  API_BASE_PATH,
  type AiJob,
  type Job,
  type JobCreateRequest,
  type JobDryRunResponse,
  type JobListQuery,
  type JobOutputsResponse,
  type JobRecipient,
  type AiJobCreated,
  type AiJobCreateRequest,
  type AiStatus,
  type ApiKeyCreated,
  type ApiKeyCreateRequest,
  type ApiKeyRevokeResponse,
  type ApiKeySummary,
  type ApiKeyUpdateRequest,
  type SuggestionAcceptResponse,
  type SuggestionSet,
  type SuggestionSetSummary,
  type ApiRouteName,
  type DocumentLockResponse,
  type GrantUpdateRequest,
  type Invitation,
  type InvitationAcceptResult,
  type InvitationCreateRequest,
  type Member,
  type PublicShareInfo,
  type Role,
  type ShareGrant,
  type ShareLink,
  type ShareLinkCreateRequest,
  type ShareLinkCreated,
  type ShareLinkRevokeResponse,
  type ShareLinkUpdateRequest,
  type ShareTarget,
  type ShareUnlockResponse,
  type SharedItem,
  type UnlockSession,
  type Workspace,
  type WorkspaceAuditQuery,
  type WorkspaceCreateRequest,
  type WorkspaceDeleteResponse,
  type WorkspaceUpdateRequest,
  type WorkspaceUsage,
  type CommandBatchRequest,
  type CommandBatchResponse,
  type CursorQuery,
  type DocumentCreateRequest,
  type DocumentDetail,
  type DocumentListQuery,
  type DocumentMeta,
  type DocumentImportRequest,
  type DocumentImportResult,
  type DocumentUpdateRequest,
  type ElementsBatchResponse,
  type ExportFormatId,
  type ConversionReport,
  type FormatInfo,
  type Me,
  type MeUpdateRequest,
  type OutlineResponse,
  type Paginated,
  type Project,
  type ProjectCreateRequest,
  type ProjectListQuery,
  type ProjectSummary,
  type ProjectUpdateRequest,
  type SceneRead,
  type ScenesBatchResponse,
  type SnapshotCreateRequest,
  type SnapshotCreateResponse,
  type SnapshotDetail,
  type SnapshotForkRequest,
  type SnapshotListResponse,
  type SnapshotOpenResponse,
  type SnapshotSummary,
  type TemplateSummary,
  type TrashResult,
  type VersionListItem,
  type VersionRestoreResponse,
  type VersionSnapshotRequest,
  type WorkspaceDetail,
  type WorkspaceListItem,
} from "@sudobility/screenwriter_types";
import type { DocumentJSON, TemplateJSON } from "@sudobility/writing_core";
import { ApiError, apiErrorFrom } from "../errors";
import { base64ToBytes, bytesToBase64, type BinaryInput, toUint8Array } from "../util/base64";
import type { HttpMethod, NetworkClient, NetworkResponse } from "./network-client";
import {
  GZIP_MIN_BYTES,
  canGzip,
  gzipText,
  isRetryable,
  newIdempotencyKey,
  parseRetryAfter,
  resolveRetry,
  retryDelayMs,
  type RetryPolicy,
} from "./retry";

export interface ScreenwriterClientOptions {
  network: NetworkClient;
  /** API origin, e.g. `http://localhost:8042` (no `/api/v1`). */
  baseUrl: string;
  /**
   * Bearer token supplier. Called per request; `forceRefresh` is true on the one retry after a 401.
   * Return null when signed out.
   */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Sent as `X-Client` on every request, e.g. `web/1.4.0` (`fadewright-mcp/<v>` marks MCP command origins). */
  clientTag?: string;
  /**
   * Retry policy (spec 10 §2.4): GET/PUT/DELETE always, POST only with an `Idempotency-Key` (every POST the client sends
   * carries one, except the read-only and file-body ones), network errors, 408, 429 `RATE_LIMITED`, 502, 503, 504,
   * full-jitter backoff, `Retry-After` honoured. `false` disables retries; a partial object overrides defaults.
   */
  retry?: Partial<RetryPolicy> | false;
  /** Gzip JSON bodies of at least 1 KiB when the platform has `CompressionStream` (default true). */
  gzip?: boolean;
  /** Where `Idempotency-Key` values come from (default: a random UUID per call). Tests inject a counter. */
  newIdempotencyKey?: () => string;
}

/** A Yjs V2 document state as fetched over REST. */
export interface BinaryState {
  state: Uint8Array;
  epoch: number;
  /** Only `/documents/:did/state` sends it. */
  stateVector: Uint8Array | null;
}

/** `importDocument` input: the file as `bytes` (or an already-encoded `contentB64`) plus the request options. */
export type ImportDocumentInput = Omit<DocumentImportRequest, "contentB64"> &
  ({ bytes: BinaryInput; contentB64?: undefined } | { contentB64: string; bytes?: undefined });

export interface ExportedDocument {
  filename: string;
  mimeType: string;
  /** Decoded file bytes. */
  bytes: Uint8Array;
  report: ConversionReport;
  format: ExportFormatId;
}

type Query = Record<string, string | number | boolean | undefined>;

/**
 * Which credential a request carries. `user` (default): the signed-in user's token if there is one (retried once on 401).
 * `none`: no Authorization header at all (public share routes, works signed out). `{bearer}`: exactly that token, such as a
 * link session (`fls_...`).
 */
export type AuthMode = "user" | "none" | { bearer: string };

/** A place sharing attaches to: `inviteMember`, `listGrants`, `createShareLink` and `listShareLinks` dispatch on `type`. */
export type ShareLinkTargetRef = { type: "document" | "project" | "snapshot"; id: string };

const enc = encodeURIComponent;

/**
 * Typed wrapper over every route the API serves. Returns unwrapped envelope `data`, throws `ApiError`.
 * Which method serves which `API_ROUTES` entry is declared in `API_ROUTE_METHODS` (checked by a test).
 */
export class ScreenwriterClient {
  /** Unlock-session tokens by document id, sent as `X-Doc-Unlock` on that document's routes (spec 05 §6.7). */
  private readonly unlockTokens = new Map<string, string>();

  constructor(private readonly opts: ScreenwriterClientOptions) {}

  /** Remember (or forget, with null) an unlock-session token for a locked document. `createUnlockSession` does this itself. */
  setDocumentUnlock(did: string, token: string | null): void {
    if (token) this.unlockTokens.set(did, token);
    else this.unlockTokens.delete(did);
  }
  getDocumentUnlock(did: string): string | null {
    return this.unlockTokens.get(did) ?? null;
  }

  // ─── transport ───────────────────────────────────────────────────────────

  private url(path: string, query?: Query): string {
    const base = this.opts.baseUrl.replace(/\/+$/, "");
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const q = qs.toString();
    return `${base}${API_BASE_PATH}${path}${q ? `?${q}` : ""}`;
  }

  /** WebSocket URL of the sync endpoint on this API. */
  syncUrl(): string {
    return this.url("/sync").replace(/^http/, "ws");
  }

  /** POSTs that never get an `Idempotency-Key`: reads dressed as POST and file bodies the server already dedupes by id. */
  private static readonly NO_KEY = [/\/export$/, /\/documents\/import$/, /\/(elements|scenes)\/batch$/, /\/share\/[^/]+\/unlock$/];

  /**
   * The request funnel (spec 10 §2.2): headers (token, `X-Client`, unlock token, `Idempotency-Key` on creates), gzip of
   * JSON bodies >= 1 KiB, one token refresh after a 401, then the retry policy (§2.4). The idempotency key is made once
   * and reused by every retry of the same logical call.
   */
  private async send(method: HttpMethod, path: string, query?: Query, body?: unknown, auth: AuthMode = "user", key?: string): Promise<NetworkResponse> {
    const policy = resolveRetry(this.opts.retry);
    const idemKey = key ?? (method === "POST" && !ScreenwriterClient.NO_KEY.some(re => re.test(path)) ? (this.opts.newIdempotencyKey ?? newIdempotencyKey)() : undefined);
    const did = /^\/documents\/([^/]+)/.exec(path)?.[1];
    const unlock = did ? this.unlockTokens.get(decodeURIComponent(did)) : undefined;
    let payload: string | Uint8Array | undefined;
    let gzipped = false;
    if (body !== undefined) {
      const text = JSON.stringify(body);
      if (this.opts.gzip !== false && text.length >= GZIP_MIN_BYTES && canGzip()) {
        payload = await gzipText(text);
        gzipped = true;
      } else {
        payload = text;
      }
    }
    const once = async (forceRefresh: boolean): Promise<NetworkResponse> => {
      const headers: Record<string, string> = {};
      const token = auth === "user" ? await this.opts.getToken(forceRefresh) : auth === "none" ? null : auth.bearer;
      if (token) headers.Authorization = `Bearer ${token}`;
      if (this.opts.clientTag) headers["X-Client"] = this.opts.clientTag;
      if (unlock) headers["X-Doc-Unlock"] = unlock;
      if (idemKey) headers["Idempotency-Key"] = idemKey;
      if (payload !== undefined) {
        headers["Content-Type"] = "application/json";
        if (gzipped) headers["Content-Encoding"] = "gzip";
      }
      try {
        const req: Parameters<NetworkClient["request"]>[0] = { method, url: this.url(path, query), headers };
        if (payload !== undefined) req.body = payload;
        return await this.opts.network.request(req);
      } catch (e) {
        throw new ApiError(e instanceof Error ? e.message : String(e), "NETWORK_ERROR", 0);
      }
    };
    let attempt = 1;
    let refreshed = false;
    for (;;) {
      let res: NetworkResponse | null = null;
      let failure: ApiError | null = null;
      try {
        res = await once(refreshed && attempt === 1 ? true : false);
      } catch (e) {
        failure = e as ApiError;
      }
      if (res && res.status === 401 && auth === "user" && !refreshed) {
        refreshed = true; // one refresh, not a retry attempt
        res = await once(true).catch(e => ((failure = e as ApiError), null));
      }
      const status = res?.status ?? 0;
      const code = res && status >= 400 ? this.codeOf(res) : undefined;
      if (attempt >= policy.maxAttempts || !isRetryable(method, !!idemKey, status, code)) {
        if (failure && !res) throw failure;
        return res as NetworkResponse;
      }
      await policy.sleep(retryDelayMs(policy, attempt, status, parseRetryAfter(res?.headers["retry-after"])));
      attempt++;
    }
  }

  /** The `code` of a failure envelope, if the body is one. */
  private codeOf(res: NetworkResponse): string | undefined {
    try {
      const env = JSON.parse(new TextDecoder().decode(res.body)) as { success?: boolean; code?: string };
      return env.success === false ? env.code : undefined;
    } catch {
      return undefined;
    }
  }

  private fail(res: NetworkResponse): never {
    let env: unknown;
    try {
      env = JSON.parse(new TextDecoder().decode(res.body));
    } catch {
      /* not JSON */
    }
    if (env && typeof env === "object" && (env as { success?: unknown }).success === false) {
      const f = env as { error?: string; code?: string; details?: Record<string, unknown> };
      const retryAfter = parseRetryAfter(res.headers["retry-after"]);
      const details = retryAfter !== undefined && f.details?.retryAfterS === undefined ? { ...f.details, retryAfterS: Math.ceil(retryAfter / 1000) } : f.details;
      throw apiErrorFrom(f.error ?? `HTTP ${res.status}`, (f.code ?? "INTERNAL") as ApiError["code"], res.status, details);
    }
    throw new ApiError(`HTTP ${res.status}`, "BAD_RESPONSE", res.status);
  }

  private async json<T>(method: HttpMethod, path: string, query?: Query, body?: unknown, auth: AuthMode = "user", key?: string): Promise<T> {
    const res = await this.send(method, path, query, body, auth, key);
    if (res.status < 200 || res.status >= 300) this.fail(res);
    try {
      const env = JSON.parse(new TextDecoder().decode(res.body)) as { success?: boolean; data?: T };
      if (env.success !== true) throw new Error("not a success envelope");
      return env.data as T;
    } catch {
      throw new ApiError("Malformed response envelope", "BAD_RESPONSE", res.status);
    }
  }

  private async bytes(path: string, query?: Query, auth: AuthMode = "user"): Promise<BinaryState> {
    const res = await this.send("GET", path, query, undefined, auth);
    if (res.status < 200 || res.status >= 300) this.fail(res);
    const sv = res.headers["x-state-vector"];
    return {
      state: res.body,
      epoch: Number(res.headers["x-epoch"] ?? 0),
      stateVector: sv ? Uint8Array.from(atob(sv), c => c.charCodeAt(0)) : null,
    };
  }

  // ─── health, me ──────────────────────────────────────────────────────────

  health() {
    return this.json<{ status: string } & Record<string, unknown>>("GET", "/health");
  }
  me() {
    return this.json<Me>("GET", "/me");
  }
  updateMe(patch: MeUpdateRequest) {
    return this.json<Me>("PATCH", "/me", undefined, patch);
  }

  // ─── workspaces ──────────────────────────────────────────────────────────

  listWorkspaces() {
    return this.json<Paginated<WorkspaceListItem>>("GET", "/workspaces");
  }
  getWorkspace(wid: string) {
    return this.json<WorkspaceDetail>("GET", `/workspaces/${enc(wid)}`);
  }
  /** A team workspace with the caller as its owner (409 `LIMIT_EXCEEDED` past 50 owned teams). */
  createWorkspace(body: WorkspaceCreateRequest) {
    return this.json<Workspace>("POST", "/workspaces", undefined, body);
  }
  updateWorkspace(wid: string, patch: WorkspaceUpdateRequest) {
    return this.json<Workspace>("PATCH", `/workspaces/${enc(wid)}`, undefined, patch);
  }
  /** Soft delete; `confirmName` must equal the workspace name (400 `CONFIRMATION_MISMATCH`). */
  deleteWorkspace(wid: string, confirmName: string) {
    return this.json<WorkspaceDeleteResponse>("DELETE", `/workspaces/${enc(wid)}`, undefined, { confirmName });
  }
  /** Make another member the owner; the caller becomes an admin. */
  transferWorkspace(wid: string, toUserId: string) {
    return this.json<Workspace>("POST", `/workspaces/${enc(wid)}/transfer`, undefined, { toUserId });
  }
  /** 409 `LAST_OWNER` for the sole owner. */
  leaveWorkspace(wid: string) {
    return this.json<{ left: true }>("POST", `/workspaces/${enc(wid)}/leave`);
  }
  getWorkspaceUsage(wid: string) {
    return this.json<WorkspaceUsage>("GET", `/workspaces/${enc(wid)}/usage`);
  }
  /** The audit log as CSV text (owner/admin; range at most one year). */
  async downloadWorkspaceAudit(wid: string, range: WorkspaceAuditQuery = {}): Promise<string> {
    const res = await this.send("GET", `/workspaces/${enc(wid)}/audit.csv`, { from: range.from, to: range.to });
    if (res.status < 200 || res.status >= 300) this.fail(res);
    return new TextDecoder().decode(res.body);
  }

  // ─── members and invitations (B8) ────────────────────────────────────────

  listMembers(wid: string, query: Partial<CursorQuery> = {}) {
    return this.json<Paginated<Member>>("GET", `/workspaces/${enc(wid)}/members`, query);
  }
  /** 403 `ROLE_ESCALATION` above your own role; 409 `LAST_OWNER`. */
  updateMemberRole(wid: string, uid: string, role: Role) {
    return this.json<Member>("PATCH", `/workspaces/${enc(wid)}/members/${enc(uid)}`, undefined, { role });
  }
  removeMember(wid: string, uid: string) {
    return this.json<{ removed: true }>("DELETE", `/workspaces/${enc(wid)}/members/${enc(uid)}`);
  }
  /** Invite by email. The response never holds the token: it travels by email (slice B12). */
  inviteToWorkspace(wid: string, body: InvitationCreateRequest) {
    return this.json<Invitation>("POST", `/workspaces/${enc(wid)}/invitations`, undefined, body);
  }
  inviteToProject(pid: string, body: InvitationCreateRequest) {
    return this.json<Invitation>("POST", `/projects/${enc(pid)}/invitations`, undefined, body);
  }
  inviteToDocument(did: string, body: InvitationCreateRequest) {
    return this.json<Invitation>("POST", `/documents/${enc(did)}/invitations`, undefined, body);
  }
  /** One entry point for the three invitation routes. */
  inviteMember(target: ShareTarget, body: InvitationCreateRequest) {
    return target.type === "workspace"
      ? this.inviteToWorkspace(target.id, body)
      : target.type === "project"
        ? this.inviteToProject(target.id, body)
        : this.inviteToDocument(target.id, body);
  }
  listWorkspaceInvitations(wid: string, query: Partial<CursorQuery> = {}) {
    return this.json<Paginated<Invitation>>("GET", `/workspaces/${enc(wid)}/invitations`, query);
  }
  /** Pending invitations addressed to the signed-in user's verified email. */
  listMyInvitations() {
    return this.json<Invitation[]>("GET", "/me/invitations");
  }
  renewInvitation(iid: string) {
    return this.json<Invitation>("POST", `/invitations/${enc(iid)}/renew`);
  }
  cancelInvitation(iid: string) {
    return this.json<{ cancelled: true }>("DELETE", `/invitations/${enc(iid)}`);
  }
  /** `token` is the one from the email. 410 `INVITATION_INVALID|EXPIRED|CLOSED`, 403 `EMAIL_MISMATCH`. */
  acceptInvitation(token: string) {
    return this.json<InvitationAcceptResult>("POST", "/invitations/accept", undefined, { token });
  }
  declineInvitation(iid: string) {
    return this.json<{ declined: true }>("POST", `/invitations/${enc(iid)}/decline`);
  }
  /** Projects and documents shared with the caller through grants (outside their own workspaces). */
  listSharedWithMe(query: Partial<CursorQuery> = {}) {
    return this.json<Paginated<SharedItem>>("GET", "/me/shared", query);
  }

  // ─── document lock (B8) ──────────────────────────────────────────────────

  /** Needs a recent sign-in (401 `REAUTH_REQUIRED` otherwise). */
  lockDocument(did: string) {
    return this.json<DocumentLockResponse>("POST", `/documents/${enc(did)}/lock`);
  }
  unlockDocument(did: string) {
    this.unlockTokens.delete(did);
    return this.json<DocumentLockResponse>("DELETE", `/documents/${enc(did)}/lock`);
  }
  /**
   * Opens a locked document for this user for 30 minutes; the token is kept and sent as `X-Doc-Unlock` on that document's
   * routes from now on. For the sync socket pass `getUnlockToken` to `SyncClient`.
   */
  async createUnlockSession(did: string) {
    const s = await this.json<UnlockSession>("POST", `/documents/${enc(did)}/unlock-session`);
    this.unlockTokens.set(did, s.sessionToken);
    return s;
  }

  // ─── grants and share links (B8) ─────────────────────────────────────────

  listDocumentGrants(did: string) {
    return this.json<ShareGrant[]>("GET", `/documents/${enc(did)}/grants`);
  }
  listProjectGrants(pid: string) {
    return this.json<ShareGrant[]>("GET", `/projects/${enc(pid)}/grants`);
  }
  listGrants(target: { type: "document" | "project"; id: string }) {
    return target.type === "document" ? this.listDocumentGrants(target.id) : this.listProjectGrants(target.id);
  }
  updateGrant(gid: string, body: GrantUpdateRequest) {
    return this.json<ShareGrant>("PATCH", `/grants/${enc(gid)}`, undefined, body);
  }
  removeGrant(gid: string) {
    return this.json<{ removed: true }>("DELETE", `/grants/${enc(gid)}`);
  }
  /** The token (and so the URL) is in this response and never again. */
  createDocumentShareLink(did: string, body: ShareLinkCreateRequest) {
    return this.json<ShareLinkCreated>("POST", `/documents/${enc(did)}/share-links`, undefined, body);
  }
  createProjectShareLink(pid: string, body: ShareLinkCreateRequest) {
    return this.json<ShareLinkCreated>("POST", `/projects/${enc(pid)}/share-links`, undefined, body);
  }
  createSnapshotShareLink(sid: string, body: ShareLinkCreateRequest) {
    return this.json<ShareLinkCreated>("POST", `/snapshots/${enc(sid)}/share-links`, undefined, body);
  }
  createShareLink(target: ShareLinkTargetRef, body: ShareLinkCreateRequest) {
    return target.type === "document"
      ? this.createDocumentShareLink(target.id, body)
      : target.type === "project"
        ? this.createProjectShareLink(target.id, body)
        : this.createSnapshotShareLink(target.id, body);
  }
  listDocumentShareLinks(did: string) {
    return this.json<ShareLink[]>("GET", `/documents/${enc(did)}/share-links`);
  }
  listProjectShareLinks(pid: string) {
    return this.json<ShareLink[]>("GET", `/projects/${enc(pid)}/share-links`);
  }
  listShareLinks(target: { type: "document" | "project"; id: string }) {
    return target.type === "document" ? this.listDocumentShareLinks(target.id) : this.listProjectShareLinks(target.id);
  }
  /** Access, general access (anyone/restricted), expiry, password, download and watermark: the URL stays the same. */
  updateShareLink(lid: string, patch: ShareLinkUpdateRequest) {
    return this.json<ShareLink>("PATCH", `/share-links/${enc(lid)}`, undefined, patch);
  }
  /** The old URL fails immediately. Make a new link for a new URL. */
  revokeShareLink(lid: string) {
    return this.json<ShareLinkRevokeResponse>("DELETE", `/share-links/${enc(lid)}`);
  }

  // ─── public share links (B8): no user token needed, works signed out ─────

  /** What a link points at (never content). Sent WITHOUT credentials. `ShareLinkExpiredError` when it is dead. */
  resolveShareLink(token: string) {
    return this.json<PublicShareInfo>("GET", `/public/share/${enc(token)}`, undefined, undefined, "none");
  }
  /**
   * A 15-minute `linkSession` for a link (also the way to renew one). Sends the signed-in user's token when there is one:
   * a `comment` session is only granted to a signed-in user, anonymous visitors get `view`. 401
   * `SHARE_LINK_PASSWORD_REQUIRED` for a wrong password, 429 after 10 wrong attempts.
   */
  unlockShareLink(token: string, password?: string) {
    return this.json<ShareUnlockResponse>("POST", `/share/${enc(token)}/unlock`, undefined, password === undefined ? {} : { password });
  }
  /**
   * The Yjs state behind a link. Pass the `linkSession` (a password link needs it); without one the request goes out as
   * the signed-in user (restricted links, or a member reading through a link) or anonymously. A project link needs `documentId`.
   */
  getSharedState(token: string, opts: { linkSession?: string; documentId?: string } = {}) {
    return this.bytes(`/share/${enc(token)}/state`, { documentId: opts.documentId }, opts.linkSession ? { bearer: opts.linkSession } : "user");
  }

  // ─── projects ────────────────────────────────────────────────────────────

  listProjects(wid: string, query: Partial<CursorQuery> & Partial<ProjectListQuery> = {}) {
    return this.json<Paginated<ProjectSummary>>("GET", `/workspaces/${enc(wid)}/projects`, query);
  }
  createProject(wid: string, body: ProjectCreateRequest) {
    return this.json<ProjectSummary>("POST", `/workspaces/${enc(wid)}/projects`, undefined, body);
  }
  getProject(pid: string) {
    return this.json<Project>("GET", `/projects/${enc(pid)}`);
  }
  updateProject(pid: string, patch: ProjectUpdateRequest) {
    return this.json<ProjectSummary>("PATCH", `/projects/${enc(pid)}`, undefined, patch);
  }
  trashProject(pid: string) {
    return this.json<TrashResult>("POST", `/projects/${enc(pid)}/trash`);
  }
  restoreProject(pid: string) {
    return this.json<ProjectSummary>("POST", `/projects/${enc(pid)}/restore`);
  }

  // ─── documents ───────────────────────────────────────────────────────────

  listDocuments(pid: string, query: Partial<CursorQuery> & Partial<DocumentListQuery> = {}) {
    return this.json<Paginated<DocumentMeta>>("GET", `/projects/${enc(pid)}/documents`, query);
  }
  /** Pass `id` (a client-generated `doc_...`) to make creation idempotent. */
  createDocument(pid: string, body: DocumentCreateRequest) {
    return this.json<DocumentMeta>("POST", `/projects/${enc(pid)}/documents`, undefined, body);
  }
  getDocument(did: string) {
    return this.json<DocumentDetail>("GET", `/documents/${enc(did)}`);
  }
  updateDocument(did: string, patch: DocumentUpdateRequest) {
    return this.json<DocumentMeta>("PATCH", `/documents/${enc(did)}`, undefined, patch);
  }
  trashDocument(did: string) {
    return this.json<TrashResult>("POST", `/documents/${enc(did)}/trash`);
  }
  restoreDocument(did: string) {
    return this.json<DocumentMeta>("POST", `/documents/${enc(did)}/restore`);
  }
  /** Live Yjs V2 state as bytes (`Y.applyUpdateV2`), with the epoch it belongs to. */
  getDocumentState(did: string) {
    return this.bytes(`/documents/${enc(did)}/state`);
  }
  getDocumentContent(did: string) {
    return this.json<DocumentJSON>("GET", `/documents/${enc(did)}/content`);
  }

  // ─── commands and scene reads (live document) ────────────────────────────

  /**
   * Apply a `writing_core` command batch to the live document as ONE Yjs transaction (all or nothing).
   * `baseEpoch` must equal the document's live epoch (409 `EPOCH_MISMATCH` otherwise); `expectedHashes`
   * guards against editing text that changed since it was read (409 `CONTENT_CHANGED`, `details.ids`);
   * `dryRun` reports the effects without applying. An open editor writes through its own Y.Doc instead:
   * this route is for bulk tools and scripts.
   */
  applyCommands(did: string, body: CommandBatchRequest) {
    return this.json<CommandBatchResponse>("POST", `/documents/${enc(did)}/commands`, undefined, body);
  }
  /** One row per scene of the live document (heading, number, synopsis, content hash). */
  getOutline(did: string) {
    return this.json<OutlineResponse>("GET", `/documents/${enc(did)}/outline`);
  }
  /** One scene with its elements. `sceneId` is the scene heading element's id. */
  getScene(did: string, sceneId: string) {
    return this.json<SceneRead>("GET", `/documents/${enc(did)}/scenes/${enc(sceneId)}`);
  }
  /** Up to `SCENE_BATCH_MAX` scenes in one round trip (a read, sent as POST for the id list). */
  getScenes(did: string, sceneIds: string[]) {
    return this.json<ScenesBatchResponse>("POST", `/documents/${enc(did)}/scenes/batch`, undefined, { sceneIds });
  }
  /** Up to `ELEMENT_BATCH_MAX` elements in one round trip (a read, sent as POST for the id list). */
  getElements(did: string, elementIds: string[]) {
    return this.json<ElementsBatchResponse>("POST", `/documents/${enc(did)}/elements/batch`, undefined, { elementIds });
  }

  /** Import a script file into a project. The server detects the format from the content. */
  importDocument(pid: string, input: ImportDocumentInput) {
    const { bytes, contentB64, ...rest } = input;
    const body: DocumentImportRequest = { ...rest, contentB64: contentB64 ?? bytesToBase64(toUint8Array(bytes as BinaryInput)) };
    return this.json<DocumentImportResult>("POST", `/projects/${enc(pid)}/documents/import`, undefined, body);
  }
  /** Export the live document; the file comes back decoded. */
  async exportDocument(did: string, format: ExportFormatId): Promise<ExportedDocument> {
    const r = await this.json<{ filename: string; mimeType: string; contentB64: string; report: ConversionReport; format: ExportFormatId }>(
      "POST",
      `/documents/${enc(did)}/export`,
      undefined,
      { format }
    );
    return { filename: r.filename, mimeType: r.mimeType, bytes: base64ToBytes(r.contentB64), report: r.report, format: r.format };
  }
  getFormats() {
    return this.json<FormatInfo[]>("GET", "/formats");
  }

  // ─── templates ───────────────────────────────────────────────────────────

  listTemplates(category?: string) {
    return this.json<TemplateSummary[]>("GET", "/templates", { category });
  }
  /** Full template body; `idOrKey` is the template id or its built-in key. */
  getTemplate(idOrKey: string) {
    return this.json<TemplateJSON>("GET", `/templates/${enc(idOrKey)}`);
  }

  // ─── versions ────────────────────────────────────────────────────────────

  listVersions(did: string, query: Partial<CursorQuery> = {}) {
    return this.json<Paginated<VersionListItem>>("GET", `/documents/${enc(did)}/versions`, query);
  }
  getVersionState(did: string, vid: string) {
    return this.bytes(`/documents/${enc(did)}/versions/${enc(vid)}/state`);
  }
  /** Bumps the document epoch: subscribed sync clients get `epochChanged`. */
  restoreVersion(did: string, vid: string) {
    return this.json<VersionRestoreResponse>("POST", `/documents/${enc(did)}/versions/${enc(vid)}/restore`);
  }
  /** Pin a version point as a manual snapshot. */
  snapshotVersion(did: string, vid: string, body: VersionSnapshotRequest) {
    return this.json<SnapshotSummary>("POST", `/documents/${enc(did)}/versions/${enc(vid)}/snapshot`, undefined, body);
  }

  // ─── snapshots ───────────────────────────────────────────────────────────

  listSnapshots(did: string, opts: { includeAutomatic?: boolean } = {}) {
    return this.json<SnapshotListResponse>("GET", `/documents/${enc(did)}/snapshots`, {
      includeAutomatic: opts.includeAutomatic,
    });
  }
  createSnapshot(did: string, body: SnapshotCreateRequest) {
    return this.json<SnapshotCreateResponse>("POST", `/documents/${enc(did)}/snapshots`, undefined, body);
  }
  getSnapshot(sid: string) {
    return this.json<SnapshotDetail>("GET", `/snapshots/${enc(sid)}`);
  }
  getSnapshotState(sid: string) {
    return this.bytes(`/snapshots/${enc(sid)}/state`);
  }
  getSnapshotContent(sid: string) {
    return this.json<DocumentJSON>("GET", `/snapshots/${enc(sid)}/content`);
  }
  /** Replaces the live document with the snapshot and bumps the epoch. */
  openSnapshot(sid: string) {
    return this.json<SnapshotOpenResponse>("POST", `/snapshots/${enc(sid)}/open`, undefined, { confirm: true });
  }
  forkSnapshot(sid: string, body: SnapshotForkRequest) {
    return this.json<DocumentMeta>("POST", `/snapshots/${enc(sid)}/fork`, undefined, body);
  }

  // ─── API keys (B6) ───────────────────────────────────────────────────────

  /** The caller's personal API keys (never the secrets). User sign-in only: a key gets 403. */
  listApiKeys() {
    return this.json<ApiKeySummary[]>("GET", "/api-keys");
  }
  /** The full `key` is in this response and never again. */
  createApiKey(body: ApiKeyCreateRequest) {
    return this.json<ApiKeyCreated>("POST", "/api-keys", undefined, body);
  }
  updateApiKey(kid: string, body: ApiKeyUpdateRequest) {
    return this.json<ApiKeySummary>("PATCH", `/api-keys/${enc(kid)}`, undefined, body);
  }
  revokeApiKey(kid: string) {
    return this.json<ApiKeyRevokeResponse>("DELETE", `/api-keys/${enc(kid)}`);
  }

  // ─── AI (B7) ─────────────────────────────────────────────────────────────

  /** Whether AI can run: `fixture` = canned test-mode answers, `live` = ShapeShyft, `unavailable` = not configured. */
  getAiStatus() {
    return this.json<AiStatus>("GET", "/ai/status");
  }
  // ─── jobs (B9) ───────────────────────────────────────────────────────────

  /** The caller's jobs (or, with `documentId`, every job on a document they can read). `kind` is exact or a family prefix like `ai.`. */
  listJobs(query: JobListQuery = {}) {
    return this.json<Paginated<Job>>("GET", "/jobs", query as Query);
  }
  /** A job's status and progress (never its request or result). `wait` (seconds, max 120) long-polls until status or progress stage changes. */
  getJob(jobId: string, opts: { wait?: number } = {}) {
    return this.json<Job>("GET", `/jobs/${enc(jobId)}`, { wait: opts.wait });
  }
  /**
   * Create a job of a generic kind (202). Sends an `Idempotency-Key` (`body.idempotencyKey` when given, else a fresh one) and the same
   * key in the body, so a retried or replayed create returns the original job. AI kinds use `startAiJob`; export/import kinds their own routes.
   * Errors: 501 `JOB_KIND_DISABLED` (`JobKindDisabledError`), 400 `JOB_KIND_NOT_GENERIC`, 409 `IDEMPOTENCY_KEY_REUSED`.
   */
  createJob(body: JobCreateRequest & { dryRun?: false }): Promise<Job>;
  createJob(body: JobCreateRequest & { dryRun: true }): Promise<JobDryRunResponse>;
  createJob(body: JobCreateRequest): Promise<Job | JobDryRunResponse>;
  createJob(body: JobCreateRequest): Promise<Job | JobDryRunResponse> {
    const key = body.idempotencyKey ?? (this.opts.newIdempotencyKey ?? newIdempotencyKey)();
    return this.json<Job | JobDryRunResponse>("POST", "/jobs", undefined, { ...body, idempotencyKey: key }, "user", key);
  }
  /** Owner only. A queued job is cancelled at once; a running one reports `cancelRequested` and stops shortly. 409 `JOB_FINISHED` when done. */
  cancelJob(jobId: string) {
    return this.json<Job>("POST", `/jobs/${enc(jobId)}/cancel`);
  }
  /** Download URLs of a finished job's outputs (owner only). 409 `JOB_NOT_FINISHED` / `JOB_FAILED`. */
  getJobOutputs(jobId: string) {
    return this.json<JobOutputsResponse>("GET", `/jobs/${enc(jobId)}/outputs`);
  }
  /** Batch-watermark recipients of a job (owner only; not for API keys). */
  listJobRecipients(jobId: string) {
    return this.json<JobRecipient[]>("GET", `/jobs/${enc(jobId)}/recipients`);
  }

  /** Starts a review or polish job (202). Poll `getAiJob`. */
  startAiJob(did: string, body: AiJobCreateRequest) {
    return this.json<AiJobCreated>("POST", `/documents/${enc(did)}/ai/jobs`, undefined, body);
  }
  /** Recent jobs of a document, newest first (a finished report is in `result`). */
  listAiJobs(did: string, limit?: number) {
    return this.json<{ items: AiJob[] }>("GET", `/documents/${enc(did)}/ai/jobs`, { limit });
  }
  getAiJob(jobId: string) {
    return this.json<AiJob>("GET", `/ai/jobs/${enc(jobId)}`);
  }
  cancelAiJob(jobId: string) {
    return this.json<AiJob>("POST", `/ai/jobs/${enc(jobId)}/cancel`);
  }
  listSuggestionSets(did: string) {
    return this.json<{ items: SuggestionSetSummary[] }>("GET", `/documents/${enc(did)}/ai/suggestion-sets`);
  }
  getSuggestionSet(ssid: string) {
    return this.json<SuggestionSet>("GET", `/ai/suggestion-sets/${enc(ssid)}`);
  }
  /** Atomic: one stale suggestion refuses the whole batch with `ApiError` 409 `CONTENT_CHANGED` (`details.suggestionIds`). */
  acceptSuggestions(ssid: string, suggestionIds: string[]) {
    return this.json<SuggestionAcceptResponse>("POST", `/ai/suggestion-sets/${enc(ssid)}/accept`, undefined, { suggestionIds });
  }
  /** No ids rejects every pending suggestion in the set. */
  rejectSuggestions(ssid: string, suggestionIds?: string[]) {
    return this.json<SuggestionSet>("POST", `/ai/suggestion-sets/${enc(ssid)}/reject`, undefined, suggestionIds ? { suggestionIds } : {});
  }
}

/**
 * Which client method serves each `API_ROUTES` entry. Typed as a full record, so adding a route to
 * `screenwriter_types` is a compile error here until it is mapped. `null` = the API does not serve it yet.
 */
export const API_ROUTE_METHODS: Record<ApiRouteName, keyof ScreenwriterClient | null> = {
  health: "health",
  meGet: "me",
  mePatch: "updateMe",
  workspacesList: "listWorkspaces",
  workspaceGet: "getWorkspace",
  projectsList: "listProjects",
  projectCreate: "createProject",
  projectGet: "getProject",
  projectUpdate: "updateProject",
  projectTrash: "trashProject",
  projectRestore: "restoreProject",
  documentsList: "listDocuments",
  documentCreate: "createDocument",
  documentGet: "getDocument",
  documentUpdate: "updateDocument",
  documentTrash: "trashDocument",
  documentRestore: "restoreDocument",
  documentState: "getDocumentState",
  documentContent: "getDocumentContent",
  documentImport: "importDocument",
  documentExport: "exportDocument",
  formatsList: "getFormats",
  templatesList: "listTemplates",
  templateGet: "getTemplate",
  sync: "syncUrl",
  versionsList: "listVersions",
  versionState: "getVersionState",
  versionRestore: "restoreVersion",
  versionSnapshot: "snapshotVersion",
  snapshotsList: "listSnapshots",
  snapshotCreate: "createSnapshot",
  snapshotGet: "getSnapshot",
  snapshotState: "getSnapshotState",
  snapshotContent: "getSnapshotContent",
  snapshotOpen: "openSnapshot",
  snapshotFork: "forkSnapshot",
  // B5 commands and live scene reads
  commands: "applyCommands",
  outline: "getOutline",
  scene: "getScene",
  scenesBatch: "getScenes",
  elementsBatch: "getElements",
  // B6 personal API keys
  apiKeysList: "listApiKeys",
  apiKeyCreate: "createApiKey",
  apiKeyUpdate: "updateApiKey",
  apiKeyRevoke: "revokeApiKey",
  // B7 AI
  aiStatus: "getAiStatus",
  aiJobCreate: "startAiJob",
  aiJobsList: "listAiJobs",
  aiJobGet: "getAiJob",
  aiJobCancel: "cancelAiJob",
  aiSuggestionSetsList: "listSuggestionSets",
  aiSuggestionSetGet: "getSuggestionSet",
  aiSuggestionSetAccept: "acceptSuggestions",
  aiSuggestionSetReject: "rejectSuggestions",
  // B9 generic jobs
  jobsList: "listJobs",
  jobGet: "getJob",
  jobCreate: "createJob",
  jobCancel: "cancelJob",
  jobOutputs: "getJobOutputs",
  jobRecipients: "listJobRecipients",
  jobWebhook: null, // provider-to-server call (HMAC): a client never makes it
  // B8 tenancy, roles, sharing
  workspaceCreate: "createWorkspace",
  workspaceUpdate: "updateWorkspace",
  workspaceDelete: "deleteWorkspace",
  workspaceTransfer: "transferWorkspace",
  workspaceLeave: "leaveWorkspace",
  workspaceUsage: "getWorkspaceUsage",
  workspaceAudit: "downloadWorkspaceAudit",
  membersList: "listMembers",
  memberUpdate: "updateMemberRole",
  memberRemove: "removeMember",
  invitationCreateWorkspace: "inviteToWorkspace",
  invitationCreateProject: "inviteToProject",
  invitationCreateDocument: "inviteToDocument",
  workspaceInvitationsList: "listWorkspaceInvitations",
  myInvitations: "listMyInvitations",
  invitationRenew: "renewInvitation",
  invitationCancel: "cancelInvitation",
  invitationAccept: "acceptInvitation",
  invitationDecline: "declineInvitation",
  sharedWithMe: "listSharedWithMe",
  documentLock: "lockDocument",
  documentUnlock: "unlockDocument",
  documentUnlockSession: "createUnlockSession",
  shareLinkCreateDocument: "createDocumentShareLink",
  shareLinkCreateProject: "createProjectShareLink",
  shareLinkCreateSnapshot: "createSnapshotShareLink",
  shareLinksListDocument: "listDocumentShareLinks",
  shareLinksListProject: "listProjectShareLinks",
  shareLinkUpdate: "updateShareLink",
  shareLinkRevoke: "revokeShareLink",
  grantsListDocument: "listDocumentGrants",
  grantsListProject: "listProjectGrants",
  grantUpdate: "updateGrant",
  grantRemove: "removeGrant",
  publicShareResolve: "resolveShareLink",
  shareUnlock: "unlockShareLink",
  shareState: "getSharedState",
};
