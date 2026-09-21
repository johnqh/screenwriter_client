import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiJob, AiJobCreateRequest } from "@sudobility/screenwriter_types";
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
