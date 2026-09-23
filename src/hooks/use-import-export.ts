import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExportCreateRequest, ExportFormatId, Job, WatermarkLookupRequest } from "@sudobility/screenwriter_types";
import type { ImportDocumentInput, ImportFileInput, ImportFileTarget } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { invalidateDocumentLists } from "./use-documents";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";
import { useJob, useJobOutputs } from "./use-jobs";

export function useFormats() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.formats(),
    queryFn: () => client.getFormats(),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

/** Imports a file as a new document in the project and refreshes the project's document list. */
export function useImportDocument(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportDocumentInput) => client.importDocument(pid, input),
    onSuccess: () => invalidateDocumentLists(qc),
  });
}

export function useExportDocument(did: string) {
  const client = useScreenwriterClient();
  return useMutation({
    mutationFn: (format: ExportFormatId) => client.exportDocument(did, format),
  });
}

/**
 * Import a file as a job (B16): declare, upload, start, then follow the `import.<format>` (or `doc.importOver`) job with `useJob`.
 * `start(file)` resolves with the queued job; `job` is the live copy (polled until it finishes). When it succeeds the document lists
 * (and, for an import over, the document family) are refreshed once. Build on this instead of `useImportDocument` for anything new.
 *
 *   const imp = useImportJob({ projectId });   // or { documentId } to replace a document's content
 *   await imp.start({ filename, bytes });
 *   imp.job?.status; imp.outputs?.outputs[0].documentId
 */
export function useImportJob(target: ImportFileTarget) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const targetKey = target.documentId ?? target.projectId;
  const mutation = useMutation({
    mutationFn: (file: ImportFileInput) => client.importFile(target, file),
    onSuccess: job => {
      setJobId(job.id);
      qc.setQueryData(queryKeys.job(job.id), job);
    },
  });
  const job = useJob(jobId);
  const status = job.data?.status;
  useEffect(() => {
    if (status !== "succeeded") return;
    void invalidateDocumentLists(qc);
    if (target.documentId) void qc.invalidateQueries({ queryKey: queryKeys.documentFamily(target.documentId) });
  }, [status, qc, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const outputs = useJobOutputs(jobId, status === "succeeded");
  const reset = useCallback(() => {
    setJobId(null);
    mutation.reset();
  }, [mutation]);
  return {
    start: mutation.mutateAsync,
    /** The start request itself (declare, upload, start): pending, or the error (`FormatUnsupportedError`, `OcrUnavailableError`, ...). */
    starting: mutation,
    jobId,
    job: job.data as Job | undefined,
    /** One `conversion-report.json` per created document, each with `documentId` (once the job succeeded). */
    outputs: outputs.data,
    reset,
  };
}

/**
 * Export a document as a job (B16): `start({format, source?, options?})` creates `export.<format>` (or `watermark.batch`), `job` follows
 * it, `outputs` holds the download URLs once it succeeded (`client.fetchJobOutput(output)` gives the bytes). fountain, fdx and json only:
 * anything else fails the start with `FormatUnsupportedError`.
 */
export function useExportJob(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: ExportCreateRequest) => client.createExportJob(did, body),
    onSuccess: job => {
      setJobId(job.id);
      qc.setQueryData(queryKeys.job(job.id), job);
      return qc.invalidateQueries({ queryKey: queryKeys.jobs() });
    },
  });
  const job = useJob(jobId);
  const outputs = useJobOutputs(jobId, job.data?.status === "succeeded");
  const reset = useCallback(() => {
    setJobId(null);
    mutation.reset();
  }, [mutation]);
  return { start: mutation.mutateAsync, starting: mutation, jobId, job: job.data as Job | undefined, outputs: outputs.data, reset };
}

/** Leak lookup for a workspace admin: `{exportId}` or `{pdfUploadKey}`. Errors: `WatermarkNotFoundError`, 403 for a non-admin. */
export function useWatermarkLookup(wid: string) {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (body: WatermarkLookupRequest) => client.lookupWatermark(wid, body) });
}
