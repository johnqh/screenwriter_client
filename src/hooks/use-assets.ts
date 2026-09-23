/** Assets and R2 (B11): the library, uploads, links and staleness. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssetCompleteRequest,
  AssetLinkCreateRequest,
  AssetLinkUpdateRequest,
  AssetListQuery,
  AssetPartsRequest,
  AssetUpdateRequest,
  AssetUploadRequest,
  AssetUrlQuery,
  DocumentAssetLinksQuery,
  DocumentStalenessQuery,
} from "@sudobility/screenwriter_types";
import type { UploadAssetOptions, UploadableFile } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** `?workspaceId=` (required for a user; a key defaults to its own workspace), `?documentId=`, `?linkedTo=`, `?role=`, `?kind=`, `?q=`, `?origin=`. */
export function useAssets(query: Partial<AssetListQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.assetLists(query),
    queryFn: () => client.listAssets(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

/** One asset with its versions and links. */
export function useAsset(aid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.asset(aid ?? ""),
    queryFn: () => client.getAsset(aid as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!aid,
  });
}

/** A signed URL for one version's original or a named derivative; refetches near expiry (the URL is only good for `ASSET_URL_TTL_S`, 300 s). */
export function useAssetUrl(aid: string | undefined, vid: string | undefined, query: Partial<AssetUrlQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.assetUrl(aid ?? "", vid ?? "", query.variant),
    queryFn: () => client.getAssetUrl(aid as string, vid as string, query),
    staleTime: 4 * 60_000,
    enabled: !!aid && !!vid,
  });
}

export function useUpdateAsset() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aid, body }: { aid: string; body: AssetUpdateRequest }) => client.updateAsset(aid, body),
    onSuccess: (_r, { aid }) => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.asset(aid) }), qc.invalidateQueries({ queryKey: queryKeys.assetLists() })]),
  });
}

/** Soft delete; the mutation throws `AssetInUseError` (409) while a live link still points at the asset. */
export function useDeleteAsset() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) => client.deleteAsset(aid),
    onSuccess: (_r, aid) => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.asset(aid) }), qc.invalidateQueries({ queryKey: queryKeys.assetLists() })]),
  });
}

export function useRestoreAsset() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) => client.restoreAsset(aid),
    onSuccess: (_r, aid) => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.asset(aid) }), qc.invalidateQueries({ queryKey: queryKeys.assetLists() })]),
  });
}

/** The asset links of one document (`?targetKind=&targetId=&role=`, `?withStaleness=true`). Under the document family: a scene/entity edit can make these stale. */
export function useAssetLinks(did: string | undefined, query: Partial<DocumentAssetLinksQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentAssetLinks(did ?? "", query),
    queryFn: () => client.listDocumentAssetLinks(did as string, query),
    staleTime: STALE_TIMES.LISTS,
    enabled: !!did,
  });
}

function invalidateForLink(qc: ReturnType<typeof useQueryClient>, did: string | null | undefined) {
  const p: Promise<unknown>[] = [qc.invalidateQueries({ queryKey: queryKeys.assetLists() })];
  if (did) p.push(qc.invalidateQueries({ queryKey: queryKeys.documentAssetLinks(did) }), qc.invalidateQueries({ queryKey: queryKeys.documentStaleness(did) }));
  return Promise.all(p);
}

/** 404 `TARGET_NOT_FOUND`, 422 `RoleNotAllowedForTargetError`. */
export function useCreateAssetLink() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssetLinkCreateRequest) => client.createAssetLink(body),
    onSuccess: r => invalidateForLink(qc, r.documentId),
  });
}

export function useUpdateAssetLink(did?: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lid, body }: { lid: string; body: AssetLinkUpdateRequest }) => client.updateAssetLink(lid, body),
    onSuccess: r => invalidateForLink(qc, did ?? r.documentId),
  });
}

export function useUnlinkAsset(did?: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lid: string) => client.unlinkAsset(lid),
    onSuccess: () => invalidateForLink(qc, did),
  });
}

/** Per-target fresh/stale/deleted counts (`?targetKind=scene|element|shot|entity`). */
export function useStaleness(did: string | undefined, query: Partial<DocumentStalenessQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.documentStaleness(did ?? "", query),
    queryFn: () => client.getDocumentStaleness(did as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did,
  });
}

export function useAssetLinkStaleness(lid: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.assetLinkStaleness(lid ?? ""),
    queryFn: () => client.getAssetLinkStaleness(lid as string),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!lid,
  });
}

// ─── upload flow ─────────────────────────────────────────────────────────────

/** The four low-level upload-plan routes, for a caller building its own progress UI instead of `useUploadAsset`. */
export function useAssetUpload(uploadId: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.assetUpload(uploadId ?? ""),
    queryFn: () => client.getAssetUpload(uploadId as string),
    staleTime: 0,
    enabled: !!uploadId,
  });
}

export function useInitAssetUpload() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: ({ wid, body }: { wid: string; body: AssetUploadRequest }) => client.initAssetUpload(wid, body) });
}

export function useSignAssetUploadParts() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: ({ uploadId, partNumbers }: { uploadId: string; partNumbers: AssetPartsRequest["partNumbers"] }) => client.signAssetUploadParts(uploadId, partNumbers) });
}

export function useCompleteAssetUpload() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadId, body }: { uploadId: string; body: AssetCompleteRequest }) => client.completeAssetUpload(uploadId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assetLists() }),
  });
}

export function useAbortAssetUpload() {
  const client = useScreenwriterClient();
  return useMutation({ mutationFn: (uploadId: string) => client.abortAssetUpload(uploadId) });
}

export interface UseUploadAssetArgs {
  wid: string;
  file: UploadableFile;
  opts: UploadAssetOptions;
}

/**
 * `uploadAsset`'s whole multipart plan as a mutation, with live progress: `progress` (0..1, from `opts.onProgress`) updates on
 * every part and once more at completion, without waiting for the mutation to settle (read it from the hook's return value,
 * not from `mutation.data`, since it changes mid-flight). A failed part throws `AssetUploadInterruptedError`: read
 * `.uploadId` off the mutation's `error` and retry with `{...opts, resumeUploadId: uploadId}` to resume.
 */
export function useUploadAsset() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ wid, file, opts }: UseUploadAssetArgs) =>
      client.uploadAsset(wid, file, {
        ...opts,
        onProgress: f => {
          setProgress(f);
          opts.onProgress?.(f);
        },
      }),
    onMutate: () => setProgress(0),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assetLists() }),
  });
  return { ...mutation, progress };
}
