import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, Upload, Trash2, ImageOff } from "lucide-react";
import { api } from "../../lib/api";

type ImageItem = { id: string | null; url: string; pending: boolean; legacy: boolean };
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
type ImageType = (typeof imageTypes)[number];

export default function PropertyModal({ onClose, property }: { onClose: () => void; property?: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = Boolean(property);
  const [form, setForm] = useState({
    title: property?.title ?? "", titleAr: property?.titleAr ?? "",
    type: property?.type ?? "apartment", status: property?.status ?? "available",
    price: property?.price?.toString() ?? "", currency: property?.currency ?? "USD",
    areaSqm: property?.areaSqm?.toString() ?? "", bedrooms: property?.bedrooms?.toString() ?? "", bathrooms: property?.bathrooms?.toString() ?? "",
    location: property?.location ?? "", locationAr: property?.locationAr ?? "", city: property?.city ?? "", country: property?.country ?? "",
    description: property?.description ?? "",
  });
  const [images, setImages] = useState<ImageItem[]>(() => {
    const structured = ((property?.attachments ?? []) as any[]).map((item) => ({
      id: item.id as string, url: item.url as string, pending: false, legacy: false,
    }));
    const known = new Set(structured.map((item) => item.url));
    const legacy = ((property?.imageUrls ?? []) as string[])
      .filter((url) => !known.has(url))
      .map((url) => ({ id: null, url, pending: false, legacy: true }));
    return [...structured, ...legacy];
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  async function uploadFile(file: File) {
    if (!imageTypes.includes(file.type as ImageType)) throw new Error("Unsupported image type");
    const response = await api.attachments.presign.$post({
      json: {
        filename: file.name,
        contentType: file.type as ImageType,
        sizeBytes: file.size,
        purpose: "property",
        ...(property?.id ? { propertyId: property.id } : {}),
      },
    });
    const result = await response.json();
    if (!response.ok || !("attachmentId" in result)) {
      throw new Error("error" in result ? result.error : "Could not prepare upload");
    }
    const uploaded = await fetch(result.url, { method: "PUT", body: file, headers: result.requiredHeaders });
    if (!uploaded.ok) {
      await api.attachments[":id"].$delete({ param: { id: result.attachmentId } }).catch(() => undefined);
      throw new Error("Image upload failed");
    }
    setImages((current) => [...current, {
      id: result.attachmentId,
      url: URL.createObjectURL(file),
      pending: true,
      legacy: false,
    }]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setUploadError("");
    try {
      for (const file of Array.from(files)) await uploadFile(file);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(index: number) {
    const image = images[index];
    if (!image || image.legacy) return;
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (image.pending && image.id) {
      await api.attachments[":id"].$delete({ param: { id: image.id } }).catch(() => undefined);
      URL.revokeObjectURL(image.url);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const json = {
        ...form,
        price: form.price ? Number(form.price) : undefined,
        areaSqm: form.areaSqm ? Number(form.areaSqm) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        attachmentIds: images.flatMap((item) => item.id ? [item.id] : []),
      };
      const response = isEdit
        ? await api.properties[":id"].$patch({ param: { id: property.id }, json })
        : await api.properties.$post({ json });
      const result = await response.json();
      if (!response.ok) throw new Error("error" in result ? result.error : "Property could not be saved");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-lg">{isEdit ? t("properties.edit_property", "Edit Property") : t("properties.new_property")}</h2>
          <button type="button" aria-label={t("common.close", "Close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form className="p-5 space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("properties.photos", "Photos")}</label>
            <div className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200"}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void handleFiles(event.dataTransfer.files); }}>
              {images.length > 0 && <div className="grid grid-cols-4 gap-2 mb-3">{images.map((image, index) => <div key={image.id ?? `legacy-${index}`} className="relative aspect-square rounded-lg overflow-hidden group"><img src={image.url} alt={`${t("properties.photo", "Property photo")} ${index + 1}`} className="w-full h-full object-cover" />{!image.legacy && <button type="button" aria-label={t("properties.remove_photo", "Remove photo")} onClick={() => void removeImage(index)} className="absolute top-1 end-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"><Trash2 size={12} /></button>}</div>)}</div>}
              <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: "var(--primary)" }}><Upload size={15} /> {uploading ? t("common.loading") : t("properties.upload_photos", "Upload or drag photos here")}<input aria-label={t("properties.upload_photos", "Upload property photos")} type="file" accept={imageTypes.join(",")} multiple hidden disabled={uploading} onChange={(event) => void handleFiles(event.target.files)} /></label>
              {images.length === 0 && <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1"><ImageOff size={12} /> {t("properties.no_photos", "No photos yet")}</div>}
              {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1.5">{t("properties.property_title")} *</label><input className="input" required {...field("title")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.property_title")} (AR)</label><input className="input" dir="rtl" {...field("titleAr")} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1.5">{t("properties.type")}</label><select className="select" {...field("type")}>{["apartment","villa","office","land","commercial"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.status")}</label><select className="select" {...field("status")}>{["available","reserved","sold","rented"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="col-span-2"><label className="block text-sm font-medium mb-1.5">{t("properties.price")}</label><input className="input" type="number" {...field("price")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("common.currency")}</label><select className="select" {...field("currency")}>{["USD","AED","SAR","IQD"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label className="block text-sm font-medium mb-1.5">{t("properties.bedrooms")}</label><input className="input" type="number" {...field("bedrooms")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.bathrooms")}</label><input className="input" type="number" {...field("bathrooms")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.area")}</label><input className="input" type="number" {...field("areaSqm")} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1.5">{t("properties.location")}</label><input className="input" {...field("location")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.location")} (AR)</label><input className="input" dir="rtl" {...field("locationAr")} /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1.5">{t("properties.city")}</label><input className="input" {...field("city")} /></div><div><label className="block text-sm font-medium mb-1.5">{t("properties.country")}</label><input className="input" {...field("country")} placeholder="AE / IQ / SA" /></div></div>
          <div><label className="block text-sm font-medium mb-1.5">{t("properties.description", "Description")}</label><textarea className="input min-h-[70px] resize-none" {...field("description")} /></div>
          {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
          <div className="flex justify-end gap-3 pt-1"><button type="button" className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button><button type="submit" className="btn-primary" disabled={save.isPending || uploading}>{save.isPending ? t("common.loading") : isEdit ? t("common.save") : t("common.add")}</button></div>
        </form>
      </div>
    </div>
  );
}
