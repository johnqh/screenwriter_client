/** Spec 03 §2.7: full-jitter exponential backoff, `random(0, min(30 000, 500 * 2^attempt))`. */
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 30_000;

export function backoffCeiling(attempt: number, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}

/** `attempt` starts at 0 for the first retry. `random` is injectable for tests. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  return Math.floor(random() * backoffCeiling(attempt));
}
