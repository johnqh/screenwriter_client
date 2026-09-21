import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExportFormatId } from "@sudobility/screenwriter_types";
import type { ImportDocumentInput } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { invalidateDocumentLists } from "./use-documents";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

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
