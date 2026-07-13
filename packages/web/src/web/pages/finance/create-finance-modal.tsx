import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  financeRequest,
  type FinanceContact,
  type FinanceProfile,
  type FinanceSource,
  type FinanceUnit,
} from "../../lib/finance-client";

export type FinanceCreateKind = "schedule" | "invoice" | "receipt" | "expense" | "commission";

type Props = {
  kind: FinanceCreateKind;
  contacts: FinanceContact[];
  units: FinanceUnit[];
  profiles: FinanceProfile[];
  sources: FinanceSource[];
  onClose: () => void;
  onCreated: () => void;
};

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  contactId: string;
  balanceDue: number;
  currency: string;
  status: string;
};

type ScheduleOption = {
  id: string;
  scheduleNumber: string;
  payerContactId: string;
  currency: string;
  status: string;
};

type ScheduleItem = { id: string; label: string; amount: number; dueAt: number; status: string };

function localDate(days = 0): string {
  const date = new Date(Date.now() + days * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function CreateFinanceModal({
  kind,
  contacts,
  units,
  profiles,
  sources,
  onClose,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [scheduleItemId, setScheduleItemId] = useState("");
  const [contactId, setContactId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [currency, setCurrency] = useState("AED");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("maintenance");
  const [date, setDate] = useState(localDate());
  const [dueDate, setDueDate] = useState(localDate(30));
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [basisType, setBasisType] = useState<"fixed" | "percentage">("percentage");
  const [basisValue, setBasisValue] = useState("2");
  const [recipientProfileId, setRecipientProfileId] = useState("");

  const eligibleSources = useMemo(
    () => sources.filter((source) => ["active", "completed", "renewal_due", "renewed"].includes(source.status)),
    [sources],
  );
  const selectedSource = eligibleSources.find((source) => source.id === sourceId);

  useEffect(() => {
    if (!selectedSource) return;
    setContactId(selectedSource.payerContactId);
    setCurrency(selectedSource.currency);
    setAmount(String(selectedSource.amount));
    setUnitId(selectedSource.unitId ?? "");
  }, [selectedSource]);

  const invoiceQuery = useQuery({
    queryKey: ["finance-create-invoices"],
    enabled: kind === "receipt",
    queryFn: async () => {
      const statuses = ["issued", "partially_paid", "overdue"];
      const groups = await Promise.all(statuses.map((status) =>
        financeRequest<{ invoices: InvoiceOption[] }>(`/invoices?status=${status}&page=1&pageSize=200`),
      ));
      return groups.flatMap((group) => group.invoices);
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ["finance-create-schedules"],
    enabled: kind === "invoice",
    queryFn: () => financeRequest<{ schedules: ScheduleOption[] }>("/schedules?status=active&page=1&pageSize=200"),
  });

  const scheduleDetailQuery = useQuery({
    queryKey: ["finance-create-schedule", scheduleId],
    enabled: kind === "invoice" && Boolean(scheduleId),
    queryFn: () => financeRequest<{ schedule: ScheduleOption & { items: ScheduleItem[] } }>(`/schedules/${scheduleId}`),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === "schedule") {
        if (!selectedSource) throw new Error("Select an eligible lease or sale");
        return financeRequest("/schedules/generate", {
          method: "POST",
          body: JSON.stringify({ sourceType: selectedSource.type, sourceId: selectedSource.id }),
        });
      }
      if (kind === "invoice") {
        if (scheduleItemId) {
          return financeRequest(`/invoices/from-schedule-item/${scheduleItemId}`, { method: "POST" });
        }
        return financeRequest("/invoices", {
          method: "POST",
          body: JSON.stringify({
            contactId,
            sourceType: "manual",
            unitId: unitId || undefined,
            issueDate: new Date(date).getTime(),
            dueAt: new Date(dueDate).getTime(),
            discountAmount: 0,
            currency,
            notes: description || null,
            lines: [{ description: description || "Real estate service", quantity: 1, unitPrice: Number(amount), taxRate: Number(taxAmount) }],
          }),
        });
      }
      if (kind === "receipt") {
        const selectedInvoice = invoiceQuery.data?.find((invoice) => invoice.id === invoiceId);
        return financeRequest("/receipts", {
          method: "POST",
          body: JSON.stringify({
            contactId: selectedInvoice?.contactId ?? contactId,
            paymentDate: new Date(date).getTime(),
            amount: Number(amount),
            currency: selectedInvoice?.currency ?? currency,
            paymentMethod,
            externalReference: reference || null,
            notes: description || null,
            allocations: selectedInvoice ? [{ invoiceId: selectedInvoice.id, amount: Number(amount) }] : undefined,
          }),
        });
      }
      if (kind === "expense") {
        return financeRequest("/expenses", {
          method: "POST",
          body: JSON.stringify({
            category,
            unitId: unitId || undefined,
            description: description || "Expense",
            incurredAt: new Date(date).getTime(),
            dueAt: dueDate ? new Date(dueDate).getTime() : null,
            subtotal: Number(amount),
            taxAmount: Number(taxAmount),
            currency,
          }),
        });
      }
      if (!selectedSource) throw new Error("Select an eligible lease or sale");
      if (!recipientProfileId) throw new Error("Select a commission recipient");
      return financeRequest("/commissions", {
        method: "POST",
        body: JSON.stringify({
          transactionType: selectedSource.type,
          transactionId: selectedSource.id,
          basisType,
          basisValue: Number(basisValue),
          currency: selectedSource.currency,
          notes: description || null,
          splits: [{
            recipientType: "profile",
            recipientProfileId,
            splitType: "percentage",
            splitValue: 100,
          }],
        }),
      });
    },
    onSuccess: onCreated,
  });

  const title = {
    schedule: t("finance.new_schedule", "Generate payment schedule"),
    invoice: t("finance.new_invoice", "Create invoice"),
    receipt: t("finance.new_receipt", "Post receipt"),
    expense: t("finance.new_expense", "Record expense"),
    commission: t("finance.new_commission", "Create commission"),
  }[kind];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-xs text-gray-400">{t("finance.number_notice", "The permanent document number is assigned when saved.")}</p></div>
          <button type="button" className="rounded-lg p-2 hover:bg-gray-100" aria-label={t("common.close", "Close")} onClick={onClose}><X size={18} /></button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          {(kind === "schedule" || kind === "commission") && (
            <Field label={t("finance.source_transaction", "Source lease or sale")}>
              <select className="select" required value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">{t("finance.select_source", "Select source")}</option>
                {eligibleSources.map((source) => <option key={`${source.type}-${source.id}`} value={source.id}>{source.number} · {source.type} · {source.status}</option>)}
              </select>
            </Field>
          )}

          {kind === "invoice" && (
            <>
              <Field label={t("finance.active_schedule", "Active schedule (optional)")}>
                <select className="select" value={scheduleId} onChange={(event) => { setScheduleId(event.target.value); setScheduleItemId(""); }}>
                  <option value="">{t("finance.manual_invoice", "Manual invoice")}</option>
                  {(scheduleQuery.data?.schedules ?? []).map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.scheduleNumber} · {schedule.currency}</option>)}
                </select>
              </Field>
              {scheduleId && <Field label={t("finance.schedule_item", "Schedule installment")}><select className="select" required value={scheduleItemId} onChange={(event) => setScheduleItemId(event.target.value)}><option value="">{t("finance.select_installment", "Select installment")}</option>{(scheduleDetailQuery.data?.schedule.items ?? []).filter((item) => item.status !== "paid").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.amount.toLocaleString()} · {new Date(item.dueAt).toLocaleDateString()}</option>)}</select></Field>}
            </>
          )}

          {kind === "receipt" && (
            <Field label={t("finance.allocate_invoice", "Allocate to invoice (optional)")}>
              <select className="select" value={invoiceId} onChange={(event) => {
                const id = event.target.value;
                const invoice = invoiceQuery.data?.find((item) => item.id === id);
                setInvoiceId(id);
                if (invoice) { setContactId(invoice.contactId); setAmount(String(invoice.balanceDue)); setCurrency(invoice.currency); }
              }}>
                <option value="">{t("finance.unallocated_receipt", "Leave unallocated")}</option>
                {(invoiceQuery.data ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.balanceDue.toLocaleString()} {invoice.currency}</option>)}
              </select>
            </Field>
          )}

          {(kind === "invoice" && !scheduleItemId) || (kind === "receipt" && !invoiceId) ? (
            <Field label={t("finance.contact", "Contact")}><select className="select" required value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">{t("finance.select_contact", "Select contact")}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></Field>
          ) : null}

          {(kind === "invoice" && !scheduleItemId) || kind === "expense" ? (
            <Field label={t("finance.unit_optional", "Unit (optional)")}><select className="select" value={unitId} onChange={(event) => { const id = event.target.value; setUnitId(id); const unit = units.find((item) => item.id === id); if (unit) setCurrency(unit.currency); }}><option value="">—</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></Field>
          ) : null}

          {kind === "commission" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("finance.commission_basis", "Commission basis")}><select className="select" value={basisType} onChange={(event) => setBasisType(event.target.value as "fixed" | "percentage")}><option value="percentage">percentage</option><option value="fixed">fixed</option></select></Field>
                <Field label={basisType === "percentage" ? t("finance.percentage", "Percentage") : t("finance.fixed_amount", "Fixed amount")}><input className="input" type="number" min="0" step="0.01" required value={basisValue} onChange={(event) => setBasisValue(event.target.value)} /></Field>
              </div>
              <Field label={t("finance.recipient", "Commission recipient")}><select className="select" required value={recipientProfileId} onChange={(event) => setRecipientProfileId(event.target.value)}><option value="">{t("finance.select_staff", "Select staff")}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.role}</option>)}</select></Field>
            </>
          )}

          {kind === "expense" && <Field label={t("finance.category", "Category")}><input className="input" required value={category} onChange={(event) => setCategory(event.target.value)} /></Field>}

          {kind !== "schedule" && kind !== "commission" && !(kind === "invoice" && scheduleItemId) && (
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <Field label={kind === "receipt" ? t("finance.receipt_amount", "Receipt amount") : kind === "expense" ? t("finance.subtotal", "Subtotal") : t("finance.amount", "Amount")}><input className="input" type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
              <Field label={t("finance.currency", "Currency")}><input className="input" required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></Field>
            </div>
          )}

          {(kind === "invoice" && !scheduleItemId) || kind === "expense" ? <Field label={t("finance.tax_rate_or_amount", kind === "invoice" ? "Tax rate %" : "Tax amount")}><input className="input" type="number" min="0" step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} /></Field> : null}

          {kind === "receipt" && <Field label={t("finance.payment_method", "Payment method")}><select className="select" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="bank_transfer">bank transfer</option><option value="cash">cash</option><option value="card">card</option><option value="cheque">cheque</option><option value="online">online</option><option value="other">other</option></select></Field>}

          {kind === "invoice" && !scheduleItemId ? <div className="grid gap-3 sm:grid-cols-2"><DateField label={t("finance.issue_date", "Issue date")} value={date} setValue={setDate} /><DateField label={t("finance.due_date", "Due date")} value={dueDate} setValue={setDueDate} /></div> : null}
          {kind === "receipt" || kind === "expense" ? <DateField label={kind === "receipt" ? t("finance.payment_date", "Payment date") : t("finance.incurred_date", "Incurred date")} value={date} setValue={setDate} /> : null}

          {kind === "receipt" && <Field label={t("finance.reference", "Reference")}><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} /></Field>}
          {kind !== "schedule" && <Field label={t("finance.description_notes", "Description / notes")}><textarea className="input min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>}

          {mutation.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{mutation.error.message}</p>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-outline" onClick={onClose}>{t("common.cancel", "Cancel")}</button><button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}</button></div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm"><span>{label}</span>{children}</label>;
}

function DateField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <Field label={label}><input className="input" type="date" required value={value} onChange={(event) => setValue(event.target.value)} /></Field>;
}
