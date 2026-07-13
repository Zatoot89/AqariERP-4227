import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Plus, Search, MapPin, Bed, Bath, Maximize, MoreVertical, Pencil, Trash2, Building2 } from "lucide-react";
import PropertyModal from "./property-modal";

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
    mutationFn: async (id: string) => {
      const response = await api.properties[":id"].$delete({ param: { id } });
      if (!response.ok) throw new Error("Property could not be archived");
    },
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
        <button className="btn-primary flex items-center gap-2 self-start" onClick={() => setShowNew(true)}><Plus size={16} />{t("properties.new_property")}</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input aria-label={t("properties.search_placeholder")} className="input ps-9" placeholder={t("properties.search_placeholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select aria-label={t("properties.all_types")} className="select w-auto" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">{t("properties.all_types")}</option>
          {["apartment","villa","office","land","commercial"].map((value) => <option key={value} value={value}>{t(`leads.property_types.${value}`)}</option>)}
        </select>
        <select aria-label={t("properties.all_statuses")} className="select w-auto" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">{t("properties.all_statuses")}</option>
          {["available","reserved","sold","rented"].map((value) => <option key={value} value={value}>{t(`properties.statuses.${value}`)}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [1,2,3,4,5,6].map((value) => <div key={value} className="card h-48 animate-pulse" />)
          : props.length === 0
            ? <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-gray-400"><Building2 size={32} className="text-gray-300" /><p className="text-sm">{search || typeFilter || statusFilter ? t("properties.no_matches", "No properties match your filters") : t("properties.empty_state", "No properties yet — add your first listing")}</p>{!search && !typeFilter && !statusFilter && <button className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={() => setShowNew(true)}><Plus size={13} /> {t("properties.new_property")}</button>}</div>
            : props.map((property: any) => (
              <div key={property.id} className="card hover:shadow-md transition-shadow overflow-hidden relative">
                <div className="absolute top-2 end-2 z-10">
                  <button aria-label={t("common.actions", "Property actions")} onClick={(event) => { event.stopPropagation(); setMenuOpenId((current) => current === property.id ? null : property.id); }} className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm"><MoreVertical size={15} /></button>
                  {menuOpenId === property.id && <div className="absolute top-full mt-1 end-0 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]"><button className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" onClick={() => { setEditing(property); setMenuOpenId(null); }}><Pencil size={13} /> {t("common.edit", "Edit")}</button><button className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-500" onClick={() => { setDeleteTarget(property); setMenuOpenId(null); }}><Trash2 size={13} /> {t("common.delete", "Archive")}</button></div>}
                </div>
                {property.imageUrls?.[0] ? <div className="h-36 overflow-hidden"><img src={property.imageUrls[0]} alt={property.title} className="w-full h-full object-cover" /></div> : <div className="h-36 flex items-center justify-center text-4xl" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, white)" }}>{property.type === "villa" ? "🏡" : property.type === "office" ? "🏢" : property.type === "land" ? "🌍" : "🏠"}</div>}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2"><p className="font-semibold text-sm leading-tight">{property.title}</p><span className={STATUS_CLASSES[property.status]}>{t(`properties.statuses.${property.status}`)}</span></div>
                  {property.titleAr && <p className="text-xs text-gray-400 mb-2" dir="rtl">{property.titleAr}</p>}
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-2"><MapPin size={11} /><span className="truncate">{property.location ?? property.city ?? "—"}</span></div>
                  <div className="flex items-center justify-between mt-3"><div className="flex gap-3 text-xs text-gray-500">{property.bedrooms != null && <span className="flex items-center gap-1"><Bed size={11} />{property.bedrooms}</span>}{property.bathrooms != null && <span className="flex items-center gap-1"><Bath size={11} />{property.bathrooms}</span>}{property.areaSqm && <span className="flex items-center gap-1"><Maximize size={11} />{property.areaSqm}m²</span>}</div>{property.price && <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{property.price.toLocaleString()} <span className="text-xs font-normal">{property.currency}</span></p>}</div>
                </div>
              </div>
            ))}
      </div>

      {totalPages > 1 && <div className="flex items-center justify-between text-sm"><span className="text-gray-400">{t("common.page_of", `Page ${page} of ${totalPages} · ${total} total`)}</span><div className="flex gap-2"><button className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>{t("common.previous", "Previous")}</button><button className="btn-outline text-xs py-1.5 px-3 disabled:opacity-40" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>{t("common.next", "Next")}</button></div></div>}

      {showNew && <PropertyModal onClose={() => setShowNew(false)} />}
      {editing && <PropertyModal property={editing} onClose={() => setEditing(null)} />}

      {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}><div className="card p-6 w-full max-w-sm space-y-4"><h3 className="font-semibold text-base">{t("properties.confirm_delete_title", "Archive this property?")}</h3><p className="text-sm text-gray-500">{t("properties.confirm_delete_body", "The property will be removed from active listings and its managed photos will be queued for cleanup.")}</p>{deleteMut.error && <p className="text-sm text-red-600">{deleteMut.error.message}</p>}<div className="flex gap-3 pt-1"><button className="btn-outline flex-1" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</button><button className="flex-1 rounded-lg bg-red-500 text-white text-sm font-medium py-2 hover:bg-red-600 transition-colors disabled:opacity-60" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>{deleteMut.isPending ? "..." : t("common.delete", "Archive")}</button></div></div></div>}
    </div>
  );
}
