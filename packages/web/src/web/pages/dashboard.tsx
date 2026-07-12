import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { TrendingUp, Users, CheckCircle2, Activity, ArrowRight, Clock, Building2, UserCircle, Settings, Circle, CheckCircle as CheckCircleFilled } from "lucide-react";
import { Link } from "wouter";
import { useProfile } from "../hooks/use-profile";
import { useAgency } from "../hooks/use-agency";

const STAGE_COLORS: Record<string, string> = {
  new: "#6B7280", contacted: "#3B82F6", viewing: "#F59E0B",
  offer: "#F97316", closed: "#10B981", lost: "#EF4444",
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { isAdminOrManager } = useProfile();
  const { agency } = useAgency();

  // Uses /api/leads/stats (not /api/analytics/overview) since it's available to every
  // role — agents get their own numbers, admin/manager get the agency-wide total.
  const overview = useQuery({
    queryKey: ["leads-stats"],
    queryFn: async () => (await api.leads.stats.$get()).json(),
  });

  const leads = useQuery({
    queryKey: ["leads-recent"],
    queryFn: async () => (await api.leads.$get({ query: { pageSize: "5" } })).json(),
  });

  const tasks = useQuery({
    queryKey: ["tasks-upcoming"],
    queryFn: async () => (await api.tasks.$get({ query: { done: "0", pageSize: "5" } })).json(),
  });

  const properties = useQuery({
    queryKey: ["properties-count"],
    queryFn: async () => (await api.properties.$get({ query: { pageSize: "1" } })).json(),
  });

  const agents = useQuery({
    queryKey: ["agents-count"],
    queryFn: async () => (await api.agents.$get()).json(),
    enabled: true,
  });

  const stats = overview.data?.stats;
  const recentLeads = (leads.data?.leads ?? []).slice(0, 5);
  const upcomingTasks = (tasks.data?.tasks ?? []).filter(t => !t.done).slice(0, 5);

  // Onboarding checklist — only meaningful (and actionable) for admin/manager, and only
  // shown until every step is complete, since agents can't invite teammates or edit the agency.
  const agentCount = ((agents.data as any)?.agents ?? []).length;
  const propertyCount = (properties.data as any)?.total ?? 0;
  const hasAgencyName = !!agency?.name && agency.name !== "My Agency";
  const onboardingSteps = [
    { key: "profile", done: hasAgencyName, label: t("onboarding.profile", "Confirm your agency profile"), to: "/settings", icon: Settings },
    { key: "team", done: agentCount > 1, label: t("onboarding.team", "Invite your team"), to: "/agents", icon: UserCircle },
    { key: "property", done: propertyCount > 0, label: t("onboarding.property", "Add your first property"), to: "/properties", icon: Building2 },
    { key: "lead", done: (stats?.totalLeads ?? 0) > 0, label: t("onboarding.lead", "Add your first lead"), to: "/leads", icon: Users },
  ];
  const showOnboarding = isAdminOrManager && onboardingSteps.some(s => !s.done);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>{t("dashboard.title")}</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{t("tagline")}</p>
      </div>

      {/* Onboarding checklist */}
      {showOnboarding && (
        <div className="card p-5" style={{ borderColor: "var(--primary)", borderWidth: 1 }}>
          <h2 className="text-base font-semibold mb-1">{t("onboarding.title", "Finish setting up your agency")}</h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {t("onboarding.subtitle", "A few quick steps to get the most out of Aqari CRM.")}
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {onboardingSteps.map(step => (
              <Link key={step.key} to={step.to}>
                <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${step.done ? "border-green-100 bg-green-50/50" : "border-gray-100 hover:border-gray-200"}`}>
                  {step.done ? <CheckCircleFilled size={18} className="text-green-500 shrink-0" /> : <Circle size={18} className="text-gray-300 shrink-0" />}
                  <step.icon size={15} className={step.done ? "text-green-500" : "text-gray-400"} />
                  <span className={`text-sm ${step.done ? "line-through text-gray-400" : "font-medium"}`}>{step.label}</span>
                  {!step.done && <ArrowRight size={13} className="ms-auto text-gray-300" />}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{t("dashboard.total_leads")}</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
              <Users size={16} style={{ color: "var(--primary)" }} />
            </div>
          </div>
          {overview.isLoading
            ? <div className="h-7 bg-gray-100 rounded animate-pulse w-16" />
            : <p className="text-2xl font-bold">{stats?.totalLeads ?? 0}</p>}
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{t("dashboard.closed_deals")}</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-50">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
          </div>
          {overview.isLoading
            ? <div className="h-7 bg-gray-100 rounded animate-pulse w-12" />
            : <p className="text-2xl font-bold text-green-600">{stats?.closedLeads ?? 0}</p>}
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{t("dashboard.conversion_rate")}</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50">
              <TrendingUp size={16} className="text-orange-500" />
            </div>
          </div>
          {overview.isLoading
            ? <div className="h-7 bg-gray-100 rounded animate-pulse w-14" />
            : <p className="text-2xl font-bold">{stats?.conversionRate ?? 0}%</p>}
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{t("dashboard.active_pipeline")}</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
              <Activity size={16} className="text-blue-500" />
            </div>
          </div>
          {overview.isLoading
            ? <div className="h-7 bg-gray-100 rounded animate-pulse w-12" />
            : <p className="text-2xl font-bold">{(stats?.totalLeads ?? 0) - (stats?.closedLeads ?? 0)}</p>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Pipeline overview */}
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-4">{t("dashboard.pipeline_overview")}</h2>
          {overview.isLoading
            ? <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}</div>
            : (
              <div className="space-y-3">
                {(stats?.stageBreakdown ?? []).map((s: any) => (
                  <div key={s.stage} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t(`leads.stages.${s.stage}`)}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: stats.totalLeads > 0 ? `${(s.count / stats.totalLeads) * 100}%` : "0%",
                          backgroundColor: STAGE_COLORS[s.stage] ?? "#6B7280"
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 text-end">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Upcoming tasks */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">{t("dashboard.upcoming_tasks")}</h2>
            <Link to="/tasks"><span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{t("common.view")} →</span></Link>
          </div>
          {tasks.isLoading
            ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
            : upcomingTasks.length === 0
              ? <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>{t("common.no_data")}</p>
              : (
                <div className="space-y-2">
                  {upcomingTasks.map((task: any) => (
                    <div key={task.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                      <Clock size={15} className="mt-0.5 shrink-0 text-orange-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {t(`tasks.types.${task.type}`)} · {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      </div>

      {/* Recent leads */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t("dashboard.recent_leads")}</h2>
          <Link to="/leads"><span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{t("common.view")} →</span></Link>
        </div>
        {leads.isLoading
          ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
          : recentLeads.length === 0
            ? <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>{t("common.no_data")}</p>
            : (
              <div className="divide-y divide-gray-50">
                {recentLeads.map((lead: any) => (
                  <Link key={lead.id} to={`/leads/${lead.id}`}>
                    <div className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg cursor-pointer">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0" style={{ backgroundColor: "var(--primary)" }}>
                        {lead.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{lead.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{lead.phone ?? lead.email ?? "—"}</p>
                      </div>
                      <span className={`stage-${lead.stage}`}>{t(`leads.stages.${lead.stage}`)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}
