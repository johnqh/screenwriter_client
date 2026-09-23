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

export type ShareLinkFailure = "unknown" | "revoked" | "expired" | "unavailable" | "session" | "disabled";

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
  if (code === "LOCATOR_AMBIGUOUS") return new LocatorAmbiguousError(message, status, details);
  if (code === "LOCATOR_NOT_FOUND") return new LocatorNotFoundError(message, status, details);
  if (code === "REPORT_OPTIONS_INVALID") return new ReportOptionsInvalidError(message, status, details);
  if (code === "REPORT_KIND_UNAVAILABLE") return new ReportKindUnavailableError(message, status, details);
  if (code === "STALE_WRITE") return new StaleWriteError(message, status, details);
  if (code === "UNMAPPED_STYLES") return new UnmappedStylesError(message, status, details);
  if (code === "TEMPLATE_INVALID") return new TemplateInvalidError(message, status, details);
  if (code === "OWNS_TEAM_WORKSPACE") return new OwnsTeamWorkspaceError(message, status, details);
  if (code === "REAUTH_REQUIRED") return new ReauthRequiredError(message, status, details);
  if (code === "MACRO_TRIGGER_TAKEN") return new MacroTriggerTakenError(message, status, details);
  if (code === "IMPORT_FORMAT_UNSUPPORTED" || code === "EXPORT_FORMAT_UNSUPPORTED") return new FormatUnsupportedError(message, code, status, details);
  if (code === "ANCHOR_NOT_FOUND") return new AnchorNotFoundError(message, status, details);
  if (code === "COMPARE_TOO_LARGE") return new CompareTooLargeError(message, status, details);
  if (code === "LIMIT_EXCEEDED") return new LimitExceededError(message, status, details);
  if (code === "OCR_UNAVAILABLE") return new OcrUnavailableError(message, status, details);
  if (code === "UPLOAD_INCOMPLETE") return new UploadIncompleteError(message, status, details);
  if (code === "WATERMARK_NOT_FOUND") return new WatermarkNotFoundError(message, status, details);
  if (code === "PAYLOAD_TOO_LARGE" || code === "IMPORT_TOO_LARGE" || code === "ASSET_TOO_LARGE") {
    return new PayloadTooLargeError(message, code, status, details);
  }
  if (code === "ASSET_TYPE_REJECTED") return new AssetTypeRejectedError(message, status, details);
  if (code === "ASSET_CHECKSUM_MISMATCH") return new AssetChecksumMismatchError(message, status, details);
  if (code === "ASSET_NOT_READY") return new AssetNotReadyError(message, status, details);
  if (code === "ASSET_IN_USE") return new AssetInUseError(message, status, details);
  if (code === "STORAGE_QUOTA_EXCEEDED") return new StorageQuotaExceededError(message, status, details);
  if (code === "ROLE_NOT_ALLOWED_FOR_TARGET") return new RoleNotAllowedForTargetError(message, status, details);
  if (code === "CLIENT_TOO_OLD") return new ClientOutdatedError(message, status, details);
  return new ApiError(message, code, status, details);
}

/** 426 `CLIENT_TOO_OLD` (B18): this client's own version is below `GET /public/config`'s `minClientVersion` for its platform. */
export class ClientOutdatedError extends ApiError {
  override readonly name: string = "ClientOutdatedError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "CLIENT_TOO_OLD", status, details);
  }
  get minVersion(): string | undefined {
    return this.details?.minVersion as string | undefined;
  }
}
export const isClientOutdated = (e: unknown): e is ClientOutdatedError => e instanceof ClientOutdatedError;

/**
 * 415 `IMPORT_FORMAT_UNSUPPORTED` / `EXPORT_FORMAT_UNSUPPORTED` (B16): a format no reader/writer exists for (PDF, DOCX, ...). `supported`
 * lists what the server can do; `reason` is set for a PDF import (`pdfImportNotBuilt`).
 */
export class FormatUnsupportedError extends ApiError {
  override readonly name: string = "FormatUnsupportedError";
  constructor(message: string, code: "IMPORT_FORMAT_UNSUPPORTED" | "EXPORT_FORMAT_UNSUPPORTED", status: number, details?: Record<string, unknown>) {
    super(message, code, status, details);
  }
  get direction(): "import" | "export" {
    return this.code === "EXPORT_FORMAT_UNSUPPORTED" ? "export" : "import";
  }
  get format(): string | null {
    return typeof this.details?.format === "string" ? this.details.format : null;
  }
  get supported(): string[] {
    return Array.isArray(this.details?.supported) ? (this.details.supported as string[]) : [];
  }
  get reason(): string | undefined {
    return typeof this.details?.reason === "string" ? this.details.reason : undefined;
  }
}

