/** Account and per-user data (B13): preferences, dictionary, macros, writing stats and goals, export/delete/restore, per-document view state, stars. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DictionaryUpdateRequest,
  UserMacroCreateRequest,
  UserMacroPatchRequest,
  UserPreferencesResponse,
  WritingSessionRequest,
  WritingStatsQuery,
  DocumentViewStateResponse,
} from "@sudobility/screenwriter_types";
import type { DocumentViewStateUpdate, UserPreferencesUpdate, WritingGoalInput } from "../network";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** The user's preferences (with `updatedAt`). Another device's change arrives on the next refetch (window focus, or `invalidate`). */
export function usePreferences(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () => client.getPreferences(),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
  });
}

/**
 * Sets top-level keys (`null` removes one). Uses the cached copy as the base when there is one, so a burst of changes
 * costs one PUT each; a `STALE_WRITE` is merged and retried by the client. The result replaces the cached copy.
 */
export function useSetPreferences() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: UserPreferencesUpdate) => client.setPreferences(update, qc.getQueryData<UserPreferencesResponse>(queryKeys.preferences())),
    onSuccess: prefs => qc.setQueryData(queryKeys.preferences(), prefs),
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.preferences() }),
  });
}

export function useDictionary(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({ queryKey: queryKeys.dictionary(), queryFn: () => client.getDictionary(), staleTime: STALE_TIMES.LISTS, ...options });
}

export function useUpdateDictionary() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DictionaryUpdateRequest) => client.updateDictionary(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dictionary() }),
  });
}

export function useMacros(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({ queryKey: queryKeys.macros(), queryFn: () => client.listMacros(), staleTime: STALE_TIMES.LISTS, ...options });
}

export function useCreateMacro() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserMacroCreateRequest) => client.createMacro(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.macros() }),
  });
}

export function useUpdateMacro() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { mid: string; patch: UserMacroPatchRequest }) => client.updateMacro(v.mid, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.macros() }),
  });
}

export function useDeleteMacro() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) => client.deleteMacro(mid),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.macros() }),
  });
}

/** Buckets (zero-filled) and streak. `useRecordWritingSession` refreshes it. */
export function useWritingStats(query: WritingStatsQuery = {}, options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.writingStats(query),
    queryFn: () => client.getWritingStats(query),
    staleTime: STALE_TIMES.LISTS,
    ...options,
  });
}

/** Records a session (idempotent on `clientSessionId`) and refreshes the stats. */
export function useRecordWritingSession() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WritingSessionRequest) => client.recordWritingSession(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.writingStatsAll() }),
  });
}

export function useWritingGoals(options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({ queryKey: queryKeys.writingGoals(), queryFn: () => client.getWritingGoals(), staleTime: STALE_TIMES.LISTS, ...options });
}

export function useSetWritingGoals() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goals: WritingGoalInput[]) => client.setWritingGoals(goals),
    onSuccess: goals => qc.setQueryData(queryKeys.writingGoals(), goals),
  });
}

/** Starts the export job; follow `data.id` with `useJob`, then `useJobOutputs`. Invalidates the job lists. */
export function useRequestAccountExport() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.requestAccountExport(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.jobs() }),
  });
}

/** Schedules deletion; refreshes `me` (its `deletionScheduledFor` drives the banner). Errors: `ReauthRequiredError`, `OwnsTeamWorkspaceError`. */
export function useDeleteAccount() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.deleteAccount(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me() }),
  });
}

export function useRestoreAccount() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.restoreAccount(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me() }),
  });
}

/** The caller's own view state for a document (`{}` until saved). A viewer has one too. */
export function useMyDocumentState(did: string | undefined, options: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.myDocumentState(did ?? ""),
    queryFn: () => client.getMyDocumentState(did as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && (options.enabled ?? true),
  });
}

/**
 * Saves top-level keys of the view state (the lib debounces, spec: 5 s). Reuses the cached copy as the base; the client
 * merges and retries once on `STALE_WRITE`. The result replaces the cache, so the editor never sees a stale token.
 */
export function useSetMyDocumentState(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: DocumentViewStateUpdate) => client.setMyDocumentState(did, update, qc.getQueryData<DocumentViewStateResponse>(queryKeys.myDocumentState(did))),
    onSuccess: state => qc.setQueryData(queryKeys.myDocumentState(did), state),
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.myDocumentState(did) }),
  });
}

/** `mutate(true)` stars (the default), `mutate(false)` unstars. Stars are per user; the workspace list (B14) reads them. */
export function useStarDocument(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (starred: boolean = true) => (starred ? client.starDocument(did) : client.unstarDocument(did)),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.documentLists() }),
  });
}
