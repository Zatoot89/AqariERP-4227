import { Hono } from "hono";
import { and, asc, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import {
  financeEvents,
  invoiceLines,
  invoices as invoiceTable,
  paymentScheduleItems,
  paymentSchedules,
  receiptAllocations,
  receipts,
} from "../database/finance-schema";
import { auditLogs, profiles } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { assertFinanceTransition, requireReason, roundMoney, type StaffRole } from "../lib/finance-lifecycle";
import { nextFinanceNumber } from "../lib/finance-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createInvoiceSchema,
  financeListQuerySchema,
  invoiceTransitionSchema,
} from "../validation/finance";
import { entityIdSchema } from "../validation/schemas";

async function findInvoice(agencyId: string, id: string) {
  return db.select().from(invoiceTable).where(and(
    eq(invoiceTable.id, id),
    eq(invoiceTable.agencyId, agencyId),
  )).get();
}

async function validateInvoiceRelations(
  agencyId: string,
  body: {
    contactId: string;
    scheduleId?: string;
    scheduleItemId?: string;
    propertyId?: string;
    unitId?: string;
    currency: string;
  },
): Promise<string | undefined> {
  const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, body.contactId),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get();
  if (!contact) return "Contact not found";
  if (body.scheduleId) {
    const schedule = await db.select().from(paymentSchedules).where(and(
      eq(paymentSchedules.id, body.scheduleId),
      eq(paymentSchedules.agencyId, agencyId),
    )).get();
    if (!schedule || schedule.payerContactId !== body.contactId || schedule.currency !== body.currency) {
      return "Schedule does not match the contact and currency";
    }
  }
  if (body.scheduleItemId) {
    const item = await db.select().from(paymentScheduleItems).where(and(
      eq(paymentScheduleItems.id, body.scheduleItemId),
      eq(paymentScheduleItems.agencyId, agencyId),
    )).get();
    if (!item || (body.scheduleId && item.scheduleId !== body.scheduleId)) {
      return "Schedule item not found";
    }
  }
  if (body.propertyId) {
    const property = await db.select({ id: inventoryProperties.id }).from(inventoryProperties).where(and(
      eq(inventoryProperties.id, body.propertyId),
      eq(inventoryProperties.agencyId, agencyId),
      isNull(inventoryProperties.deletedAt),
    )).get();
    if (!property) return "Property not found";
  }
  if (body.unitId) {
    const unit = await db.select({ id: units.id }).from(units).where(and(
      eq(units.id, body.unitId),
      eq(units.agencyId, agencyId),
      isNull(units.deletedAt),
    )).get();
    if (!unit) return "Unit not found";
  }
  return undefined;
}

