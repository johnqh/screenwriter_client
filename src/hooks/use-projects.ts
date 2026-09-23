import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CursorQuery,
  ProjectDuplicateRequest,
  ProjectFolderCreateRequest,
  ProjectFolderUpdateRequest,
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
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
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
        qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
      ]),
  });
}

/** Trashed projects and documents change together: refresh the trash family and every project list. */
const refreshProjectsAndTrash = (qc: ReturnType<typeof useQueryClient>, pid?: string) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.projectLists() }),
    qc.invalidateQueries({ queryKey: queryKeys.projectsAll() }),
    qc.invalidateQueries({ queryKey: queryKeys.trashAll() }),
    qc.invalidateQueries({ queryKey: queryKeys.documentLists() }),
    ...(pid ? [qc.invalidateQueries({ queryKey: queryKeys.project(pid) })] : []),
  ]);

/** Permanently delete a trashed project (admin). The delete is a job: the trash and lists refresh now and settle when it ran. */
export function usePurgeProject() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pid, confirmName }: { pid: string; confirmName: string }) => client.deleteProject(pid, confirmName),
    onSuccess: (_r, v) => refreshProjectsAndTrash(qc, v.pid),
  });
}

/** Starts the `project.duplicate` job; follow it with `useJob(job.id)`, then read `job.result.projectId`. */
export function useDuplicateProject(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectDuplicateRequest) => client.duplicateProject(pid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.jobs() }),
  });
}

/** Folders live in the project detail (`Project.folders`): every folder change refreshes it. */
export function useCreateFolder(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectFolderCreateRequest) => client.createFolder(pid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
  });
}

export function useUpdateFolder(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fid, patch }: { fid: string; patch: ProjectFolderUpdateRequest }) => client.updateFolder(fid, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
  });
}

/** Deleting a folder moves documents, so the document lists refresh too. */
export function useDeleteFolder(pid: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fid, moveContentsTo }: { fid: string; moveContentsTo?: string }) => client.deleteFolder(fid, moveContentsTo),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.project(pid) }),
        qc.invalidateQueries({ queryKey: queryKeys.documentLists() }),
      ]),
  });
}
