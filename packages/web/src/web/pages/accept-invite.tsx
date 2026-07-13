import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function AcceptInvitePage() {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError(t("invite.missing", "The invitation token is missing."));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("invite.password_mismatch", "Passwords do not match."));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Invitation acceptance failed");
      setAccepted(true);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Invitation acceptance failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg)" }}>
      <div className="card p-6 w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-white text-xl font-bold mb-3" style={{ backgroundColor: "var(--primary)" }}>
            ع
          </div>
          <h1 className="text-xl font-bold">{t("invite.title", "Accept your invitation")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("invite.description", "Choose a secure password to activate your account.")}
          </p>
        </div>

        {accepted ? (
          <div className="space-y-4 text-center">
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
              {t("invite.success", "Your account is active. You can now sign in.")}
            </div>
            <Link to="/sign-in" className="btn-primary inline-flex justify-center w-full">
              {t("auth.sign_in")}
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="invite-password" className="label">{t("auth.password")}</label>
              <input
                id="invite-password"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                {t("invite.password_help", "At least 12 characters with uppercase, lowercase, and a number.")}
              </p>
            </div>
            <div>
              <label htmlFor="invite-confirm-password" className="label">
                {t("invite.confirm_password", "Confirm password")}
              </label>
              <input
                id="invite-confirm-password"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={12}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button className="btn-primary w-full" type="submit" disabled={loading || !token}>
              {loading ? t("common.loading") : t("invite.activate", "Activate account")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
