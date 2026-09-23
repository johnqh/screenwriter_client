/** Devices and push tokens (B12, spec 05 §6.24). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeviceCreateRequest, DeviceUpdateRequest, PushTokenSetRequest } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useDevices(currentDeviceId?: string) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.devices(),
    queryFn: () => client.listDevices(currentDeviceId),
    staleTime: STALE_TIMES.LISTS,
  });
}

export function useRegisterDevice() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceCreateRequest) => client.registerDevice(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices() }),
  });
}

export function useUpdateDevice() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { devid: string; body: DeviceUpdateRequest }) => client.updateDevice(vars.devid, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices() }),
  });
}

export function useRevokeDevice() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (devid: string) => client.revokeDevice(devid),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices() }),
  });
}

export function useSetPushToken() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { devid: string; body: PushTokenSetRequest }) => client.setPushToken(vars.devid, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices() }),
  });
}

export function useClearPushToken() {
  const client = useScreenwriterClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (devid: string) => client.clearPushToken(devid),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices() }),
  });
}