/** 503 `OCR_UNAVAILABLE`: no OCR engine on this server (or the language pack is missing). Never a fake result. */
export class OcrUnavailableError extends ApiError {
  override readonly name: string = "OcrUnavailableError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "OCR_UNAVAILABLE", status, details);
  }
}

/** 409 `UPLOAD_INCOMPLETE` (`startImport`): the file was not PUT yet (`reason: "missing"`), has another size (`"size"`) or hash (`"checksum"`). */
export class UploadIncompleteError extends ApiError {
  override readonly name: string = "UploadIncompleteError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "UPLOAD_INCOMPLETE", status, details);
  }
  get reason(): "missing" | "size" | "checksum" | undefined {
    return this.details?.reason as "missing" | "size" | "checksum" | undefined;
  }
}

/** 404 `WATERMARK_NOT_FOUND` (`lookupWatermark`): no export of this workspace matches. `reason` `pdfNotSupported` means a PDF cannot be read yet. */
export class WatermarkNotFoundError extends ApiError {
  override readonly name: string = "WatermarkNotFoundError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "WATERMARK_NOT_FOUND", status, details);
  }
  get reason(): "noCode" | "unknownCode" | "pdfNotSupported" | undefined {
    return this.details?.reason as "noCode" | "unknownCode" | "pdfNotSupported" | undefined;
  }
}

/** 404 `ANCHOR_NOT_FOUND` (`addSnapshotComment`, `copyCommentToLive`): the commented element or range does not resolve (in the snapshot, or any more in the live document). */
export class AnchorNotFoundError extends ApiError {
  override readonly name: string = "AnchorNotFoundError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ANCHOR_NOT_FOUND", status, details);
  }
  get elementId(): string | undefined {
    return this.details?.elementId as string | undefined;
  }
}

/** 413 `COMPARE_TOO_LARGE` (`compare`): more than `max` combined pages. */
export class CompareTooLargeError extends ApiError {
  override readonly name: string = "CompareTooLargeError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "COMPARE_TOO_LARGE", status, details);
  }
  get pages(): number | undefined {
    return this.details?.pages as number | undefined;
  }
  get max(): number | undefined {
    return this.details?.max as number | undefined;
  }
}

/** 409 `LIMIT_EXCEEDED`: a per-object cap was hit (200 notes per snapshot, 500 macros, ...); `limit` is the cap when the server names it. */
export class LimitExceededError extends ApiError {
  override readonly name: string = "LimitExceededError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "LIMIT_EXCEEDED", status, details);
  }
  get limit(): number | undefined {
    return this.details?.limit as number | undefined;
  }
}

export const isAnchorNotFound = (e: unknown): e is AnchorNotFoundError => e instanceof AnchorNotFoundError;
export const isCompareTooLarge = (e: unknown): e is CompareTooLargeError => e instanceof CompareTooLargeError;
export const isLimitExceeded = (e: unknown): e is LimitExceededError => e instanceof LimitExceededError;
export const isFormatUnsupported = (e: unknown): e is FormatUnsupportedError => e instanceof FormatUnsupportedError;
export const isOcrUnavailable = (e: unknown): e is OcrUnavailableError => e instanceof OcrUnavailableError;
export const isUploadIncomplete = (e: unknown): e is UploadIncompleteError => e instanceof UploadIncompleteError;
export const isWatermarkNotFound = (e: unknown): e is WatermarkNotFoundError => e instanceof WatermarkNotFoundError;

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

/** 409 `LOCATOR_AMBIGUOUS` (`GET /documents/:did/resolve`, packets): the locator matches several objects; `candidates` lists them. */
export class LocatorAmbiguousError extends ApiError {
  override readonly name: string = "LocatorAmbiguousError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "LOCATOR_AMBIGUOUS", status, details);
  }
  get candidates(): { id: string; label: string; score: number }[] {
    return (this.details?.candidates as { id: string; label: string; score: number }[] | undefined) ?? [];
  }
}

/** 404 `LOCATOR_NOT_FOUND`: nothing matches; `suggestions` are the closest objects (may be empty). */
export class LocatorNotFoundError extends ApiError {
  override readonly name: string = "LocatorNotFoundError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "LOCATOR_NOT_FOUND", status, details);
  }
  get suggestions(): { id: string; label: string }[] {
    return (this.details?.suggestions as { id: string; label: string }[] | undefined) ?? [];
  }
}

