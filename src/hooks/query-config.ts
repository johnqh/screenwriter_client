/** Stale times in ms. Document content is live over sync, so REST reads of it are never "fresh" for long. */
export const STALE_TIMES = {
  ME: 5 * 60_000,
  WORKSPACES: 5 * 60_000,
  TEMPLATES: 10 * 60_000,
  LISTS: 30_000,
  DETAIL: 15_000,
  /** Snapshot and version bodies are immutable. */
  IMMUTABLE: Infinity,
} as const;
