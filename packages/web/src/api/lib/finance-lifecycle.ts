export type StaffRole = "admin" | "manager" | "agent";
export type FinanceKind = "schedule" | "invoice" | "expense" | "commission";

const TRANSITIONS: Record<FinanceKind, Record<string, readonly string[]>> = {
  schedule: {
    draft: ["active", "cancelled"],
    active: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  },
  invoice: {
    draft: ["issued", "void"],
    issued: ["partially_paid", "paid", "overdue", "void"],
    partially_paid: ["paid", "overdue", "void"],
    overdue: ["partially_paid", "paid", "void"],
    paid: [],
    void: [],
  },
  expense: {
    draft: ["submitted", "cancelled"],
    submitted: ["approved", "rejected", "cancelled"],
    approved: ["paid", "void"],
    paid: [],
    rejected: [],
    cancelled: [],
    void: [],
  },
  commission: {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "rejected", "cancelled"],
    approved: ["partially_paid", "paid", "cancelled"],
    partially_paid: ["paid", "cancelled"],
    paid: [],
    rejected: [],
    cancelled: [],
  },
};

const PRIVILEGED: Record<FinanceKind, ReadonlySet<string>> = {
  schedule: new Set(["active", "completed", "cancelled"]),
  invoice: new Set(["void"]),
  expense: new Set(["approved", "rejected", "paid", "void"]),
  commission: new Set(["approved", "rejected", "cancelled"]),
};

export function assertFinanceTransition(
  kind: FinanceKind,
  from: string,
  to: string,
  role: StaffRole,
): void {
  if (!(TRANSITIONS[kind][from] ?? []).includes(to)) {
    throw new Error(`Invalid ${kind} transition from ${from} to ${to}`);
  }
  if (PRIVILEGED[kind].has(to) && role === "agent") {
    throw new Error(`The ${to} transition requires manager or administrator approval`);
  }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function requireReason(kind: FinanceKind, to: string): boolean {
  return (
    (kind === "schedule" && to === "cancelled") ||
    (kind === "invoice" && to === "void") ||
    (kind === "expense" && ["rejected", "cancelled", "void"].includes(to)) ||
    (kind === "commission" && ["rejected", "cancelled"].includes(to))
  );
}
