import { Hono } from "hono";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../database";
import {
  commissionPayouts,
  commissions,
  commissionSplits,
  expenses,
  financeReconciliationRuns,
  invoices,
  paymentScheduleItems,
  paymentSchedules,
  receiptAllocations,
  receipts,
} from "../database/finance-schema";
import { auditLogs } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseQuery } from "../lib/validation";
import { requireRole, requireTenant } from "../middleware/auth";
import { financeReportQuerySchema } from "../validation/finance";

function addCurrency(
  target: Record<string, number>,
  currency: string,
  amount: number,
): void {
  target[currency] = Math.round(((target[currency] ?? 0) + amount) * 100) / 100;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
}

export const financeReports = new Hono()
  .get("/overview", requireTenant, requireRole("admin", "manager"), async (c) => {
    const parsed = parseQuery(c, financeReportQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const from = parsed.data.from ?? 0;
    const to = parsed.data.to ?? Number.MAX_SAFE_INTEGER;
    const currency = parsed.data.currency;
    const [invoiceRows, receiptRows, expenseRows, commissionRows, scheduleRows] = await Promise.all([
      db.select().from(invoices).where(and(
        eq(invoices.agencyId, agencyId),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
        currency ? eq(invoices.currency, currency) : undefined,
      )),
      db.select().from(receipts).where(and(
        eq(receipts.agencyId, agencyId),
        eq(receipts.status, "posted"),
        gte(receipts.paymentDate, from),
        lte(receipts.paymentDate, to),
        currency ? eq(receipts.currency, currency) : undefined,
      )),
      db.select().from(expenses).where(and(
        eq(expenses.agencyId, agencyId),
        gte(expenses.incurredAt, from),
        lte(expenses.incurredAt, to),
        currency ? eq(expenses.currency, currency) : undefined,
      )),
      db.select().from(commissions).where(and(
        eq(commissions.agencyId, agencyId),
        gte(commissions.createdAt, from),
        lte(commissions.createdAt, to),
        currency ? eq(commissions.currency, currency) : undefined,
      )),
      db.select().from(paymentSchedules).where(and(
        eq(paymentSchedules.agencyId, agencyId),
        gte(paymentSchedules.createdAt, from),
        lte(paymentSchedules.createdAt, to),
        currency ? eq(paymentSchedules.currency, currency) : undefined,
      )),
    ]);

    const totals = {
      invoiced: {} as Record<string, number>,
      invoicePaid: {} as Record<string, number>,
      receivable: {} as Record<string, number>,
      collected: {} as Record<string, number>,
      expensesApproved: {} as Record<string, number>,
      expensesPaid: {} as Record<string, number>,
      commissionApproved: {} as Record<string, number>,
      commissionPaid: {} as Record<string, number>,
      scheduled: {} as Record<string, number>,
      scheduleCollected: {} as Record<string, number>,
    };
    for (const invoice of invoiceRows.filter((row) => row.status !== "void")) {
      addCurrency(totals.invoiced, invoice.currency, invoice.totalAmount);
      addCurrency(totals.invoicePaid, invoice.currency, invoice.paidAmount);
      addCurrency(totals.receivable, invoice.currency, invoice.balanceDue);
    }
    for (const receipt of receiptRows) addCurrency(totals.collected, receipt.currency, receipt.amount);
    for (const expense of expenseRows) {
      if (["approved", "paid"].includes(expense.status)) {
        addCurrency(totals.expensesApproved, expense.currency, expense.totalAmount);
      }
      if (expense.status === "paid") addCurrency(totals.expensesPaid, expense.currency, expense.totalAmount);
    }
    for (const commission of commissionRows) {
      if (["approved", "partially_paid", "paid"].includes(commission.status)) {
        addCurrency(totals.commissionApproved, commission.currency, commission.approvedAmount ?? commission.grossCommission);
      }
      addCurrency(totals.commissionPaid, commission.currency, commission.paidAmount);
    }
    for (const schedule of scheduleRows.filter((row) => row.status !== "cancelled")) {
      addCurrency(totals.scheduled, schedule.currency, schedule.totalAmount);
      addCurrency(totals.scheduleCollected, schedule.currency, schedule.paidAmount);
    }
    return c.json({
      totals,
      counts: {
        invoices: invoiceRows.length,
        overdueInvoices: invoiceRows.filter((row) => row.status === "overdue").length,
        receipts: receiptRows.length,
        pendingExpenses: expenseRows.filter((row) => row.status === "submitted").length,
        pendingCommissions: commissionRows.filter((row) => row.status === "pending_approval").length,
        activeSchedules: scheduleRows.filter((row) => row.status === "active").length,
      },
    }, 200);
  })
  .get("/aging", requireTenant, requireRole("admin", "manager"), async (c) => {
    const parsed = parseQuery(c, financeReportQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const now = parsed.data.to ?? Date.now();
    const rows = await db.select().from(invoices).where(and(
      eq(invoices.agencyId, agencyId),
      parsed.data.currency ? eq(invoices.currency, parsed.data.currency) : undefined,
    ));
    const buckets: Record<string, Record<string, number>> = {
      current: {},
      "1-30": {},
      "31-60": {},
      "61-90": {},
      "90+": {},
    };
    const details = rows.filter((row) => row.balanceDue > 0.009 && !["draft", "void"].includes(row.status)).map((invoice) => {
      const overdueDays = Math.max(0, Math.floor((now - invoice.dueAt) / 86400000));
      const bucket = overdueDays === 0
        ? "current"
        : overdueDays <= 30
          ? "1-30"
          : overdueDays <= 60
            ? "31-60"
            : overdueDays <= 90
              ? "61-90"
              : "90+";
      addCurrency(buckets[bucket], invoice.currency, invoice.balanceDue);
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        contactId: invoice.contactId,
        dueAt: invoice.dueAt,
        overdueDays,
        bucket,
        balanceDue: invoice.balanceDue,
        currency: invoice.currency,
      };
    });
    return c.json({ buckets, invoices: details }, 200);
  })
  .get("/cashflow", requireTenant, requireRole("admin", "manager"), async (c) => {
    const parsed = parseQuery(c, financeReportQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const from = parsed.data.from ?? 0;
    const to = parsed.data.to ?? Number.MAX_SAFE_INTEGER;
    const [receiptRows, expenseRows, payoutRows] = await Promise.all([
      db.select().from(receipts).where(and(
        eq(receipts.agencyId, agencyId), eq(receipts.status, "posted"),
        gte(receipts.paymentDate, from), lte(receipts.paymentDate, to),
        parsed.data.currency ? eq(receipts.currency, parsed.data.currency) : undefined,
      )),
      db.select().from(expenses).where(and(
        eq(expenses.agencyId, agencyId), eq(expenses.status, "paid"),
        gte(expenses.paidAt, from), lte(expenses.paidAt, to),
        parsed.data.currency ? eq(expenses.currency, parsed.data.currency) : undefined,
      )),
      db.select().from(commissionPayouts).where(and(
        eq(commissionPayouts.agencyId, agencyId), eq(commissionPayouts.status, "posted"),
        gte(commissionPayouts.paymentDate, from), lte(commissionPayouts.paymentDate, to),
        parsed.data.currency ? eq(commissionPayouts.currency, parsed.data.currency) : undefined,
      )),
    ]);
    const monthMap = new Map<string, { inflow: Record<string, number>; expenses: Record<string, number>; commissions: Record<string, number> }>();
    const getMonth = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 7);
    const ensure = (month: string) => {
      let row = monthMap.get(month);
      if (!row) {
        row = { inflow: {}, expenses: {}, commissions: {} };
        monthMap.set(month, row);
      }
      return row;
    };
    for (const receipt of receiptRows) addCurrency(ensure(getMonth(receipt.paymentDate)).inflow, receipt.currency, receipt.amount);
    for (const expense of expenseRows) addCurrency(ensure(getMonth(expense.paidAt!)).expenses, expense.currency, expense.totalAmount);
    for (const payout of payoutRows) addCurrency(ensure(getMonth(payout.paymentDate)).commissions, payout.currency, payout.amount);
    return c.json({ months: [...monthMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, values]) => ({ month, ...values })) }, 200);
  })
  .get("/export/:type", requireTenant, requireRole("admin", "manager"), async (c) => {
    const agencyId = c.get("agencyId") as string;
    const type = c.req.param("type");
    let content: string;
    if (type === "invoices") {
      const rows = await db.select().from(invoices).where(eq(invoices.agencyId, agencyId));
      content = csv(rows, ["invoiceNumber", "contactId", "status", "issueDate", "dueAt", "totalAmount", "paidAmount", "balanceDue", "currency", "sourceType", "sourceId"]);
    } else if (type === "receipts") {
      const rows = await db.select().from(receipts).where(eq(receipts.agencyId, agencyId));
      content = csv(rows, ["receiptNumber", "contactId", "status", "paymentDate", "amount", "allocatedAmount", "currency", "paymentMethod", "externalReference"]);
    } else if (type === "expenses") {
      const rows = await db.select().from(expenses).where(eq(expenses.agencyId, agencyId));
      content = csv(rows, ["expenseNumber", "category", "status", "description", "incurredAt", "totalAmount", "currency", "propertyId", "unitId", "vendorContactId"]);
    } else if (type === "commissions") {
      const rows = await db.select().from(commissions).where(eq(commissions.agencyId, agencyId));
      content = csv(rows, ["commissionNumber", "transactionType", "transactionId", "status", "grossCommission", "approvedAmount", "paidAmount", "currency"]);
    } else {
      return c.json({ error: "Unsupported export type" }, 400);
    }
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="aqari-${type}.csv"`);
    return c.body(`\uFEFF${content}`);
  })
  .post("/reconcile", requireTenant, requireRole("admin", "manager"), async (c) => {
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const startedAt = Date.now();
    const discrepancies: Array<{ type: string; id: string; expected: number | string; actual: number | string }> = [];
    const [invoiceRows, receiptRows, itemRows, scheduleRows, splitRows, commissionRows] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.agencyId, agencyId)),
      db.select().from(receipts).where(eq(receipts.agencyId, agencyId)),
      db.select().from(paymentScheduleItems).where(eq(paymentScheduleItems.agencyId, agencyId)),
      db.select().from(paymentSchedules).where(eq(paymentSchedules.agencyId, agencyId)),
      db.select().from(commissionSplits).where(eq(commissionSplits.agencyId, agencyId)),
      db.select().from(commissions).where(eq(commissions.agencyId, agencyId)),
    ]);
    const allocations = await db.select().from(receiptAllocations).where(and(
      eq(receiptAllocations.agencyId, agencyId),
      eq(receiptAllocations.status, "active"),
    ));
    const payouts = await db.select().from(commissionPayouts).where(and(
      eq(commissionPayouts.agencyId, agencyId),
      eq(commissionPayouts.status, "posted"),
    ));
    const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
    for (const invoice of invoiceRows) {
      const allocated = sum(allocations.filter((row) => row.invoiceId === invoice.id).map((row) => row.amount));
      if (Math.abs(invoice.paidAmount - allocated) > 0.009) discrepancies.push({ type: "invoice_paid", id: invoice.id, expected: allocated, actual: invoice.paidAmount });
      const expectedBalance = Math.round((invoice.totalAmount - allocated) * 100) / 100;
      if (Math.abs(invoice.balanceDue - expectedBalance) > 0.009) discrepancies.push({ type: "invoice_balance", id: invoice.id, expected: expectedBalance, actual: invoice.balanceDue });
    }
    for (const receipt of receiptRows) {
      const allocated = sum(allocations.filter((row) => row.receiptId === receipt.id).map((row) => row.amount));
      if (Math.abs(receipt.allocatedAmount - allocated) > 0.009) discrepancies.push({ type: "receipt_allocated", id: receipt.id, expected: allocated, actual: receipt.allocatedAmount });
    }
    for (const item of itemRows) {
      const invoiceIds = invoiceRows.filter((invoice) => invoice.scheduleItemId === item.id).map((invoice) => invoice.id);
      const allocated = sum(allocations.filter((row) => invoiceIds.includes(row.invoiceId)).map((row) => row.amount));
      if (Math.abs(item.paidAmount - allocated) > 0.009) discrepancies.push({ type: "schedule_item_paid", id: item.id, expected: allocated, actual: item.paidAmount });
    }
    for (const schedule of scheduleRows) {
      const paid = sum(itemRows.filter((item) => item.scheduleId === schedule.id).map((item) => item.paidAmount));
      if (Math.abs(schedule.paidAmount - paid) > 0.009) discrepancies.push({ type: "schedule_paid", id: schedule.id, expected: paid, actual: schedule.paidAmount });
    }
    for (const split of splitRows) {
      const paid = sum(payouts.filter((payout) => payout.splitId === split.id).map((payout) => payout.amount));
      if (Math.abs(split.paidAmount - paid) > 0.009) discrepancies.push({ type: "commission_split_paid", id: split.id, expected: paid, actual: split.paidAmount });
    }
    for (const commission of commissionRows) {
      const paid = sum(splitRows.filter((split) => split.commissionId === commission.id).map((split) => split.paidAmount));
      if (Math.abs(commission.paidAmount - paid) > 0.009) discrepancies.push({ type: "commission_paid", id: commission.id, expected: paid, actual: commission.paidAmount });
    }
    const completedAt = Date.now();
    const id = nanoid();
    await db.transaction(async (tx) => {
      await tx.insert(financeReconciliationRuns).values({
        id,
        agencyId,
        status: discrepancies.length === 0 ? "clean" : "discrepancies_found",
        discrepancyCount: discrepancies.length,
        result: JSON.stringify(discrepancies),
        runBy: user.id,
        startedAt,
        completedAt,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "finance.reconciled",
        entityType: "finance_reconciliation",
        entityId: id,
        metadata: { discrepancyCount: discrepancies.length },
      }));
    });
    return c.json({ reconciliation: { id, status: discrepancies.length === 0 ? "clean" : "discrepancies_found", discrepancies, startedAt, completedAt } }, 200);
  });
