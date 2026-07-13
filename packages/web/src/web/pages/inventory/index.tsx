import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Download,
  Home,
  MapPin,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { downloadCsv, recordsFromCsv } from "../../lib/csv";
import { AssetRelations } from "./asset-relations";
import { PropertyForm } from "./property-form";
import { UnitForm } from "./unit-form";

type InventoryStatus =
  | "available"
  | "reserved"
  | "sold"
  | "rented"
  | "occupied"
  | "off_market";

type InventoryProperty = {
  id: string;
  developmentId: string | null;
  assetCode: string | null;
  title: string;
  titleAr: string | null;
  propertyType: string;
  purpose: "sale" | "rent" | "both";
  status: InventoryStatus;
  city: string | null;
  country: string | null;
  builtAreaSqm: number | null;
  landAreaSqm: number | null;
  saleAskingPrice: number | null;
  annualRentAskingPrice: number | null;
  currency: string;
};

type InventoryUnit = {
  id: string;
  unitNumber: string;
  floor: string | null;
  unitType: string;
  status: InventoryStatus;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  saleAskingPrice: number | null;
  annualRentAskingPrice: number | null;
  currency: string;
};

type Ownership = {
  id: string;
  ownerContactId: string;
  ownershipPercentage: number;
  effectiveFrom: number;
  effectiveTo: number | null;
};

type Listing = {
  id: string;
  principalContactId: string;
  agreementType: "sale" | "rent" | "both";
  status: "draft" | "active" | "expired" | "terminated";
  startsAt: number;
  endsAt: number | null;
};

type PropertyDetail = InventoryProperty & {
  units: InventoryUnit[];
  ownership: Ownership[];
  listings: Listing[];
  availabilityHistory: Array<{
    id: string;
    status: InventoryStatus;
    effectiveFrom: number;
    effectiveTo: number | null;
  }>;
};

type DevelopmentOption = { id: string; name: string };
type ContactOption = { id: string; displayName: string };

const STATUS_CLASSES: Record<InventoryStatus, string> = {
  available: "bg-green-100 text-green-700",
  reserved: "bg-yellow-100 text-yellow-700",
  sold: "bg-gray-100 text-gray-600",
  rented: "bg-blue-100 text-blue-700",
  occupied: "bg-purple-100 text-purple-700",
  off_market: "bg-red-100 text-red-700",
};

