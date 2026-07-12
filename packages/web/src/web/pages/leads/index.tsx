import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { api } from "../../lib/api";
import { Plus, Search, LayoutGrid, List, Phone, MessageCircle, Users } from "lucide-react";
import NewLeadModal from "./new-lead-modal";

const STAGES = ["new", "contacted", "viewing", "offer", "closed", "lost"];
const SOURCES = ["whatsapp", "propertyfinder", "bayut", "dubizzle", "aqarmap", "manual", "website", "referral"];

const STAGE_COLORS: Record<string, string> = {
  new: "#6B7280", contacted: "#3B82F6", viewing: "#F59E0B",
  offer: "#F97316", closed: "#10B981", lost: "#EF4444",
};

export default function LeadsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Drag state
  const draggingId = useRef<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Kanban needs every lead (to drag across columns) — list view paginates.
  const { data, isLoading } = useQuery({
    queryKey: ["leads", stageFilter, sourceFilter, search, view, page],
    queryFn: async () => {
      const res = view === "kanban"
        ? await api.leads.$get({ query: { stage: stageFilter, source: sourceFilter, q: search, all: "true" } })
        : await api.leads.$get({ query: { stage: stageFilter, source: sourceFilter, q: search, page: String(page), pageSize: String(PAGE_SIZE) } });
      return res.json();
    },
  });

  const stageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      await api.leads[":id"].stage.$patch({ param: { id }, json: { stage } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  useEffect(() => { setPage(1); }, [stageFilter, sourceFilter, search, view]);

  const leads = data?.leads ?? [];
  const total: number = (data as any)?.total ?? leads.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const leadsByStage = STAGES.reduce((acc, s) => {
    acc[s] = leads.filter((l: any) => l.stage === s);
    return acc;
  }, {} as Record<string, any[]>);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    draggingId.current = leadId;
    e.dataTransfer.effectAllowed = "move";
    // Delay to allow ghost image render
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = "0.4";
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    draggingId.current = null;
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = draggingId.current;
    if (!id) return;
    const lead = leads.find((l: any) => l.id === id);
    if (lead && lead.stage !== stage) {
      stageMutation.mutate({ id, stage });
    }
    setDragOverStage(null);
    draggingId.current = null;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
        <button className="btn-primary flex items-center gap-2 self-start" onClick={() => setShowNew(true)}>
          <Plus size={16} />
          {t("leads.new_lead")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            aria-label={t("leads.search_placeholder")}
            className="input ps-9"
            placeholder={t("leads.search_placeholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select aria-label={t("leads.all_stages")} className="select w-auto" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">{t("leads.all_stages")}</option>
          {STAGES.map(s => <option key={s} value={s}>{t(`leads.stages.${s}`)}</option>)}
        </select>
        <select aria-label={t("leads.all_sources")} className="select w-auto" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="">{t("leads.all_sources")}</option>
          {SOURCES.map(s => <option key={s} value={s}>{t(`leads.sources.${s}`)}</option>)}
        </select>
        <div className="flex gap-1 p-1 rounded-lg border border-gray-200 bg-white">
          <button aria-label={t("leads.kanban_view", "Kanban view")} onClick={() => setView("kanban")} className={`p-1.5 rounded ${view === "kanban" ? "bg-gray-100" : "hover:bg-gray-50"}`}><LayoutGrid size={16} /></button>
          <button aria-label={t("leads.list_view", "List view")} onClick={() => setView("list")} className={`p-1.5 rounded ${view === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}><List size={16} /></button>
        </div>
      </div>

      {/* Kanban view */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: "fit-content" }}>
            {STAGES.map(stage => (
              <div
                key={stage}
                className="kanban-col"
                onDragOver={e => handleDragOver(e, stage)}
                onDrop={e => handleDrop(e, stage)}
                onDragLeave={() => setDragOverStage(null)}
                style={{
                  outline: dragOverStage === stage ? `2px dashed ${STAGE_COLORS[stage]}` : "none",
                  outlineOffset: "2px",
                  borderRadius: "12px",
                  transition: "outline 0.15s",
                }}
              >
                <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                    <span className="text-sm font-semibold">{t(`leads.stages.${stage}`)}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-400">{leadsByStage[stage]?.length ?? 0}</span>
                </div>
                <div className="space-y-2" style={{ minHeight: "80px" }}>
                  {isLoading
                    ? [1,2].map(i => <div key={i} className="kanban-card h-20 animate-pulse bg-gray-100" />)
                    : leadsByStage[stage]?.map((lead: any) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        style={{ cursor: "grab" }}
                      >
                        <Link
                          to={`/leads/${lead.id}`}
                          onClick={e => {
                            if (draggingId.current) e.preventDefault();
                          }}
                        >
                          <div className="kanban-card">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{lead.name}</p>
                                {lead.nameAr && (
                                  <p className="text-xs text-gray-400 truncate" dir="rtl">{lead.nameAr}</p>
                                )}
                              </div>
                              <span className={`source-${lead.source} shrink-0`} style={{ fontSize: "10px" }}>
                                {t(`leads.sources.${lead.source}`)}
                              </span>
                            </div>
                            {lead.preferredArea && (
                              <p className="text-xs mt-1.5 text-gray-500 truncate">📍 {lead.preferredArea}</p>
                            )}
                            {(lead.budgetMin || lead.budgetMax) && (
                              <p className="text-xs mt-0.5 text-gray-500">
                                💰 {lead.budgetMin?.toLocaleString() ?? "?"} – {lead.budgetMax?.toLocaleString() ?? "?"} {lead.currency}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2.5">
                              {lead.phone && (
                                <a
                                  href={`tel:${lead.phone}`}
                                  aria-label={`${t("leads.call", "Call")} ${lead.name}`}
                                  onClick={e => e.stopPropagation()}
                                  className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
                                >
                                  <Phone size={12} />
                                </a>
                              )}
                              {lead.whatsappId && (
                                <a
                                  href={`https://wa.me/${lead.whatsappId}`}
                                  aria-label={`${t("leads.whatsapp", "WhatsApp")} ${lead.name}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="p-1.5 rounded-md bg-green-50 hover:bg-green-100 transition-colors"
                                >
                                  <MessageCircle size={12} className="text-green-600" />
                                </a>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  {/* Drop hint when dragging over empty column */}
                  {dragOverStage === stage && leadsByStage[stage]?.length === 0 && (
                    <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed text-xs text-gray-400" style={{ borderColor: STAGE_COLORS[stage] }}>
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.name")}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.phone")}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.source")}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.stage")}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.budget")}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">{t("leads.preferred_area")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1,2,3,4,5,6].map(j => <td aria-label={t("common.loading", "Loading")} key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                  : leads.length === 0
                    ? <tr><td aria-label={t("leads.empty_state", "No leads")} colSpan={6} className="py-16">
                        <div className="flex flex-col items-center gap-3 text-gray-400">
                          <Users size={32} className="text-gray-300" />
                          <p className="text-sm">{search || stageFilter || sourceFilter ? t("leads.no_matches", "No leads match your filters") : t("leads.empty_state", "No leads yet — add your first one to get started")}</p>
                          {!search && !stageFilter && !sourceFilter && (
                            <button className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={() => setShowNew(true)}>
                              <Plus size={13} /> {t("leads.new_lead")}
                            </button>
                          )}
                        </div>
                      </td></tr>
                    : leads.map((lead: any) => (
                      <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                        <td aria-label={lead.name} className="px-4 py-3">
                          <Link to={`/leads/${lead.id}`} aria-label={lead.name}>
                            <div>
                              <p className="font-medium">{lead.name}</p>
                              {lead.nameAr && <p className="text-xs text-gray-400" dir="rtl">{lead.nameAr}</p>}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{lead.phone ?? "—"}</td>
                        <td className="px-4 py-3"><span className={`source-${lead.source}`}>{t(`leads.sources.${lead.source}`)}</span></td>
                        <td className="px-4 py-3"><span className={`stage-${lead.stage}`}>{t(`leads.stages.${lead.stage}`)}</span></td>
                        <td className="px-4 py-3 text-gray-600">
                          {lead.budgetMax ? `${lead.budgetMax.toLocaleString()} ${lead.currency}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{lead.preferredArea ?? "—"}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-400">{t("common.page_of", `Page ${page} of ${totalPages} · ${total} total`)}</span>
              <div className="flex gap-2">
                <button
                  className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t("common.previous", "Previous")}
                </button>
                <button
                  className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  {t("common.next", "Next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showNew && <NewLeadModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