/** 400 `REPORT_OPTIONS_INVALID`: `issues` names each bad option (`{path, message}`). */
export class ReportOptionsInvalidError extends ApiError {
  override readonly name: string = "ReportOptionsInvalidError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "REPORT_OPTIONS_INVALID", status, details);
  }
  get issues(): { path: string; message: string }[] {
    return (this.details?.issues as { path: string; message: string }[] | undefined) ?? [];
  }
}

/** 501 `REPORT_KIND_UNAVAILABLE`: the kind is declared but not built (`reason` says why). */
export class ReportKindUnavailableError extends ApiError {
  override readonly name: string = "ReportKindUnavailableError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "REPORT_KIND_UNAVAILABLE", status, details);
  }
  get reason(): string | undefined {
    return typeof this.details?.reason === "string" ? this.details.reason : undefined;
  }
}

export const isLocatorAmbiguous = (e: unknown): e is LocatorAmbiguousError => e instanceof LocatorAmbiguousError;
export const isLocatorNotFound = (e: unknown): e is LocatorNotFoundError => e instanceof LocatorNotFoundError;
export const isReportOptionsInvalid = (e: unknown): e is ReportOptionsInvalidError => e instanceof ReportOptionsInvalidError;

/**
 * 409 `STALE_WRITE`: an optimistic-concurrency token (`baseUpdatedAt`) no longer matches (`PUT /me/preferences`,
 * `PUT /documents/:did/my-state`). `current` is the server copy (with its new `updatedAt`, or `{}` for a view state never
 * saved). `setPreferences` / `setMyDocumentState` already merge onto it and retry once; this reaches the caller only if the
 * retry lost the race too.
 */
export class StaleWriteError extends ApiError {
  override readonly name: string = "StaleWriteError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "STALE_WRITE", status, details);
  }
  get current(): Record<string, unknown> | undefined {
    const c = this.details?.current;
    return c && typeof c === "object" ? (c as Record<string, unknown>) : undefined;
  }
}

/** 409 `OWNS_TEAM_WORKSPACE` (`DELETE /me`): transfer these team workspaces first (`details.workspaces`). */
export class OwnsTeamWorkspaceError extends ApiError {
  override readonly name: string = "OwnsTeamWorkspaceError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "OWNS_TEAM_WORKSPACE", status, details);
  }
  get workspaces(): { id: string; name: string; members: number }[] {
    return (this.details?.workspaces as { id: string; name: string; members: number }[] | undefined) ?? [];
  }
}

/** 401 `REAUTH_REQUIRED`: the sign-in is too old for this action (account deletion, document locks); ask the person to sign in again. */
export class ReauthRequiredError extends ApiError {
  override readonly name: string = "ReauthRequiredError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "REAUTH_REQUIRED", status, details);
  }
}

/** 409 `MACRO_TRIGGER_TAKEN`: another macro already uses that shortcut or alias. */
export class MacroTriggerTakenError extends ApiError {
  override readonly name: string = "MacroTriggerTakenError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "MACRO_TRIGGER_TAKEN", status, details);
  }
}

export const isStaleWrite = (e: unknown): e is StaleWriteError => e instanceof StaleWriteError;
export const isOwnsTeamWorkspace = (e: unknown): e is OwnsTeamWorkspaceError => e instanceof OwnsTeamWorkspaceError;
export const isReauthRequired = (e: unknown): e is ReauthRequiredError => e instanceof ReauthRequiredError;
export const isMacroTriggerTaken = (e: unknown): e is MacroTriggerTakenError => e instanceof MacroTriggerTakenError;

/** 422 `UNMAPPED_STYLES` (`POST /documents/:did/template`): these styles have no counterpart in the new template; send a `mapping` for them. */
export class UnmappedStylesError extends ApiError {
  override readonly name: string = "UnmappedStylesError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "UNMAPPED_STYLES", status, details);
  }
  get unmappedStyles(): string[] {
    return (this.details?.unmappedStyles as string[] | undefined) ?? [];
  }
}

/** 422 `TEMPLATE_INVALID` (create, new version, import): `issues` are the schema and structure problems (`{code, path?, message, styleId?}`). */
export class TemplateInvalidError extends ApiError {
  override readonly name: string = "TemplateInvalidError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "TEMPLATE_INVALID", status, details);
  }
  get issues(): { code: string; path?: string; message: string; styleId?: string }[] {
    return (this.details?.issues as { code: string; path?: string; message: string; styleId?: string }[] | undefined) ?? [];
  }
}

