import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useProfile } from "../../hooks/use-profile";
import { X } from "lucide-react";

export default function NewLeadModal({ onClose, lead }: { onClose: () => void; lead?: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!lead;
  const { isAdminOrManager } = useProfile();
  const [form, setForm] = useState({
    name: lead?.name ?? "", nameAr: lead?.nameAr ?? "", phone: lead?.phone ?? "", email: lead?.email ?? "",
    source: lead?.source ?? "manual",
    propertyType: lead?.propertyType ?? "apartment",
    budgetMin: lead?.budgetMin?.toString() ?? "", budgetMax: lead?.budgetMax?.toString() ?? "", currency: lead?.currency ?? "USD",
    preferredArea: lead?.preferredArea ?? "", notes: lead?.notes ?? "",
    assignedTo: lead?.assignedTo ?? "",
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await api.agents.$get()).json(),
    enabled: isAdminOrManager,
  });
  const agentOptions = ((agentsData as any)?.agents ?? []).filter((a: any) => a.active !== 0);

  const save = useMutation({
    mutationFn: async () => {
      const json = {
        ...form,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        assignedTo: form.assignedTo || undefined,
      };
      const res = isEdit
        ? await api.leads[":id"].$patch({ param: { id: lead.id }, json })
        : await api.leads.$post({ json });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (isEdit) qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      onClose();
    },
  });

  const field = (key: string) => ({
    value: (form as any)[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-lg">{isEdit ? t("leads.edit_lead", "Edit Lead") : t("leads.new_lead")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={e => { e.preventDefault(); save.mutate(); }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.name")} *</label>
              <input className="input" required {...field("name")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.name")} (AR)</label>
              <input className="input" dir="rtl" {...field("nameAr")} placeholder="الاسم بالعربية" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.phone")}</label>
              <input className="input" type="tel" {...field("phone")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.email")}</label>
              <input className="input" type="email" {...field("email")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.source")}</label>
              <select className="select" {...field("source")}>
                {["whatsapp","propertyfinder","bayut","dubizzle","aqarmap","manual","website","referral"].map(s =>
                  <option key={s} value={s}>{t(`leads.sources.${s}`)}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.property_type")}</label>
              <select className="select" {...field("propertyType")}>
                {["apartment","villa","office","land","commercial"].map(p =>
                  <option key={p} value={p}>{t(`leads.property_types.${p}`)}</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Min Budget</label>
              <input className="input" type="number" {...field("budgetMin")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Max Budget</label>
              <input className="input" type="number" {...field("budgetMax")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("common.currency")}</label>
              <select className="select" {...field("currency")}>
                {["USD","AED","SAR","IQD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {isAdminOrManager && (
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("leads.assigned_to", "Assigned To")}</label>
              <select className="select" {...field("assignedTo")}>
                <option value="">{t("leads.assign_to_me", "Assign to me")}</option>
                {agentOptions.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name || a.email}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("leads.preferred_area")}</label>
            <input className="input" {...field("preferredArea")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("leads.notes")}</label>
            <textarea className="input min-h-[80px] resize-none" {...field("notes")} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? t("common.loading") : isEdit ? t("common.save") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
