import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CursorQuery,
  ProjectCreateRequest,
  ProjectListQuery,
  ProjectUpdateRequest,
} from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

type ProjectFilters = Partial<CursorQuery> & Partial<ProjectListQuery>;

export function useProjects(wid: string | undefined, filters: ProjectFilters = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.projects(wid ?? "", filters),
    queryFn: () => client.listProjects(wid as string, filters),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!wid,
  });
}

export function useProject(pid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.project(pid ?? ""),
    queryFn: () => client.getProject(pid as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!pid,
  });
}

export function useCreateProject(wid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreateRequest) => client.createProject(wid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
  });
}

export function useUpdateProject(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProjectUpdateRequest) => client.updateProject(pid, patch),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
        qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
      ]),
  });
}

export function useTrashProject() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => client.trashProject(pid),
    onSuccess: (_r, pid) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
        qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
      ]),
  });
}

export function useRestoreProject() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => client.restoreProject(pid),
    onSuccess: (_r, pid) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
        qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
      ]),
  });
}
