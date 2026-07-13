import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type DevelopmentOption = { id: string; name: string };
type InventoryProperty = { id: string; title: string };

type PropertyFormProps = {
  developments: DevelopmentOption[];
  onClose: () => void;
  onCreated: (property: InventoryProperty) => void;
};

type PropertyType =
  | "apartment"
  | "villa"
  | "office"
  | "land"
  | "commercial"
  | "building"
  | "warehouse"
  | "retail"
  | "other";

export function PropertyForm({ developments, onClose, onCreated }: PropertyFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    developmentId: "",
    assetCode: "",
    title: "",
    titleAr: "",
    propertyType: "apartment" as PropertyType,
    purpose: "both" as "sale" | "rent" | "both",
    status: "available" as "available" | "reserved" | "sold" | "rented" | "occupied" | "off_market",
    city: "",
    country: "AE",
    builtAreaSqm: "",
    landAreaSqm: "",
    saleAskingPrice: "",
    annualRentAskingPrice: "",
    currency: "AED",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.inventory.properties.$post({
        json: {
          developmentId: form.developmentId || null,
          assetCode: form.assetCode || null,
          title: form.title,
          titleAr: form.titleAr || null,
          propertyType: form.propertyType,
          purpose: form.purpose,
          status: form.status,
          city: form.city || null,
          country: form.country || null,
          builtAreaSqm: form.builtAreaSqm ? Number(form.builtAreaSqm) : null,
          landAreaSqm: form.landAreaSqm ? Number(form.landAreaSqm) : null,
          saleAskingPrice: form.saleAskingPrice ? Number(form.saleAskingPrice) : null,
          annualRentAskingPrice: form.annualRentAskingPrice
            ? Number(form.annualRentAskingPrice)
            : null,
          currency: form.currency,
        },
      });
      const payload = await response.json() as {
        property?: InventoryProperty;
        error?: string;
      };
      if (!response.ok || !payload.property) {
        throw new Error(payload.error ?? "Could not create property");
      }
      return payload.property;
    },
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("inventory.new_property", "New inventory property")}</h2>
            <p className="text-xs text-gray-400">{t("inventory.new_property_help", "Create a standalone asset or connect it to a development.")}</p>
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-gray-100" aria-label={t("common.close", "Close")} onClick={onClose}><X size={18} /></button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>{t("inventory.title", "Title")} *</span><input className="input" required value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.title_ar", "Arabic title")}</span><input className="input" dir="rtl" value={form.titleAr} onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>{t("inventory.development", "Development")}</span><select className="select" value={form.developmentId} onChange={(event) => setForm((value) => ({ ...value, developmentId: event.target.value }))}><option value="">{t("inventory.standalone", "Standalone property")}</option>{developments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.asset_code", "Asset code")}</span><input className="input" value={form.assetCode} onChange={(event) => setForm((value) => ({ ...value, assetCode: event.target.value }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm"><span>{t("inventory.type", "Property type")}</span><select className="select" value={form.propertyType} onChange={(event) => setForm((value) => ({ ...value, propertyType: event.target.value as PropertyType }))}>{["apartment","villa","office","land","commercial","building","warehouse","retail","other"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.purpose", "Purpose")}</span><select className="select" value={form.purpose} onChange={(event) => setForm((value) => ({ ...value, purpose: event.target.value as "sale" | "rent" | "both" }))}><option value="sale">sale</option><option value="rent">rent</option><option value="both">both</option></select></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.status", "Status")}</span><select className="select" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as typeof form.status }))}>{["available","reserved","sold","rented","occupied","off_market"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm sm:col-span-2"><span>{t("inventory.city", "City")}</span><input className="input" value={form.city} onChange={(event) => setForm((value) => ({ ...value, city: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.country", "Country")}</span><input className="input" maxLength={2} value={form.country} onChange={(event) => setForm((value) => ({ ...value, country: event.target.value.toUpperCase() }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>{t("inventory.built_area", "Built area (m²)")}</span><input className="input" type="number" min="0" step="0.01" value={form.builtAreaSqm} onChange={(event) => setForm((value) => ({ ...value, builtAreaSqm: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.land_area", "Land area (m²)")}</span><input className="input" type="number" min="0" step="0.01" value={form.landAreaSqm} onChange={(event) => setForm((value) => ({ ...value, landAreaSqm: event.target.value }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
            <label className="space-y-1 text-sm"><span>{t("inventory.sale_price", "Sale asking price")}</span><input className="input" type="number" min="0" step="0.01" value={form.saleAskingPrice} onChange={(event) => setForm((value) => ({ ...value, saleAskingPrice: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.rent_price", "Annual rent")}</span><input className="input" type="number" min="0" step="0.01" value={form.annualRentAskingPrice} onChange={(event) => setForm((value) => ({ ...value, annualRentAskingPrice: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("common.currency", "Currency")}</span><input className="input" maxLength={3} value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value.toUpperCase() }))} /></label>
          </div>
          {mutation.error && <p className="text-sm text-red-500">{mutation.error.message}</p>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-outline" onClick={onClose}>{t("common.cancel", "Cancel")}</button><button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button></div>
        </form>
      </div>
    </div>
  );
}
