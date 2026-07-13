import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type UnitFormProps = {
  propertyId: string;
  defaultCurrency: string;
  onClose: () => void;
  onCreated: () => void;
};

export function UnitForm({ propertyId, defaultCurrency, onClose, onCreated }: UnitFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    unitNumber: "",
    floor: "",
    unitType: "apartment",
    purpose: "both" as "sale" | "rent" | "both",
    status: "available" as "available" | "reserved" | "sold" | "rented" | "occupied" | "off_market",
    bedrooms: "",
    bathrooms: "",
    areaSqm: "",
    parkingSpaces: "0",
    furnishing: "unfurnished" as "unfurnished" | "semi_furnished" | "furnished",
    saleAskingPrice: "",
    annualRentAskingPrice: "",
    currency: defaultCurrency,
    amenities: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.inventory.properties[":id"].units.$post({
        param: { id: propertyId },
        json: {
          unitNumber: form.unitNumber,
          floor: form.floor || null,
          unitType: form.unitType,
          purpose: form.purpose,
          status: form.status,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
          areaSqm: form.areaSqm ? Number(form.areaSqm) : null,
          parkingSpaces: Number(form.parkingSpaces || 0),
          furnishing: form.furnishing,
          saleAskingPrice: form.saleAskingPrice ? Number(form.saleAskingPrice) : null,
          annualRentAskingPrice: form.annualRentAskingPrice
            ? Number(form.annualRentAskingPrice)
            : null,
          currency: form.currency,
          amenities: form.amenities
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not create unit");
    },
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 className="text-lg font-semibold">{t("inventory.new_unit", "New unit")}</h2>
          <button type="button" className="rounded-lg p-2 hover:bg-gray-100" aria-label={t("common.close", "Close")} onClick={onClose}><X size={18} /></button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm"><span>{t("inventory.unit_number", "Unit number")} *</span><input className="input" required value={form.unitNumber} onChange={(event) => setForm((value) => ({ ...value, unitNumber: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.floor", "Floor")}</span><input className="input" value={form.floor} onChange={(event) => setForm((value) => ({ ...value, floor: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.unit_type", "Unit type")}</span><input className="input" value={form.unitType} onChange={(event) => setForm((value) => ({ ...value, unitType: event.target.value }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm"><span>{t("inventory.purpose", "Purpose")}</span><select className="select" value={form.purpose} onChange={(event) => setForm((value) => ({ ...value, purpose: event.target.value as typeof form.purpose }))}><option value="sale">sale</option><option value="rent">rent</option><option value="both">both</option></select></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.status", "Status")}</span><select className="select" value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as typeof form.status }))}>{["available","reserved","sold","rented","occupied","off_market"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.furnishing", "Furnishing")}</span><select className="select" value={form.furnishing} onChange={(event) => setForm((value) => ({ ...value, furnishing: event.target.value as typeof form.furnishing }))}><option value="unfurnished">unfurnished</option><option value="semi_furnished">semi furnished</option><option value="furnished">furnished</option></select></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="space-y-1 text-sm"><span>{t("inventory.bedrooms", "Bedrooms")}</span><input className="input" type="number" min="0" value={form.bedrooms} onChange={(event) => setForm((value) => ({ ...value, bedrooms: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.bathrooms", "Bathrooms")}</span><input className="input" type="number" min="0" value={form.bathrooms} onChange={(event) => setForm((value) => ({ ...value, bathrooms: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.area", "Area m²")}</span><input className="input" type="number" min="0" step="0.01" value={form.areaSqm} onChange={(event) => setForm((value) => ({ ...value, areaSqm: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.parking", "Parking")}</span><input className="input" type="number" min="0" value={form.parkingSpaces} onChange={(event) => setForm((value) => ({ ...value, parkingSpaces: event.target.value }))} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
            <label className="space-y-1 text-sm"><span>{t("inventory.sale_price", "Sale price")}</span><input className="input" type="number" min="0" value={form.saleAskingPrice} onChange={(event) => setForm((value) => ({ ...value, saleAskingPrice: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("inventory.rent_price", "Annual rent")}</span><input className="input" type="number" min="0" value={form.annualRentAskingPrice} onChange={(event) => setForm((value) => ({ ...value, annualRentAskingPrice: event.target.value }))} /></label>
            <label className="space-y-1 text-sm"><span>{t("common.currency", "Currency")}</span><input className="input" maxLength={3} value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value.toUpperCase() }))} /></label>
          </div>
          <label className="block space-y-1 text-sm"><span>{t("inventory.amenities", "Amenities, comma separated")}</span><input className="input" value={form.amenities} onChange={(event) => setForm((value) => ({ ...value, amenities: event.target.value }))} /></label>
          {mutation.error && <p className="text-sm text-red-500">{mutation.error.message}</p>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-outline" onClick={onClose}>{t("common.cancel", "Cancel")}</button><button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button></div>
        </form>
      </div>
    </div>
  );
}
