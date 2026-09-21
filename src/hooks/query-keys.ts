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

  formats: () => [...root(), "formats"] as const,

  templates: (category?: string) => [...root(), "templates", category ?? null] as const,
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
} as const;
