import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import { contacts } from "../database/core-domain-schema";
import {
  financeEvents,
  invoices,
  receiptAllocations,
  receipts as receiptTable,
} from "../database/finance-schema";
import { auditLogs } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nextFinanceNumber } from "../lib/finance-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireRole, requireTenant } from "../middleware/auth";
import {
  allocateReceiptSchema,
  createReceiptSchema,
  financeListQuerySchema,
  reverseAllocationSchema,
  voidReceiptSchema,
} from "../validation/finance";
import { entityIdSchema } from "../validation/schemas";

async function findReceipt(agencyId: string, id: string) {
  return db.select().from(receiptTable).where(and(
    eq(receiptTable.id, id),
    eq(receiptTable.agencyId, agencyId),
  )).get();
}

async function allocate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    agencyId: string;
    receiptId: string;
    invoiceId: string;
    amount: number;
    userId: string;
    now: number;
  },
) {
  const [allocation] = await tx.insert(receiptAllocations).values({
    id: nanoid(),
    agencyId: input.agencyId,
    receiptId: input.receiptId,
    invoiceId: input.invoiceId,
    amount: input.amount,
    status: "active",
    allocatedBy: input.userId,
    allocatedAt: input.now,
  }).returning();
  await tx.insert(financeEvents).values({
    id: nanoid(),
    agencyId: input.agencyId,
    eventType: "receipt.allocated",
    entityType: "receipt_allocation",
    entityId: allocation.id,
    amount: input.amount,
    currency: (await tx.select({ currency: receiptTable.currency }).from(receiptTable)
      .where(eq(receiptTable.id, input.receiptId)).get())?.currency,
    actorId: input.userId,
    metadata: JSON.stringify({ receiptId: input.receiptId, invoiceId: input.invoiceId }),
    createdAt: input.now,
  });
  return allocation;
}

