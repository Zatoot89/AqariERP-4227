import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import { expenses as expenseTable, financeEvents } from "../database/finance-schema";
import { auditLogs, profiles } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { assertFinanceTransition, requireReason, roundMoney, type StaffRole } from "../lib/finance-lifecycle";
import { nextFinanceNumber } from "../lib/finance-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createExpenseSchema,
  expenseTransitionSchema,
  financeListQuerySchema,
} from "../validation/finance";
import { entityIdSchema } from "../validation/schemas";

async function findExpense(agencyId: string, id: string) {
  return db.select().from(expenseTable).where(and(
    eq(expenseTable.id, id),
    eq(expenseTable.agencyId, agencyId),
  )).get();
}

async function validateRelations(
  agencyId: string,
  body: { vendorContactId?: string; propertyId?: string; unitId?: string },
): Promise<string | undefined> {
  if (body.vendorContactId) {
    const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, body.vendorContactId),
      eq(contacts.agencyId, agencyId),
    )).get();
    if (!contact) return "Vendor contact not found";
  }
  if (body.propertyId) {
    const property = await db.select({ id: inventoryProperties.id }).from(inventoryProperties).where(and(
      eq(inventoryProperties.id, body.propertyId),
      eq(inventoryProperties.agencyId, agencyId),
    )).get();
    if (!property) return "Property not found";
  }
  if (body.unitId) {
    const unit = await db.select().from(units).where(and(
      eq(units.id, body.unitId),
      eq(units.agencyId, agencyId),
    )).get();
    if (!unit) return "Unit not found";
    if (body.propertyId && unit.propertyId !== body.propertyId) {
      return "Unit does not belong to the selected property";
    }
  }
  return undefined;
}

export const financeExpenses = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, financeListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(expenseTable).where(and(
      eq(expenseTable.agencyId, agencyId),
      parsed.data.status ? eq(expenseTable.status, parsed.data.status) : undefined,
      parsed.data.propertyId ? eq(expenseTable.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(expenseTable.unitId, parsed.data.unitId) : undefined,
      parsed.data.from ? eq(expenseTable.incurredAt, parsed.data.from) : undefined,
    )).orderBy(desc(expenseTable.incurredAt), desc(expenseTable.createdAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ expenses: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createExpenseSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const relationError = await validateRelations(agencyId, parsed.data);
    if (relationError) return c.json({ error: relationError }, 404);
    const totalAmount = roundMoney(parsed.data.subtotal + parsed.data.taxAmount);
    const now = Date.now();
    try {
      const expense = await db.transaction(async (tx) => {
        const expenseNumber = await nextFinanceNumber(tx, agencyId, "expense");
        const id = nanoid();
        const [created] = await tx.insert(expenseTable).values({
          id,
          agencyId,
          expenseNumber,
          category: parsed.data.category,
          vendorContactId: parsed.data.vendorContactId,
          propertyId: parsed.data.propertyId,
          unitId: parsed.data.unitId,
          sourceType: parsed.data.sourceType,
          sourceId: parsed.data.sourceId,
          status: "draft",
          description: parsed.data.description,
          incurredAt: parsed.data.incurredAt,
          dueAt: parsed.data.dueAt,
          subtotal: parsed.data.subtotal,
          taxAmount: parsed.data.taxAmount,
          totalAmount,
          currency: parsed.data.currency,
          notes: parsed.data.notes,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        }).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "expense.created", entityType: "expense",
          entityId: id, amount: totalAmount, currency: parsed.data.currency,
          actorId: user.id, metadata: JSON.stringify({ expenseNumber, category: parsed.data.category }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "expense.created",
          entityType: "expense",
          entityId: id,
          metadata: { expenseNumber, totalAmount, currency: parsed.data.currency },
        }));
        return created;
      });
      return c.json({ expense }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not create expense" }, 409);
    }
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const expense = await findExpense(c.get("agencyId") as string, id.data);
    if (!expense) return c.json({ error: "Not found" }, 404);
    return c.json({ expense }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, expenseTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findExpense(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertFinanceTransition("expense", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requireReason("expense", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required" }, 400);
    }
    if (parsed.data.toState === "paid" && !parsed.data.paymentMethod) {
      return c.json({ error: "Payment method is required" }, 400);
    }
    const now = parsed.data.effectiveAt ?? Date.now();
    try {
      const expense = await db.transaction(async (tx) => {
        const [updated] = await tx.update(expenseTable).set({
          status: parsed.data.toState,
          submittedAt: parsed.data.toState === "submitted" ? now : existing.submittedAt,
          approvedAt: parsed.data.toState === "approved" ? now : existing.approvedAt,
          approvedBy: parsed.data.toState === "approved" ? user.id : existing.approvedBy,
          paidAt: parsed.data.toState === "paid" ? now : existing.paidAt,
          paidBy: parsed.data.toState === "paid" ? user.id : existing.paidBy,
          paymentMethod: parsed.data.toState === "paid" ? parsed.data.paymentMethod : existing.paymentMethod,
          paymentReference: parsed.data.toState === "paid" ? parsed.data.paymentReference : existing.paymentReference,
          rejectionReason: parsed.data.toState === "rejected" ? parsed.data.reason : existing.rejectionReason,
          updatedAt: now,
        }).where(and(eq(expenseTable.id, existing.id), eq(expenseTable.agencyId, agencyId))).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: `expense.${parsed.data.toState}`,
          entityType: "expense", entityId: existing.id,
          amount: parsed.data.toState === "paid" ? -existing.totalAmount : existing.totalAmount,
          currency: existing.currency, actorId: user.id,
          metadata: JSON.stringify({ previousState: existing.status, reason: parsed.data.reason }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: `expense.${parsed.data.toState}`,
          entityType: "expense",
          entityId: existing.id,
          metadata: { previousState: existing.status, reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ expense }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Expense transition failed" }, 409);
    }
  });
