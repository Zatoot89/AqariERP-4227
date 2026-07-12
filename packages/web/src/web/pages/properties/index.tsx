import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Plus, Search, MapPin, Bed, Bath, Maximize, MoreVertical, Pencil, Trash2, Building2 } from "lucide-react";
import NewPropertyModal from "./new-property-modal";

const STATUS_CLASSES: Record<string, string> = {
  available: "badge bg-green-100 text-green-700",
  reserved: "badge bg-yellow-100 text-yellow-700",
  sold: "badge bg-gray-100 text-gray-600",
  rented: "badge bg-blue-100 text-blue-700",
};

export default function PropertiesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", typeFilter, statusFilter, search, page],
    queryFn: async () => (await api.properties.$get({ query: { type: typeFilter, status: statusFilter, q: search, page: String(page), pageSize: String(PAGE_SIZE) } })).json(),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await api.properties[":id"].$delete({ param: { id } }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      setDeleteTarget(null);
    },
  });

  const props = data?.properties ?? [];
  const total: number = (data as any)?.total ?? props.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("properties.title")}</h1>
        <button className="btn-primary flex items-center gap-2 self-start" onClick={() => setShowNew(true)}>
          <Plus size={16} />
          {t("properties.new_property")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input aria-label={t("properties.search_placeholder")} className="input ps-9" placeholder={t("properties.search_placeholder")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select aria-label={t("properties.all_types")} className="select w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">{t("properties.all_types")}</option>
          {["apartment","villa","office","land","commercial"].map(s => <option key={s} value={s}>{t(`leads.property_types.${s}`)}</option>)}
        </select>
        <select aria-label={t("properties.all_statuses")} className="select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{t("properties.all_statuses")}</option>
          {["available","reserved","sold","rented"].map(s => <option key={s} value={s}>{t(`properties.statuses.${s}`)}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [1,2,3,4,5,6].map(i => <div key={i} className="card h-48 animate-pulse" />)
          : props.length === 0
            ? <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-gray-400">
                <Building2 size={32} className="text-gray-300" />
                <p className="text-sm">{search || typeFilter || statusFilter ? t("properties.no_matches", "No properties match your filters") : t("properties.empty_state", "No properties yet — add your first listing")}</p>
                {!search && !typeFilter && !statusFilter && (
                  <button className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={() => setShowNew(true)}>
                    <Plus size={13} /> {t("properties.new_property")}
                  </button>
                )}
              </div>
            : props.map((prop: any) => (
              <div key={prop.id} className="card hover:shadow-md transition-shadow overflow-hidden relative">
                {/* Kebab menu */}
                <div className="absolute top-2 end-2 z-10">
                  <button
                    aria-label={t("common.actions", "Property actions")}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(m => m === prop.id ? null : prop.id); }}
                    className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm"
                  >
                    <MoreVertical size={15} />
                  </button>
                  {menuOpenId === prop.id && (
                    <div className="absolute top-full mt-1 end-0 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]">
                      <button
                        className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => { setEditing(prop); setMenuOpenId(null); }}
                      >
                        <Pencil size={13} /> {t("common.edit", "Edit")}
                      </button>
                      <button
                        className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-500"
                        onClick={() => { setDeleteTarget(prop); setMenuOpenId(null); }}
                      >
                        <Trash2 size={13} /> {t("common.delete", "Delete")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Image or placeholder */}
                {prop.imageUrls?.[0] ? (
                  <div className="h-36 overflow-hidden">
                    <img src={prop.imageUrls[0]} alt={prop.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-36 flex items-center justify-center text-4xl" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, white)" }}>
                    {prop.type === "villa" ? "🏡" : prop.type === "office" ? "🏢" : prop.type === "land" ? "🌍" : "🏠"}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-sm leading-tight">{prop.title}</p>
                    <span className={STATUS_CLASSES[prop.status]}>{t(`properties.statuses.${prop.status}`)}</span>
                  </div>
                  {prop.titleAr && <p className="text-xs text-gray-400 mb-2" dir="rtl">{prop.titleAr}</p>}
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                    <MapPin size={11} />
                    <span className="truncate">{prop.location ?? prop.city ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-3 text-xs text-gray-500">
                      {prop.bedrooms != null && (
                        <span className="flex items-center gap-1"><Bed size={11} />{prop.bedrooms}</span>
                      )}
                      {prop.bathrooms != null && (
                        <span className="flex items-center gap-1"><Bath size={11} />{prop.bathrooms}</span>
                      )}
                      {prop.areaSqm && (
                        <span className="flex items-center gap-1"><Maximize size={11} />{prop.areaSqm}m²</span>
                      )}
                    </div>
                    {prop.price && (
                      <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                        {prop.price.toLocaleString()} <span className="text-xs font-normal">{prop.currency}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">{t("common.page_of", `Page ${page} of ${totalPages} · ${total} total`)}</span>
          <div className="flex gap-2">
            <button className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              {t("common.previous", "Previous")}
            </button>
            <button className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              {t("common.next", "Next")}
            </button>
          </div>
        </div>
      )}

      {showNew && <NewPropertyModal onClose={() => setShowNew(false)} />}
      {editing && <NewPropertyModal property={editing} onClose={() => setEditing(null)} />}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-base">{t("properties.confirm_delete_title", "Delete this property?")}</h3>
            <p className="text-sm text-gray-500">{t("properties.confirm_delete_body", "This permanently removes the listing and its photos. This can't be undone.")}</p>
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
