import { useQuery } from "@tanstack/react-query";
import type { PacketQuery } from "@sudobility/screenwriter_types";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

/** Production packets (spec 11 §7): `locator` is `#12A`, `@5`, a heading, an entity name or a raw id. Failures are typed (`LocatorAmbiguousError`, ...): no retry. */
export function useScenePacket(did: string | undefined, locator: string | undefined, query: PacketQuery = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.packet(did ?? "", "scene", locator ?? "", query),
    queryFn: () => client.getScenePacket(did as string, locator as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && !!locator,
    retry: false,
  });
}

export function useCharacterPacket(did: string | undefined, locator: string | undefined, query: PacketQuery = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.packet(did ?? "", "character", locator ?? "", query),
    queryFn: () => client.getCharacterPacket(did as string, locator as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && !!locator,
    retry: false,
  });
}

export function useLocationPacket(did: string | undefined, locator: string | undefined, query: PacketQuery = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.packet(did ?? "", "location", locator ?? "", query),
    queryFn: () => client.getLocationPacket(did as string, locator as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && !!locator,
    retry: false,
  });
}

export function useShotPacket(did: string | undefined, locator: string | undefined, query: PacketQuery = {}) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.packet(did ?? "", "shot", locator ?? "", query),
    queryFn: () => client.getShotPacket(did as string, locator as string, query),
    staleTime: STALE_TIMES.DETAIL,
    enabled: !!did && !!locator,
    retry: false,
  });
}
