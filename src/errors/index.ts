import type { ApiErrorCode, Permission, Role } from "@sudobility/screenwriter_types";

/** Codes the client itself raises (never sent by the server). */
export type ClientErrorCode = "NETWORK_ERROR" | "BAD_RESPONSE";

/** Thrown for every failed REST call: a failure envelope, a non-2xx status, or a transport failure. */
export class ApiError extends Error {
  override readonly name: string = "ApiError";
  constructor(
    message: string,
    /** API error code (spec 05 §12), or a client-side code for transport problems. */
    readonly code: ApiErrorCode | ClientErrorCode,
    /** HTTP status; 0 when no response was received. */
    readonly status: number,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/**
 * 403 `FORBIDDEN` on an object the caller can read: their role is too low. The server names what would be enough
 * in `details.requiredRole`, so the UI can say "ask an owner for writer access".
 */
export class RoleInsufficientError extends ApiError {
  override readonly name: string = "RoleInsufficientError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "FORBIDDEN", status, details);
  }
  /** The lowest role that may do this. */
  get requiredRole(): Role | undefined {
    return this.details?.requiredRole as Role | undefined;
  }
  /** The caller's own effective role. */
  get role(): Role | undefined {
    return this.details?.role as Role | undefined;
  }
  get permission(): Permission | undefined {
    return this.details?.permission as Permission | undefined;
  }
}

export type ShareLinkFailure = "unknown" | "revoked" | "expired" | "unavailable" | "session";

/** 404 `SHARE_LINK_INVALID`: the link is unknown, revoked, expired, its target is gone, or its session is not valid. */
export class ShareLinkExpiredError extends ApiError {
  override readonly name: string = "ShareLinkExpiredError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "SHARE_LINK_INVALID", status, details);
  }
  /** Why: an expired link deserves "this link has expired", an unknown one "not found". */
  get reason(): ShareLinkFailure {
    return (this.details?.reason as ShareLinkFailure | undefined) ?? "unknown";
  }
}

export const isRoleInsufficient = (e: unknown): e is RoleInsufficientError => e instanceof RoleInsufficientError;
export const isShareLinkExpired = (e: unknown): e is ShareLinkExpiredError => e instanceof ShareLinkExpiredError;

/** The right `ApiError` subclass for a failure envelope. */
export function apiErrorFrom(
  message: string,
  code: ApiErrorCode | ClientErrorCode,
  status: number,
  details?: Record<string, unknown>
): ApiError {
  if (code === "FORBIDDEN" && details && typeof details.requiredRole === "string") {
    return new RoleInsufficientError(message, status, details);
  }
  if (code === "SHARE_LINK_INVALID") return new ShareLinkExpiredError(message, status, details);
  if (code === "RATE_LIMITED") return new RateLimitedError(message, status, details);
  if (code === "JOB_KIND_DISABLED") return new JobKindDisabledError(message, status, details);
  if (code === "PAYLOAD_TOO_LARGE" || code === "IMPORT_TOO_LARGE" || code === "ASSET_TOO_LARGE") {
    return new PayloadTooLargeError(message, code, status, details);
  }
  return new ApiError(message, code, status, details);
}

/** 429 `RATE_LIMITED`. Retried by the request funnel; surfaced only after the attempts are spent. `Retry-After` (seconds) is on it. */
export class RateLimitedError extends ApiError {
  override readonly name: string = "RateLimitedError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "RATE_LIMITED", status, details);
  }
  /** Seconds to wait, from the `Retry-After` header (or the body's `details.retryAfterS`). */
  get retryAfterS(): number | undefined {
    const v = this.details?.retryAfterS;
    return typeof v === "number" ? v : undefined;
  }
  /** Which bucket tripped (`rest`, `invitation`, `export`, ...). */
  get bucket(): string | undefined {
    return typeof this.details?.bucket === "string" ? this.details.bucket : undefined;
  }
}

/** 413 `PAYLOAD_TOO_LARGE` (request body over 32 MiB, or gzip that inflates past it), `IMPORT_TOO_LARGE`, `ASSET_TOO_LARGE`. */
export class PayloadTooLargeError extends ApiError {
  override readonly name: string = "PayloadTooLargeError";
}

/** 501 `JOB_KIND_DISABLED`: the kind is registered but not enabled on this server. */
export class JobKindDisabledError extends ApiError {
  override readonly name: string = "JobKindDisabledError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "JOB_KIND_DISABLED", status, details);
  }
  get kind(): string | undefined {
    return typeof this.details?.kind === "string" ? this.details.kind : undefined;
  }
}

export const isRateLimited = (e: unknown): e is RateLimitedError => e instanceof RateLimitedError;
export const isPayloadTooLarge = (e: unknown): e is PayloadTooLargeError => e instanceof PayloadTooLargeError;
export const isJobKindDisabled = (e: unknown): e is JobKindDisabledError => e instanceof JobKindDisabledError;
