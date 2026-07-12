import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { X, UserPlus, UserX, UserCheck, Users } from "lucide-react";

const ROLES = ["agent", "manager", "admin"];

export default function AgentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "agent", password: "" });
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await api.agents.$get()).json(),
  });

  const inviteMut = useMutation({
    mutationFn: async () => {
      const res = await api.agents.$post({ json: { name: form.name, email: form.email, role: form.role, password: form.password || undefined } });
      const body = await res.json();
      if (!res.ok) throw new Error((body as any).error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setShowInvite(false);
      setForm({ name: "", email: "", role: "agent", password: "" });
      setError("");
    },
    onError: (err: any) => setError(err.message),
  });

  const agents = data?.agents ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("agents.title")}</h1>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => { setShowInvite(true); setError(""); }}
        >
          <UserPlus size={16} />
          {t("agents.invite")}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [1,2,3].map(i => <div key={i} className="card h-40 animate-pulse" />)
          : agents.length === 0
            ? <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-gray-400">
                <Users size={32} className="text-gray-300" />
                <p className="text-sm">{t("agents.empty_state", "No agents yet — invite your first teammate")}</p>
                <button className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={() => { setShowInvite(true); setError(""); }}>
                  <UserPlus size={13} /> {t("agents.invite")}
                </button>
              </div>
            : agents.map((agent: any) => (
              <AgentCard key={agent.id} agent={agent} t={t} />
            ))}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">{t("agents.invite")}</h3>
              <button aria-label={t("common.close", "Close")} onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="agent-name" className="label">{t("field.name")}</label>
                <input
                  id="agent-name"
                  className="input"
                  placeholder="Full Name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="agent-email" className="label">{t("field.email")}</label>
                <input
                  id="agent-email"
                  type="email"
                  className="input"
                  placeholder="agent@email.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="agent-role" className="label">{t("field.role")}</label>
                <select
                  id="agent-role"
                  className="select"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{t(`agents.roles.${r}`, r)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="agent-password" className="label">{t("field.password")} <span className="text-gray-400 text-xs">{t("agents.password_hint", "(optional — auto-generated and emailed to them if left blank)")}</span></label>
                <input
                  id="agent-password"
                  type="password"
                  className="input"
                  placeholder="Leave blank to auto-generate"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button className="btn-outline flex-1" onClick={() => setShowInvite(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => inviteMut.mutate()}
                disabled={!form.name.trim() || !form.email.trim() || inviteMut.isPending}
              >
                {inviteMut.isPending ? "..." : t("agents.invite")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, t }: { agent: any; t: any }) {
  const qc = useQueryClient();
  const [editRole, setEditRole] = useState(false);

  const { data } = useQuery({
    queryKey: ["agent-stats", agent.id],
    queryFn: async () => (await api.agents[":id"].stats.$get({ param: { id: agent.id } })).json(),
  });

  const roleMut = useMutation({
    mutationFn: async (role: string) => {
      await api.agents[":id"].$patch({ param: { id: agent.id }, json: { role } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setEditRole(false);
    },
  });

  const activeMut = useMutation({
    mutationFn: async (active: number) => {
      await api.agents[":id"].$patch({ param: { id: agent.id }, json: { active } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const stats = data?.stats;
  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    manager: "bg-blue-100 text-blue-700",
    agent: "bg-gray-100 text-gray-600",
  };

  const isActive = agent.active !== 0;

  return (
    <div className={`card p-5 ${!isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: "var(--primary)" }}>
          {agent.name ? agent.name.charAt(0).toUpperCase() : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{agent.name || "Unnamed"}</p>
            {!isActive && <span className="badge bg-gray-100 text-gray-500" style={{ fontSize: "9px" }}>{t("agents.inactive", "Inactive")}</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{agent.email}</p>
          <div className="flex items-center gap-2 mt-1">
            {editRole ? (
              <select
                aria-label={t("field.role")}
                className="select text-xs py-0.5 px-1.5 h-auto"
                defaultValue={agent.role}
                onChange={e => roleMut.mutate(e.target.value)}
                autoFocus
                onBlur={() => setEditRole(false)}
                style={{ fontSize: "10px", padding: "2px 6px" }}
              >
                {ROLES.map(r => <option key={r} value={r}>{t(`agents.roles.${r}`, r)}</option>)}
              </select>
            ) : (
              <button
                className={`badge ${roleColors[agent.role] ?? "bg-gray-100 text-gray-600"} cursor-pointer hover:opacity-80`}
                style={{ fontSize: "10px" }}
                onClick={() => setEditRole(true)}
                title="Click to change role"
              >
                {t(`agents.roles.${agent.role}`, agent.role)}
              </button>
            )}
          </div>
        </div>
        <button
          aria-label={isActive ? t("agents.deactivate", "Deactivate") : t("agents.reactivate", "Reactivate")}
          onClick={() => activeMut.mutate(isActive ? 0 : 1)}
          disabled={activeMut.isPending}
          title={isActive ? t("agents.deactivate", "Deactivate") : t("agents.reactivate", "Reactivate")}
          className={`p-1.5 rounded-lg shrink-0 transition-colors ${isActive ? "text-gray-300 hover:text-red-500 hover:bg-red-50" : "text-gray-300 hover:text-green-500 hover:bg-green-50"}`}
        >
          {isActive ? <UserX size={16} /> : <UserCheck size={16} />}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-50">
        <div className="text-center">
          <p className="text-lg font-bold">{stats?.total ?? "—"}</p>
          <p className="text-xs text-gray-400">{t("agents.total_leads")}</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-green-600">{stats?.closed ?? "—"}</p>
          <p className="text-xs text-gray-400">{t("agents.closed")}</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: "var(--accent)" }}>{stats ? `${stats.conversionRate}%` : "—"}</p>
          <p className="text-xs text-gray-400">{t("agents.conversion")}</p>
        </div>
      </div>
    </div>
  );
}
