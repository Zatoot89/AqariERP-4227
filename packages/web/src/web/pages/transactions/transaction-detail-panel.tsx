import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, RefreshCw, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProfile } from "../../hooks/use-profile";
import {
  transactionRequest,
  type ContactOption,
  type UnitOption,
} from "../../lib/transaction-client";
import type { WorkspaceKind } from "./create-transaction-modal";

type StateEvent = {
  id: string;
  fromState: string | null;
  toState: string;
  reason: string | null;
  createdAt: number;
};

type Party = {
  id: string;
  contactId: string;
  partyRole: string;
};

type Milestone = {
  id: string;
  name: string;
  amount: number | null;
  dueAt: number | null;
  status: string;
};

type TransactionDetail = {
  id: string;
  status: string;
  viewingNumber?: string;
  offerNumber?: string;
  reservationNumber?: string;
  leaseNumber?: string;
  saleNumber?: string;
  unitId?: string | null;
  propertyId?: string | null;
  contactId?: string;
  buyerContactId?: string;
  sellerContactId?: string | null;
  landlordContactId?: string;
  tenantContactId?: string;
  offeredAmount?: number;
  depositAmount?: number | null;
  rentAmount?: number;
  agreedValue?: number;
  currency?: string;
  scheduledAt?: number;
  startsAt?: number;
  endsAt?: number;
  expiresAt?: number;
  validUntil?: number | null;
  terms?: string | null;
  feedback?: string | null;
  rating?: number | null;
  parties?: Party[];
  events?: StateEvent[];
  milestones?: Milestone[];
  versions?: Array<{ id: string; offerNumber: string; version: number; status: string; offeredAmount: number }>;
  renewals?: Array<{ id: string; leaseNumber: string; status: string; startsAt: number; endsAt: number }>;
};

type TransactionDetailPanelProps = {
  kind: WorkspaceKind;
  id: string | null;
  contacts: ContactOption[];
  units: UnitOption[];
};

const SINGULAR: Record<WorkspaceKind, string> = {
  viewings: "viewing",
  offers: "offer",
  reservations: "reservation",
  leases: "lease",
  sales: "sale",
};

function recordNumber(record: TransactionDetail): string {
  return record.viewingNumber
    ?? record.offerNumber
    ?? record.reservationNumber
    ?? record.leaseNumber
    ?? record.saleNumber
    ?? record.id;
}

function amount(record: TransactionDetail): string {
  const value = record.offeredAmount
    ?? record.rentAmount
    ?? record.agreedValue
    ?? record.depositAmount;
  return value == null ? "—" : `${value.toLocaleString()} ${record.currency ?? ""}`;
}

