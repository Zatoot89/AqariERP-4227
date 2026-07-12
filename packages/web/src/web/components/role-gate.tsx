import { Redirect } from "wouter";
import { useProfile } from "../hooks/use-profile";

/**
 * Wrap admin/manager-only pages. Redirects agents to the dashboard.
 * Renders nothing while the profile is loading to avoid a flash of content.
 */
export function RoleGate({ children }: { children: React.ReactNode }) {
  const { isAdminOrManager, isLoading } = useProfile();

  if (isLoading) return null;
  if (!isAdminOrManager) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}
