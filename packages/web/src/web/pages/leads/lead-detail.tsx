import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import {
  ArrowLeft, Phone, Mail, MessageCircle, MapPin,
  ChevronDown, Send, DollarSign, Plus, CheckCircle, Clock, X, Building2,
  Pencil, Trash2
} from "lucide-react";
import NewLeadModal from "./new-lead-modal";

const STAGES = ["new", "contacted", "viewing", "offer", "closed", "lost"];
const STAGE_COLORS: Record<string, string> = {
  new: "#6B7280", contacted: "#3B82F6", viewing: "#F59E0B",
  offer: "#F97316", closed: "#10B981", lost: "#EF4444",
};
const TASK_TYPES = ["call", "viewing", "follow_up", "document", "other"];

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [note, setNote] = useState("");
  const [stageDropdown, setStageDropdown] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", type: "call", dueAt: "" });
  const [showLinkProp, setShowLinkProp] = useState(false);
  const [propSearch, setPropSearch] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMut = useMutation({
    mutationFn: async () => {
      await api.leads[":id"].$delete({ param: { id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setLocation("/leads");
    },
  });

  const { data: leadData, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => (await api.leads[":id"].$get({ param: { id } })).json(),
  });

  const { data: actData } = useQuery({
    queryKey: ["lead-activities", id],
    queryFn: async () => (await api.leads[":id"].activities.$get({ param: { id } })).json(),
  });

  const { data: tasksData } = useQuery({
    queryKey: ["lead-tasks", id],
    queryFn: async () => (await api.tasks.$get({ query: { leadId: id } })).json(),
  });

  const stageMut = useMutation({
    mutationFn: async (stage: string) => {
      await api.leads[":id"].stage.$patch({ param: { id }, json: { stage } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      setStageDropdown(false);
    },
  });

  const noteMut = useMutation({
    mutationFn: async () => {
      await api.leads[":id"].notes.$post({ param: { id }, json: { body: note } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead-activities", id] }); setNote(""); },
  });

  const taskMut = useMutation({
    mutationFn: async () => {
      await api.tasks.$post({ json: {
        title: taskForm.title,
        type: taskForm.type,
        leadId: id,
        dueAt: taskForm.dueAt ? new Date(taskForm.dueAt).getTime() : undefined,
      }});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-tasks", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setShowTaskModal(false);
      setTaskForm({ title: "", type: "call", dueAt: "" });
    },
  });

  const doneMut = useMutation({
    mutationFn: async (taskId: string) => {
      await api.tasks[":id"].done.$patch({ param: { id: taskId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-tasks", id] }),
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (taskId: string) => {
      await api.tasks[":id"].$delete({ param: { id: taskId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-tasks", id] }),
  });

  // Linked properties
  const { data: linkedPropsData } = useQuery({
    queryKey: ["lead-properties", id],
    queryFn: async () => (await api.leads[":id"].properties.$get({ param: { id } })).json(),
  });

  const { data: allPropsData } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => (await api.properties.$get({ query: { all: "true" } })).json(),
    enabled: showLinkProp,
  });

  const linkPropMut = useMutation({
    mutationFn: async (propertyId: string) => {
      await api.leads[":id"].properties.$post({ param: { id }, json: { propertyId, status: "shown" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-properties", id] });
      setShowLinkProp(false);
      setPropSearch("");
    },
  });

  const lead = leadData?.lead;
  const activities = actData?.activities ?? [];
  const tasks = tasksData?.tasks ?? [];
  const now = Date.now();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="card h-48 animate-pulse" />
      </div>
    );
  }

  if (!lead) return <div className="text-center py-20 text-gray-400">Lead not found</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link to="/leads">
          <div className="flex items-center gap-2 text-sm font-medium cursor-pointer hover:opacity-70 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={16} className="rtl:rotate-180" />
            {t("common.back")}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <button
            className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
            onClick={() => setShowEdit(true)}
          >
            <Pencil size={13} />
            {t("common.edit", "Edit")}
          </button>
          <button
            className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={13} />
            {t("common.delete", "Delete")}
          </button>
        </div>
      </div>

      {/* Lead header */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: "var(--primary)" }}>
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{lead.name}</h1>
              {lead.nameAr && <p className="text-sm text-gray-400" dir="rtl">{lead.nameAr}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`source-${lead.source}`}>{t(`leads.sources.${lead.source}`)}</span>
                {lead.propertyType && (
                  <span className="badge bg-gray-100 text-gray-600">{t(`leads.property_types.${lead.propertyType}`)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Stage switcher */}
          <div className="relative">
            <button
              onClick={() => setStageDropdown(d => !d)}
              className={`stage-${lead.stage} flex items-center gap-1.5 px-3 py-1.5 cursor-pointer`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[lead.stage] }} />
              {t(`leads.stages.${lead.stage}`)}
              <ChevronDown size={14} />
            </button>
            {stageDropdown && (
              <div className="absolute top-full mt-1 end-0 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10 min-w-[160px]">
                {STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => stageMut.mutate(s)}
                    className="w-full text-start px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[s] }} />
                    {t(`leads.stages.${s}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contact + info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-50">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm hover:opacity-70">
              <Phone size={15} style={{ color: "var(--primary)" }} />
              <span className="truncate">{lead.phone}</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm hover:opacity-70">
              <Mail size={15} style={{ color: "var(--primary)" }} />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.whatsappId && (
            <a href={`https://wa.me/${lead.whatsappId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-green-600 hover:opacity-70">
              <MessageCircle size={15} />
              <span>{t("leads.whatsapp_contact")}</span>
            </a>
          )}
          {lead.preferredArea && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={15} style={{ color: "var(--accent)" }} />
              <span className="truncate">{lead.preferredArea}</span>
            </div>
          )}
          {(lead.budgetMin || lead.budgetMax) && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign size={15} className="text-green-500" />
              <span>{lead.budgetMin?.toLocaleString() ?? "?"} – {lead.budgetMax?.toLocaleString() ?? "?"} {lead.currency}</span>
            </div>
          )}
        </div>

        {lead.notes && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
            <p className="text-sm text-amber-800">{lead.notes}</p>
          </div>
        )}
      </div>

      {lead.whatsappId && <WhatsappPanel leadId={id} />}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Activity log */}
        <div className="card p-5">
          <h2 className="font-semibold text-base mb-4">{t("leads.activity_log")}</h2>

          {/* Add note */}
          <div className="flex gap-2 mb-4">
            <textarea
              aria-label={t("leads.note_placeholder")}
              className="input flex-1 resize-none min-h-[60px] text-sm"
              placeholder={t("leads.note_placeholder")}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button
              aria-label={t("leads.add_note", "Add note")}
              className="btn-primary px-3 self-end"
              onClick={() => noteMut.mutate()}
              disabled={!note.trim() || noteMut.isPending}
            >
              <Send size={15} />
            </button>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activities.length === 0
              ? <p className="text-sm text-center py-6 text-gray-400">{t("common.no_data")}</p>
              : activities.map((act: any) => (
                <div key={act.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    {act.type === "note" ? "📝" : act.type === "stage_change" ? "🔄" : act.type === "whatsapp_msg" ? "💬" : "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{act.body}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(act.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Tasks for this lead */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base">{t("tasks.title")}</h2>
              <button
                className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
                onClick={() => setShowTaskModal(true)}
              >
                <Plus size={13} />
                {t("tasks.new_task")}
              </button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-center py-4 text-gray-400">{t("common.no_data")}</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task: any) => {
                  const isOverdue = !task.done && task.dueAt && task.dueAt < now;
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-sm ${
                        task.done ? "opacity-60 border-gray-100" : isOverdue ? "border-red-100 bg-red-50/50" : "border-gray-100"
                      }`}
                    >
                      <button
                        onClick={() => !task.done && doneMut.mutate(task.id)}
                        className={`mt-0.5 shrink-0 transition-colors ${task.done ? "text-green-500" : "text-gray-300 hover:text-green-500"}`}
                      >
                        <CheckCircle size={16} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${task.done ? "line-through" : ""}`}>{task.title}</p>
                        {task.dueAt && (
                          <div className={`flex items-center gap-1 mt-0.5 text-xs ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
                            <Clock size={11} />
                            {new Date(task.dueAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteTaskMut.mutate(task.id)}
                        className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title={t("common.delete", "Delete")}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Linked properties */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base">{t("leads.linked_properties")}</h2>
              <button
                className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
                onClick={() => setShowLinkProp(p => !p)}
              >
                <Plus size={13} />
                {t("leads.link_property")}
              </button>
            </div>

            {/* Property search dropdown */}
            {showLinkProp && (
              <div className="mb-3">
                <input
                  aria-label={t("properties.search_placeholder", "Search properties")}
                  className="input text-sm mb-2"
                  placeholder="Search properties..."
                  value={propSearch}
                  onChange={e => setPropSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                  {(allPropsData as any)?.properties
                    ?.filter((p: any) =>
                      !propSearch || p.title?.toLowerCase().includes(propSearch.toLowerCase()) || p.location?.toLowerCase().includes(propSearch.toLowerCase())
                    )
                    .map((p: any) => (
                      <button
                        key={p.id}
                        className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => linkPropMut.mutate(p.id)}
                        disabled={linkPropMut.isPending}
                      >
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="text-xs text-gray-400 truncate">{p.location} · {p.price?.toLocaleString()} {p.currency}</p>
                        </div>
                      </button>
                    )) ?? <div className="px-3 py-4 text-sm text-gray-400 text-center">Loading...</div>
                  }
                </div>
              </div>
            )}

            {/* Linked list */}
            {((linkedPropsData as any)?.properties ?? []).length === 0 && !showLinkProp ? (
              <p className="text-sm text-gray-400 text-center py-4">{t("common.no_data")}</p>
            ) : (
              <div className="space-y-2">
                {((linkedPropsData as any)?.properties ?? []).map((prop: any) => (
                  <div key={prop.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-100 text-sm">
                    <Building2 size={15} style={{ color: "var(--primary)" }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{prop.title}</p>
                      <p className="text-xs text-gray-400 truncate">{prop.location} · {prop.price?.toLocaleString()} {prop.currency}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">{t("tasks.new_task")}</h3>
              <button aria-label={t("common.close", "Close")} onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="lead-task-title" className="label">{t("tasks.task_title")}</label>
                <input
                  id="lead-task-title"
                  className="input"
                  placeholder={t("tasks.title_placeholder")}
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="lead-task-type" className="label">{t("tasks.type")}</label>
                <select
                  id="lead-task-type"
                  className="select"
                  value={taskForm.type}
                  onChange={e => setTaskForm(f => ({ ...f, type: e.target.value }))}
                >
                  {TASK_TYPES.map(type => (
                    <option key={type} value={type}>{t(`tasks.types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="lead-task-due" className="label">{t("tasks.due_date")}</label>
                <input
                  id="lead-task-due"
                  type="datetime-local"
                  className="input"
                  value={taskForm.dueAt}
                  onChange={e => setTaskForm(f => ({ ...f, dueAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button className="btn-outline flex-1" onClick={() => setShowTaskModal(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => taskMut.mutate()}
                disabled={!taskForm.title.trim() || taskMut.isPending}
              >
                {taskMut.isPending ? "..." : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {showEdit && <NewLeadModal lead={lead} onClose={() => setShowEdit(false)} />}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-base">{t("leads.confirm_delete_title", "Delete this lead?")}</h3>
            <p className="text-sm text-gray-500">{t("leads.confirm_delete_body", "This permanently removes the lead and its activity history. This can't be undone.")}</p>
            <div className="flex gap-3 pt-1">
              <button className="btn-outline flex-1" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</button>
              <button
                className="flex-1 rounded-lg bg-red-500 text-white text-sm font-medium py-2 hover:bg-red-600 transition-colors disabled:opacity-60"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? "..." : t("common.delete", "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsappPanel({ leadId }: { leadId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages", leadId],
    queryFn: async () => (await api.whatsapp.leads[":id"].messages.$get({ param: { id: leadId } })).json(),
    refetchInterval: 15000,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await api.whatsapp.leads[":id"].send.$post({ param: { id: leadId }, json: { body: text } });
      const result = await res.json();
      if (!res.ok) throw new Error((result as any)?.error ?? "Failed to send");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-messages", leadId] });
      setText("");
    },
  });

  const messages = (data as any)?.messages ?? [];

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={16} className="text-green-600" />
        <h2 className="font-semibold text-base">{t("leads.whatsapp_chat", "WhatsApp")}</h2>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
        {isLoading ? (
          <p className="text-sm text-center py-4 text-gray-400">{t("common.loading")}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-center py-4 text-gray-400">{t("leads.no_wa_messages", "No messages yet")}</p>
        ) : (
          messages.map((m: any) => (
            <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  m.direction === "outbound" ? "bg-green-500 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                <p>{m.body}</p>
                <p className={`text-[10px] mt-0.5 ${m.direction === "outbound" ? "text-green-100" : "text-gray-400"}`}>
                  {new Date(m.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {sendMut.isError && (
        <p className="text-xs text-red-500 mb-2">{(sendMut.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <input
          aria-label={t("leads.wa_placeholder", "WhatsApp message")}
          className="input flex-1"
          placeholder={t("leads.wa_placeholder", "Type a WhatsApp message…")}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && text.trim()) sendMut.mutate(); }}
        />
        <button
          aria-label={t("leads.send_message", "Send message")}
          className="btn-primary px-3"
          onClick={() => sendMut.mutate()}
          disabled={!text.trim() || sendMut.isPending}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