export function TransactionDetailPanel({
  kind,
  id,
  contacts,
  units,
}: TransactionDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isManager = profile?.role === "admin" || profile?.role === "manager";

  const detailQuery = useQuery({
    queryKey: ["transaction-detail", kind, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const payload = await transactionRequest<Record<string, TransactionDetail>>(`/${kind}/${id}`);
      return payload[SINGULAR[kind]];
    },
  });

  const action = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", kind] }),
        queryClient.invalidateQueries({ queryKey: ["transaction-detail", kind, id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
    },
  });

  const record = detailQuery.data;
  const contactName = (contactId: string | undefined) =>
    contacts.find((contact) => contact.id === contactId)?.displayName ?? contactId ?? "—";
  const unitName = units.find((unit) => unit.id === record?.unitId)?.label ?? record?.unitId ?? "—";

  async function transition(toState: string, reasonRequired = false) {
    const reason = reasonRequired
      ? window.prompt(t("transactions.reason_prompt", "Enter the reason for this action"))
      : undefined;
    if (reasonRequired && !reason) return;
    await transactionRequest(`/${kind}/${id}/transition`, {
      method: "PATCH",
      body: JSON.stringify({ toState, reason: reason || undefined }),
    });
  }

  async function completeViewing(status: "completed" | "cancelled" | "no_show") {
    const feedback = status === "completed"
      ? window.prompt(t("transactions.feedback_prompt", "Viewing feedback")) ?? ""
      : undefined;
    const ratingText = status === "completed"
      ? window.prompt(t("transactions.rating_prompt", "Rating from 1 to 5"), "5")
      : undefined;
    const reason = status === "cancelled"
      ? window.prompt(t("transactions.reason_prompt", "Cancellation reason"))
      : undefined;
    if (status === "cancelled" && !reason) return;
    await transactionRequest(`/viewings/${id}/complete`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        feedback: feedback || undefined,
        rating: ratingText ? Number(ratingText) : undefined,
        reason: reason || undefined,
      }),
    });
  }

  async function createCounter() {
    if (!record) return;
    const amountText = window.prompt(
      t("transactions.counter_amount", "Counteroffer amount"),
      String(record.offeredAmount ?? ""),
    );
    if (!amountText) return;
    await transactionRequest(`/offers/${record.id}/counter`, {
      method: "POST",
      body: JSON.stringify({
        offeredAmount: Number(amountText),
        currency: record.currency,
      }),
    });
  }

  async function renewLease() {
    if (!record?.endsAt) return;
    const suggestedStart = new Date(record.endsAt + 86400000).toISOString().slice(0, 10);
    const suggestedEnd = new Date(record.endsAt + 365 * 86400000).toISOString().slice(0, 10);
    const startsAtText = window.prompt(t("transactions.renewal_start", "Renewal start date (YYYY-MM-DD)"), suggestedStart);
    if (!startsAtText) return;
    const endsAtText = window.prompt(t("transactions.renewal_end", "Renewal end date (YYYY-MM-DD)"), suggestedEnd);
    if (!endsAtText) return;
    const rentText = window.prompt(t("transactions.renewal_rent", "Renewal rent amount"), String(record.rentAmount ?? ""));
    await transactionRequest(`/leases/${record.id}/renew`, {
      method: "POST",
      body: JSON.stringify({
        startsAt: new Date(startsAtText).getTime(),
        endsAt: new Date(endsAtText).getTime(),
        rentAmount: rentText ? Number(rentText) : undefined,
      }),
    });
  }

  async function completeMilestone(milestoneId: string) {
    await transactionRequest(`/sales/${id}/milestones/${milestoneId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
  }

  async function generateDocument(language: "en" | "ar") {
    if (!record || kind === "viewings") return;
    const transactionType = SINGULAR[kind] as "offer" | "reservation" | "lease" | "sale";
    const payload = await transactionRequest<{
      document: { id: string; status: string };
      pdfError?: string;
    }>("/documents/generate", {
      method: "POST",
      body: JSON.stringify({ transactionType, transactionId: record.id, language }),
    });
    window.open(`/api/transactions/documents/${encodeURIComponent(payload.document.id)}/html`, "_blank", "noopener,noreferrer");
  }

  if (!id) {
    return <div className="py-16 text-center text-sm text-gray-400">{t("transactions.select", "Select a transaction to view its lifecycle and actions.")}</div>;
  }
  if (detailQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>;
  }
  if (!record) {
    return <div className="py-16 text-center text-sm text-red-500">{t("common.not_found", "Record not found")}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{recordNumber(record)}</h2>
            <span className="badge bg-blue-100 text-blue-700">{record.status}</span>
          </div>
          <p className="mt-1 text-sm text-gray-400">{unitName}</p>
        </div>
        {kind !== "viewings" && (
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex items-center gap-1" onClick={() => action.mutate(() => generateDocument("en"))}><FileText size={14} /> EN</button>
            <button type="button" className="btn-outline flex items-center gap-1" onClick={() => action.mutate(() => generateDocument("ar"))}><FileText size={14} /> عربي</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Summary label={t("transactions.amount", "Amount")} value={amount(record)} />
        <Summary label={t("transactions.primary_party", "Primary party")} value={contactName(record.contactId ?? record.buyerContactId ?? record.landlordContactId)} />
        <Summary label={t("transactions.secondary_party", "Secondary party")} value={contactName(record.sellerContactId ?? record.tenantContactId)} />
        <Summary label={t("transactions.status", "Status")} value={record.status} />
      </div>

      <ActionBar
        kind={kind}
        status={record.status}
        isManager={isManager}
        busy={action.isPending}
        onAction={(operation) => action.mutate(operation)}
        transition={transition}
        completeViewing={completeViewing}
        createCounter={createCounter}
        renewLease={renewLease}
      />

      {action.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{action.error.message}</p>}

      {record.milestones && record.milestones.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">{t("transactions.milestones", "Sale milestones")}</h3>
          <div className="space-y-2">
            {record.milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{milestone.name}</p>
                  <p className="text-xs text-gray-400">{milestone.amount?.toLocaleString() ?? "—"} · {milestone.dueAt ? new Date(milestone.dueAt).toLocaleDateString() : "—"}</p>
                </div>
                {milestone.status === "pending" ? (
                  <button type="button" className="btn-outline flex items-center gap-1" onClick={() => action.mutate(() => completeMilestone(milestone.id))}><CheckCircle2 size={14} /> {t("common.complete", "Complete")}</button>
                ) : <span className="badge bg-green-100 text-green-700">{milestone.status}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {record.versions && record.versions.length > 1 && (
        <section>
          <h3 className="mb-2 font-semibold">{t("transactions.negotiation_history", "Negotiation versions")}</h3>
          <div className="space-y-2">{record.versions.map((version) => <div key={version.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>v{version.version} · {version.offerNumber}</span><span>{version.offeredAmount.toLocaleString()} · {version.status}</span></div>)}</div>
        </section>
      )}

      {record.renewals && record.renewals.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">{t("transactions.renewals", "Renewals")}</h3>
          <div className="space-y-2">{record.renewals.map((renewal) => <div key={renewal.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><div className="flex justify-between"><strong>{renewal.leaseNumber}</strong><span>{renewal.status}</span></div><p className="text-xs text-gray-400">{new Date(renewal.startsAt).toLocaleDateString()} — {new Date(renewal.endsAt).toLocaleDateString()}</p></div>)}</div>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-semibold">{t("transactions.lifecycle", "Lifecycle history")}</h3>
        <div className="space-y-2">
          {(record.events ?? []).map((event) => (
            <div key={event.id} className="rounded-lg border-s-2 border-blue-300 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3"><span>{event.fromState ?? "created"} → <strong>{event.toState}</strong></span><span className="text-xs text-gray-400">{new Date(event.createdAt).toLocaleString()}</span></div>
              {event.reason && <p className="mt-1 text-xs text-gray-500">{event.reason}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>;
}

type ActionBarProps = {
  kind: WorkspaceKind;
  status: string;
  isManager: boolean;
  busy: boolean;
  onAction: (operation: () => Promise<unknown>) => void;
  transition: (toState: string, reasonRequired?: boolean) => Promise<void>;
  completeViewing: (status: "completed" | "cancelled" | "no_show") => Promise<void>;
  createCounter: () => Promise<void>;
  renewLease: () => Promise<void>;
};

function ActionBar(props: ActionBarProps) {
  const { t } = useTranslation();
  const buttons: Array<{ label: string; operation: () => Promise<unknown>; danger?: boolean; icon?: "refresh" | "check" | "x" }> = [];
  const addTransition = (label: string, state: string, manager = false, reason = false, danger = false) => {
    if (!manager || props.isManager) buttons.push({ label, operation: () => props.transition(state, reason), danger, icon: danger ? "x" : "check" });
  };

  if (props.kind === "viewings" && props.status === "scheduled") {
    buttons.push(
      { label: t("transactions.complete_viewing", "Complete"), operation: () => props.completeViewing("completed"), icon: "check" },
      { label: t("transactions.no_show", "No show"), operation: () => props.completeViewing("no_show"), icon: "x" },
      { label: t("common.cancel", "Cancel"), operation: () => props.completeViewing("cancelled"), danger: true, icon: "x" },
    );
  }
  if (props.kind === "offers") {
    if (props.status === "draft") addTransition(t("transactions.submit", "Submit"), "submitted");
    if (["submitted", "under_review", "countered"].includes(props.status)) {
      buttons.push({ label: t("transactions.counter", "Counter"), operation: props.createCounter, icon: "refresh" });
      addTransition(t("transactions.accept", "Accept"), "accepted", true);
      addTransition(t("transactions.reject", "Reject"), "rejected", true, true, true);
      addTransition(t("transactions.withdraw", "Withdraw"), "withdrawn", false, true, true);
    }
  }
  if (props.kind === "reservations") {
    if (props.status === "draft") {
      addTransition(t("transactions.activate", "Activate"), "active", true);
      addTransition(t("common.cancel", "Cancel"), "cancelled", true, true, true);
    }
    if (props.status === "active") {
      addTransition(t("transactions.release", "Release"), "released", true, true, true);
      addTransition(t("transactions.expire", "Expire"), "expired", true);
    }
  }
  if (props.kind === "leases") {
    if (props.status === "draft") addTransition(t("transactions.request_approval", "Request approval"), "pending_approval");
    if (props.status === "pending_approval") {
      addTransition(t("transactions.approve_activate", "Approve & activate"), "active", true);
      addTransition(t("transactions.reject", "Reject"), "rejected", true, true, true);
    }
    if (["active", "renewal_due"].includes(props.status) && props.isManager) {
      buttons.push({ label: t("transactions.renew", "Renew"), operation: props.renewLease, icon: "refresh" });
      if (props.status === "active") addTransition(t("transactions.mark_renewal_due", "Mark renewal due"), "renewal_due", true);
      addTransition(t("transactions.terminate", "Terminate"), "terminated", true, true, true);
      if (props.status === "active") addTransition(t("transactions.complete", "Complete"), "completed", true);
    }
  }
  if (props.kind === "sales") {
    if (props.status === "draft") addTransition(t("transactions.request_approval", "Request approval"), "pending_approval");
    if (props.status === "pending_approval") {
      addTransition(t("transactions.approve_activate", "Approve & activate"), "active", true);
      addTransition(t("transactions.reject", "Reject"), "rejected", true, true, true);
    }
    if (props.status === "active") {
      addTransition(t("transactions.complete_handover", "Complete & hand over"), "completed", true);
      addTransition(t("transactions.terminate", "Terminate"), "terminated", true, true, true);
      addTransition(t("common.cancel", "Cancel"), "cancelled", true, true, true);
    }
  }

  if (buttons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-gray-100 p-3">
      {buttons.map((button) => (
        <button
          type="button"
          key={button.label}
          disabled={props.busy}
          onClick={() => props.onAction(button.operation)}
          className={button.danger ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100" : "btn-outline flex items-center gap-1"}
        >
          {button.icon === "refresh" ? <RefreshCw size={14} /> : button.icon === "x" ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
          {button.label}
        </button>
      ))}
    </div>
  );
}