function receiptHtml(input: {
  receiptNumber: string;
  status: string;
  contactName: string;
  paymentDate: number;
  amount: number;
  allocatedAmount: number;
  currency: string;
  paymentMethod: string;
  externalReference: string | null;
  allocations: Array<{ invoiceNumber: string; amount: number; status: string }>;
}) {
  const escape = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const rows = input.allocations.map((item) => `
    <tr><td>${escape(item.invoiceNumber)}</td><td>${item.amount.toFixed(2)} ${escape(input.currency)}</td><td>${escape(item.status)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><style>
    @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#111827}h1{margin:0 0 16px}
    .amount{font-size:28px;font-weight:bold;margin:20px 0}table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#f3f4f6}
  </style></head><body>
    <h1>Receipt ${escape(input.receiptNumber)}</h1>
    <p>${escape(input.contactName)} · ${new Date(input.paymentDate).toLocaleDateString()} · ${escape(input.status)}</p>
    <div class="amount">${input.amount.toFixed(2)} ${escape(input.currency)}</div>
    <p>Method: ${escape(input.paymentMethod)}<br/>Reference: ${escape(input.externalReference || "—")}<br/>Allocated: ${input.allocatedAmount.toFixed(2)} ${escape(input.currency)}<br/>Unallocated: ${(input.amount - input.allocatedAmount).toFixed(2)} ${escape(input.currency)}</p>
    <table><thead><tr><th>Invoice</th><th>Allocated</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Unallocated receipt</td></tr>'}</tbody></table>
  </body></html>`;
}

export const financeReceipts = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, financeListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(receiptTable).where(and(
      eq(receiptTable.agencyId, agencyId),
      parsed.data.status ? eq(receiptTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(receiptTable.contactId, parsed.data.contactId) : undefined,
    )).orderBy(desc(receiptTable.paymentDate), desc(receiptTable.createdAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ receipts: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createReceiptSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, parsed.data.contactId),
      eq(contacts.agencyId, agencyId),
    )).get();
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    const allocationTotal = (parsed.data.allocations ?? []).reduce((sum, item) => sum + item.amount, 0);
    if (allocationTotal > parsed.data.amount + 0.009) {
      return c.json({ error: "Allocations exceed the receipt amount" }, 400);
    }
    const now = Date.now();
    try {
      const receipt = await db.transaction(async (tx) => {
        const receiptNumber = await nextFinanceNumber(tx, agencyId, "receipt");
        const id = nanoid();
        const [created] = await tx.insert(receiptTable).values({
          id,
          agencyId,
          receiptNumber,
          contactId: parsed.data.contactId,
          status: "posted",
          paymentDate: parsed.data.paymentDate,
          amount: parsed.data.amount,
          allocatedAmount: 0,
          currency: parsed.data.currency,
          paymentMethod: parsed.data.paymentMethod,
          externalReference: parsed.data.externalReference,
          chequeNumber: parsed.data.chequeNumber,
          bankName: parsed.data.bankName,
          notes: parsed.data.notes,
          receivedBy: user.id,
          createdAt: now,
        }).returning();
        for (const item of parsed.data.allocations ?? []) {
          await allocate(tx, {
            agencyId,
            receiptId: id,
            invoiceId: item.invoiceId,
            amount: item.amount,
            userId: user.id,
            now,
          });
        }
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "receipt.posted", entityType: "receipt",
          entityId: id, amount: parsed.data.amount, currency: parsed.data.currency,
          actorId: user.id, metadata: JSON.stringify({ receiptNumber, allocationTotal }), createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "receipt.posted",
          entityType: "receipt",
          entityId: id,
          metadata: { receiptNumber, amount: parsed.data.amount, currency: parsed.data.currency },
        }));
        return created;
      });
      const current = await findReceipt(agencyId, receipt.id);
      return c.json({ receipt: current }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not post receipt" }, 409);
    }
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const receipt = await findReceipt(agencyId, id.data);
    if (!receipt) return c.json({ error: "Not found" }, 404);
    const allocations = await db.select({
      id: receiptAllocations.id,
      invoiceId: receiptAllocations.invoiceId,
      invoiceNumber: invoices.invoiceNumber,
      amount: receiptAllocations.amount,
      status: receiptAllocations.status,
      allocatedAt: receiptAllocations.allocatedAt,
      reversedAt: receiptAllocations.reversedAt,
      reversalReason: receiptAllocations.reversalReason,
    }).from(receiptAllocations)
      .innerJoin(invoices, eq(invoices.id, receiptAllocations.invoiceId))
      .where(and(
        eq(receiptAllocations.agencyId, agencyId),
        eq(receiptAllocations.receiptId, receipt.id),
      )).orderBy(desc(receiptAllocations.allocatedAt));
    return c.json({ receipt: { ...receipt, allocations } }, 200);
  })
  .post("/:id/allocate", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, allocateReceiptSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const receipt = await findReceipt(agencyId, id.data);
    if (!receipt || receipt.status !== "posted") return c.json({ error: "Posted receipt not found" }, 404);
    try {
      const allocation = await db.transaction(async (tx) => {
        const created = await allocate(tx, {
          agencyId,
          receiptId: receipt.id,
          invoiceId: parsed.data.invoiceId,
          amount: parsed.data.amount,
          userId: user.id,
          now: Date.now(),
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "receipt.allocated",
          entityType: "receipt_allocation",
          entityId: created.id,
          metadata: { receiptId: receipt.id, invoiceId: parsed.data.invoiceId, amount: parsed.data.amount },
        }));
        return created;
      });
      return c.json({ allocation }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Allocation failed" }, 409);
    }
  })
  .patch("/:id/allocations/:allocationId/reverse", requireTenant, requireRole("admin", "manager"), async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const allocationId = parseParam(c, entityIdSchema, "allocationId");
    if (!allocationId.success) return allocationId.response;
    const parsed = await parseJson(c, reverseAllocationSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const now = Date.now();
    try {
      const allocation = await db.transaction(async (tx) => {
        const existing = await tx.select().from(receiptAllocations).where(and(
          eq(receiptAllocations.id, allocationId.data),
          eq(receiptAllocations.receiptId, id.data),
          eq(receiptAllocations.agencyId, agencyId),
          eq(receiptAllocations.status, "active"),
        )).get();
        if (!existing) throw new Error("Active allocation not found");
        const [updated] = await tx.update(receiptAllocations).set({
          status: "reversed",
          reversedAt: now,
          reversedBy: user.id,
          reversalReason: parsed.data.reason,
        }).where(and(
          eq(receiptAllocations.id, existing.id),
          eq(receiptAllocations.agencyId, agencyId),
        )).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "receipt.allocation_reversed",
          entityType: "receipt_allocation", entityId: existing.id,
          amount: -existing.amount,
          currency: (await tx.select({ currency: receiptTable.currency }).from(receiptTable)
            .where(eq(receiptTable.id, existing.receiptId)).get())?.currency,
          actorId: user.id,
          metadata: JSON.stringify({ receiptId: existing.receiptId, invoiceId: existing.invoiceId, reason: parsed.data.reason }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "receipt.allocation_reversed",
          entityType: "receipt_allocation",
          entityId: existing.id,
          metadata: { reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ allocation }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Reversal failed" }, 409);
    }
  })
  .patch("/:id/void", requireTenant, requireRole("admin", "manager"), async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, voidReceiptSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const existing = await findReceipt(agencyId, id.data);
    if (!existing || existing.status !== "posted") return c.json({ error: "Posted receipt not found" }, 404);
    const now = Date.now();
    try {
      const receipt = await db.transaction(async (tx) => {
        const allocations = await tx.select().from(receiptAllocations).where(and(
          eq(receiptAllocations.agencyId, agencyId),
          eq(receiptAllocations.receiptId, existing.id),
          eq(receiptAllocations.status, "active"),
        ));
        for (const allocation of allocations) {
          await tx.update(receiptAllocations).set({
            status: "reversed",
            reversedAt: now,
            reversedBy: user.id,
            reversalReason: `Receipt voided: ${parsed.data.reason}`,
          }).where(eq(receiptAllocations.id, allocation.id));
        }
        const [updated] = await tx.update(receiptTable).set({
          status: "void",
          voidedAt: now,
          voidedBy: user.id,
          voidReason: parsed.data.reason,
        }).where(and(eq(receiptTable.id, existing.id), eq(receiptTable.agencyId, agencyId))).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "receipt.voided", entityType: "receipt",
          entityId: existing.id, amount: -existing.amount, currency: existing.currency,
          actorId: user.id, metadata: JSON.stringify({ reason: parsed.data.reason }), createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "receipt.voided",
          entityType: "receipt",
          entityId: existing.id,
          metadata: { reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ receipt }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Receipt void failed" }, 409);
    }
  })
  .get("/:id/html", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const receipt = await findReceipt(agencyId, id.data);
    if (!receipt) return c.json({ error: "Not found" }, 404);
    const [contact, allocations] = await Promise.all([
      db.select({ name: contacts.displayName }).from(contacts).where(and(
        eq(contacts.id, receipt.contactId),
        eq(contacts.agencyId, agencyId),
      )).get(),
      db.select({
        invoiceNumber: invoices.invoiceNumber,
        amount: receiptAllocations.amount,
        status: receiptAllocations.status,
      }).from(receiptAllocations)
        .innerJoin(invoices, eq(invoices.id, receiptAllocations.invoiceId))
        .where(and(
          eq(receiptAllocations.agencyId, agencyId),
          eq(receiptAllocations.receiptId, receipt.id),
        )),
    ]);
    return c.html(receiptHtml({
      receiptNumber: receipt.receiptNumber,
      status: receipt.status,
      contactName: contact?.name ?? receipt.contactId,
      paymentDate: receipt.paymentDate,
      amount: receipt.amount,
      allocatedAmount: receipt.allocatedAmount,
      currency: receipt.currency,
      paymentMethod: receipt.paymentMethod,
      externalReference: receipt.externalReference,
      allocations,
    }), 200, {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
  });
