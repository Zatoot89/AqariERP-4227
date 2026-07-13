export type TransactionKind = "offer" | "reservation" | "lease" | "sale";
export type StaffRole = "admin" | "manager" | "agent";

export const TRANSACTION_STATES = {
  offer: [
    "draft",
    "submitted",
    "under_review",
    "countered",
    "accepted",
    "rejected",
    "expired",
    "withdrawn",
  ],
  reservation: ["draft", "active", "converted", "released", "expired", "cancelled"],
  lease: [
    "draft",
    "pending_approval",
    "active",
    "renewal_due",
    "renewed",
    "rejected",
    "terminated",
    "expired",
    "completed",
    "cancelled",
  ],
  sale: [
    "draft",
    "pending_approval",
    "active",
    "completed",
    "rejected",
    "terminated",
    "cancelled",
  ],
} as const;

export type OfferState = (typeof TRANSACTION_STATES.offer)[number];
export type ReservationState = (typeof TRANSACTION_STATES.reservation)[number];
export type LeaseState = (typeof TRANSACTION_STATES.lease)[number];
export type SaleState = (typeof TRANSACTION_STATES.sale)[number];
export type TransactionState = OfferState | ReservationState | LeaseState | SaleState;

const TRANSITIONS: Record<TransactionKind, Record<string, readonly string[]>> = {
  offer: {
    draft: ["submitted", "withdrawn"],
    submitted: ["under_review", "countered", "accepted", "rejected", "expired", "withdrawn"],
    under_review: ["countered", "accepted", "rejected", "expired"],
    countered: ["submitted", "accepted", "rejected", "expired", "withdrawn"],
    accepted: [],
    rejected: [],
    expired: [],
    withdrawn: [],
  },
  reservation: {
    draft: ["active", "cancelled"],
    active: ["converted", "released", "expired", "cancelled"],
    converted: [],
    released: [],
    expired: [],
    cancelled: [],
  },
  lease: {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["active", "rejected", "cancelled"],
    active: ["renewal_due", "terminated", "expired", "completed"],
    renewal_due: ["renewed", "terminated", "expired"],
    renewed: [],
    rejected: [],
    terminated: [],
    expired: [],
    completed: [],
    cancelled: [],
  },
  sale: {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["active", "rejected", "cancelled"],
    active: ["completed", "terminated", "cancelled"],
    completed: [],
    rejected: [],
    terminated: [],
    cancelled: [],
  },
};

const PRIVILEGED_TARGETS: Record<TransactionKind, ReadonlySet<string>> = {
  offer: new Set(["accepted", "rejected"]),
  reservation: new Set(["active", "converted", "released", "cancelled"]),
  lease: new Set([
    "active",
    "rejected",
    "renewal_due",
    "renewed",
    "terminated",
    "completed",
    "cancelled",
  ]),
  sale: new Set(["active", "rejected", "completed", "terminated", "cancelled"]),
};

export function isKnownState(kind: TransactionKind, state: string): state is TransactionState {
  return (TRANSACTION_STATES[kind] as readonly string[]).includes(state);
}

export function canTransition(
  kind: TransactionKind,
  from: string,
  to: string,
  role: StaffRole,
): boolean {
  if (!isKnownState(kind, from) || !isKnownState(kind, to)) return false;
  if (!(TRANSITIONS[kind][from] ?? []).includes(to)) return false;
  if (PRIVILEGED_TARGETS[kind].has(to) && role === "agent") return false;
  return true;
}

export function assertTransition(
  kind: TransactionKind,
  from: string,
  to: string,
  role: StaffRole,
): void {
  if (!isKnownState(kind, from)) throw new Error(`Unknown ${kind} state: ${from}`);
  if (!isKnownState(kind, to)) throw new Error(`Unknown ${kind} target state: ${to}`);
  if (!(TRANSITIONS[kind][from] ?? []).includes(to)) {
    throw new Error(`Invalid ${kind} transition from ${from} to ${to}`);
  }
  if (PRIVILEGED_TARGETS[kind].has(to) && role === "agent") {
    throw new Error(`The ${to} transition requires manager or administrator approval`);
  }
}

export function requiresTransitionReason(
  kind: TransactionKind,
  to: string,
): boolean {
  return (
    (kind === "offer" && ["rejected", "withdrawn"].includes(to)) ||
    (kind === "reservation" && ["released", "cancelled"].includes(to)) ||
    (kind === "lease" && ["rejected", "terminated", "cancelled"].includes(to)) ||
    (kind === "sale" && ["rejected", "terminated", "cancelled"].includes(to))
  );
}
