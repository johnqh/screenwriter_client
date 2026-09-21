/**
 * Retry policy and request-body helpers of the request funnel (spec 10 §2.2 steps 2 and 6, §2.4). Pure functions so they
 * can be tested without a network.
 */
import type { HttpMethod } from "./network-client";

export interface RetryPolicy {
  /** Total tries, first one included. Default 3. */
  maxAttempts: number;
  /** Default 400 ms. */
  baseDelayMs: number;
  /** Default 8000 ms. */
  maxDelayMs: number;
  /** `Retry-After` overrides the computed delay but never waits longer than this. Default 60 s. */
  maxRetryAfterMs: number;
  /** Injected for tests. Default `Math.random`. */
  random: () => number;
  /** Injected for tests. Default `setTimeout`. */
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 8000,
  maxRetryAfterMs: 60_000,
  random: Math.random,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

export function resolveRetry(opt: Partial<RetryPolicy> | false | undefined): RetryPolicy {
  if (opt === false) return { ...DEFAULT_RETRY, maxAttempts: 1 };
  return { ...DEFAULT_RETRY, ...opt };
}

/** Methods that are safe to repeat as they are (spec 10 §2.4). A POST is repeatable only with an `Idempotency-Key`. */
const IDEMPOTENT_METHODS: readonly HttpMethod[] = ["GET", "PUT", "DELETE"];

/** 503s that say "not configured", not "try again": waiting will not change the answer. */
const DETERMINISTIC_503 = new Set(["CONFIG_MISSING", "AI_UNAVAILABLE", "STORAGE_UNAVAILABLE", "GRAMMAR_UNAVAILABLE", "OCR_UNAVAILABLE"]);

/**
 * Should this outcome be tried again? `status` 0 is a transport failure. Retried: no response, 408, 429 `RATE_LIMITED`,
 * 502, 503, 504. Never: 4xx other than those, `QUOTA_EXCEEDED`, or a POST without an idempotency key.
 */
export function isRetryable(method: HttpMethod, hasKey: boolean, status: number, code?: string): boolean {
  if (!IDEMPOTENT_METHODS.includes(method) && !(method === "POST" && hasKey)) return false;
  if (status === 0 || status === 408 || status === 502 || status === 504) return true;
  if (status === 429) return code === undefined || code === "RATE_LIMITED";
  if (status === 503) return code === undefined || !DETERMINISTIC_503.has(code);
  return false;
}

/** `Retry-After` as milliseconds: delta-seconds or an HTTP date. Undefined when absent or unparseable. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/** Full jitter: uniform in [0, min(max, base * 2^(attempt-1))]; a `Retry-After` on 429/503 replaces it (capped). */
export function retryDelayMs(policy: RetryPolicy, attempt: number, status: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && (status === 429 || status === 503)) return Math.min(retryAfterMs, policy.maxRetryAfterMs);
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(policy.random() * ceiling);
}

/** JSON bodies at least this long are gzipped when the platform has `CompressionStream` (the API inflates them). */
export const GZIP_MIN_BYTES = 1024;

export function canGzip(): boolean {
  return typeof CompressionStream !== "undefined" && typeof Response !== "undefined" && typeof Blob !== "undefined";
}

export async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One key per logical call, reused across its retries. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
