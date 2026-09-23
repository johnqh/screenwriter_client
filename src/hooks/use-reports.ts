import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportCreateRequest, ReportKind } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** The 18 report kinds with their options and columns (`available: false` kinds explain why in `unavailableReason`). */
export function useReportKinds() {
  const client = useScreenwriterClient();
  return useQuery({ queryKey: queryKeys.reportKinds(), queryFn: () => client.getReportKinds(), staleTime: STALE_TIMES.TEMPLATES });
}

/**
 * One report as JSON tables. On a document past 200 pages the answer is a `report.render` job instead (`isReportJob`): follow
 * it with `useJob` and `useJobOutputs`.
 */
export function useReport(did: string | undefined, kind: ReportKind | undefined, query: { source?: string; options?: Record<string, unknown> } = {}, opts: { enabled?: boolean } = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.report(did ?? "", kind ?? "", query.source, query.options),
    queryFn: () => client.getReport(did as string, kind as ReportKind, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && !!kind && (opts.enabled ?? true),
    retry: false,
  });
}

/** `csv` / `pdf` / `html` start a `report.render` job (the mutation returns it); `json` returns the result. */
export function useCreateReport(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportCreateRequest) => client.createReport(did, body),
    onSuccess: result => {
      if ("status" in result) return qc.invalidateQueries({ queryKey: queryKeys.jobs() });
      return undefined;
    },
  });
}
