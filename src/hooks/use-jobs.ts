import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Job, JobCreateRequest, JobListQuery, JobStatus } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** Poll cadence of an active job: every second at first, then every 5 s once it has been polled `JOB_FAST_POLLS` times. */
export const JOB_FAST_POLL_MS = 1000;
export const JOB_SLOW_POLL_MS = 5000;
export const JOB_FAST_POLLS = 30;

const ACTIVE: readonly JobStatus[] = ["queued", "running"];
export const isJobActive = (job: Pick<Job, "status"> | undefined): boolean => !!job && ACTIVE.includes(job.status);

/** Interval for the next poll given what has been read so far; `false` stops (terminal) and undefined data keeps polling. */
export function jobPollInterval(job: Pick<Job, "status"> | undefined, updateCount: number): number | false {
  if (job && !isJobActive(job)) return false;
  return updateCount < JOB_FAST_POLLS ? JOB_FAST_POLL_MS : JOB_SLOW_POLL_MS;
}

/** The caller's jobs (or every job on `documentId`). `kind` is exact or a family prefix (`ai.`). */
export function useJobs(query: JobListQuery = {}, opts: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.jobLists(query),
    queryFn: () => client.listJobs(query),
    staleTime: STALE_TIMES.LISTS,
    enabled: opts.enabled ?? true,
  });
}

/** One job. Polls every 1 s (5 s after 30 polls) while queued or running and stops once terminal. */
export function useJob(jobId: string | null | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ""),
    queryFn: () => client.getJob(jobId as string),
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: q => jobPollInterval(q.state.data, q.state.dataUpdateCount),
  });
}

/** Download URLs of a finished job. Idle until `enabled` (pass `job?.status === "succeeded"`). */
export function useJobOutputs(jobId: string | null | undefined, enabled = true) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.jobOutputs(jobId ?? ""),
    queryFn: () => client.getJobOutputs(jobId as string),
    enabled: !!jobId && enabled,
    staleTime: STALE_TIMES.DETAIL,
  });
}

export function useJobRecipients(jobId: string | null | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.jobRecipients(jobId ?? ""),
    queryFn: () => client.listJobRecipients(jobId as string),
    enabled: !!jobId,
    staleTime: STALE_TIMES.LISTS,
  });
}

/** Create a generic job. The client sends an Idempotency-Key, so a network retry cannot make two jobs. */
export function useCreateJob() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JobCreateRequest) => client.createJob(body),
    onSuccess: (result, body) => {
      if (!body.dryRun && "id" in result) qc.setQueryData(queryKeys.job(result.id), result);
      return qc.invalidateQueries({ queryKey: queryKeys.jobs() });
    },
  });
}

export function useCancelJob() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => client.cancelJob(jobId),
    onSuccess: (job, jobId) => {
      qc.setQueryData(queryKeys.job(jobId), job);
      return qc.invalidateQueries({ queryKey: queryKeys.jobs() });
    },
  });
}
