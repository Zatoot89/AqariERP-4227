import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { X, Upload, Trash2, ImageOff } from "lucide-react";

export default function NewPropertyModal({ onClose, property }: { onClose: () => void; property?: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!property;
  const [form, setForm] = useState({
    title: property?.title ?? "", titleAr: property?.titleAr ?? "",
    type: property?.type ?? "apartment", status: property?.status ?? "available",
    price: property?.price?.toString() ?? "", currency: property?.currency ?? "USD",
    areaSqm: property?.areaSqm?.toString() ?? "", bedrooms: property?.bedrooms?.toString() ?? "", bathrooms: property?.bathrooms?.toString() ?? "",
    location: property?.location ?? "", locationAr: property?.locationAr ?? "", city: property?.city ?? "", country: property?.country ?? "",
    description: property?.description ?? "",
  });

  // Existing image keys (from `images` JSON column) + previews for already-uploaded ones (imageUrls, presigned).
  const [imageKeys, setImageKeys] = useState<string[]>(() => {
    try { return property?.images ? JSON.parse(property.images) : []; } catch { return []; }
  });
  const [previews, setPreviews] = useState<string[]>(property?.imageUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type, sizeBytes: file.size, propertyId: property?.id } });
      const { url, key } = await res.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setImageKeys(keys => [...keys, key]);
      setPreviews(urls => [...urls, URL.createObjectURL(file)]);
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(f => { if (f.type.startsWith("image/")) uploadFile(f); });
  }

  function removeImage(idx: number) {
    setImageKeys(keys => keys.filter((_, i) => i !== idx));
    setPreviews(urls => urls.filter((_, i) => i !== idx));
  }

  const save = useMutation({
    mutationFn: async () => {
      const json = {
        ...form,
        price: form.price ? Number(form.price) : undefined,
        areaSqm: form.areaSqm ? Number(form.areaSqm) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        images: JSON.stringify(imageKeys),
      };
      const res = isEdit
        ? await api.properties[":id"].$patch({ param: { id: property.id }, json })
        : await api.properties.$post({ json });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      onClose();
    },
  });

  const field = (key: string) => ({
    value: (form as any)[key],
    onChange: (e: any) => setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-lg">{isEdit ? t("properties.edit_property", "Edit Property") : t("properties.new_property")}</h2>
          <button type="button" aria-label={t("common.close", "Close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form className="p-5 space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("properties.photos", "Photos")}</label>
            <div
              className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {previews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden group">
                      <img src={src} alt={`${t("properties.photo", "Property photo")} ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 end-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: "var(--primary)" }}>
                <Upload size={15} />
                {uploading ? t("common.loading") : t("properties.upload_photos", "Upload or drag photos here")}
                <input aria-label={t("properties.upload_photos", "Upload property photos")} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} disabled={uploading} />
              </label>
              {previews.length === 0 && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1">
                  <ImageOff size={12} /> {t("properties.no_photos", "No photos yet")}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.property_title")} *</label>
              <input className="input" required {...field("title")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.property_title")} (AR)</label>
              <input className="input" dir="rtl" {...field("titleAr")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.type")}</label>
              <select className="select" {...field("type")}>
                {["apartment","villa","office","land","commercial"].map(tp => <option key={tp} value={tp}>{tp}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.status")}</label>
              <select className="select" {...field("status")}>
                {["available","reserved","sold","rented"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">{t("properties.price")}</label>
              <input className="input" type="number" {...field("price")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("common.currency")}</label>
              <select className="select" {...field("currency")}>
                {["USD","AED","SAR","IQD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.bedrooms")}</label>
              <input className="input" type="number" {...field("bedrooms")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.bathrooms")}</label>
              <input className="input" type="number" {...field("bathrooms")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.area")}</label>
              <input className="input" type="number" {...field("areaSqm")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.location")}</label>
              <input className="input" {...field("location")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.location")} (AR)</label>
              <input className="input" dir="rtl" {...field("locationAr")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.city")}</label>
              <input className="input" {...field("city")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("properties.country")}</label>
              <input className="input" {...field("country")} placeholder="AE / IQ / SA" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("properties.description", "Description")}</label>
            <textarea className="input min-h-[70px] resize-none" {...field("description")} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending || uploading}>
              {save.isPending ? t("common.loading") : isEdit ? t("common.save") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
