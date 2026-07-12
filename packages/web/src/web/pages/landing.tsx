import { useTranslation } from "react-i18next";
import { setLanguage } from "../lib/i18n";
import { Link } from "wouter";
import { Building2, MessageCircle, BarChart3, Users, CheckCircle, Globe, ArrowRight, Zap, Clock } from "lucide-react";

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const toggleLang = () => setLanguage(isAr ? "en" : "ar");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0f172a", color: "#f1f5f9" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 2rem", borderBottom: "1px solid #1e293b",
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: "rgba(15,23,42,0.9)", backdropFilter: "blur(10px)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: "1rem"
          }}>ع</div>
          <span style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.02em" }}>
            {t("app_name")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            onClick={toggleLang}
            style={{
              padding: "0.4rem 1rem", borderRadius: "8px", border: "1px solid #334155",
              background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500
            }}
          >
            {isAr ? "English" : "عربي"}
          </button>
          <Link to="/sign-in">
            <button style={{
              padding: "0.4rem 1rem", borderRadius: "8px", border: "1px solid #334155",
              background: "transparent", color: "#e2e8f0", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500
            }}>
              {t("auth.sign_in")}
            </button>
          </Link>
          <Link to="/sign-up">
            <button style={{
              padding: "0.5rem 1.2rem", borderRadius: "8px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", color: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600
            }}>
              {t("landing.start_free")}
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "5rem 2rem 4rem", maxWidth: "800px", margin: "0 auto" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.35rem 1rem", borderRadius: "999px",
          border: "1px solid #6366f133", background: "#6366f111",
          color: "#a5b4fc", fontSize: "0.8rem", fontWeight: 600, marginBottom: "2rem"
        }}>
          <Zap size={13} />
          {t("landing.badge")}
        </div>

        <h1 style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800,
          lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: "1.5rem"
        }}>
          {t("landing.hero_line1")}{" "}
          <span style={{
            background: "linear-gradient(135deg, #6366f1, #a78bfa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>
            {t("landing.hero_highlight")}
          </span>
          {" "}{t("landing.hero_line2")}
        </h1>

        <p style={{ fontSize: "1.1rem", color: "#94a3b8", marginBottom: "2.5rem", lineHeight: 1.7 }}>
          {t("landing.hero_sub")}
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/sign-up">
            <button style={{
              padding: "0.85rem 2rem", borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", color: "#fff", cursor: "pointer",
              fontSize: "1rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "0.5rem",
              boxShadow: "0 0 30px #6366f144"
            }}>
              {t("landing.cta_primary")}
              <ArrowRight size={16} style={{ transform: isAr ? "rotate(180deg)" : "none" }} />
            </button>
          </Link>
          <Link to="/sign-in">
            <button style={{
              padding: "0.85rem 2rem", borderRadius: "10px",
              border: "1px solid #334155", background: "transparent",
              color: "#e2e8f0", cursor: "pointer", fontSize: "1rem", fontWeight: 600
            }}>
              {t("landing.cta_demo")}
            </button>
          </Link>
        </div>

        {/* Trust line */}
        <p style={{ marginTop: "1.75rem", color: "#475569", fontSize: "0.85rem" }}>
          {t("landing.trust")}
        </p>
      </section>

      {/* Features */}
      <section style={{ padding: "3rem 2rem", maxWidth: "1100px", margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          {t("landing.features_title")}
        </h2>
        <p style={{ textAlign: "center", color: "#94a3b8", marginBottom: "3rem", fontSize: "1rem" }}>
          {t("landing.features_sub")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {[
            { icon: MessageCircle, color: "#22c55e", key: "whatsapp" },
            { icon: BarChart3, color: "#6366f1", key: "pipeline" },
            { icon: Building2, color: "#f59e0b", key: "listings" },
            { icon: Users, color: "#ec4899", key: "agents" },
            { icon: Clock, color: "#3b82f6", key: "tasks" },
            { icon: Globe, color: "#8b5cf6", key: "bilingual" },
          ].map(({ icon: Icon, color, key }) => (
            <div key={key} style={{
              padding: "1.5rem", borderRadius: "14px",
              border: "1px solid #1e293b", background: "#0f172a",
              transition: "border-color 0.2s"
            }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "12px",
                background: `${color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "1rem"
              }}>
                <Icon size={20} style={{ color }} />
              </div>
              <h3 style={{ fontWeight: 700, marginBottom: "0.5rem", fontSize: "1rem" }}>
                {t(`landing.feature_${key}_title`)}
              </h3>
              <p style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6 }}>
                {t(`landing.feature_${key}_desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pitch line */}
      <section style={{
        margin: "2rem auto", maxWidth: "900px", padding: "3rem 2rem",
        textAlign: "center",
        background: "linear-gradient(135deg, #1e1b4b, #1e293b)",
        borderRadius: "20px", border: "1px solid #312e81"
      }}>
        <p style={{ fontSize: "clamp(1.3rem, 3vw, 2rem)", fontWeight: 700, lineHeight: 1.4, marginBottom: "1.5rem" }}>
          "{t("tagline")}"
        </p>
        <Link to="/sign-up">
          <button style={{
            padding: "0.75rem 2rem", borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            border: "none", color: "#fff", cursor: "pointer",
            fontSize: "0.95rem", fontWeight: 700
          }}>
            {t("landing.start_free")} →
          </button>
        </Link>
      </section>

      {/* Pricing */}
      <section style={{ padding: "3rem 2rem 2rem", maxWidth: "1000px", margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          {t("landing.pricing_title")}
        </h2>
        <p style={{ textAlign: "center", color: "#94a3b8", marginBottom: "3rem" }}>
          {t("landing.pricing_sub")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
          {[
            {
              key: "starter", price: "$1,500", period: t("landing.one_time"),
              features: ["landing.f_leads", "landing.f_pipeline", "landing.f_dashboard", "landing.f_2agents"],
              highlight: false
            },
            {
              key: "growth", price: "$3,500", period: t("landing.one_time"),
              features: ["landing.f_everything_starter", "landing.f_automations", "landing.f_agent_perf", "landing.f_properties", "landing.f_5agents"],
              highlight: true
            },
            {
              key: "full", price: "$8,000", period: t("landing.one_time"),
              features: ["landing.f_everything_growth", "landing.f_portals", "landing.f_ai", "landing.f_unlimited"],
              highlight: false
            },
          ].map(({ key, price, period, features, highlight }) => (
            <div key={key} style={{
              padding: "2rem", borderRadius: "16px",
              border: `1px solid ${highlight ? "#6366f1" : "#1e293b"}`,
              background: highlight ? "linear-gradient(135deg, #1e1b4b, #0f172a)" : "#0f172a",
              position: "relative"
            }}>
              {highlight && (
                <div style={{
                  position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff", padding: "0.2rem 0.9rem", borderRadius: "999px",
                  fontSize: "0.75rem", fontWeight: 700
                }}>
                  {t("landing.popular")}
                </div>
              )}
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                {t(`landing.plan_${key}`)}
              </p>
              <p style={{ fontSize: "2.25rem", fontWeight: 800, marginBottom: "0.25rem" }}>{price}</p>
              <p style={{ color: "#475569", fontSize: "0.8rem", marginBottom: "1.5rem" }}>{period}</p>
              <ul style={{ listStyle: "none", padding: 0, marginBottom: "1.75rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.875rem", color: "#cbd5e1" }}>
                    <CheckCircle size={15} style={{ color: "#22c55e", flexShrink: 0 }} />
                    {t(f)}
                  </li>
                ))}
              </ul>
              <Link to="/sign-up">
                <button style={{
                  width: "100%", padding: "0.7rem", borderRadius: "10px",
                  background: highlight ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "transparent",
                  border: `1px solid ${highlight ? "transparent" : "#334155"}`,
                  color: highlight ? "#fff" : "#e2e8f0",
                  cursor: "pointer", fontWeight: 600, fontSize: "0.9rem"
                }}>
                  {t("landing.get_started")}
                </button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        textAlign: "center", padding: "2.5rem 2rem",
        borderTop: "1px solid #1e293b", color: "#475569", fontSize: "0.85rem", marginTop: "3rem"
      }}>
        <p>© 2025 {t("app_name")} · {t("landing.footer_tagline")}</p>
      </footer>
    </div>
  );
}