function invoiceHtml(input: {
  invoiceNumber: string;
  status: string;
  issueDate: number;
  dueAt: number;
  contactName: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTax: number;
    lineTotal: number;
  }>;
}): string {
  const escape = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const rows = input.lines.map((line) => `
    <tr>
      <td>${escape(line.description)}</td>
      <td>${line.quantity}</td>
      <td>${line.unitPrice.toFixed(2)}</td>
      <td>${line.lineTax.toFixed(2)}</td>
      <td>${line.lineTotal.toFixed(2)}</td>
    </tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>
    @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#111827}h1{margin:0}
    .meta{display:flex;justify-content:space-between;color:#6b7280;margin:8px 0 24px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}
    th{background:#f3f4f6}.totals{margin:20px 0 0 auto;width:320px}.totals td:first-child{font-weight:bold}
  </style></head><body>
    <h1>Invoice ${escape(input.invoiceNumber)}</h1>
    <div class="meta"><span>${escape(input.contactName)}</span><span>${escape(input.status)}</span></div>
    <p>Issue date: ${new Date(input.issueDate).toLocaleDateString()}<br/>Due date: ${new Date(input.dueAt).toLocaleDateString()}</p>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      <tr><td>Subtotal</td><td>${input.subtotal.toFixed(2)} ${escape(input.currency)}</td></tr>
      <tr><td>Tax</td><td>${input.taxAmount.toFixed(2)} ${escape(input.currency)}</td></tr>
      <tr><td>Discount</td><td>${input.discountAmount.toFixed(2)} ${escape(input.currency)}</td></tr>
      <tr><td>Total</td><td>${input.totalAmount.toFixed(2)} ${escape(input.currency)}</td></tr>
      <tr><td>Paid</td><td>${input.paidAmount.toFixed(2)} ${escape(input.currency)}</td></tr>
      <tr><td>Balance</td><td>${input.balanceDue.toFixed(2)} ${escape(input.currency)}</td></tr>
    </table>
  </body></html>`;
}

export const financeInvoices = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, financeListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const now = Date.now();
    await db.update(invoiceTable).set({ status: "overdue", updatedAt: now }).where(and(
      eq(invoiceTable.agencyId, agencyId),
      eq(invoiceTable.status, "issued"),
      lt(invoiceTable.dueAt, now),
    ));
    const rows = await db.select().from(invoiceTable).where(and(
      eq(invoiceTable.agencyId, agencyId),
      parsed.data.status ? eq(invoiceTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(invoiceTable.contactId, parsed.data.contactId) : undefined,
      parsed.data.sourceType ? eq(invoiceTable.sourceType, parsed.data.sourceType) : undefined,
      parsed.data.sourceId ? eq(invoiceTable.sourceId, parsed.data.sourceId) : undefined,
      parsed.data.propertyId ? eq(invoiceTable.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(invoiceTable.unitId, parsed.data.unitId) : undefined,
      parsed.data.from ? gte(invoiceTable.issueDate, parsed.data.from) : undefined,
      parsed.data.to ? lte(invoiceTable.issueDate, parsed.data.to) : undefined,
    )).orderBy(desc(invoiceTable.issueDate), desc(invoiceTable.createdAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ invoices: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createInvoiceSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const relationError = await validateInvoiceRelations(agencyId, parsed.data);
    if (relationError) return c.json({ error: relationError }, 404);
    const lines = parsed.data.lines.map((line, index) => {
      const lineSubtotal = roundMoney(line.quantity * line.unitPrice);
      const lineTax = roundMoney(lineSubtotal * line.taxRate / 100);
      return {
        sequence: index + 1,
        ...line,
        lineSubtotal,
        lineTax,
        lineTotal: roundMoney(lineSubtotal + lineTax),
      };
    });
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
    const taxAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTax, 0));
    const totalAmount = roundMoney(subtotal + taxAmount - parsed.data.discountAmount);
    if (totalAmount < 0) return c.json({ error: "Discount exceeds invoice amount" }, 400);
    const now = Date.now();
    try {
      const invoice = await db.transaction(async (tx) => {
        const invoiceNumber = await nextFinanceNumber(tx, agencyId, "invoice");
        const id = nanoid();
        const [created] = await tx.insert(invoiceTable).values({
          id,
          agencyId,
          invoiceNumber,
          contactId: parsed.data.contactId,
          sourceType: parsed.data.sourceType,
          sourceId: parsed.data.sourceId,
          scheduleId: parsed.data.scheduleId,
          scheduleItemId: parsed.data.scheduleItemId,
          propertyId: parsed.data.propertyId,
          unitId: parsed.data.unitId,
          status: "draft",
          issueDate: parsed.data.issueDate,
          dueAt: parsed.data.dueAt,
          subtotal,
          taxAmount,
          discountAmount: parsed.data.discountAmount,
          totalAmount,
          paidAmount: 0,
          balanceDue: totalAmount,
          currency: parsed.data.currency,
          notes: parsed.data.notes,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        }).returning();
        for (const line of lines) {
          await tx.insert(invoiceLines).values({
            id: nanoid(),
            agencyId,
            invoiceId: id,
            sequence: line.sequence,
            description: line.description,
            descriptionAr: line.descriptionAr,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineSubtotal: line.lineSubtotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
            createdAt: now,
          });
        }
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "invoice.created", entityType: "invoice",
          entityId: id, amount: totalAmount, currency: parsed.data.currency,
          actorId: user.id, metadata: JSON.stringify({ invoiceNumber }), createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "invoice.created",
          entityType: "invoice",
          entityId: id,
          metadata: { invoiceNumber, totalAmount, currency: parsed.data.currency },
        }));
        return created;
      });
      return c.json({ invoice }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not create invoice" }, 409);
    }
  })
  .post("/from-schedule-item/:itemId", requireTenant, async (c) => {
    const itemId = parseParam(c, entityIdSchema, "itemId");
    if (!itemId.success) return itemId.response;
    const agencyId = c.get("agencyId") as string;
    const item = await db.select().from(paymentScheduleItems).where(and(
      eq(paymentScheduleItems.id, itemId.data),
      eq(paymentScheduleItems.agencyId, agencyId),
    )).get();
    if (!item) return c.json({ error: "Schedule item not found" }, 404);
    const schedule = await db.select().from(paymentSchedules).where(and(
      eq(paymentSchedules.id, item.scheduleId),
      eq(paymentSchedules.agencyId, agencyId),
      eq(paymentSchedules.status, "active"),
    )).get();
    if (!schedule) return c.json({ error: "Active schedule not found" }, 409);
    const existing = await db.select().from(invoiceTable).where(and(
      eq(invoiceTable.agencyId, agencyId),
      eq(invoiceTable.scheduleItemId, item.id),
    )).get();
    if (existing && existing.status !== "void") {
      return c.json({ error: "This schedule item already has an invoice" }, 409);
    }
    const user = c.get("user")!;
    const now = Date.now();
    const invoice = await db.transaction(async (tx) => {
      const invoiceNumber = await nextFinanceNumber(tx, agencyId, "invoice");
      const id = nanoid();
      const [created] = await tx.insert(invoiceTable).values({
        id,
        agencyId,
        invoiceNumber,
        contactId: schedule.payerContactId,
        sourceType: schedule.sourceType,
        sourceId: schedule.sourceId,
        scheduleId: schedule.id,
        scheduleItemId: item.id,
        propertyId: schedule.propertyId,
        unitId: schedule.unitId,
        status: "draft",
        issueDate: now,
        dueAt: item.dueAt,
        subtotal: item.amount,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: item.amount,
        paidAmount: 0,
        balanceDue: item.amount,
        currency: schedule.currency,
        notes: item.notes,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(invoiceLines).values({
        id: nanoid(), agencyId, invoiceId: id, sequence: 1,
        description: item.label, descriptionAr: item.labelAr,
        quantity: 1, unitPrice: item.amount, taxRate: 0,
        lineSubtotal: item.amount, lineTax: 0, lineTotal: item.amount, createdAt: now,
      });
      await tx.insert(financeEvents).values({
        id: nanoid(), agencyId, eventType: "invoice.created_from_schedule",
        entityType: "invoice", entityId: id, amount: item.amount,
        currency: schedule.currency, actorId: user.id,
        metadata: JSON.stringify({ scheduleId: schedule.id, scheduleItemId: item.id, invoiceNumber }),
        createdAt: now,
      });
      return created;
    });
    return c.json({ invoice }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const invoice = await findInvoice(agencyId, id.data);
    if (!invoice) return c.json({ error: "Not found" }, 404);
    const [lines, allocations] = await Promise.all([
      db.select().from(invoiceLines).where(and(
        eq(invoiceLines.agencyId, agencyId),
        eq(invoiceLines.invoiceId, invoice.id),
      )).orderBy(asc(invoiceLines.sequence)),
      db.select({
        id: receiptAllocations.id,
        amount: receiptAllocations.amount,
        status: receiptAllocations.status,
        allocatedAt: receiptAllocations.allocatedAt,
        receiptId: receipts.id,
        receiptNumber: receipts.receiptNumber,
        paymentDate: receipts.paymentDate,
        paymentMethod: receipts.paymentMethod,
      }).from(receiptAllocations)
        .innerJoin(receipts, eq(receipts.id, receiptAllocations.receiptId))
        .where(and(
          eq(receiptAllocations.agencyId, agencyId),
          eq(receiptAllocations.invoiceId, invoice.id),
        )).orderBy(desc(receiptAllocations.allocatedAt)),
    ]);
    return c.json({ invoice: { ...invoice, lines, allocations } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, invoiceTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findInvoice(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertFinanceTransition("invoice", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requireReason("invoice", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required" }, 400);
    }
    const now = Date.now();
    try {
      const invoice = await db.transaction(async (tx) => {
        const [updated] = await tx.update(invoiceTable).set({
          status: parsed.data.toState,
          issuedAt: parsed.data.toState === "issued" ? now : existing.issuedAt,
          voidedAt: parsed.data.toState === "void" ? now : existing.voidedAt,
          voidReason: parsed.data.toState === "void" ? parsed.data.reason : existing.voidReason,
          updatedAt: now,
        }).where(and(eq(invoiceTable.id, existing.id), eq(invoiceTable.agencyId, agencyId))).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: `invoice.${parsed.data.toState}`,
          entityType: "invoice", entityId: existing.id, amount: existing.totalAmount,
          currency: existing.currency, actorId: user.id,
          metadata: JSON.stringify({ previousState: existing.status, reason: parsed.data.reason }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: `invoice.${parsed.data.toState}`,
          entityType: "invoice",
          entityId: existing.id,
          metadata: { previousState: existing.status, reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ invoice }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invoice transition failed" }, 409);
    }
  })
  .get("/:id/html", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const invoice = await findInvoice(agencyId, id.data);
    if (!invoice) return c.json({ error: "Not found" }, 404);
    const [contact, lines] = await Promise.all([
      db.select({ name: contacts.displayName }).from(contacts).where(and(
        eq(contacts.id, invoice.contactId),
        eq(contacts.agencyId, agencyId),
      )).get(),
      db.select().from(invoiceLines).where(and(
        eq(invoiceLines.agencyId, agencyId),
        eq(invoiceLines.invoiceId, invoice.id),
      )).orderBy(asc(invoiceLines.sequence)),
    ]);
    return c.html(invoiceHtml({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueAt: invoice.dueAt,
      contactName: contact?.name ?? invoice.contactId,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      discountAmount: invoice.discountAmount,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      lines,
    }), 200, {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
  });
