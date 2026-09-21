import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommandBatchRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { queryKeys } from "./query-keys";

/**
 * Live reads of a document's scenes and elements, and the server-side command route. None of these is
 * cached across mounts (`staleTime: 0`): the live document moves on with every edit, and an open editor
 * reads from its own Y.Doc, so these are for panels, tools and scripts that hold no replica.
 */

export function useOutline(did: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.outline(did ?? ""),
    queryFn: () => client.getOutline(did as string),
    staleTime: 0,
    enabled: !!did,
  });
}

export function useScene(did: string | undefined, sceneId: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.scene(did ?? "", sceneId ?? ""),
    queryFn: () => client.getScene(did as string, sceneId as string),
    staleTime: 0,
    enabled: !!did && !!sceneId,
  });
}

/** Several scenes in one request (max `SCENE_BATCH_MAX`). Idle while `sceneIds` is empty. */
export function useScenes(did: string | undefined, sceneIds: readonly string[]) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.scenes(did ?? "", sceneIds),
    queryFn: () => client.getScenes(did as string, [...sceneIds]),
    staleTime: 0,
    enabled: !!did && sceneIds.length > 0,
  });
}

/** Several elements in one request (max `ELEMENT_BATCH_MAX`). Idle while `elementIds` is empty. */
export function useElements(did: string | undefined, elementIds: readonly string[]) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.elements(did ?? "", elementIds),
    queryFn: () => client.getElements(did as string, [...elementIds]),
    staleTime: 0,
    enabled: !!did && elementIds.length > 0,
  });
}

/**
 * Apply a command batch. A real (non-`dryRun`) batch changes the document, so everything read from it
 * (outline, scenes, elements, content) is refreshed; a `dryRun` changes nothing and refreshes nothing.
 */
export function useApplyCommands(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommandBatchRequest) => client.applyCommands(did, body),
    onSuccess: (_result, body) => (body.dryRun ? undefined : qc.invalidateQueries({ queryKey: queryKeys.documentFamily(did) })),
  });
}