export default function InventoryPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryStatus | "">("");
  const [purpose, setPurpose] = useState<"sale" | "rent" | "both" | "">("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  const inventoryQuery = useQuery({
    queryKey: ["inventory", search, status, purpose, page],
    queryFn: async () => {
      const response = await api.inventory.properties.$get({
        query: {
          q: search || undefined,
          status: status || undefined,
          purpose: purpose || undefined,
          page: String(page),
          pageSize: "24",
        },
      });
      return response.json() as Promise<{
        properties: InventoryProperty[];
        total: number;
        page: number;
        pageSize: number;
      }>;
    },
  });

  const detailQuery = useQuery({
    queryKey: ["inventory-property", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const response = await api.inventory.properties[":id"].$get({ param: { id: selectedId! } });
      return response.json() as Promise<{ property: PropertyDetail }>;
    },
  });

  const developmentsQuery = useQuery({
    queryKey: ["developments-options"],
    queryFn: async () => {
      const response = await api.developments.$get({ query: {} });
      return response.json() as Promise<{ developments: DevelopmentOption[] }>;
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts-options"],
    queryFn: async () => {
      const response = await api.contacts.$get({ query: { page: "1", pageSize: "200" } });
      return response.json() as Promise<{ contacts: ContactOption[] }>;
    },
  });

  const properties = inventoryQuery.data?.properties ?? [];
  const total = inventoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 24));
  const selected = detailQuery.data?.property;

  function exportInventory() {
    downloadCsv(
      `aqari-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "id",
        "assetCode",
        "title",
        "titleAr",
        "propertyType",
        "purpose",
        "status",
        "city",
        "country",
        "builtAreaSqm",
        "landAreaSqm",
        "saleAskingPrice",
        "annualRentAskingPrice",
        "currency",
      ],
      properties.map((property) => [
        property.id,
        property.assetCode,
        property.title,
        property.titleAr,
        property.propertyType,
        property.purpose,
        property.status,
        property.city,
        property.country,
        property.builtAreaSqm,
        property.landAreaSqm,
        property.saleAskingPrice,
        property.annualRentAskingPrice,
        property.currency,
      ]),
    );
  }

  async function importInventory(file: File) {
    setImportStatus("Reading file…");
    try {
      const records = recordsFromCsv(await file.text()).slice(0, 200);
      let created = 0;
      let skipped = 0;
      for (const record of records) {
        if (!record.title) {
          skipped += 1;
          continue;
        }
        const response = await api.inventory.properties.$post({
          json: {
            assetCode: record.assetCode || null,
            title: record.title,
            titleAr: record.titleAr || null,
            propertyType: ([
              "apartment",
              "villa",
              "office",
              "land",
              "commercial",
              "building",
              "warehouse",
              "retail",
              "other",
            ].includes(record.propertyType) ? record.propertyType : "other") as
              | "apartment"
              | "villa"
              | "office"
              | "land"
              | "commercial"
              | "building"
              | "warehouse"
              | "retail"
              | "other",
            purpose: (["sale", "rent", "both"].includes(record.purpose)
              ? record.purpose
              : "both") as "sale" | "rent" | "both",
            status: (["available", "reserved", "sold", "rented", "occupied", "off_market"].includes(record.status)
              ? record.status
              : "available") as InventoryStatus,
            city: record.city || null,
            country: record.country || null,
            builtAreaSqm: record.builtAreaSqm ? Number(record.builtAreaSqm) : null,
            landAreaSqm: record.landAreaSqm ? Number(record.landAreaSqm) : null,
            saleAskingPrice: record.saleAskingPrice ? Number(record.saleAskingPrice) : null,
            annualRentAskingPrice: record.annualRentAskingPrice
              ? Number(record.annualRentAskingPrice)
              : null,
            currency: record.currency || "USD",
          },
        });
        if (response.ok) created += 1;
        else skipped += 1;
      }
      setImportStatus(`Imported ${created}; skipped ${skipped}.`);
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } catch {
      setImportStatus("Import failed. Verify the inventory CSV columns and numeric values.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("inventory.title_page", "Inventory")}</h1>
          <p className="text-sm text-gray-500">{t("inventory.subtitle", "Properties, units, owners, availability, and listing authority in one workspace.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline flex items-center gap-2" onClick={exportInventory}><Download size={15} /> {t("common.export", "Export")}</button>
          <label className="btn-outline flex cursor-pointer items-center gap-2"><Upload size={15} /> {t("common.import", "Import")}<input type="file" accept=".csv,text/csv" hidden aria-label={t("inventory.import", "Import inventory CSV")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importInventory(file); event.target.value = ""; }} /></label>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setShowPropertyForm(true)}><Plus size={15} /> {t("inventory.new_property", "New property")}</button>
        </div>
      </header>

      {importStatus && <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{importStatus}</div>}

      <section className="card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="relative"><span className="sr-only">{t("common.search", "Search")}</span><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input ps-9" placeholder={t("inventory.search", "Search title, code, or city")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <select className="select" aria-label={t("inventory.status", "Status")} value={status} onChange={(event) => { setStatus(event.target.value as InventoryStatus | ""); setPage(1); }}><option value="">{t("inventory.all_statuses", "All statuses")}</option>{Object.keys(STATUS_CLASSES).map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="select" aria-label={t("inventory.purpose", "Purpose")} value={purpose} onChange={(event) => { setPurpose(event.target.value as typeof purpose); setPage(1); }}><option value="">{t("inventory.all_purposes", "Sale and rent")}</option><option value="sale">sale</option><option value="rent">rent</option><option value="both">both</option></select>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 text-sm text-gray-500">{total} {t("inventory.assets", "assets")}</div>
          {inventoryQuery.isLoading ? <div className="p-10 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div> : properties.length === 0 ? <div className="flex flex-col items-center gap-2 p-14 text-gray-400"><Building2 size={32} /><p className="text-sm">{t("inventory.empty", "No inventory properties match this view.")}</p></div> : <div className="grid gap-3 p-4 sm:grid-cols-2">{properties.map((property) => (
            <button type="button" key={property.id} onClick={() => setSelectedId(property.id)} className={`rounded-xl border p-4 text-start transition ${selectedId === property.id ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:border-gray-200 hover:shadow-sm"}`}>
              <div className="mb-3 flex items-start justify-between gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-500">{property.propertyType === "building" ? <Building2 size={18} /> : <Home size={18} />}</div><span className={`badge ${STATUS_CLASSES[property.status]}`}>{property.status}</span></div>
              <p className="truncate font-semibold">{property.title}</p>
              <p className="mt-1 truncate text-xs text-gray-400">{property.assetCode || property.titleAr || property.propertyType}</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-500"><MapPin size={12} /><span className="truncate">{[property.city, property.country].filter(Boolean).join(", ") || "—"}</span></div>
              <div className="mt-3 flex justify-between text-xs"><span className="text-gray-400">{property.purpose}</span><strong>{property.saleAskingPrice?.toLocaleString() ?? property.annualRentAskingPrice?.toLocaleString() ?? "—"} {property.currency}</strong></div>
            </button>
          ))}</div>}
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm"><button type="button" className="btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous", "Previous")}</button><span className="text-gray-400">{page} / {totalPages}</span><button type="button" className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t("common.next", "Next")}</button></div>
        </section>

        <aside className="card p-5">
          {!selectedId ? <div className="py-16 text-center text-sm text-gray-400">{t("inventory.select", "Select an inventory asset to manage its units, owners, and listing agreements.")}</div> : detailQuery.isLoading ? <div className="py-16 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div> : selected ? <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{selected.title}</h2><span className={`badge ${STATUS_CLASSES[selected.status]}`}>{selected.status}</span></div><p className="mt-1 text-sm text-gray-400">{selected.assetCode || selected.titleAr || selected.propertyType}</p></div><button type="button" className="btn-primary flex items-center gap-2 self-start" onClick={() => setShowUnitForm(true)}><Plus size={14} /> {t("inventory.add_unit", "Add unit")}</button></div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{t("inventory.type", "Type")}</p><p className="mt-1 font-medium">{selected.propertyType}</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{t("inventory.units", "Units")}</p><p className="mt-1 font-medium">{selected.units.length}</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{t("inventory.area", "Area")}</p><p className="mt-1 font-medium">{selected.builtAreaSqm ?? selected.landAreaSqm ?? "—"}</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{t("inventory.currency", "Currency")}</p><p className="mt-1 font-medium">{selected.currency}</p></div></div>
            <section><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t("inventory.units", "Units")}</h3><span className="text-xs text-gray-400">{selected.units.length}</span></div>{selected.units.length === 0 ? <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-400">{t("inventory.no_units", "No units have been added.")}</p> : <div className="max-h-56 space-y-2 overflow-y-auto">{selected.units.map((unit) => <div key={unit.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"><div><p className="font-medium">{unit.unitNumber} · {unit.unitType}</p><p className="text-xs text-gray-400">{unit.floor ? `Floor ${unit.floor} · ` : ""}{unit.bedrooms ?? "—"} beds · {unit.areaSqm ?? "—"} m²</p></div><div className="text-end"><span className={`badge ${STATUS_CLASSES[unit.status]}`}>{unit.status}</span><p className="mt-1 text-xs font-medium">{unit.saleAskingPrice?.toLocaleString() ?? unit.annualRentAskingPrice?.toLocaleString() ?? "—"} {unit.currency}</p></div></div>)}</div>}</section>
            <AssetRelations propertyId={selected.id} contacts={contactsQuery.data?.contacts ?? []} ownership={selected.ownership} listings={selected.listings} />
            <section><h3 className="mb-2 font-semibold">{t("inventory.availability_history", "Availability history")}</h3><div className="space-y-2">{selected.availabilityHistory.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>{item.status}</span><span className="text-xs text-gray-400">{new Date(item.effectiveFrom).toLocaleDateString()}</span></div>)}</div></section>
          </div> : <p className="py-16 text-center text-sm text-red-500">{t("common.not_found", "Record not found")}</p>}
        </aside>
      </div>

      {showPropertyForm && <PropertyForm developments={developmentsQuery.data?.developments ?? []} onClose={() => setShowPropertyForm(false)} onCreated={(property) => { setShowPropertyForm(false); setSelectedId(property.id); void queryClient.invalidateQueries({ queryKey: ["inventory"] }); }} />}
      {showUnitForm && selected && <UnitForm propertyId={selected.id} defaultCurrency={selected.currency} onClose={() => setShowUnitForm(false)} onCreated={() => { setShowUnitForm(false); void queryClient.invalidateQueries({ queryKey: ["inventory-property", selected.id] }); }} />}
    </div>
  );
}
