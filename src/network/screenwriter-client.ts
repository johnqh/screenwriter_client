import {
  API_BASE_PATH,
  type ApiRouteName,
  type CursorQuery,
  type DocumentCreateRequest,
  type DocumentDetail,
  type DocumentListQuery,
  type DocumentMeta,
  type DocumentUpdateRequest,
  type Me,
  type MeUpdateRequest,
  type Paginated,
  type Project,
  type ProjectCreateRequest,
  type ProjectListQuery,
  type ProjectSummary,
  type ProjectUpdateRequest,
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
import { ApiError } from "../errors";
import type { HttpMethod, NetworkClient, NetworkResponse } from "./network-client";

export interface ScreenwriterClientOptions {
  network: NetworkClient;
  /** API origin, e.g. `http://localhost:8042` (no `/api/v1`). */
  baseUrl: string;
  /**
   * Bearer token supplier. Called per request; `forceRefresh` is true on the one retry after a 401.
   * Return null when signed out.
   */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
}

/** A Yjs V2 document state as fetched over REST. */
export interface BinaryState {
  state: Uint8Array;
  epoch: number;
  /** Only `/documents/:did/state` sends it. */
  stateVector: Uint8Array | null;
}

type Query = Record<string, string | number | boolean | undefined>;

const enc = encodeURIComponent;

/**
 * Typed wrapper over every route the API serves. Returns unwrapped envelope `data`, throws `ApiError`.
 * Which method serves which `API_ROUTES` entry is declared in `API_ROUTE_METHODS` (checked by a test).
 */
export class ScreenwriterClient {
  constructor(private readonly opts: ScreenwriterClientOptions) {}

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

  private async send(method: HttpMethod, path: string, query?: Query, body?: unknown): Promise<NetworkResponse> {
    const attempt = async (forceRefresh: boolean): Promise<NetworkResponse> => {
      const headers: Record<string, string> = {};
      const token = await this.opts.getToken(forceRefresh);
      if (token) headers.Authorization = `Bearer ${token}`;
      let text: string | undefined;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        text = JSON.stringify(body);
      }
      try {
        const req: Parameters<NetworkClient["request"]>[0] = { method, url: this.url(path, query), headers };
        if (text !== undefined) req.body = text;
        return await this.opts.network.request(req);
      } catch (e) {
        throw new ApiError(e instanceof Error ? e.message : String(e), "NETWORK_ERROR", 0);
      }
    };
    let res = await attempt(false);
    if (res.status === 401) res = await attempt(true);
    return res;
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
      throw new ApiError(f.error ?? `HTTP ${res.status}`, (f.code ?? "INTERNAL") as ApiError["code"], res.status, f.details);
    }
    throw new ApiError(`HTTP ${res.status}`, "BAD_RESPONSE", res.status);
  }

  private async json<T>(method: HttpMethod, path: string, query?: Query, body?: unknown): Promise<T> {
    const res = await this.send(method, path, query, body);
    if (res.status < 200 || res.status >= 300) this.fail(res);
    try {
      const env = JSON.parse(new TextDecoder().decode(res.body)) as { success?: boolean; data?: T };
      if (env.success !== true) throw new Error("not a success envelope");
      return env.data as T;
    } catch {
      throw new ApiError("Malformed response envelope", "BAD_RESPONSE", res.status);
    }
  }

  private async bytes(path: string): Promise<BinaryState> {
    const res = await this.send("GET", path);
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
  // B5: declared in API_ROUTES but not served by the API yet
  commands: null,
  outline: null,
  scene: null,
};
