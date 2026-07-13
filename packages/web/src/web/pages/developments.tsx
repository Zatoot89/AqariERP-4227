import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, FolderTree, Plus, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

type DevelopmentType = "compound" | "project" | "building";
type Development = {
  id: string;
  agencyId: string;
  parentId: string | null;
  developmentType: DevelopmentType;
  code: string | null;
  name: string;
  nameAr: string | null;
  city: string | null;
  country: string | null;
  floorsCount: number | null;
};

type DevelopmentForm = {
  developmentType: DevelopmentType;
  parentId: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  country: string;
  floorsCount: string;
};

const EMPTY_FORM: DevelopmentForm = {
  developmentType: "building",
  parentId: "",
  code: "",
  name: "",
  nameAr: "",
  city: "",
  country: "AE",
  floorsCount: "",
};

export default function DevelopmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<DevelopmentType | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<DevelopmentForm>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ["developments", search, type],
    queryFn: async () => {
      const response = await api.developments.$get({
        query: {
          q: search || undefined,
          developmentType: type || undefined,
        },
      });
      return response.json() as Promise<{ developments: Development[] }>;
    },
  });

  const create = useMutation({
    mutationFn: async (value: DevelopmentForm) => {
      const response = await api.developments.$post({
        json: {
          developmentType: value.developmentType,
          parentId: value.parentId || null,
          code: value.code || null,
          name: value.name,
          nameAr: value.nameAr || null,
          city: value.city || null,
          country: value.country || null,
          floorsCount: value.floorsCount ? Number(value.floorsCount) : null,
        },
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Could not create development");
      }
      return response.json() as Promise<{ development: Development }>;
    },
    onSuccess: () => {
      setShowCreate(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["developments"] });
    },
  });

  const rows = query.data?.developments ?? [];
  const byParent = new Map<string | null, Development[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.parentId) ?? [];
    siblings.push(row);
    byParent.set(row.parentId, siblings);
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    return (byParent.get(parentId) ?? []).map((development) => (
      <div key={development.id}>
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3" style={{ paddingInlineStart: `${16 + depth * 24}px` }}>
          {depth > 0 && <ChevronRight size={14} className="text-gray-300" />}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {development.developmentType === "building" ? <Building2 size={17} /> : <FolderTree size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{development.name}</p>
              <span className="badge bg-gray-100 text-gray-600">{development.developmentType}</span>
              {development.code && <span className="text-xs font-mono text-gray-400">{development.code}</span>}
            </div>
            <p className="truncate text-xs text-gray-400">{development.nameAr || [development.city, development.country].filter(Boolean).join(", ") || "—"}</p>
          </div>
          {development.floorsCount != null && <span className="text-xs text-gray-400">{development.floorsCount} {t("developments.floors", "floors")}</span>}
        </div>
        {renderTree(development.id, depth + 1)}
      </div>
    ));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("developments.title", "Developments")}</h1>
          <p className="text-sm text-gray-500">{t("developments.subtitle", "Organize compounds, projects, and buildings in a tenant-safe hierarchy.")}</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-2 self-start" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> {t("developments.new", "New development")}
        </button>
      </header>

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="relative">
            <span className="sr-only">{t("common.search", "Search")}</span>
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input ps-9" placeholder={t("developments.search", "Search name or code")} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select className="select" aria-label={t("developments.type", "Development type")} value={type} onChange={(event) => setType(event.target.value as DevelopmentType | "")}>
            <option value="">{t("developments.all", "All development types")}</option>
            <option value="compound">{t("developments.compound", "Compound")}</option>
            <option value="project">{t("developments.project", "Project")}</option>
            <option value="building">{t("developments.building", "Building")}</option>
          </select>
        </div>
      </section>

      <section className="card overflow-hidden">
        {query.isLoading ? (
          <div className="p-10 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-14 text-gray-400">
            <FolderTree size={32} />
            <p className="text-sm">{t("developments.empty", "No developments have been created yet.")}</p>
          </div>
        ) : (
          renderTree(null)
        )}
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h2 className="text-lg font-semibold">{t("developments.new", "New development")}</h2>
              <button type="button" className="rounded-lg p-2 hover:bg-gray-100" aria-label={t("common.close", "Close")} onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); create.mutate(form); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span>{t("developments.type", "Type")} *</span><select className="select" value={form.developmentType} onChange={(event) => setForm((value) => ({ ...value, developmentType: event.target.value as DevelopmentType }))}><option value="compound">Compound</option><option value="project">Project</option><option value="building">Building</option></select></label>
                <label className="space-y-1 text-sm"><span>{t("developments.parent", "Parent")}</span><select className="select" value={form.parentId} onChange={(event) => setForm((value) => ({ ...value, parentId: event.target.value }))}><option value="">{t("developments.no_parent", "No parent")}</option>{rows.filter((item) => item.developmentType !== "building").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span>{t("developments.name", "Name")} *</span><input className="input" required value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} /></label>
                <label className="space-y-1 text-sm"><span>{t("developments.code", "Code")}</span><input className="input" value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value }))} /></label>
              </div>
              <label className="block space-y-1 text-sm"><span>{t("developments.name_ar", "Arabic name")}</span><input className="input" dir="rtl" value={form.nameAr} onChange={(event) => setForm((value) => ({ ...value, nameAr: event.target.value }))} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm sm:col-span-2"><span>{t("developments.city", "City")}</span><input className="input" value={form.city} onChange={(event) => setForm((value) => ({ ...value, city: event.target.value }))} /></label>
                <label className="space-y-1 text-sm"><span>{t("developments.country", "Country")}</span><input className="input" maxLength={2} value={form.country} onChange={(event) => setForm((value) => ({ ...value, country: event.target.value.toUpperCase() }))} /></label>
              </div>
              {form.developmentType === "building" && <label className="block space-y-1 text-sm"><span>{t("developments.floors", "Floors")}</span><input className="input" type="number" min="0" value={form.floorsCount} onChange={(event) => setForm((value) => ({ ...value, floorsCount: event.target.value }))} /></label>}
              {create.error && <p className="text-sm text-red-500">{create.error.message}</p>}
              <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>{t("common.cancel", "Cancel")}</button><button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
