import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

const RANGES = [
  { value: "7d", labelKey: "analytics.range7d", fallback: "Last 7 days" },
  { value: "30d", labelKey: "analytics.range30d", fallback: "Last 30 days" },
  { value: "90d", labelKey: "analytics.range90d", fallback: "Last 90 days" },
  { value: "all", labelKey: "analytics.rangeAll", fallback: "All time" },
];

const STAGE_COLORS: Record<string, string> = {
  new: "#6366f1",
  contacted: "#3b82f6",
  viewing: "#f59e0b",
  offer: "#f97316",
  closed: "#22c55e",
  lost: "#ef4444",
};

const SOURCE_COLORS = [
  "#6366f1","#3b82f6","#f59e0b","#22c55e","#ef4444","#8b5cf6","#ec4899",
];

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState("30d");

  const { data: overviewData } = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: async () => (await api.analytics.overview.$get({ query: { range } })).json(),
  });
  const { data: agentStats } = useQuery({
    queryKey: ["analytics-agents", range],
    queryFn: async () => (await api.analytics.agents.$get({ query: { range } })).json(),
  });
  const { data: sources } = useQuery({
    queryKey: ["analytics-sources", range],
    queryFn: async () => (await api.analytics.sources.$get({ query: { range } })).json(),
  });

  // API returns { overview: { totalLeads, closedLeads, conversionRate, stageBreakdown } }
  const overview = (overviewData as any)?.overview ?? {};
  const pipeline: any[] = overview.stageBreakdown ?? [];
  const totalLeads: number = overview.totalLeads ?? 0;
  const closedLeads: number = overview.closedLeads ?? 0;
  const conversionRate: number = overview.conversionRate ?? 0;

  const maxCount = Math.max(...pipeline.map((x: any) => x.count), 1);

  const sourceList = (sources as any)?.sources ?? [];
  const totalSource = sourceList.reduce((s: number, x: any) => s + x.count, 0) || 1;

  // API returns { leaderboard: [...] } with fields: id, name, role, totalLeads, closedLeads, conversionRate
  const agents: any[] = (agentStats as any)?.leaderboard ?? [];

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">{t("nav.analytics")}</h1>
        <select aria-label={t("analytics.date_range", "Analytics date range")} className="select w-auto" value={range} onChange={e => setRange(e.target.value)}>
          {RANGES.map(r => <option key={r.value} value={r.value}>{t(r.labelKey, r.fallback)}</option>)}
        </select>
      </div>

      {/* KPI row */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">{t("stats.totalLeads")}</div>
          <div className="stat-value">{totalLeads}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("stats.closedWon")}</div>
          <div className="stat-value" style={{ color: "#22c55e" }}>{closedLeads}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("stats.conversionRate")}</div>
          <div className="stat-value">{conversionRate}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("stats.openTasks")}</div>
          <div className="stat-value">—</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Pipeline funnel */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>{t("analytics.pipeline")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {pipeline.map((stage: any) => (
              <div key={stage.stage}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                  <span style={{ textTransform: "capitalize" }}>{t(`stage.${stage.stage}`, stage.stage.replace(/_/g, " "))}</span>
                  <span style={{ fontWeight: 600 }}>{stage.count}</span>
                </div>
                <div style={{ height: "10px", borderRadius: "5px", background: "var(--border)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(stage.count / maxCount) * 100}%`,
                    background: STAGE_COLORS[stage.stage] ?? "#6366f1",
                    borderRadius: "5px",
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            ))}
            {pipeline.length === 0 && (
              <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("empty.noData")}</div>
            )}
          </div>
        </div>

        {/* Lead sources */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>{t("analytics.sources")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {sourceList.map((src: any, i: number) => {
              const pct = Math.round((src.count / totalSource) * 100);
              return (
                <div key={src.source} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: SOURCE_COLORS[i % SOURCE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "0.875rem" }}>{src.source}</span>
                  <div style={{ width: "80px", height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: SOURCE_COLORS[i % SOURCE_COLORS.length], borderRadius: "4px" }} />
                  </div>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: "30px", textAlign: "end" }}>{pct}%</span>
                </div>
              );
            })}
            {sourceList.length === 0 && (
              <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{t("empty.noData")}</div>
            )}
          </div>
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>{t("analytics.agentLeaderboard")}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "start", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>#</th>
              <th style={{ textAlign: "start", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>{t("field.agent")}</th>
              <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>{t("analytics.leads")}</th>
              <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>{t("analytics.closed")}</th>
              <th style={{ textAlign: "end", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>{t("analytics.convRate")}</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent: any, i: number) => (
              <tr key={agent.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{i + 1}</td>
                <td aria-label={agent.name ?? t("unknown")} style={{ padding: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      background: "var(--primary)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.8rem", fontWeight: 700, flexShrink: 0
                    }}>
                      {agent.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{agent.name ?? t("unknown")}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{agent.role}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "0.75rem", textAlign: "center" }}>{agent.totalLeads}</td>
                <td style={{ padding: "0.75rem", textAlign: "center", color: "#22c55e", fontWeight: 600 }}>{agent.closedLeads}</td>
                <td style={{ padding: "0.75rem", textAlign: "end" }}>
                  <span style={{
                    background: agent.conversionRate >= 50 ? "#22c55e22" : agent.conversionRate >= 20 ? "#f59e0b22" : "#ef444422",
                    color: agent.conversionRate >= 50 ? "#22c55e" : agent.conversionRate >= 20 ? "#f59e0b" : "#ef4444",
                    padding: "0.2rem 0.5rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600
                  }}>
                    {agent.conversionRate}%
                  </span>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>{t("empty.noData")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
