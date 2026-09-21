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
} as const;
