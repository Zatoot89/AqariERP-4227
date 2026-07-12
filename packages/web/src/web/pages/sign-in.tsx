import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { authClient, captureToken } from "../lib/auth";
import { setLanguage } from "../lib/i18n";

export default function SignInPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await authClient.signIn.email(
      { email, password },
      { onSuccess: captureToken },
    );
    setLoading(false);
    if (signInError) {
      setError(signInError.message ?? "Sign in failed");
      return;
    }
    setLocation("/dashboard");
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signUpError } = await authClient.signUp.email(
      { name, email, password },
      { onSuccess: captureToken },
    );
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message ?? "Sign up failed");
      return;
    }

    try {
      const response = await fetch("/api/settings/bootstrap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("aqari_token") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ locale: i18n.language === "ar" ? "ar" : "en" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Account setup failed");
      }
    } catch (bootstrapError) {
      setLoading(false);
      setError(
        bootstrapError instanceof Error ? bootstrapError.message : "Account setup failed",
      );
      return;
    }

    setLoading(false);
    setLocation("/dashboard");
  };

  const toggleLang = () => setLanguage(i18n.language === "ar" ? "en" : "ar");

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <button
        onClick={toggleLang}
        className="fixed top-4 end-4 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50"
      >
        {i18n.language === "ar" ? "English" : "عربي"}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <span className="text-white text-2xl font-bold">ع</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>
            {tab === "signin" ? t("auth.welcome_back") : t("auth.create_account")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {t("app_name")}
          </p>
        </div>

        <div className="flex rounded-xl p-1 mb-6" style={{ backgroundColor: "var(--border)" }}>
          {(["signin", "signup"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => {
                setTab(tabKey);
                setError("");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === tabKey ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tabKey === "signin" ? t("auth.sign_in") : t("auth.sign_up")}
            </button>
          ))}
        </div>

        <div className="card p-6">
          <form
            onSubmit={tab === "signin" ? handleSignIn : handleSignUp}
            className="space-y-4"
          >
            {tab === "signup" && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium mb-1.5">{t("auth.name")}</label>
                <input
                  aria-label={t("auth.name")}
                  id="auth-name"
                  className="input"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium mb-1.5">{t("auth.email")}</label>
              <input
                aria-label={t("auth.email")}
                id="auth-email"
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium mb-1.5">{t("auth.password")}</label>
              <input
                aria-label={t("auth.password")}
                id="auth-password"
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading
                ? tab === "signin"
                  ? t("auth.signing_in")
                  : t("auth.signing_up")
                : tab === "signin"
                  ? t("auth.sign_in")
                  : t("auth.sign_up")}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
          Demo: create any account to get started
        </p>
      </div>
    </div>
  );
}
