import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiConsentAcceptRequest,
  AiEstimateRequest,
  AiJob,
  AiJobCreateRequest,
  SuggestionDecideRequest,
} from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** How often a queued or running job is re-read. */
export const AI_JOB_POLL_MS = 1500;

export const isAiJobActive = (job: Pick<AiJob, "status"> | undefined): boolean =>
  job?.status === "queued" || job?.status === "running";

/** Availability of AI on the API (fixture / live / unavailable). */
export function useAiStatus() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiStatus(),
    queryFn: () => client.getAiStatus(),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

export function useStartAiJob(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AiJobCreateRequest) => client.startAiJob(did, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.aiJobs(did) }),
  });
}

/** Polls every ~1.5 s while the job is queued or running, and stops once it is terminal. */
export function useAiJob(jobId: string | null | undefined, pollMs: number = AI_JOB_POLL_MS) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiJob(jobId ?? ""),
    queryFn: () => client.getAiJob(jobId as string),
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: q => (isAiJobActive(q.state.data) || !q.state.data ? pollMs : false),
  });
}

/** Recent jobs of a document (newest first): where the last report is read back after a reload. */
export function useAiJobs(did: string | undefined, limit = 10) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiJobs(did ?? ""),
    queryFn: () => client.listAiJobs(did as string, limit),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

export function useCancelAiJob(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => client.cancelAiJob(jobId),
    onSuccess: (job, jobId) => {
      qc.setQueryData(queryKeys.aiJob(jobId), job);
      return qc.invalidateQueries({ queryKey: queryKeys.aiJobs(did) });
    },
  });
}

export function useSuggestionSets(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.suggestionSets(did ?? ""),
    queryFn: () => client.listSuggestionSets(did as string),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

export function useSuggestionSet(ssid: string | null | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.suggestionSet(ssid ?? ""),
    queryFn: () => client.getSuggestionSet(ssid as string),
    staleTime: 0,
    enabled: !!ssid,
  });
}

/**
 * Accepting invalidates the document's suggestion sets (and the set itself); the document text updates through
 * the sync socket, not through a refetch. A stale suggestion refuses the whole batch: `ApiError` 409 `CONTENT_CHANGED`.
 */
export function useAcceptSuggestions(did: string, ssid: string | null | undefined) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionIds: string[]) => client.acceptSuggestions(ssid as string, suggestionIds),
    // a refused batch also changes the set (the stale ones are marked), so refresh on error too
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSets(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSet(ssid ?? "") }),
      ]),
  });
}

export function useRejectSuggestions(did: string, ssid: string | null | undefined) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionIds?: string[]) => client.rejectSuggestions(ssid as string, suggestionIds),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSets(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSet(ssid ?? "") }),
      ]),
  });
}

/** Combined accept-and-reject in one call (`dryRun`, `"allPending"`); see `useAcceptSuggestions` for invalidation reasoning. */
export function useDecideSuggestions(did: string, ssid: string | null | undefined) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SuggestionDecideRequest) => client.decideSuggestions(ssid as string, body),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSets(did) }),
        qc.invalidateQueries({ queryKey: queryKeys.suggestionSet(ssid ?? "") }),
      ]),
  });
}

// ─── B17: consent, estimate, activity, reports ────────────────────────────

export function useAiConsent() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiConsent(),
    queryFn: () => client.getAiConsent(),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

export function useAcceptAiConsent() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AiConsentAcceptRequest) => client.acceptAiConsent(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.aiConsent() }),
  });
}

/** The live credit estimate before the user confirms a job (the configure sheet). Not cached: it depends on the current document and balance. */
export function useAiEstimate(did: string | undefined) {
  const client = useScreenwriterClient();
  return useMutation({
    mutationFn: (body: AiEstimateRequest) => client.estimateAiJob(did as string, body),
  });
}

export function useMyAiActivity(query: { limit?: number; cursor?: string; documentId?: string } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.myAiActivity(query),
    queryFn: () => client.listMyAiActivity(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useWorkspaceAiActivity(wid: string | undefined, query: { limit?: number; cursor?: string; userId?: string; documentId?: string } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.workspaceAiActivity(wid ?? "", query),
    queryFn: () => client.listWorkspaceAiActivity(wid as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

export function useAiReports(did: string | undefined, query: { limit?: number; cursor?: string; task?: string } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiReports(did ?? "", query),
    queryFn: () => client.listAiReports(did as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

/** A saved coverage/review result: immutable once the job succeeds, so cached indefinitely. */
export function useAiReport(did: string | undefined, jobId: string | null | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.aiReport(jobId ?? ""),
    queryFn: () => client.getAiReport(did as string, jobId as string),
    staleTime: Infinity,
    enabled: !!did && !!jobId,
  });
}

export function useConvertAiNote(did: string) {
  const client = useScreenwriterClient();
  return useMutation({
    mutationFn: ({ jobId, noteId }: { jobId: string; noteId: string }) => client.convertAiNote(did, jobId, noteId),
  });
}
