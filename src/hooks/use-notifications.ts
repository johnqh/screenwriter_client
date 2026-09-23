/**
 * Notification prefs, the notifications list and the live SSE stream (B12, spec 05 §6.16, §6.26).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationPrefsUpdate,
  NotificationsQuery,
  NotificationsReadRequest,
} from "@sudobility/screenwriter_types";
import type { NotificationStreamEvent } from "../network/screenwriter-client";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useNotificationPrefs() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.notificationPrefs(),
    queryFn: () => client.getNotificationPrefs(),
    staleTime: STALE_TIMES.ME,
  });
}

export function useSetNotificationPrefs() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: NotificationPrefsUpdate) => client.setNotificationPrefs(update),
    onSuccess: prefs => qc.setQueryData(queryKeys.notificationPrefs(), prefs),
  });
}

/** The notification list; `useNotificationStream` keeps it fresh live, so this needs no polling. */
export function useNotifications(query: Partial<NotificationsQuery> = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.notificationList(query),
    queryFn: () => client.listNotifications(query),
    staleTime: STALE_TIMES.LISTS,
  });
}

/** Just the badge count (a minimal `listNotifications` call, read from the `X-Unread-Count` header). */
export function useUnreadCount() {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.unreadCount(),
    queryFn: async () => (await client.listNotifications({ limit: 1, unread: true })).unreadCount,
    staleTime: STALE_TIMES.DETAIL,
  });
}

export function useMarkNotificationsRead() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationsReadRequest) => client.markNotificationsRead(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}

/** Notes/replies mentioning someone who cannot see the document yet (spec 05 §6.15), so the author can offer to share. */
export function useMentionsWithoutAccess(did: string) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.mentionsWithoutAccess(did),
    queryFn: () => client.listMentionsWithoutAccess(did),
    enabled: !!did,
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useDeleteNotification() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nid: string) => client.deleteNotification(nid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}

export type NotificationStreamStatus = "connecting" | "open" | "closed" | "idle";

/**
 * Opens `openNotificationStream` for the component's lifetime: a `notification` or `unread_count` event
 * invalidates the notification queries, so `useNotifications`/`useUnreadCount` refetch live. Mount this once
 * (e.g. near the app root, or wherever the notification bell lives); it closes the stream on unmount.
 */
export function useNotificationStream(opts: { enabled?: boolean } = {}): { status: NotificationStreamStatus } {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  const [status, setStatus] = useState<NotificationStreamStatus>("idle");
  const onEventRef = useRef((evt: NotificationStreamEvent) => {
    if (evt.event === "notification" || evt.event === "unread_count") {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    }
  });

  useEffect(() => {
    if (opts.enabled === false) return;
    setStatus("connecting");
    const handle = client.openNotificationStream(evt => onEventRef.current(evt), { onStatus: setStatus });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, opts.enabled]);

  return { status };
}
