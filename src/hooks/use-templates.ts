import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TemplateCreateRequest,
  TemplateListQuery,
  TemplateUpdateRequest,
  TemplateVersionCreateRequest,
} from "@sudobility/screenwriter_types";
import type { ImportTemplateInput } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/**
 * Built-ins, plus (B14) the caller's own `user` templates and the `workspace` ones. `filter` is a category string, or
 * `{category?, workspaceId?, scope?}` to narrow to one workspace or one scope.
 */
export function useTemplates(filter?: string | Partial<TemplateListQuery>) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.templates(filter),
    queryFn: () => client.listTemplates(filter),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

/** One template body; `version` reads an older version of a user/workspace template. */
export function useTemplate(idOrKey: string | undefined, version?: number) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: version === undefined ? queryKeys.template(idOrKey ?? "") : [...queryKeys.template(idOrKey ?? ""), version],
    queryFn: () => client.getTemplate(idOrKey as string, version),
    staleTime: STALE_TIMES.TEMPLATES,
    enabled: !!idOrKey,
  });
}

/** Lists and bodies of stored templates go stale together (a new version changes `latestVersion` and the latest body). */
const useRefresh = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.templatesAll() }),
      qc.invalidateQueries({ queryKey: [...queryKeys.all(), "template"] }),
    ]);
};

export function useCreateTemplate() {
  const client = useScreenwriterClient();
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body: TemplateCreateRequest) => client.createTemplate(body), onSuccess: refresh });
}

export function useCreateTemplateVersion(tid: string) {
  const client = useScreenwriterClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (template: TemplateVersionCreateRequest["template"]) => client.createTemplateVersion(tid, template),
    onSuccess: refresh,
  });
}

export function useUpdateTemplate(tid: string) {
  const client = useScreenwriterClient();
  const refresh = useRefresh();
  return useMutation({ mutationFn: (patch: TemplateUpdateRequest) => client.updateTemplate(tid, patch), onSuccess: refresh });
}

export function useDeleteTemplate() {
  const client = useScreenwriterClient();
  const refresh = useRefresh();
  return useMutation({ mutationFn: (tid: string) => client.deleteTemplate(tid), onSuccess: refresh });
}

export function useImportTemplate() {
  const client = useScreenwriterClient();
  const refresh = useRefresh();
  return useMutation({ mutationFn: (input: ImportTemplateInput) => client.importTemplate(input), onSuccess: refresh });
}

export function useExportTemplate(tid: string) {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (opts: { format?: "fwtemplate" | "json"; version?: number } = {}) => client.exportTemplate(tid, opts) });
}
