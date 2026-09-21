import { useQuery } from "@tanstack/react-query";
import { useScreenwriterClient } from "./client-context";
import { STALE_TIMES } from "./query-config";
import { queryKeys } from "./query-keys";

export function useTemplates(category?: string) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.templates(category),
    queryFn: () => client.listTemplates(category),
    staleTime: STALE_TIMES.TEMPLATES,
  });
}

export function useTemplate(idOrKey: string | undefined) {
  const client = useScreenwriterClient();
  return useQuery({
    queryKey: queryKeys.template(idOrKey ?? ""),
    queryFn: () => client.getTemplate(idOrKey as string),
    staleTime: STALE_TIMES.TEMPLATES,
    enabled: !!idOrKey,
  });
}
