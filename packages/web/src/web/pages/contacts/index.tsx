import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Upload, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { downloadCsv, recordsFromCsv } from "../../lib/csv";

type ContactRole =
  | "owner"
  | "landlord"
  | "tenant"
  | "buyer"
  | "seller"
  | "broker"
  | "vendor"
  | "guarantor"
  | "prospect";

type ContactSummary = {
  id: string;
  contactType: "person" | "company";
  displayName: string;
  displayNameAr: string | null;
  legalName: string | null;
  preferredLanguage: "en" | "ar";
  notes: string | null;
  doNotContact: number;
  createdAt: number;
};

type ContactDetail = ContactSummary & {
  roles: Array<{ id: string; role: ContactRole; isPrimary: number }>;
  methods: Array<{
    id: string;
    methodType: "phone" | "email" | "whatsapp";
    value: string;
    isPrimary: number;
  }>;
};

type ContactForm = {
  contactType: "person" | "company";
  displayName: string;
  displayNameAr: string;
  phone: string;
  email: string;
  roles: ContactRole[];
  notes: string;
};

const ROLE_OPTIONS: ContactRole[] = [
  "owner",
  "landlord",
  "tenant",
  "buyer",
  "seller",
  "broker",
  "vendor",
  "guarantor",
  "prospect",
];

const EMPTY_FORM: ContactForm = {
  contactType: "person",
  displayName: "",
  displayNameAr: "",
  phone: "",
  email: "",
  roles: ["prospect"],
  notes: "",
};

