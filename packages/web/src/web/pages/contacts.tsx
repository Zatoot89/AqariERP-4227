import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Upload, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { downloadCsv, recordsFromCsv } from "../lib/csv";

type ContactRole =
  | "owner" | "landlord" | "tenant" | "buyer" | "seller"
  | "broker" | "vendor" | "guarantor" | "prospect";

type Contact = {
  id: string;
  contactType: "person" | "company";
  displayName: string;
  displayNameAr: string | null;
  legalName: string | null;
};

type ContactDetail = Contact & {
  roles: Array<{ id: string; role: ContactRole }>;
  methods: Array<{ id: string; methodType: string; value: string }>;
  notes: string | null;
};

const ROLES: ContactRole[] = [
  "owner", "landlord", "tenant", "buyer", "seller",
  "broker", "vendor", "guarantor", "prospect",
];

export default function ContactsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<ContactRole | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [duplicates, setDuplicates] = useState<Contact[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [form, setForm] = useState({
    contactType: "person" as "person" | "company",
    displayName: "",
    displayNameAr: "",
    phone: "",
    email: "",
    roles: ["prospect"] as ContactRole[],
    notes: "",
  });

  const listQuery = useQuery({
    queryKey: ["contacts", search, role],
    queryFn: async () => {
      const response = await api.contacts.$get({
        query: { q: search || undefined, role: role || undefined, page: "1", pageSize: "200" },
      });
      return response.json() as Promise<{ contacts: Contact[]; total: number }>;
    },
  });

  const detailQuery = useQuery({
    queryKey: ["contact", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const response = await api.contacts[":id"].$get({ param: { id: selectedId! } });
      return response.json() as Promise<{ contact: ContactDetail }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (skipDuplicateCheck: boolean) => {
      if (!skipDuplicateCheck) {
        const response = await api.contacts.duplicates.$get({
          query: {
            name: form.displayName || undefined,
            phone: form.phone || undefined,
            email: form.email || undefined,
          },
        });
        const payload = await response.json() as { contacts: Contact[] };
        if (payload.contacts.length > 0) return { duplicates: payload.contacts } as const;
      }
      const methods: Array<{ methodType: "phone" | "email"; value: string; isPrimary?: boolean }> = [];
      if (form.phone) methods.push({ methodType: "phone", value: form.phone, isPrimary: true });
      if (form.email) methods.push({ methodType: "email", value: form.email, isPrimary: !form.phone });
      const response = await api.contacts.$post({
        json: {
          contactType: form.contactType,
          displayName: form.displayName,
          displayNameAr: form.displayNameAr || null,
          notes: form.notes || null,
          roles: form.roles,
          methods,
        },
      });
      const payload = await response.json() as { contact?: ContactDetail; error?: string };
      if (!response.ok || !payload.contact) throw new Error(payload.error ?? "Could not create contact");
      return { contact: payload.contact } as const;
    },
    onSuccess: (result) => {
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        return;
      }
      setShowCreate(false);
      setDuplicates([]);
      setSelectedId(result.contact.id);
      setForm({ contactType: "person", displayName: "", displayNameAr: "", phone: "", email: "", roles: ["prospect"], notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const contacts = listQuery.data?.contacts ?? [];
  const detail = detailQuery.data?.contact;

  function toggleRole(value: ContactRole) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(value)
        ? current.roles.filter((item) => item !== value)
        : [...current.roles, value],
    }));
  }

  function exportContacts() {
    downloadCsv(
      `aqari-contacts-${new Date().toISOString().slice(0, 10)}.csv`,
      ["id", "contactType", "displayName", "displayNameAr"],
      contacts.map((item) => [item.id, item.contactType, item.displayName, item.displayNameAr]),
    );
  }

  async function importContacts(file: File) {
    setImportStatus("Reading file…");
    try {
      const records = recordsFromCsv(await file.text()).slice(0, 200);
      let created = 0;
      let skipped = 0;
      for (const record of records) {
        if (!record.displayName) { skipped += 1; continue; }
        const roles = (record.roles || "prospect").split(/[|;]/)
          .map((item) => item.trim())
          .filter((item): item is ContactRole => ROLES.includes(item as ContactRole));
        const methods: Array<{ methodType: "phone" | "email"; value: string; isPrimary?: boolean }> = [];
        if (record.phone) methods.push({ methodType: "phone", value: record.phone, isPrimary: true });
        if (record.email) methods.push({ methodType: "email", value: record.email, isPrimary: !record.phone });
        const response = await api.contacts.$post({
          json: {
            contactType: record.contactType === "company" ? "company" : "person",
            displayName: record.displayName,
            displayNameAr: record.displayNameAr || null,
            roles: roles.length > 0 ? roles : ["prospect"],
            methods,
          },
        });
        if (response.ok) created += 1; else skipped += 1;
      }
      setImportStatus(`Imported ${created}; skipped ${skipped}.`);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch {
      setImportStatus("Import failed. Expected columns: displayName, contactType, phone, email, roles.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("contacts.title", "Contacts")}</h1>
          <p className="text-sm text-gray-500">{t("contacts.subtitle", "A shared directory for owners, buyers, tenants, vendors, and other parties.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline flex items-center gap-2" onClick={exportContacts}><Download size={15} /> {t("common.export", "Export")}</button>
          <label className="btn-outline flex cursor-pointer items-center gap-2"><Upload size={15} /> {t("common.import", "Import")}<input hidden type="file" accept=".csv,text/csv" aria-label={t("contacts.import", "Import contacts CSV")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importContacts(file); event.target.value = ""; }} /></label>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}><Plus size={15} /> {t("contacts.new", "New contact")}</button>
        </div>
      </header>

      {importStatus && <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{importStatus}</div>}

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="relative"><span className="sr-only">{t("common.search", "Search")}</span><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input ps-9" value={search} placeholder={t("contacts.search", "Search contacts")} onChange={(event) => setSearch(event.target.value)} /></label>
          <select className="select" aria-label={t("contacts.filter_role", "Filter by role")} value={role} onChange={(event) => setRole(event.target.value as ContactRole | "")}><option value="">{t("contacts.all_roles", "All roles")}</option>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 text-sm text-gray-500">{listQuery.data?.total ?? 0} {t("contacts.records", "contacts")}</div>
          {listQuery.isLoading ? <div className="p-10 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div> : contacts.length === 0 ? <div className="flex flex-col items-center gap-2 p-12 text-gray-400"><Users size={30} /><p className="text-sm">{t("contacts.empty", "No contacts match this view.")}</p></div> : <div className="divide-y divide-gray-100">{contacts.map((contact) => (
            <button type="button" key={contact.id} aria-label={`${t("contacts.open", "Open contact")}: ${contact.displayName}`} onClick={() => setSelectedId(contact.id)} className={`w-full px-4 py-3 text-start hover:bg-gray-50 ${selectedId === contact.id ? "bg-blue-50" : ""}`}>
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{contact.displayName}</p><p className="truncate text-xs text-gray-400">{contact.displayNameAr || contact.legalName || contact.contactType}</p></div><span className="badge bg-gray-100 text-gray-600">{contact.contactType}</span></div>
            </button>
          ))}</div>}
        </section>

        <aside className="card p-5">
          {!selectedId ? <div className="py-12 text-center text-sm text-gray-400">{t("contacts.select", "Select a contact to view details.")}</div> : detailQuery.isLoading ? <div className="py-12 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div> : detail ? <div className="space-y-5"><div><h2 className="text-lg font-semibold">{detail.displayName}</h2>{detail.displayNameAr && <p className="text-sm text-gray-400" dir="rtl">{detail.displayNameAr}</p>}</div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("contacts.roles", "Roles")}</p><div className="flex flex-wrap gap-2">{detail.roles.map((item) => <span key={item.id} className="badge bg-blue-100 text-blue-700">{item.role}</span>)}</div></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("contacts.methods", "Contact methods")}</p><div className="space-y-2">{detail.methods.map((method) => <div key={method.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="me-2 text-xs uppercase text-gray-400">{method.methodType}</span>{method.value}</div>)}</div></div>{detail.notes && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{detail.notes}</p>}</div> : null}
        </aside>
      </div>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto"><div className="flex items-center justify-between border-b border-gray-100 p-5"><h2 className="text-lg font-semibold">{t("contacts.new", "New contact")}</h2><button type="button" className="rounded-lg p-2 hover:bg-gray-100" aria-label={t("common.close", "Close")} onClick={() => { setShowCreate(false); setDuplicates([]); }}><X size={18} /></button></div><form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(false); }}>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t("contacts.type", "Type")}</span><select className="select" value={form.contactType} onChange={(event) => setForm((value) => ({ ...value, contactType: event.target.value as "person" | "company" }))}><option value="person">person</option><option value="company">company</option></select></label><label className="space-y-1 text-sm"><span>{t("contacts.name", "Display name")} *</span><input className="input" required value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} /></label></div>
        <label className="block space-y-1 text-sm"><span>{t("contacts.name_ar", "Arabic name")}</span><input className="input" dir="rtl" value={form.displayNameAr} onChange={(event) => setForm((value) => ({ ...value, displayNameAr: event.target.value }))} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t("contacts.phone", "Phone")}</span><input className="input" value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} /></label><label className="space-y-1 text-sm"><span>{t("contacts.email", "Email")}</span><input className="input" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></label></div>
        <fieldset><legend className="mb-2 text-sm">{t("contacts.roles", "Roles")}</legend><div className="flex flex-wrap gap-2">{ROLES.map((item) => <button type="button" key={item} onClick={() => toggleRole(item)} className={`rounded-full border px-3 py-1 text-xs ${form.roles.includes(item) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>{item}</button>)}</div></fieldset>
        <label className="block space-y-1 text-sm"><span>{t("common.notes", "Notes")}</span><textarea className="input min-h-20" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} /></label>
        {duplicates.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><p className="font-medium">{t("contacts.duplicate_warning", "Possible duplicates found")}</p><ul className="mt-1 list-disc ps-5">{duplicates.map((item) => <li key={item.id}>{item.displayName}</li>)}</ul><button type="button" className="mt-2 font-semibold underline" onClick={() => createMutation.mutate(true)}>{t("contacts.create_anyway", "Create anyway")}</button></div>}
        {createMutation.error && <p className="text-sm text-red-500">{createMutation.error.message}</p>}
        <div className="flex justify-end gap-3"><button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>{t("common.cancel", "Cancel")}</button><button type="submit" className="btn-primary" disabled={createMutation.isPending || form.roles.length === 0}>{createMutation.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button></div>
      </form></div></div>}
    </div>
  );
}
