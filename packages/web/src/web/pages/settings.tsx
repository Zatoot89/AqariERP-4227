import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { api } from "../lib/api";

function fetchSettings() {
  return api.settings.agency.$get().then((r) => r.json());
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    country: "",
    locale: "en",
    currency: "USD",
    timezone: "Asia/Baghdad",
  });
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (data && (data as any).agency) {
      const a = (data as any).agency;
      setForm({
        name: a.name ?? "",
        nameAr: a.nameAr ?? "",
        country: a.country ?? "",
        locale: a.locale ?? "en",
        currency: a.currency ?? "USD",
        timezone: a.timezone ?? "Asia/Baghdad",
      });
    }
  }, [data]);

  const logoPreview = (data as any)?.agency?.logoImageUrl ?? null;

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    try {
      const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type, sizeBytes: file.size } });
      const { url, key } = await res.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await api.settings.agency.$patch({ json: { logoUrl: key } });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setLogoUploading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (body: typeof form) =>
      api.settings.agency.$patch({ json: body }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(form);
    if (form.locale !== i18n.language) {
      i18n.changeLanguage(form.locale);
    }
  }

  const agency = (data as any)?.agency;
  const [waForm, setWaForm] = useState({ waAccessToken: "", waPhoneNumberId: "" });
  useEffect(() => {
    if (agency) {
      setWaForm({
        waAccessToken: agency.waAccessToken ?? "",
        waPhoneNumberId: agency.waPhoneNumberId ?? "",
      });
    }
  }, [agency]);
  const [waTestResult, setWaTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const waMutation = useMutation({
    mutationFn: (body: typeof waForm) =>
      api.settings.agency.$patch({ json: body }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setWaTestResult(null); },
  });

  const testMutation = useMutation({
    mutationFn: () => api.whatsapp["test-connection"].$post().then((r) => r.json()),
    onSuccess: (res: any) => {
      if (res.ok) setWaTestResult({ ok: true, message: `Connected: ${res.verifiedName ?? res.phoneNumber}` });
      else setWaTestResult({ ok: false, message: res.error ?? "Connection failed" });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  function handleWaSave(e: React.FormEvent) {
    e.preventDefault();
    waMutation.mutate(waForm);
  }

  return (
    <div className="page-content" style={{ maxWidth: "720px" }}>
      <div className="page-header">
        <h1 className="page-title">{t("nav.settings")}</h1>
      </div>

      {/* Agency Profile */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>{t("settings.agencyProfile")}</h2>

        {/* Logo upload */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--primary)" }}>
            {logoPreview ? (
              <img src={logoPreview} alt={t("settings.agencyLogo", "Agency logo")} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-bold">{(form.name || "A").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: "var(--primary)" }}>
              {logoUploading ? t("common.loading") : t("settings.uploadLogo", "Upload logo")}
              <input aria-label={t("settings.uploadLogo", "Upload logo")} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} disabled={logoUploading} />
            </label>
            <p className="text-xs text-gray-400 mt-0.5">{t("settings.logoHelp", "Shown in the sidebar and on client-facing pages.")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="form-label">{t("settings.agencyName")}</label>
              <input className="form-input" {...field("name")} placeholder="Aqari Realty" />
            </div>
            <div>
              <label className="form-label">{t("settings.agencyNameAr")}</label>
              <input className="form-input" dir="rtl" {...field("nameAr")} placeholder="عقاري العقارية" />
            </div>
            <div>
              <label className="form-label">{t("settings.country")}</label>
              <select className="form-input" {...field("country")}>
                <option value="">—</option>
                <option value="IQ">Iraq (العراق)</option>
                <option value="SA">Saudi Arabia (المملكة العربية السعودية)</option>
                <option value="AE">UAE (الإمارات)</option>
                <option value="KW">Kuwait (الكويت)</option>
                <option value="QA">Qatar (قطر)</option>
                <option value="BH">Bahrain (البحرين)</option>
                <option value="OM">Oman (عُمان)</option>
                <option value="JO">Jordan (الأردن)</option>
                <option value="EG">Egypt (مصر)</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t("settings.language")}</label>
              <select className="form-input" {...field("locale")}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t("settings.currency")}</label>
              <select className="form-input" {...field("currency")}>
                <option value="USD">USD — US Dollar</option>
                <option value="IQD">IQD — Iraqi Dinar</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="KWD">KWD — Kuwaiti Dinar</option>
                <option value="QAR">QAR — Qatari Riyal</option>
                <option value="EGP">EGP — Egyptian Pound</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t("settings.timezone")}</label>
              <select className="form-input" {...field("timezone")}>
                <option value="Asia/Baghdad">Asia/Baghdad (GMT+3)</option>
                <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
                <option value="Africa/Cairo">Africa/Cairo (GMT+2)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("saving") : t("save")}
            </button>
            {saved && <span style={{ color: "#22c55e", fontSize: "0.875rem", fontWeight: 500 }}>✓ {t("saved")}</span>}
          </div>
        </form>
      </div>

      {/* WhatsApp Integration */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>{t("settings.whatsapp")}</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{t("settings.whatsappDesc")}</p>
          </div>
          {agency?.waConnectedAt ? (
            <span style={{ background: "#22c55e22", color: "#22c55e", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600 }}>
              {t("settings.connected", "Connected")}
            </span>
          ) : (
            <span style={{ background: "#94a3b822", color: "#64748b", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600 }}>
              {t("settings.notConnected", "Not connected")}
            </span>
          )}
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {t("settings.whatsappHelp", "Get these from your Meta Developer App → WhatsApp → API Setup.")}
        </p>
        <form onSubmit={handleWaSave}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem" }}>
          <div>
            <label className="form-label">{t("settings.wapiToken")}</label>
            <input
              className="form-input"
              type="password"
              placeholder="EAAxxxxxxxx (permanent access token)"
              value={waForm.waAccessToken}
              onChange={e => setWaForm(f => ({ ...f, waAccessToken: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">{t("settings.wapiPhone")}</label>
            <input
              className="form-input"
              placeholder="Phone Number ID (e.g. 109xxxxxxxxxx)"
              value={waForm.waPhoneNumberId}
              onChange={e => setWaForm(f => ({ ...f, waPhoneNumberId: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
          <button className="btn btn-primary" type="submit" disabled={waMutation.isPending}>
            {waMutation.isPending ? t("saving") : t("common.save")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={testMutation.isPending || !agency?.waAccessToken || !agency?.waPhoneNumberId}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? t("common.loading") : t("settings.connect", "Test Connection")}
          </button>
          {waTestResult && (
            <span style={{ fontSize: "0.8rem", fontWeight: 500, color: waTestResult.ok ? "#22c55e" : "#ef4444" }}>
              {waTestResult.ok ? "✓" : "✗"} {waTestResult.message}
            </span>
          )}
        </div>
        </form>
      </div>

      {/* Billing */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>{t("settings.billing")}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "0.75rem" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.25rem"
          }}>⭐</div>
          <div>
            <div style={{ fontWeight: 600 }}>Aqari Pro</div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{t("settings.planDesc")}</div>
          </div>
          <div style={{ marginInlineStart: "auto", textAlign: "end" }}>
            <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>$49<span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 400 }}>/mo</span></div>
            <div style={{ fontSize: "0.75rem", color: "#22c55e" }}>{t("settings.active")}</div>
          </div>
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-secondary" disabled>{t("settings.manageBilling")}</button>
          <button className="btn btn-secondary" disabled>{t("settings.invoices")}</button>
        </div>
      </div>
    </div>
  );
}