export default function ContactsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<ContactRole | "">("");
  const [contactType, setContactType] = useState<"person" | "company" | "">("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [duplicateMatches, setDuplicateMatches] = useState<ContactSummary[]>([]);
  const [importStatus, setImportStatus] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["contacts", search, role, contactType, page],
    queryFn: async () => {
      const response = await api.contacts.$get({
        query: {
          q: search || undefined,
          role: role || undefined,
          contactType: contactType || undefined,
          page: String(page),
          pageSize: "30",
        },
      });
      return response.json() as Promise<{
        contacts: ContactSummary[];
        total: number;
        page: number;
        pageSize: number;
      }>;
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

  const createContact = useMutation({
    mutationFn: async ({ value, skipDuplicateCheck }: {
      value: ContactForm;
      skipDuplicateCheck: boolean;
    }) => {
      if (!skipDuplicateCheck) {
        const duplicateResponse = await api.contacts.duplicates.$get({
          query: {
            name: value.displayName || undefined,
            phone: value.phone || undefined,
            email: value.email || undefined,
          },
        });
        const duplicatePayload = await duplicateResponse.json() as { contacts: ContactSummary[] };
        if (duplicatePayload.contacts.length > 0) {
          return { duplicates: duplicatePayload.contacts } as const;
        }
      }

      const methods: Array<{
        methodType: "phone" | "email";
        value: string;
        isPrimary?: boolean;
      }> = [];
      if (value.phone) methods.push({ methodType: "phone", value: value.phone, isPrimary: true });
      if (value.email) methods.push({ methodType: "email", value: value.email, isPrimary: !value.phone });
      const response = await api.contacts.$post({
        json: {
          contactType: value.contactType,
          displayName: value.displayName,
          displayNameAr: value.displayNameAr || null,
          notes: value.notes || null,
          roles: value.roles,
          methods,
        },
      });
      if (!response.ok) throw new Error("Could not create contact");
      return response.json() as Promise<{ contact: ContactDetail }>;
    },
    onSuccess: (result) => {
      if ("duplicates" in result) {
        setDuplicateMatches(result.duplicates);
        return;
      }
      setDuplicateMatches([]);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setSelectedId(result.contact.id);
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const contacts = contactsQuery.data?.contacts ?? [];
  const total = contactsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

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
      ["id", "contactType", "displayName", "displayNameAr", "preferredLanguage", "doNotContact"],
      contacts.map((contact) => [
        contact.id,
        contact.contactType,
        contact.displayName,
        contact.displayNameAr,
        contact.preferredLanguage,
        contact.doNotContact,
      ]),
    );
  }

  async function importContacts(file: File) {
    setImportStatus("Reading file…");
    try {
      const records = recordsFromCsv(await file.text()).slice(0, 200);
      let created = 0;
      let skipped = 0;
      for (const record of records) {
        const displayName = record.displayName?.trim();
        if (!displayName) {
          skipped += 1;
          continue;
        }
        const parsedRoles = (record.roles ?? "prospect")
          .split(/[|;]/)
          .map((item) => item.trim())
          .filter((item): item is ContactRole => ROLE_OPTIONS.includes(item as ContactRole));
        const methods: Array<{
          methodType: "phone" | "email";
          value: string;
          isPrimary?: boolean;
        }> = [];
        if (record.phone) methods.push({ methodType: "phone", value: record.phone, isPrimary: true });
        if (record.email) methods.push({ methodType: "email", value: record.email, isPrimary: !record.phone });
        const response = await api.contacts.$post({
          json: {
            contactType: record.contactType === "company" ? "company" : "person",
            displayName,
            displayNameAr: record.displayNameAr || null,
            roles: parsedRoles.length > 0 ? parsedRoles : ["prospect"],
            methods,
          },
        });
        if (response.ok) created += 1;
        else skipped += 1;
      }
      setImportStatus(`Imported ${created}; skipped ${skipped}.`);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch {
      setImportStatus("Import failed. Check the CSV columns and values.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("contacts.title", "Contacts")}</h1>
          <p className="text-sm text-gray-500">{t("contacts.subtitle", "Owners, buyers, tenants, vendors, and other parties in one master directory.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline flex items-center gap-2" onClick={exportContacts}>
            <Download size={15} /> {t("common.export", "Export")}
          </button>
          <label className="btn-outline flex cursor-pointer items-center gap-2">
            <Upload size={15} /> {t("common.import", "Import")}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              aria-label={t("contacts.import", "Import contacts CSV")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importContacts(file);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> {t("contacts.new", "New contact")}
          </button>
        </div>
      </header>

      {importStatus && <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{importStatus}</div>}

      <section className="card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="relative">
            <span className="sr-only">{t("common.search", "Search")}</span>
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              className="input ps-9"
              value={search}
              placeholder={t("contacts.search", "Search by name")}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </label>
          <select
            className="select"
            aria-label={t("contacts.filter_role", "Filter by role")}
            value={role}
            onChange={(event) => { setRole(event.target.value as ContactRole | ""); setPage(1); }}
          >
            <option value="">{t("contacts.all_roles", "All roles")}</option>
            {ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            className="select"
            aria-label={t("contacts.filter_type", "Filter by contact type")}
            value={contactType}
            onChange={(event) => { setContactType(event.target.value as "person" | "company" | ""); setPage(1); }}
          >
            <option value="">{t("contacts.all_types", "People and companies")}</option>
            <option value="person">{t("contacts.person", "Person")}</option>
            <option value="company">{t("contacts.company", "Company")}</option>
          </select>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 text-sm text-gray-500">{total} {t("contacts.records", "contacts")}</div>
          {contactsQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-gray-400">
              <Users size={30} />
              <p className="text-sm">{t("contacts.empty", "No contacts match this view.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <button
                  type="button"
                  key={contact.id}
                  onClick={() => setSelectedId(contact.id)}
                  className={`w-full px-4 py-3 text-start hover:bg-gray-50 ${selectedId === contact.id ? "bg-blue-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{contact.displayName}</p>
                      <p className="truncate text-xs text-gray-400">{contact.displayNameAr || contact.legalName || contact.contactType}</p>
                    </div>
                    <span className="badge bg-gray-100 text-gray-600">{contact.contactType}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <button type="button" className="btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous", "Previous")}</button>
            <span className="text-gray-400">{page} / {totalPages}</span>
            <button type="button" className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t("common.next", "Next")}</button>
          </div>
        </section>

        <aside className="card p-5">
          {!selectedId ? (
            <div className="py-10 text-center text-sm text-gray-400">{t("contacts.select", "Select a contact to view roles and communication details.")}</div>
          ) : detailQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>
          ) : detailQuery.data?.contact ? (
            <div className="space-y-5">
              <div>
                <p className="text-lg font-semibold">{detailQuery.data.contact.displayName}</p>
                {detailQuery.data.contact.displayNameAr && <p className="text-sm text-gray-400" dir="rtl">{detailQuery.data.contact.displayNameAr}</p>}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("contacts.roles", "Roles")}</p>
                <div className="flex flex-wrap gap-2">
                  {detailQuery.data.contact.roles.map((item) => <span key={item.id} className="badge bg-blue-100 text-blue-700">{item.role}</span>)}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("contacts.methods", "Contact methods")}</p>
                <div className="space-y-2">
                  {detailQuery.data.contact.methods.map((method) => (
                    <div key={method.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="me-2 text-xs uppercase text-gray-400">{method.methodType}</span>
                      {method.value}
                    </div>
                  ))}
                </div>
              </div>
              {detailQuery.data.contact.notes && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{detailQuery.data.contact.notes}</p>}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-red-500">{t("common.not_found", "Record not found")}</p>
          )}
        </aside>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h2 className="text-lg font-semibold">{t("contacts.new", "New contact")}</h2>
              <button type="button" aria-label={t("common.close", "Close")} className="rounded-lg p-2 hover:bg-gray-100" onClick={() => { setShowCreate(false); setDuplicateMatches([]); }}><X size={18} /></button>
            </div>
            <form
              className="space-y-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                createContact.mutate({ value: form, skipDuplicateCheck: false });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t("contacts.type", "Type")}</span>
                  <select className="select" value={form.contactType} onChange={(event) => setForm((value) => ({ ...value, contactType: event.target.value as "person" | "company" }))}>
                    <option value="person">{t("contacts.person", "Person")}</option>
                    <option value="company">{t("contacts.company", "Company")}</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("contacts.name", "Display name")} *</span>
                  <input className="input" required value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span>{t("contacts.name_ar", "Arabic display name")}</span>
                <input className="input" dir="rtl" value={form.displayNameAr} onChange={(event) => setForm((value) => ({ ...value, displayNameAr: event.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span>{t("contacts.phone", "Phone")}</span><input className="input" value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} /></label>
                <label className="space-y-1 text-sm"><span>{t("contacts.email", "Email")}</span><input className="input" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></label>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm">{t("contacts.roles", "Roles")}</legend>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((option) => (
                    <button type="button" key={option} onClick={() => toggleRole(option)} className={`rounded-full border px-3 py-1 text-xs ${form.roles.includes(option) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>{option}</button>
                  ))}
                </div>
              </fieldset>
              <label className="block space-y-1 text-sm"><span>{t("common.notes", "Notes")}</span><textarea className="input min-h-20" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} /></label>

              {duplicateMatches.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">{t("contacts.duplicate_warning", "Possible duplicate contacts found")}</p>
                  <ul className="mt-1 list-disc ps-5">{duplicateMatches.map((item) => <li key={item.id}>{item.displayName}</li>)}</ul>
                  <button type="button" className="mt-3 font-semibold underline" onClick={() => createContact.mutate({ value: form, skipDuplicateCheck: true })}>{t("contacts.create_anyway", "Create anyway")}</button>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>{t("common.cancel", "Cancel")}</button>
                <button type="submit" className="btn-primary" disabled={createContact.isPending || form.roles.length === 0}>{createContact.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
