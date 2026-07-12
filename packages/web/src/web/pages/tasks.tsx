import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useProfile } from "../hooks/use-profile";
import { Plus, CheckCircle, Clock, AlertCircle, X, Pencil, Trash2 } from "lucide-react";

const TASK_TYPES = ["call", "viewing", "follow_up", "document", "other"];

export default function TasksPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isAdminOrManager } = useProfile();
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [doneFilter, setDoneFilter] = useState<"" | "0" | "1">("");
  const [loadedPages, setLoadedPages] = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["tasks", doneFilter, loadedPages],
    queryFn: async () => (await api.tasks.$get({ query: { done: doneFilter, page: "1", pageSize: String(loadedPages * PAGE_SIZE) } })).json(),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await api.agents.$get()).json(),
    enabled: isAdminOrManager,
  });
  const agentOptions = ((agentsData as any)?.agents ?? []).filter((a: any) => a.active !== 0);

  const doneMut = useMutation({
    mutationFn: async (id: string) => {
      await api.tasks[":id"].done.$patch({ param: { id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await api.tasks[":id"].$delete({ param: { id } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setDeleteTarget(null); },
  });

  useEffect(() => { setLoadedPages(1); }, [doneFilter]);

  const tasks = data?.tasks ?? [];
  const total: number = (data as any)?.total ?? tasks.length;
  const hasMore = tasks.length < total;
  const now = Date.now();
  const overdue = tasks.filter((t: any) => !t.done && t.dueAt && t.dueAt < now);
  const pending = tasks.filter((t: any) => !t.done && (!t.dueAt || t.dueAt >= now));
  const done = tasks.filter((t: any) => t.done);

  const agentName = (id?: string) => agentOptions.find((a: any) => a.id === id)?.name ?? agentOptions.find((a: any) => a.id === id)?.email;

  const TaskItem = ({ task }: { task: any }) => {
    const isOverdue = !task.done && task.dueAt && task.dueAt < now;
    return (
      <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${task.done ? "opacity-60 border-gray-100" : isOverdue ? "border-red-100 bg-red-50/50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
        <button
          onClick={() => !task.done && doneMut.mutate(task.id)}
          className={`mt-0.5 shrink-0 ${task.done ? "text-green-500" : isOverdue ? "text-red-400 hover:text-green-500" : "text-gray-300 hover:text-green-500"} transition-colors`}
        >
          <CheckCircle size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.done ? "line-through text-gray-400" : ""}`}>{task.title}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="badge bg-gray-100 text-gray-600" style={{ fontSize: "10px" }}>{t(`tasks.types.${task.type}`)}</span>
            {task.dueAt && (
              <span className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-500" : "text-gray-400"}`}>
                {isOverdue ? <AlertCircle size={11} /> : <Clock size={11} />}
                {new Date(task.dueAt).toLocaleDateString()}
              </span>
            )}
            {isAdminOrManager && agentName(task.assignedTo) && (
              <span className="text-xs text-gray-400">{agentName(task.assignedTo)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditingTask(task)} className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => setDeleteTarget(task)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("tasks.title")}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t("tasks.new_task")}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["", "0", "1"] as const).map(f => (
          <button
            key={f}
            onClick={() => setDoneFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${doneFilter === f ? "text-white" : "bg-white border border-gray-200 hover:bg-gray-50"}`}
            style={doneFilter === f ? { backgroundColor: "var(--primary)" } : {}}
          >
            {f === "" ? t("tasks.all_tasks") : f === "0" ? t("tasks.pending") : t("tasks.done")}
          </button>
        ))}
      </div>

      {isLoading
        ? <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        : (
          <div className="space-y-5">
            {overdue.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">{t("tasks.overdue")} ({overdue.length})</p>
                <div className="space-y-2">{overdue.map((t: any) => <TaskItem key={t.id} task={t} />)}</div>
              </div>
            )}
            {pending.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("tasks.pending")} ({pending.length})</p>
                <div className="space-y-2">{pending.map((t: any) => <TaskItem key={t.id} task={t} />)}</div>
              </div>
            )}
            {done.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("tasks.done")} ({done.length})</p>
                <div className="space-y-2">{done.map((t: any) => <TaskItem key={t.id} task={t} />)}</div>
              </div>
            )}
            {tasks.length === 0 && (
              <div className="text-center py-16 text-gray-400">{t("common.no_data")}</div>
            )}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button className="btn-outline text-sm py-2 px-4" onClick={() => setLoadedPages(n => n + 1)} disabled={isFetching}>
                  {isFetching ? t("common.loading") : t("common.load_more", "Load more")}
                </button>
              </div>
            )}
          </div>
        )}

      {/* Create / Edit modal */}
      {(showModal || editingTask) && (
        <TaskModal
          task={editingTask}
          agentOptions={agentOptions}
          isAdminOrManager={isAdminOrManager}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-base">{t("tasks.confirm_delete_title", "Delete this task?")}</h3>
            <p className="text-sm text-gray-500">{t("tasks.confirm_delete_body", "This can't be undone.")}</p>
            <div className="flex gap-3 pt-1">
              <button className="btn-outline flex-1" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</button>
              <button
                className="flex-1 rounded-lg bg-red-500 text-white text-sm font-medium py-2 hover:bg-red-600 transition-colors disabled:opacity-60"
                onClick={() => deleteMut.mutate(deleteTarget.id)}
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

function TaskModal({ task, agentOptions, isAdminOrManager, onClose }: { task?: any; agentOptions: any[]; isAdminOrManager: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!task;
  const toLocalInput = (ms?: number) => ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const [form, setForm] = useState({
    title: task?.title ?? "",
    type: task?.type ?? "follow_up",
    dueAt: toLocalInput(task?.dueAt),
    assignedTo: task?.assignedTo ?? "",
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const json = {
        title: form.title,
        type: form.type,
        dueAt: form.dueAt ? new Date(form.dueAt).getTime() : undefined,
        ...(isAdminOrManager ? { assignedTo: form.assignedTo || undefined } : {}),
      };
      if (isEdit) await api.tasks[":id"].$patch({ param: { id: task.id }, json });
      else await api.tasks.$post({ json });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">{isEdit ? t("tasks.edit_task", "Edit Task") : t("tasks.new_task")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); saveMut.mutate(); }}>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("tasks.task_title", "Title")} *</label>
            <input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("tasks.type")}</label>
            <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {TASK_TYPES.map(tp => <option key={tp} value={tp}>{t(`tasks.types.${tp}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("tasks.due_date")}</label>
            <input className="input" type="datetime-local" value={form.dueAt} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} />
          </div>
          {isAdminOrManager && (
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("tasks.assigned_to", "Assigned To")}</label>
              <select className="select" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">{t("leads.assign_to_me", "Assign to me")}</option>
                {agentOptions.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
              {saveMut.isPending ? t("common.loading") : isEdit ? t("common.save") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