export const isUnmappedStyles = (e: unknown): e is UnmappedStylesError => e instanceof UnmappedStylesError;
export const isTemplateInvalid = (e: unknown): e is TemplateInvalidError => e instanceof TemplateInvalidError;

// ─── assets and R2 (B11) ────────────────────────────────────────────────────

/** 415 `ASSET_TYPE_REJECTED` (asset upload init or complete): the extension, declared MIME or the bytes' own magic number do not agree with `kind`. */
export class AssetTypeRejectedError extends ApiError {
  override readonly name: string = "AssetTypeRejectedError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ASSET_TYPE_REJECTED", status, details);
  }
  get reason(): string | undefined {
    return this.details?.reason as string | undefined;
  }
}

/** 422 `ASSET_CHECKSUM_MISMATCH` (`completeAssetUpload`): the stored bytes' SHA-256 differs from the one declared at init or in `complete`. */
export class AssetChecksumMismatchError extends ApiError {
  override readonly name: string = "AssetChecksumMismatchError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ASSET_CHECKSUM_MISMATCH", status, details);
  }
}

/** 409 `ASSET_NOT_READY` (`getAssetUrl`): the version (or the named derivative) has not finished processing yet. `reason: "noDerivative"` means `asset.derive` is disabled: only `original` will ever exist. */
export class AssetNotReadyError extends ApiError {
  override readonly name: string = "AssetNotReadyError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ASSET_NOT_READY", status, details);
  }
  get reason(): string | undefined {
    return this.details?.reason as string | undefined;
  }
}

/** 409 `ASSET_IN_USE` (`deleteAsset`): at least one live link still points at it; unlink first. */
export class AssetInUseError extends ApiError {
  override readonly name: string = "AssetInUseError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ASSET_IN_USE", status, details);
  }
}

/** 507 `STORAGE_QUOTA_EXCEEDED` (asset upload init): the workspace's storage quota would be exceeded. */
export class StorageQuotaExceededError extends ApiError {
  override readonly name: string = "StorageQuotaExceededError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "STORAGE_QUOTA_EXCEEDED", status, details);
  }
  get quotaBytes(): number | undefined {
    return this.details?.quotaBytes as number | undefined;
  }
  get usedBytes(): number | undefined {
    return this.details?.usedBytes as number | undefined;
  }
  get requestedBytes(): number | undefined {
    return this.details?.requestedBytes as number | undefined;
  }
}

/** 422 `ROLE_NOT_ALLOWED_FOR_TARGET` (`createAssetLink`, `updateAssetLink`): this role cannot go on that target kind (or that entity kind). */
export class RoleNotAllowedForTargetError extends ApiError {
  override readonly name: string = "RoleNotAllowedForTargetError";
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message, "ROLE_NOT_ALLOWED_FOR_TARGET", status, details);
  }
  get role(): string | undefined {
    return this.details?.role as string | undefined;
  }
  get allowed(): string[] {
    return (this.details?.allowed as string[] | undefined) ?? [];
  }
}

export const isAssetTypeRejected = (e: unknown): e is AssetTypeRejectedError => e instanceof AssetTypeRejectedError;
export const isAssetChecksumMismatch = (e: unknown): e is AssetChecksumMismatchError => e instanceof AssetChecksumMismatchError;
export const isAssetNotReady = (e: unknown): e is AssetNotReadyError => e instanceof AssetNotReadyError;
export const isAssetInUse = (e: unknown): e is AssetInUseError => e instanceof AssetInUseError;
export const isStorageQuotaExceeded = (e: unknown): e is StorageQuotaExceededError => e instanceof StorageQuotaExceededError;
export const isRoleNotAllowedForTarget = (e: unknown): e is RoleNotAllowedForTargetError => e instanceof RoleNotAllowedForTargetError;

/**
 * Thrown by `uploadAsset` when a part upload fails after its retries: `uploadId` is enough to resume later
 * (`uploadAsset(wid, file, {..., resumeUploadId: uploadId})` re-lists what the storage already has and re-signs the rest).
 */
export class AssetUploadInterruptedError extends Error {
  override readonly name: string = "AssetUploadInterruptedError";
  constructor(
    message: string,
    readonly uploadId: string,
    readonly partCause?: unknown
  ) {
    super(message);
  }
}
export const isAssetUploadInterrupted = (e: unknown): e is AssetUploadInterruptedError => e instanceof AssetUploadInterruptedError;
