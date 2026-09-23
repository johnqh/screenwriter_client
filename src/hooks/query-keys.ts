/**
 * Central query-key factory. Every key starts with `["screenwriter"]`; list keys and detail keys
 * live under separate second-level segments so a mutation can invalidate "all lists" cheaply.
 */
const root = () => ["screenwriter"] as const;

export const queryKeys = {
  all: root,
  me: () => [...root(), "me"] as const,

  workspaces: () => [...root(), "workspaces"] as const,
  workspace: (wid: string) => [...root(), "workspace", wid] as const,

  projectLists: () => [...root(), "project-lists"] as const,
  projects: (wid: string, filters?: object) => [...root(), "project-lists", wid, filters ?? {}] as const,
  projectsAll: () => [...root(), "project"] as const,
  project: (pid: string) => [...root(), "project", pid] as const,

  documentLists: () => [...root(), "document-lists"] as const,
  /** Documents across a workspace (B14): under `documentLists`, so every document mutation refreshes them. */
  workspaceDocuments: (wid: string, filters?: object) => [...root(), "document-lists", "workspace", wid, filters ?? {}] as const,
  documents: (pid: string, filters?: object) => [...root(), "document-lists", pid, filters ?? {}] as const,
  documentsAll: () => [...root(), "document"] as const,
  /** Everything about one document: detail, state, content. */
  documentFamily: (did: string) => [...root(), "document", did] as const,
  document: (did: string) => [...root(), "document", did, "detail"] as const,
  documentState: (did: string) => [...root(), "document", did, "state"] as const,
  documentContent: (did: string) => [...root(), "document", did, "content"] as const,
  /** Live scene reads. Under `documentFamily`, so one invalidation refreshes them with the document. */
  outline: (did: string) => [...root(), "document", did, "outline"] as const,
  scene: (did: string, sceneId: string) => [...root(), "document", did, "scene", sceneId] as const,
  scenes: (did: string, sceneIds: readonly string[]) => [...root(), "document", did, "scenes", [...sceneIds].sort()] as const,
  elements: (did: string, elementIds: readonly string[]) => [...root(), "document", did, "elements", [...elementIds].sort()] as const,

  /**
   * Projection-backed reads (B10). All under `documentFamily(did)`, so `useApplyCommands` (and any sync-driven invalidation of
   * the document family) refreshes them; `source` (`live` | `snapshot:<id>` | `version:<id>`) is part of every key.
   */
  reads: (did: string) => [...root(), "document", did, "reads"] as const,
  entities: (did: string, filters?: object) => [...root(), "document", did, "reads", "entities", filters ?? {}] as const,
  entity: (did: string, eid: string, source?: string) => [...root(), "document", did, "reads", "entity", eid, source ?? "live"] as const,
  entityUsage: (did: string, eid: string, filters?: object) => [...root(), "document", did, "reads", "entity-usage", eid, filters ?? {}] as const,
  entityDialogue: (did: string, eid: string, filters?: object) => [...root(), "document", did, "reads", "entity-dialogue", eid, filters ?? {}] as const,
  tagCategories: (did: string, source?: string) => [...root(), "document", did, "reads", "tag-categories", source ?? "live"] as const,
  tags: (did: string, filters?: object) => [...root(), "document", did, "reads", "tags", filters ?? {}] as const,
  notes: (did: string, filters?: object) => [...root(), "document", did, "reads", "notes", filters ?? {}] as const,
  beats: (did: string, source?: string) => [...root(), "document", did, "reads", "beats", source ?? "live"] as const,
  bin: (did: string, source?: string) => [...root(), "document", did, "reads", "bin", source ?? "live"] as const,
  revisions: (did: string, source?: string) => [...root(), "document", did, "reads", "revisions", source ?? "live"] as const,
  changes: (did: string, filters?: object) => [...root(), "document", did, "reads", "changes", filters ?? {}] as const,
  alternates: (did: string, elementId: string, source?: string) => [...root(), "document", did, "reads", "alternates", elementId, source ?? "live"] as const,
  titlePage: (did: string, source?: string) => [...root(), "document", did, "reads", "title-page", source ?? "live"] as const,
  stats: (did: string, source?: string) => [...root(), "document", did, "reads", "stats", source ?? "live"] as const,
  fountain: (did: string, filters?: object) => [...root(), "document", did, "reads", "fountain", filters ?? {}] as const,
  sceneShots: (did: string, sceneId: string, source?: string) => [...root(), "document", did, "reads", "shots", sceneId, source ?? "live"] as const,
  resolve: (did: string, locators: readonly string[], snapshotId?: string) => [...root(), "document", did, "reads", "resolve", snapshotId ?? "live", [...locators]] as const,
  documentSearch: (did: string, filters?: object) => [...root(), "document", did, "reads", "search", filters ?? {}] as const,
  packet: (did: string, kind: "scene" | "character" | "location" | "shot", locator: string, filters?: object) =>
    [...root(), "document", did, "reads", "packet", kind, locator, filters ?? {}] as const,
  reports: (did: string) => [...root(), "document", did, "reports"] as const,
  report: (did: string, kind: string, source?: string, options?: object) => [...root(), "document", did, "reports", kind, source ?? "live", options ?? {}] as const,
  reportKinds: () => [...root(), "report-kinds"] as const,
  /** Global and workspace search: not tied to one document, refreshed as a family. */
  searches: () => [...root(), "search"] as const,
  search: (filters?: object) => [...root(), "search", "all", filters ?? {}] as const,
  workspaceSearch: (wid: string, filters?: object) => [...root(), "search", "workspace", wid, filters ?? {}] as const,

  formats: () => [...root(), "formats"] as const,

  /** `filter` is a category string or `{category?, workspaceId?, scope?}` (B14: user and workspace templates). */
  templates: (filter?: string | object) => [...root(), "templates", filter ?? null] as const,
  templatesAll: () => [...root(), "templates"] as const,
  template: (idOrKey: string) => [...root(), "template", idOrKey] as const,

  versions: (did: string, filters?: object) => [...root(), "versions", did, filters ?? {}] as const,
  versionsOf: (did: string) => [...root(), "versions", did] as const,
  versionState: (did: string, vid: string) => [...root(), "version-state", did, vid] as const,

  snapshots: (did: string, filters?: object) => [...root(), "snapshots", did, filters ?? {}] as const,
  snapshotsOf: (did: string) => [...root(), "snapshots", did] as const,
  snapshot: (sid: string) => [...root(), "snapshot", sid] as const,
  snapshotState: (sid: string) => [...root(), "snapshot", sid, "state"] as const,
  snapshotContent: (sid: string) => [...root(), "snapshot", sid, "content"] as const,

  /** B15. Notes and comments hang off one snapshot (`snapshotSide`), so one invalidation refreshes a snapshot's side tables. */
  snapshotSide: (sid: string) => [...root(), "snapshot", sid, "side"] as const,
  snapshotNotes: (sid: string) => [...root(), "snapshot", sid, "side", "notes"] as const,
  snapshotComments: (sid: string, filters?: object) => [...root(), "snapshot", sid, "side", "comments", filters ?? {}] as const,
  /** Compare and line history read the document (a live side, or the log), so they sit under `documentFamily`. */
  compare: (did: string, request: object) => [...root(), "document", did, "compare", request] as const,
  elementHistory: (did: string, elementId: string, filters?: object) => [...root(), "document", did, "history", elementId, filters ?? {}] as const,
  /** Presence is per document but is not document content: not under `documentFamily`. */
  presence: (did: string) => [...root(), "presence", did] as const,

  /**
   * Tenancy and sharing (B8). Everything sits under `sharing` so one invalidation refreshes a whole sharing dialog;
   * a role or membership change should also refresh `workspaces()` and the document family.
   */
  sharing: () => [...root(), "sharing"] as const,
  members: (wid: string) => [...root(), "sharing", "members", wid] as const,
  workspaceUsage: (wid: string) => [...root(), "sharing", "usage", wid] as const,
  workspaceInvitations: (wid: string) => [...root(), "sharing", "workspace-invitations", wid] as const,
  myInvitations: () => [...root(), "sharing", "my-invitations"] as const,
  sharedWithMe: () => [...root(), "sharing", "shared-with-me"] as const,
  grants: (t: { type: string; id: string }) => [...root(), "sharing", "grants", t.type, t.id] as const,
  shareLinks: (t: { type: string; id: string }) => [...root(), "sharing", "share-links", t.type, t.id] as const,
  /** A public link resolved by token: signed-out safe, kept apart from the caller's own data. */
  shareLink: (token: string) => [...root(), "share-link", token] as const,
  sharedState: (token: string, documentId?: string) => [...root(), "share-link", token, "state", documentId ?? null] as const,

  /** Account and per-user data (B13), one `account` family. View state is per document but not document content, so it lives here, not under `documentFamily`. */
  account: () => [...root(), "account"] as const,
  preferences: () => [...root(), "account", "preferences"] as const,
  dictionary: () => [...root(), "account", "dictionary"] as const,
  macros: () => [...root(), "account", "macros"] as const,
  writingStatsAll: () => [...root(), "account", "writing-stats"] as const,
  writingStats: (filters?: object) => [...root(), "account", "writing-stats", filters ?? {}] as const,
  writingGoals: () => [...root(), "account", "writing-goals"] as const,
  myDocumentState: (did: string) => [...root(), "account", "my-state", did] as const,

  /** Workspace trash (B14): everything that trashes, restores or purges refreshes the family. */
  trashAll: () => [...root(), "trash"] as const,
  trash: (wid: string, filters?: object) => [...root(), "trash", wid, filters ?? {}] as const,
  /** The Shared Bin of a project (B14). */
  projectBin: (pid: string, filters?: object) => [...root(), "project-bin", pid, filters ?? {}] as const,
  projectBinAll: () => [...root(), "project-bin"] as const,
  /** Workspace settings that are their own resources (B14): defaults and contacts. */
  workspaceSettings: () => [...root(), "workspace-settings"] as const,
  workspaceDefaults: (wid: string) => [...root(), "workspace-settings", "defaults", wid] as const,
  contacts: (wid: string, filters?: object) => [...root(), "workspace-settings", "contacts", wid, filters ?? {}] as const,

  apiKeys: () => [...root(), "api-keys"] as const,
  aiStatus: () => [...root(), "ai-status"] as const,
  aiJob: (jobId: string) => [...root(), "ai-job", jobId] as const,
  aiJobs: (did: string) => [...root(), "ai-jobs", did] as const,
  /**
   * Generic jobs (B9). Under one `jobs` family: create/cancel invalidate it. `/ai/jobs` keeps its own keys (`aiJob`, `aiJobs`);
   * the same job read through either API is the same row on the server.
   */
  jobs: () => [...root(), "jobs"] as const,
  jobLists: (filters?: object) => [...root(), "jobs", "list", filters ?? {}] as const,
  job: (jobId: string) => [...root(), "jobs", "detail", jobId] as const,
  jobOutputs: (jobId: string) => [...root(), "jobs", "outputs", jobId] as const,
  jobRecipients: (jobId: string) => [...root(), "jobs", "recipients", jobId] as const,
  suggestionSets: (did: string) => [...root(), "suggestion-sets", did] as const,
  suggestionSet: (ssid: string) => [...root(), "suggestion-set", ssid] as const,

  /** Assets and R2 (B11): one `assets` family (workspace-scoped: not under `documentFamily`) plus a document's link list. */
  assets: () => [...root(), "assets"] as const,
  assetLists: (filters?: object) => [...root(), "assets", "list", filters ?? {}] as const,
  asset: (aid: string) => [...root(), "assets", "detail", aid] as const,
  assetUpload: (uploadId: string) => [...root(), "assets", "upload", uploadId] as const,
  assetUrl: (aid: string, vid: string, variant?: string) => [...root(), "assets", "url", aid, vid, variant ?? "original"] as const,
  /** Under `documentFamily(did)`: a scene/element/entity edit can make these stale, so `useApplyCommands` refreshes them too. */
  documentAssetLinks: (did: string, filters?: object) => [...root(), "document", did, "asset-links", filters ?? {}] as const,
  documentStaleness: (did: string, filters?: object) => [...root(), "document", did, "staleness", filters ?? {}] as const,
  assetLinkStaleness: (lid: string) => [...root(), "assets", "link-staleness", lid] as const,

  /** Collaboration, notifications, devices (B12). Notifications and devices are per-person, not per-document. */
  notificationPrefs: () => [...root(), "notification-prefs"] as const,
  notifications: () => [...root(), "notifications"] as const,
  notificationList: (filters?: object) => [...root(), "notifications", "list", filters ?? {}] as const,
  unreadCount: () => [...root(), "notifications", "unread-count"] as const,
  /** Under `documentFamily`: mentions-without-access changes as notes are added/edited and as access is granted. */
  mentionsWithoutAccess: (did: string) => [...root(), "document", did, "mentions-without-access"] as const,
  chat: (did: string, filters?: object) => [...root(), "document", did, "chat", filters ?? {}] as const,
  documentActivity: (did: string, filters?: object) => [...root(), "document", did, "activity", filters ?? {}] as const,
  workspaceActivity: (wid: string, filters?: object) => [...root(), "workspace-activity", wid, filters ?? {}] as const,
  devices: () => [...root(), "devices"] as const,

  /** AI completion and credits (B17). */
  aiConsent: () => [...root(), "ai-consent"] as const,
  myAiActivity: (filters?: object) => [...root(), "ai-activity", "me", filters ?? {}] as const,
  workspaceAiActivity: (wid: string, filters?: object) => [...root(), "ai-activity", "workspace", wid, filters ?? {}] as const,
  aiReports: (did: string, filters?: object) => [...root(), "document", did, "ai-reports", filters ?? {}] as const,
  aiReport: (jobId: string) => [...root(), "ai-report", jobId] as const,
  creditsBalance: () => [...root(), "credits", "balance"] as const,
  creditPurchases: (filters?: object) => [...root(), "credits", "purchases", filters ?? {}] as const,
  creditUsages: (filters?: object) => [...root(), "credits", "usages", filters ?? {}] as const,
  creditProducts: () => [...root(), "credits", "products"] as const,

  /** Public and admin (B18). */
  publicConfig: () => [...root(), "public-config"] as const,
  publicTemplates: (category?: string) => [...root(), "public-templates", category ?? null] as const,
  namesDb: (version: number) => [...root(), "names-db", version] as const,
  deepHealth: () => [...root(), "deep-health"] as const,
  adminUser: (email: string) => [...root(), "admin", "user", email] as const,
  /** `adminJobsFamily()` has no filters object, so invalidating on it matches every `adminJobs(filters)` variant. */
  adminJobsFamily: () => [...root(), "admin", "jobs"] as const,
  adminJobs: (filters?: object) => [...root(), "admin", "jobs", "list", filters ?? {}] as const,
  adminDocumentMeta: (did: string) => [...root(), "admin", "document-meta", did] as const,
} as const;
