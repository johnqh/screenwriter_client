import type { ApiErrorCode } from "@sudobility/screenwriter_types";

/** Codes the client itself raises (never sent by the server). */
export type ClientErrorCode = "NETWORK_ERROR" | "BAD_RESPONSE";

/** Thrown for every failed REST call: a failure envelope, a non-2xx status, or a transport failure. */
export class ApiError extends Error {
  override readonly name = "ApiError";
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
