import { Redirect } from "wouter";
import { authClient } from "../lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-transparent" style={{ borderTopColor: "var(--primary)" }} />
      </div>
    );
  }

  if (!session) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}
