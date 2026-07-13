import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  FileSignature,
  HandCoins,
  KeyRound,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  loadTransactionOptions,
  transactionRequest,
} from "../../lib/transaction-client";
import {
  CreateTransactionModal,
  type WorkspaceKind,
} from "./create-transaction-modal";
import { TransactionDetailPanel } from "./transaction-detail-panel";

type TransactionListItem = {
  id: string;
  status: string;
  viewingNumber?: string;
  offerNumber?: string;
  reservationNumber?: string;
  leaseNumber?: string;
  saleNumber?: string;
  unitId?: string | null;
  contactId?: string;
  buyerContactId?: string;
  tenantContactId?: string;
  offeredAmount?: number;
  depositAmount?: number | null;
  rentAmount?: number;
  agreedValue?: number;
  currency?: string;
  scheduledAt?: number;
  startsAt?: number;
  expiresAt?: number;
  endsAt?: number;
  updatedAt?: number;
  createdAt?: number;
};

const TABS: Array<{
  key: WorkspaceKind;
  label: string;
  icon: typeof CalendarClock;
}> = [
  { key: "viewings", label: "Viewings", icon: CalendarClock },
  { key: "offers", label: "Offers", icon: HandCoins },
  { key: "reservations", label: "Reservations", icon: KeyRound },
  { key: "leases", label: "Leases", icon: FileSignature },
  { key: "sales", label: "Sales", icon: ShoppingCart },
];

function numberFor(item: TransactionListItem): string {
  return item.viewingNumber
    ?? item.offerNumber
    ?? item.reservationNumber
    ?? item.leaseNumber
    ?? item.saleNumber
    ?? item.id;
}

function amountFor(item: TransactionListItem): string {
  const value = item.offeredAmount
    ?? item.rentAmount
    ?? item.agreedValue
    ?? item.depositAmount;
  return value == null ? "—" : `${value.toLocaleString()} ${item.currency ?? ""}`;
}

function dateFor(item: TransactionListItem): string {
  const value = item.scheduledAt
    ?? item.startsAt
    ?? item.expiresAt
    ?? item.updatedAt
    ?? item.createdAt;
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<WorkspaceKind>("viewings");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setStatus("");
    setSearch("");
  }, [kind]);

  const optionsQuery = useQuery({
    queryKey: ["transaction-options"],
    queryFn: loadTransactionOptions,
    staleTime: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ["transactions", kind, status],
    queryFn: async () => {
      const query = new URLSearchParams({ page: "1", pageSize: "100" });
      if (status) query.set("status", status);
      const payload = await transactionRequest<Record<string, TransactionListItem[]>>(
        `/${kind}?${query.toString()}`,
      );
      return payload[kind] ?? [];
    },
  });

  const options = optionsQuery.data ?? { contacts: [], properties: [], units: [] };
  const contactName = (id: string | undefined) =>
    options.contacts.find((contact) => contact.id === id)?.displayName ?? id ?? "—";
  const unitName = (id: string | null | undefined) =>
    options.units.find((unit) => unit.id === id)?.label ?? id ?? "—";
  const normalizedSearch = search.trim().toLowerCase();
  const rows = (listQuery.data ?? []).filter((item) => {
    if (!normalizedSearch) return true;
    return [
      numberFor(item),
      item.status,
      unitName(item.unitId),
      contactName(item.contactId ?? item.buyerContactId ?? item.tenantContactId),
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  const tab = TABS.find((item) => item.key === kind)!;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("transactions.title", "Transactions")}</h1>
          <p className="text-sm text-gray-500">
            {t(
              "transactions.subtitle",
              "Manage viewings, negotiations, reservations, leases, sales, approvals, and generated contracts.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary flex items-center gap-2 self-start"
          onClick={() => setShowCreate(true)}
          disabled={optionsQuery.isLoading}
        >
          <Plus size={15} /> {t("transactions.new", `New ${tab.label.toLowerCase().slice(0, -1)}`)}
        </button>
      </header>

      <div className="card overflow-x-auto p-2">
        <div className="flex min-w-max gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              onClick={() => setKind(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                kind === key
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <Icon size={16} /> {t(`transactions.tabs.${key}`, label)}
            </button>
          ))}
        </div>
      </div>

      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="relative">
            <span className="sr-only">{t("common.search", "Search")}</span>
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input ps-9"
              placeholder={t("transactions.search", "Search number, party, unit, or status")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="select"
            aria-label={t("transactions.filter_status", "Filter by status")}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t("transactions.all_statuses", "All statuses")}</option>
            {statusOptions(kind).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm text-gray-500">
            <span>{rows.length} {t(`transactions.tabs.${kind}`, tab.label).toLowerCase()}</span>
            {listQuery.isFetching && <span>{t("common.loading", "Loading…")}</span>}
          </div>
          {listQuery.isLoading ? (
            <div className="p-12 text-center text-sm text-gray-400">{t("common.loading", "Loading…")}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-14 text-gray-400">
              <tab.icon size={32} />
              <p className="text-sm">{t("transactions.empty", "No records match this view.")}</p>
            </div>
          ) : (
            <div className="max-h-[720px] divide-y divide-gray-100 overflow-y-auto">
              {rows.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-label={`${t("transactions.open", "Open transaction")}: ${numberFor(item)}`}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full px-4 py-3 text-start transition hover:bg-gray-50 ${
                    selectedId === item.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{numberFor(item)}</p>
                        <span className={`badge ${statusClass(item.status)}`}>{item.status}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-400">{unitName(item.unitId)}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {contactName(item.contactId ?? item.buyerContactId ?? item.tenantContactId)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-medium">{amountFor(item)}</p>
                      <p className="mt-1 text-xs text-gray-400">{dateFor(item)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="card p-5">
          <TransactionDetailPanel
            kind={kind}
            id={selectedId}
            contacts={options.contacts}
            units={options.units}
          />
        </aside>
      </div>

      {showCreate && (
        <CreateTransactionModal
          kind={kind}
          contacts={options.contacts}
          units={options.units}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedId(id);
            void queryClient.invalidateQueries({ queryKey: ["transactions", kind] });
            void queryClient.invalidateQueries({ queryKey: ["transaction-options"] });
          }}
        />
      )}
    </div>
  );
}

function statusOptions(kind: WorkspaceKind): string[] {
  if (kind === "viewings") return ["scheduled", "completed", "cancelled", "no_show"];
  if (kind === "offers") return ["draft", "submitted", "under_review", "countered", "accepted", "rejected", "expired", "withdrawn"];
  if (kind === "reservations") return ["draft", "active", "converted", "released", "expired", "cancelled"];
  if (kind === "leases") return ["draft", "pending_approval", "active", "renewal_due", "renewed", "rejected", "terminated", "expired", "completed", "cancelled"];
  return ["draft", "pending_approval", "active", "completed", "rejected", "terminated", "cancelled"];
}

function statusClass(status: string): string {
  if (["active", "accepted", "completed"].includes(status)) return "bg-green-100 text-green-700";
  if (["draft", "scheduled"].includes(status)) return "bg-gray-100 text-gray-600";
  if (["submitted", "under_review", "pending_approval", "renewal_due"].includes(status)) return "bg-blue-100 text-blue-700";
  if (["countered", "reserved"].includes(status)) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}
