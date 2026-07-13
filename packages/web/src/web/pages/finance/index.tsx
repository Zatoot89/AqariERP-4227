import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProfile } from "../../hooks/use-profile";
import {
  downloadFinanceCsv,
  financeRequest,
  loadFinanceOptions,
} from "../../lib/finance-client";
import {
  CreateFinanceModal,
  type FinanceCreateKind,
} from "./create-finance-modal";

type FinanceTab = "overview" | "schedules" | "invoices" | "receipts" | "expenses" | "commissions";

type FinanceRow = {
  id: string;
  status: string;
  scheduleNumber?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  expenseNumber?: string;
  commissionNumber?: string;
  payerContactId?: string;
  contactId?: string;
  vendorContactId?: string | null;
  transactionType?: string;
  transactionId?: string;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  amount?: number;
  allocatedAmount?: number;
  grossCommission?: number;
  approvedAmount?: number | null;
  currency?: string;
  issueDate?: number;
  dueAt?: number | null;
  paymentDate?: number;
  incurredAt?: number;
  createdAt?: number;
  description?: string | null;
  category?: string;
};

type ScheduleDetail = FinanceRow & {
  items: Array<{ id: string; label: string; dueAt: number; amount: number; paidAmount: number; status: string }>;
};

type InvoiceDetail = FinanceRow & {
  lines: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTax: number; lineTotal: number }>;
  allocations: Array<{ id: string; receiptNumber: string; amount: number; status: string; allocatedAt: number }>;
};

type ReceiptDetail = FinanceRow & {
  allocations: Array<{ id: string; invoiceNumber: string; amount: number; status: string; allocatedAt: number; reversalReason?: string | null }>;
};

type CommissionDetail = FinanceRow & {
  splits: Array<{
    id: string;
    recipientType: string;
    recipientProfileId?: string | null;
    recipientContactId?: string | null;
    amount: number;
    paidAmount: number;
    status: string;
  }>;
  payouts: Array<{ id: string; splitId: string; amount: number; status: string; paymentDate: number }>;
};

type OverviewPayload = {
  totals: Record<string, Record<string, number>>;
  counts: {
    invoices: number;
    overdueInvoices: number;
    receipts: number;
    pendingExpenses: number;
    pendingCommissions: number;
    activeSchedules: number;
  };
};

type AgingPayload = {
  buckets: Record<string, Record<string, number>>;
  invoices: Array<{ invoiceNumber: string; overdueDays: number; balanceDue: number; currency: string }>;
};

const TABS: Array<{ key: FinanceTab; label: string; icon: typeof Landmark }> = [
  { key: "overview", label: "Overview", icon: Landmark },
  { key: "schedules", label: "Schedules", icon: FileSpreadsheet },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "receipts", label: "Receipts", icon: ReceiptText },
  { key: "expenses", label: "Expenses", icon: WalletCards },
  { key: "commissions", label: "Commissions", icon: CircleDollarSign },
];

const CREATE_KIND: Partial<Record<FinanceTab, FinanceCreateKind>> = {
  schedules: "schedule",
  invoices: "invoice",
  receipts: "receipt",
  expenses: "expense",
  commissions: "commission",
};

function numberFor(row: FinanceRow): string {
  return row.scheduleNumber
    ?? row.invoiceNumber
    ?? row.receiptNumber
    ?? row.expenseNumber
    ?? row.commissionNumber
    ?? row.id;
}

function amountFor(row: FinanceRow): number | undefined {
  return row.totalAmount ?? row.amount ?? row.grossCommission;
}

function dateFor(row: FinanceRow): number | undefined {
  return row.issueDate ?? row.paymentDate ?? row.incurredAt ?? row.dueAt ?? row.createdAt;
}

function currencySummary(values: Record<string, number> | undefined): string {
  if (!values || Object.keys(values).length === 0) return "—";
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => `${value.toLocaleString()} ${currency}`)
    .join(" · ");
}

