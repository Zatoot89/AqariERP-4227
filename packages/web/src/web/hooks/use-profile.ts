import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Current signed-in user's profile (role, agencyId, active, etc).
 * Used to gate admin-only nav items/routes and scope UI behavior by role.
 */
export function useProfile() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await api.settings.profile.$get()).json(),
    staleTime: 60_000,
  });
  const profile = (data as any)?.profile ?? null;
  return {
    profile,
    role: profile?.role as "admin" | "manager" | "agent" | undefined,
    isAdminOrManager: profile?.role === "admin" || profile?.role === "manager",
    isLoading,
  };
}
