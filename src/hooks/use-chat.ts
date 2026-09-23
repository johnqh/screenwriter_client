/** Per-document chat (B12, spec 05 §6.15). Not document content: keys sit under `documentFamily` for convenience, but a chat send never touches Y.Doc state. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatMessageCreateRequest, ChatMessageUpdateRequest, ChatQuery } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useChat(did: string, query: Partial<ChatQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.chat(did, query),
    queryFn: () => client.listChat(did, query),
    enabled: !!did,
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useSendChatMessage(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<ChatMessageCreateRequest, "clientMessageId"> & { clientMessageId?: string }) => client.sendChatMessage(did, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chat(did) }),
  });
}

export function useEditChatMessage(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { mid: string; body: ChatMessageUpdateRequest }) => client.editChatMessage(vars.mid, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chat(did) }),
  });
}

export function useDeleteChatMessage(did: string) {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) => client.deleteChatMessage(mid),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chat(did) }),
  });
}
