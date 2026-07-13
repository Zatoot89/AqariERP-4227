import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  transactionRequest,
  type ContactOption,
  type UnitOption,
} from "../../lib/transaction-client";

export type WorkspaceKind = "viewings" | "offers" | "reservations" | "leases" | "sales";

type CreateTransactionModalProps = {
  kind: WorkspaceKind;
  contacts: ContactOption[];
  units: UnitOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
};

type FormState = {
  unitId: string;
  primaryContactId: string;
  secondaryContactId: string;
  amount: string;
  depositAmount: string;
  currency: string;
  scheduledAt: string;
  startsAt: string;
  endsAt: string;
  validUntil: string;
  terms: string;
  noticeDays: string;
  rentFrequency: "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
  milestoneName: string;
  milestoneAmount: string;
  milestoneDueAt: string;
};

function localDateTime(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function selectedCurrency(units: UnitOption[], unitId: string, fallback: string): string {
  return units.find((unit) => unit.id === unitId)?.currency ?? fallback;
}

export function CreateTransactionModal({
  kind,
  contacts,
  units,
  onClose,
  onCreated,
}: CreateTransactionModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({
    unitId: "",
    primaryContactId: "",
    secondaryContactId: "",
    amount: "",
    depositAmount: "",
    currency: "AED",
    scheduledAt: localDateTime(1),
    startsAt: localDateTime(1),
    endsAt: localDateTime(kind === "leases" ? 366 : 4),
    validUntil: localDateTime(7),
    terms: "",
    noticeDays: "30",
    rentFrequency: "annual",
    milestoneName: "",
    milestoneAmount: "",
    milestoneDueAt: localDateTime(30),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const currency = selectedCurrency(units, form.unitId, form.currency);
      if (kind === "viewings") {
        const payload = await transactionRequest<{ viewing: { id: string } }>("/viewings", {
          method: "POST",
          body: JSON.stringify({
            unitId: form.unitId,
            contactId: form.primaryContactId,
            scheduledAt: timestamp(form.scheduledAt),
          }),
        });
        return payload.viewing.id;
      }
      if (kind === "offers") {
        const payload = await transactionRequest<{ offer: { id: string } }>("/offers", {
          method: "POST",
          body: JSON.stringify({
            unitId: form.unitId,
            buyerContactId: form.primaryContactId,
            sellerContactId: form.secondaryContactId || undefined,
            offeredAmount: Number(form.amount),
            currency,
            validUntil: form.validUntil ? timestamp(form.validUntil) : null,
            terms: form.terms ? { notes: form.terms } : undefined,
          }),
        });
        return payload.offer.id;
      }
      if (kind === "reservations") {
        const payload = await transactionRequest<{ reservation: { id: string } }>("/reservations", {
          method: "POST",
          body: JSON.stringify({
            unitId: form.unitId,
            contactId: form.primaryContactId,
            startsAt: timestamp(form.startsAt),
            expiresAt: timestamp(form.endsAt),
            depositAmount: form.depositAmount ? Number(form.depositAmount) : null,
            currency,
            notes: form.terms || null,
          }),
        });
        return payload.reservation.id;
      }
      if (kind === "leases") {
        const payload = await transactionRequest<{ lease: { id: string } }>("/leases", {
          method: "POST",
          body: JSON.stringify({
            unitId: form.unitId,
            landlordContactId: form.primaryContactId,
            tenantContactId: form.secondaryContactId,
            startsAt: timestamp(form.startsAt),
            endsAt: timestamp(form.endsAt),
            noticeDays: Number(form.noticeDays),
            rentAmount: Number(form.amount),
            rentFrequency: form.rentFrequency,
            securityDeposit: form.depositAmount ? Number(form.depositAmount) : null,
            currency,
            terms: form.terms ? { notes: form.terms } : undefined,
          }),
        });
        return payload.lease.id;
      }
      const milestones = form.milestoneName
        ? [{
            name: form.milestoneName,
            amount: form.milestoneAmount ? Number(form.milestoneAmount) : null,
            dueAt: form.milestoneDueAt ? timestamp(form.milestoneDueAt) : null,
          }]
        : undefined;
      const payload = await transactionRequest<{ sale: { id: string } }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          unitId: form.unitId,
          buyerContactId: form.primaryContactId,
          sellerContactId: form.secondaryContactId,
          agreedValue: Number(form.amount),
          depositAmount: form.depositAmount ? Number(form.depositAmount) : null,
          currency,
          agreementAt: Date.now(),
          expectedHandoverAt: form.endsAt ? timestamp(form.endsAt) : null,
          terms: form.terms ? { notes: form.terms } : undefined,
          milestones,
        }),
      });
      return payload.sale.id;
    },
    onSuccess: onCreated,
  });

  const title = {
    viewings: t("transactions.new_viewing", "Schedule viewing"),
    offers: t("transactions.new_offer", "Create offer"),
    reservations: t("transactions.new_reservation", "Create reservation"),
    leases: t("transactions.new_lease", "Create lease"),
    sales: t("transactions.new_sale", "Create sale"),
  }[kind];

  const primaryLabel = {
    viewings: t("transactions.client", "Client"),
    offers: t("transactions.buyer", "Buyer"),
    reservations: t("transactions.reserving_contact", "Reserving contact"),
    leases: t("transactions.landlord", "Landlord"),
    sales: t("transactions.buyer", "Buyer"),
  }[kind];
  const secondaryLabel = kind === "leases"
    ? t("transactions.tenant", "Tenant")
    : kind === "sales" || kind === "offers"
      ? t("transactions.seller", "Seller")
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-gray-400">{t("transactions.number_help", "A permanent agency document number is assigned when you save.")}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-gray-100"
            aria-label={t("common.close", "Close")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{t("transactions.unit", "Unit")} *</span>
            <select
              className="select"
              required
              value={form.unitId}
              onChange={(event) => setForm((value) => ({
                ...value,
                unitId: event.target.value,
                currency: selectedCurrency(units, event.target.value, value.currency),
              }))}
            >
              <option value="">{t("transactions.select_unit", "Select unit")}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id} disabled={unit.status === "sold"}>
                  {unit.label} · {unit.status}
                </option>
              ))}
            </select>
          </label>

          <div className={`grid gap-3 ${secondaryLabel ? "sm:grid-cols-2" : ""}`}>
            <label className="space-y-1 text-sm">
              <span>{primaryLabel} *</span>
              <select
                className="select"
                required
                value={form.primaryContactId}
                onChange={(event) => setForm((value) => ({ ...value, primaryContactId: event.target.value }))}
              >
                <option value="">{t("transactions.select_contact", "Select contact")}</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
              </select>
            </label>
            {secondaryLabel && (
              <label className="space-y-1 text-sm">
                <span>{secondaryLabel} {kind === "offers" ? "" : "*"}</span>
                <select
                  className="select"
                  required={kind !== "offers"}
                  value={form.secondaryContactId}
                  onChange={(event) => setForm((value) => ({ ...value, secondaryContactId: event.target.value }))}
                >
                  <option value="">{t("transactions.select_contact", "Select contact")}</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
                </select>
              </label>
            )}
          </div>

          {kind === "viewings" && (
            <label className="block space-y-1 text-sm">
              <span>{t("transactions.scheduled_at", "Scheduled at")} *</span>
              <input className="input" type="datetime-local" required value={form.scheduledAt} onChange={(event) => setForm((value) => ({ ...value, scheduledAt: event.target.value }))} />
            </label>
          )}

          {kind === "offers" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_110px_1fr]">
              <MoneyField label={t("transactions.offer_amount", "Offer amount")} value={form.amount} onChange={(amount) => setForm((value) => ({ ...value, amount }))} />
              <CurrencyField value={form.currency} onChange={(currency) => setForm((value) => ({ ...value, currency }))} />
              <label className="space-y-1 text-sm"><span>{t("transactions.valid_until", "Valid until")}</span><input className="input" type="datetime-local" value={form.validUntil} onChange={(event) => setForm((value) => ({ ...value, validUntil: event.target.value }))} /></label>
            </div>
          )}

          {kind === "reservations" && (
            <>
              <DateRangeFields form={form} setForm={setForm} endLabel={t("transactions.expires_at", "Expires at")} />
              <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                <MoneyField label={t("transactions.deposit", "Deposit")} required={false} value={form.depositAmount} onChange={(depositAmount) => setForm((value) => ({ ...value, depositAmount }))} />
                <CurrencyField value={form.currency} onChange={(currency) => setForm((value) => ({ ...value, currency }))} />
              </div>
            </>
          )}

          {kind === "leases" && (
            <>
              <DateRangeFields form={form} setForm={setForm} endLabel={t("transactions.ends_at", "Ends at")} />
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_110px]">
                <MoneyField label={t("transactions.rent_amount", "Rent amount")} value={form.amount} onChange={(amount) => setForm((value) => ({ ...value, amount }))} />
                <label className="space-y-1 text-sm"><span>{t("transactions.frequency", "Frequency")}</span><select className="select" value={form.rentFrequency} onChange={(event) => setForm((value) => ({ ...value, rentFrequency: event.target.value as FormState["rentFrequency"] }))}><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="semiannual">semiannual</option><option value="annual">annual</option><option value="custom">custom</option></select></label>
                <CurrencyField value={form.currency} onChange={(currency) => setForm((value) => ({ ...value, currency }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MoneyField label={t("transactions.security_deposit", "Security deposit")} required={false} value={form.depositAmount} onChange={(depositAmount) => setForm((value) => ({ ...value, depositAmount }))} />
                <label className="space-y-1 text-sm"><span>{t("transactions.notice_days", "Notice days")}</span><input className="input" type="number" min="0" required value={form.noticeDays} onChange={(event) => setForm((value) => ({ ...value, noticeDays: event.target.value }))} /></label>
              </div>
            </>
          )}

          {kind === "sales" && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
                <MoneyField label={t("transactions.agreed_value", "Agreed value")} value={form.amount} onChange={(amount) => setForm((value) => ({ ...value, amount }))} />
                <MoneyField label={t("transactions.deposit", "Deposit")} required={false} value={form.depositAmount} onChange={(depositAmount) => setForm((value) => ({ ...value, depositAmount }))} />
                <CurrencyField value={form.currency} onChange={(currency) => setForm((value) => ({ ...value, currency }))} />
              </div>
              <label className="block space-y-1 text-sm"><span>{t("transactions.expected_handover", "Expected handover")}</span><input className="input" type="datetime-local" value={form.endsAt} onChange={(event) => setForm((value) => ({ ...value, endsAt: event.target.value }))} /></label>
              <fieldset className="rounded-xl border border-gray-100 p-3">
                <legend className="px-2 text-sm font-medium">{t("transactions.first_milestone", "Optional first milestone")}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-sm"><span>{t("transactions.milestone_name", "Name")}</span><input className="input" value={form.milestoneName} onChange={(event) => setForm((value) => ({ ...value, milestoneName: event.target.value }))} /></label>
                  <MoneyField label={t("transactions.milestone_amount", "Amount")} required={false} value={form.milestoneAmount} onChange={(milestoneAmount) => setForm((value) => ({ ...value, milestoneAmount }))} />
                  <label className="space-y-1 text-sm"><span>{t("transactions.due_at", "Due at")}</span><input className="input" type="datetime-local" value={form.milestoneDueAt} onChange={(event) => setForm((value) => ({ ...value, milestoneDueAt: event.target.value }))} /></label>
                </div>
              </fieldset>
            </>
          )}

          {kind !== "viewings" && (
            <label className="block space-y-1 text-sm">
              <span>{t("transactions.terms", "Terms / notes")}</span>
              <textarea className="input min-h-20" value={form.terms} onChange={(event) => setForm((value) => ({ ...value, terms: event.target.value }))} />
            </label>
          )}

          {mutation.error && <p className="text-sm text-red-500">{mutation.error.message}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-outline" onClick={onClose}>{t("common.cancel", "Cancel")}</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? t("common.loading", "Loading…") : t("common.create", "Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>{label}{required ? " *" : ""}</span>
      <input className="input" type="number" min="0" step="0.01" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CurrencyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm">
      <span>Currency</span>
      <input className="input" maxLength={3} required value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
    </label>
  );
}

function DateRangeFields({
  form,
  setForm,
  endLabel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  endLabel: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm"><span>Starts at *</span><input className="input" type="datetime-local" required value={form.startsAt} onChange={(event) => setForm((value) => ({ ...value, startsAt: event.target.value }))} /></label>
      <label className="space-y-1 text-sm"><span>{endLabel} *</span><input className="input" type="datetime-local" required value={form.endsAt} onChange={(event) => setForm((value) => ({ ...value, endsAt: event.target.value }))} /></label>
    </div>
  );
}
