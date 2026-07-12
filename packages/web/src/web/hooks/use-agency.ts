import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/** Current agency's profile (name, logo, locale, etc). */
export function useAgency() {
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.settings.agency.$get()).json(),
    staleTime: 60_000,
  });
  const agency = (data as any)?.agency ?? null;
  return { agency, isLoading };
}