export default function FinancePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isManager = profile?.role === "admin" || profile?.role === "manager";
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<FinanceCreateKind | null>(null);

  useEffect(() => {
    setStatus("");
    setSearch("");
    setSelectedId(null);
  }, [tab]);

  const optionsQuery = useQuery({
    queryKey: ["finance-options"],
    queryFn: loadFinanceOptions,
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ["finance-list", tab, status],
    enabled: tab !== "overview",
    queryFn: async () => {
      const query = new URLSearchParams({ page: "1", pageSize: "150" });
      if (status) query.set("status", status);
      const payload = await financeRequest<Record<string, FinanceRow[]>>(`/${tab}?${query.toString()}`);
      return payload[tab] ?? [];
    },
  });

  const overviewQuery = useQuery({
    queryKey: ["finance-overview"],
    enabled: tab === "overview" && isManager,
    queryFn: () => financeRequest<OverviewPayload>("/reports/overview"),
  });
  const agingQuery = useQuery({
    queryKey: ["finance-aging"],
    enabled: tab === "overview" && isManager,
    queryFn: () => financeRequest<AgingPayload>("/reports/aging"),
  });

  const detailQuery = useQuery({
    queryKey: ["finance-detail", tab, selectedId],
    enabled: tab !== "overview" && Boolean(selectedId),
    queryFn: async () => {
      const payload = await financeRequest<Record<string, FinanceRow>>(`/${tab}/${selectedId}`);
      return payload[singular(tab)];
    },
  });

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-list", tab] }),
        queryClient.invalidateQueries({ queryKey: ["finance-detail", tab, selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["finance-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-aging"] }),
      ]);
    },
  });

  const options = optionsQuery.data ?? { contacts: [], properties: [], units: [], profiles: [], sources: [] };
  const contactName = (id: string | null | undefined) =>
    options.contacts.find((contact) => contact.id === id)?.displayName ?? id ?? "—";
  const normalized = search.trim().toLowerCase();
  const rows = useMemo(() => (listQuery.data ?? []).filter((row) => {
    if (!normalized) return true;
    return [
      numberFor(row),
      row.status,
      row.description,
      row.category,
      contactName(row.contactId ?? row.payerContactId ?? row.vendorContactId),
    ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
  }), [contactName, listQuery.data, normalized]);

  async function transition(path: string, toState: string, reasonRequired = false, extra: Record<string, unknown> = {}) {
    const reason = reasonRequired
      ? window.prompt(t("finance.reason_prompt", "Enter a reason for this action"))
      : undefined;
    if (reasonRequired && !reason) return;
    await financeRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ toState, reason: reason || undefined, ...extra }),
    });
  }

  async function createInvoiceFromItem(itemId: string) {
    const payload = await financeRequest<{ invoice: { id: string } }>(`/invoices/from-schedule-item/${itemId}`, { method: "POST" });
    setTab("invoices");
    setSelectedId(payload.invoice.id);
  }

  async function postCommissionPayout(split: CommissionDetail["splits"][number]) {
    const remaining = split.amount - split.paidAmount;
    const value = window.prompt(t("finance.payout_amount", "Payout amount"), String(remaining));
    if (!value) return;
    const method = window.prompt(t("finance.payment_method_prompt", "Payment method"), "bank_transfer") || "bank_transfer";
    await financeRequest(`/commissions/${selectedId}/payouts`, {
      method: "POST",
      body: JSON.stringify({
        splitId: split.id,
        amount: Number(value),
        paymentDate: Date.now(),
        paymentMethod: method,
      }),
    });
  }

  async function reconcile() {
    const payload = await financeRequest<{ reconciliation: { status: string; discrepancies: unknown[] } }>("/reports/reconcile", { method: "POST" });
    window.alert(payload.reconciliation.status === "clean"
      ? t("finance.reconciliation_clean", "Finance reconciliation is clean.")
      : `${payload.reconciliation.discrepancies.length} ${t("finance.discrepancies", "discrepancies found")}`);
  }

  const activeTab = TABS.find((item) => item.key === tab)!;
  const EmptyIcon = activeTab.icon;
  const detail = detailQuery.data;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("finance.title", "Finance")}</h1>
          <p className="text-sm text-gray-500">{t("finance.subtitle", "Control receivables, collections, expenses, commissions, approvals, and reconciliation.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab !== "overview" && CREATE_KIND[tab] && (
            <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setCreateKind(CREATE_KIND[tab]!)}>
              <Plus size={15} /> {t("finance.new", "New")}
            </button>
          )}
          {tab === "overview" && isManager && (
            <button type="button" className="btn-outline flex items-center gap-2" disabled={mutation.isPending} onClick={() => mutation.mutate(reconcile)}>
              <RefreshCw size={15} /> {t("finance.reconcile", "Reconcile")}
            </button>
          )}
        </div>
      </header>

      <div className="card overflow-x-auto p-2">
        <div className="flex min-w-max gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${tab === key ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
              <Icon size={16} /> {t(`finance.tabs.${key}`, label)}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <Overview
          isManager={isManager}
          data={overviewQuery.data}
          aging={agingQuery.data}
          loading={overviewQuery.isLoading || agingQuery.isLoading}
          onExport={downloadFinanceCsv}
        />
      ) : (
        <>
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <label className="relative"><span className="sr-only">{t("common.search", "Search")}</span><Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("finance.search", "Search number, contact, status, or description")} /></label>
              <select className="select" aria-label={t("finance.filter_status", "Filter status")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("finance.all_statuses", "All statuses")}</option>{statuses(tab).map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm text-gray-500"><span>{rows.length} {t(`finance.tabs.${tab}`, activeTab.label).toLowerCase()}</span>{listQuery.isFetching && <span>{t("common.loading", "Loading…")}</span>}</div>
              {listQuery.isLoading ? <Empty text={t("common.loading", "Loading…")} icon={EmptyIcon} /> : rows.length === 0 ? <Empty text={t("finance.empty", "No finance records match this view.")} icon={EmptyIcon} /> : (
                <div className="max-h-[720px] divide-y divide-gray-100 overflow-y-auto">
                  {rows.map((row) => (
                    <button type="button" key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full px-4 py-3 text-start transition hover:bg-gray-50 ${selectedId === row.id ? "bg-blue-50" : ""}`}>
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{numberFor(row)}</p><span className={`badge ${statusClass(row.status)}`}>{row.status}</span></div><p className="mt-1 truncate text-xs text-gray-500">{contactName(row.contactId ?? row.payerContactId ?? row.vendorContactId)}</p><p className="mt-1 truncate text-xs text-gray-400">{row.description ?? row.category ?? (row.transactionType ? `${row.transactionType} · ${row.transactionId}` : "")}</p></div><div className="shrink-0 text-end"><p className="text-sm font-medium">{amountFor(row)?.toLocaleString() ?? "—"} {row.currency ?? ""}</p>{row.balanceDue != null && <p className="text-xs text-red-500">{t("finance.balance", "Balance")}: {row.balanceDue.toLocaleString()}</p>}<p className="mt-1 text-xs text-gray-400">{dateFor(row) ? new Date(dateFor(row)!).toLocaleDateString() : "—"}</p></div></div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="card p-5">
              {!selectedId ? <Empty text={t("finance.select_record", "Select a finance record to see balances and actions.")} icon={Banknote} /> : detailQuery.isLoading ? <Empty text={t("common.loading", "Loading…")} icon={Banknote} /> : detail ? (
                <FinanceDetail
                  tab={tab}
                  detail={detail}
                  isManager={isManager}
                  profiles={options.profiles}
                  busy={mutation.isPending}
                  error={mutation.error?.message}
                  onAction={(operation) => mutation.mutate(operation)}
                  transition={transition}
                  createInvoiceFromItem={createInvoiceFromItem}
                  postCommissionPayout={postCommissionPayout}
                />
              ) : <Empty text={t("common.not_found", "Record not found")} icon={XCircle} />}
            </aside>
          </div>
        </>
      )}

      {createKind && (
        <CreateFinanceModal
          kind={createKind}
          contacts={options.contacts}
          units={options.units}
          profiles={options.profiles}
          sources={options.sources}
          onClose={() => setCreateKind(null)}
          onCreated={() => {
            setCreateKind(null);
            void queryClient.invalidateQueries({ queryKey: ["finance-list"] });
            void queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
          }}
        />
      )}
    </div>
  );
}

function Overview({
  isManager,
  data,
  aging,
  loading,
  onExport,
}: {
  isManager: boolean;
  data?: OverviewPayload;
  aging?: AgingPayload;
  loading: boolean;
  onExport: typeof downloadFinanceCsv;
}) {
  const { t } = useTranslation();
  if (!isManager) return <div className="card p-12 text-center text-sm text-gray-500">{t("finance.manager_dashboard_only", "Finance management reports are available to managers and administrators. Use the tabs to create and manage operational records.")}</div>;
  if (loading || !data) return <div className="card p-12 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>;
  const cards = [
    [t("finance.invoiced", "Invoiced"), data.totals.invoiced, FileText],
    [t("finance.receivable", "Receivable"), data.totals.receivable, Landmark],
    [t("finance.collected", "Collected"), data.totals.collected, ReceiptText],
    [t("finance.expenses_paid", "Expenses paid"), data.totals.expensesPaid, WalletCards],
    [t("finance.commissions_paid", "Commissions paid"), data.totals.commissionPaid, CircleDollarSign],
    [t("finance.scheduled", "Scheduled"), data.totals.scheduled, FileSpreadsheet],
  ] as const;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, values, Icon]) => <div key={label} className="card p-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Icon size={16} />{label}</div><p className="mt-3 text-lg font-semibold">{currencySummary(values)}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <section className="card p-5"><h2 className="font-semibold">{t("finance.receivables_aging", "Receivables aging")}</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(aging?.buckets ?? {}).map(([bucket, values]) => <div key={bucket} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{bucket}</p><p className="mt-1 text-sm font-semibold">{currencySummary(values)}</p></div>)}</div><div className="mt-4 max-h-60 divide-y divide-gray-100 overflow-y-auto">{(aging?.invoices ?? []).slice(0, 25).map((invoice) => <div key={invoice.invoiceNumber} className="flex justify-between gap-3 py-2 text-sm"><span>{invoice.invoiceNumber} · {invoice.overdueDays}d</span><strong>{invoice.balanceDue.toLocaleString()} {invoice.currency}</strong></div>)}</div></section>
        <section className="card p-5"><h2 className="font-semibold">{t("finance.attention", "Needs attention")}</h2><div className="mt-4 space-y-3"><Count label={t("finance.overdue_invoices", "Overdue invoices")} value={data.counts.overdueInvoices} danger /><Count label={t("finance.pending_expenses", "Pending expenses")} value={data.counts.pendingExpenses} /><Count label={t("finance.pending_commissions", "Pending commissions")} value={data.counts.pendingCommissions} /><Count label={t("finance.active_schedules", "Active schedules")} value={data.counts.activeSchedules} /></div><div className="mt-5 flex flex-wrap gap-2">{(["invoices", "receipts", "expenses", "commissions"] as const).map((type) => <button key={type} type="button" className="btn-outline flex items-center gap-1" onClick={() => onExport(type)}><Download size={14} /> {type}</button>)}</div></section>
      </div>
    </div>
  );
}

function FinanceDetail({
  tab,
  detail,
  isManager,
  profiles,
  busy,
  error,
  onAction,
  transition,
  createInvoiceFromItem,
  postCommissionPayout,
}: {
  tab: Exclude<FinanceTab, "overview">;
  detail: FinanceRow;
  isManager: boolean;
  profiles: Array<{ id: string; name: string }>;
  busy: boolean;
  error?: string;
  onAction: (operation: () => Promise<unknown>) => void;
  transition: (path: string, toState: string, reasonRequired?: boolean, extra?: Record<string, unknown>) => Promise<void>;
  createInvoiceFromItem: (itemId: string) => Promise<void>;
  postCommissionPayout: (split: CommissionDetail["splits"][number]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const schedule = detail as ScheduleDetail;
  const invoice = detail as InvoiceDetail;
  const receipt = detail as ReceiptDetail;
  const commission = detail as CommissionDetail;
  const path = `/${tab}/${detail.id}`;
  const actions: Array<{ label: string; run: () => Promise<unknown>; danger?: boolean }> = [];
  if (tab === "schedules" && detail.status === "draft" && isManager) actions.push({ label: t("finance.activate", "Activate"), run: () => transition(`${path}/transition`, "active") });
  if (tab === "schedules" && detail.status === "active" && isManager) actions.push({ label: t("finance.cancel", "Cancel"), run: () => transition(`${path}/transition`, "cancelled", true), danger: true });
  if (tab === "invoices" && detail.status === "draft") actions.push({ label: t("finance.issue", "Issue"), run: () => transition(`${path}/transition`, "issued") });
  if (tab === "invoices" && isManager && ["issued", "partially_paid", "overdue"].includes(detail.status)) actions.push({ label: t("finance.void", "Void"), run: () => transition(`${path}/transition`, "void", true), danger: true });
  if (tab === "expenses" && detail.status === "draft") actions.push({ label: t("finance.submit", "Submit"), run: () => transition(`${path}/transition`, "submitted") });
  if (tab === "expenses" && detail.status === "submitted" && isManager) actions.push({ label: t("finance.approve", "Approve"), run: () => transition(`${path}/transition`, "approved") }, { label: t("finance.reject", "Reject"), run: () => transition(`${path}/transition`, "rejected", true), danger: true });
  if (tab === "expenses" && detail.status === "approved" && isManager) actions.push({ label: t("finance.mark_paid", "Mark paid"), run: () => transition(`${path}/transition`, "paid", false, { paymentMethod: "bank_transfer" }) });
  if (tab === "commissions" && detail.status === "draft") actions.push({ label: t("finance.request_approval", "Request approval"), run: () => transition(`${path}/transition`, "pending_approval") });
  if (tab === "commissions" && detail.status === "pending_approval" && isManager) actions.push({ label: t("finance.approve", "Approve"), run: () => transition(`${path}/transition`, "approved") }, { label: t("finance.reject", "Reject"), run: () => transition(`${path}/transition`, "rejected", true), danger: true });

  const profileName = (id: string | null | undefined) => profiles.find((profile) => profile.id === id)?.name ?? id ?? "—";
  return (
    <div className="space-y-5">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{numberFor(detail)}</h2><span className={`badge ${statusClass(detail.status)}`}>{detail.status}</span></div><p className="mt-1 text-sm text-gray-400">{detail.description ?? detail.category ?? (detail.transactionType ? `${detail.transactionType} · ${detail.transactionId}` : "")}</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Summary label={t("finance.total", "Total")} value={`${amountFor(detail)?.toLocaleString() ?? "—"} ${detail.currency ?? ""}`} /><Summary label={t("finance.paid", "Paid")} value={`${detail.paidAmount?.toLocaleString() ?? detail.allocatedAmount?.toLocaleString() ?? "0"} ${detail.currency ?? ""}`} /><Summary label={t("finance.balance", "Balance")} value={`${detail.balanceDue?.toLocaleString() ?? (detail.amount != null ? (detail.amount - (detail.allocatedAmount ?? 0)).toLocaleString() : "—")} ${detail.currency ?? ""}`} /></div>
      {actions.length > 0 && <div className="flex flex-wrap gap-2 rounded-xl border border-gray-100 p-3">{actions.map((action) => <button key={action.label} type="button" disabled={busy} className={action.danger ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100" : "btn-outline flex items-center gap-1"} onClick={() => onAction(action.run)}>{action.danger ? <XCircle size={14} /> : <CheckCircle2 size={14} />}{action.label}</button>)}{(tab === "invoices" || tab === "receipts") && <button type="button" className="btn-outline flex items-center gap-1" onClick={() => window.open(`/api/finance/${tab}/${detail.id}/html`, "_blank", "noopener,noreferrer")}><FileText size={14} /> {t("finance.print", "Print")}</button>}{tab === "receipts" && isManager && detail.status === "posted" && <button type="button" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600" onClick={() => onAction(async () => { const reason = window.prompt(t("finance.reason_prompt", "Enter a reason")); if (!reason) return; await financeRequest(`/receipts/${detail.id}/void`, { method: "PATCH", body: JSON.stringify({ reason }) }); })}>{t("finance.void_receipt", "Void receipt")}</button>}</div>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {tab === "schedules" && schedule.items && <section><h3 className="mb-2 font-semibold">{t("finance.installments", "Installments")}</h3><div className="space-y-2">{schedule.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm"><div><p className="font-medium">{item.label}</p><p className="text-xs text-gray-400">{new Date(item.dueAt).toLocaleDateString()} · {item.paidAmount.toLocaleString()} / {item.amount.toLocaleString()}</p></div><div className="flex items-center gap-2"><span className={`badge ${statusClass(item.status)}`}>{item.status}</span>{detail.status === "active" && item.status !== "paid" && <button type="button" className="btn-outline" onClick={() => onAction(() => createInvoiceFromItem(item.id))}>{t("finance.invoice", "Invoice")}</button>}</div></div>)}</div></section>}
      {tab === "invoices" && invoice.lines && <section><h3 className="mb-2 font-semibold">{t("finance.lines", "Invoice lines")}</h3><div className="space-y-2">{invoice.lines.map((line) => <div key={line.id} className="flex justify-between rounded-lg bg-gray-50 p-3 text-sm"><span>{line.description} · {line.quantity} × {line.unitPrice.toLocaleString()}</span><strong>{line.lineTotal.toLocaleString()} {detail.currency}</strong></div>)}</div>{invoice.allocations?.length > 0 && <><h3 className="mb-2 mt-5 font-semibold">{t("finance.allocations", "Receipt allocations")}</h3><div className="space-y-2">{invoice.allocations.map((allocation) => <div key={allocation.id} className="flex justify-between rounded-lg border border-gray-100 p-3 text-sm"><span>{allocation.receiptNumber} · {allocation.status}</span><strong>{allocation.amount.toLocaleString()} {detail.currency}</strong></div>)}</div></>}</section>}
      {tab === "receipts" && receipt.allocations && <section><h3 className="mb-2 font-semibold">{t("finance.allocations", "Allocations")}</h3><div className="space-y-2">{receipt.allocations.map((allocation) => <div key={allocation.id} className="rounded-lg border border-gray-100 p-3 text-sm"><div className="flex justify-between"><span>{allocation.invoiceNumber} · {allocation.status}</span><strong>{allocation.amount.toLocaleString()} {detail.currency}</strong></div>{allocation.reversalReason && <p className="mt-1 text-xs text-red-500">{allocation.reversalReason}</p>}</div>)}</div></section>}
      {tab === "commissions" && commission.splits && <section><h3 className="mb-2 font-semibold">{t("finance.commission_splits", "Commission splits")}</h3><div className="space-y-2">{commission.splits.map((split) => <div key={split.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-sm"><div><p className="font-medium">{split.recipientType === "profile" ? profileName(split.recipientProfileId) : split.recipientContactId}</p><p className="text-xs text-gray-400">{split.paidAmount.toLocaleString()} / {split.amount.toLocaleString()} · {split.status}</p></div>{isManager && ["approved", "partially_paid"].includes(detail.status) && split.paidAmount < split.amount - 0.009 && <button type="button" className="btn-outline" onClick={() => onAction(() => postCommissionPayout(split))}>{t("finance.pay", "Pay")}</button>}</div>)}</div></section>}
    </div>
  );
}

function Empty({ text, icon: Icon }: { text: string; icon: typeof Landmark }) {
  return <div className="flex flex-col items-center gap-2 p-14 text-center text-sm text-gray-400"><Icon size={32} />{text}</div>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 truncate font-medium">{value}</p></div>; }
function Count({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm"><span>{label}</span><strong className={danger && value > 0 ? "text-red-600" : ""}>{value}</strong></div>; }
function singular(tab: Exclude<FinanceTab, "overview">): string { return tab === "schedules" ? "schedule" : tab === "invoices" ? "invoice" : tab === "receipts" ? "receipt" : tab === "expenses" ? "expense" : "commission"; }
function statuses(tab: Exclude<FinanceTab, "overview">): string[] { if (tab === "schedules") return ["draft", "active", "completed", "cancelled"]; if (tab === "invoices") return ["draft", "issued", "partially_paid", "paid", "overdue", "void"]; if (tab === "receipts") return ["posted", "void"]; if (tab === "expenses") return ["draft", "submitted", "approved", "rejected", "paid", "cancelled", "void"]; return ["draft", "pending_approval", "approved", "partially_paid", "paid", "rejected", "cancelled"]; }
function statusClass(status: string): string { if (["active", "issued", "approved", "paid", "completed", "posted"].includes(status)) return "bg-green-100 text-green-700"; if (["draft", "pending"].includes(status)) return "bg-gray-100 text-gray-600"; if (["submitted", "pending_approval", "partially_paid"].includes(status)) return "bg-blue-100 text-blue-700"; if (["overdue"].includes(status)) return "bg-yellow-100 text-yellow-700"; return "bg-red-100 text-red-700"; }
