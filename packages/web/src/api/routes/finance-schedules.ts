import { Hono } from "hono";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import {
  financeEvents,
  paymentScheduleItems,
  paymentSchedules,
} from "../database/finance-schema";
import { auditLogs, profiles } from "../database/schema";
import { leases, saleMilestones, sales } from "../database/transaction-schema";
import { auditRecord } from "../lib/audit";
import { assertFinanceTransition, requireReason, roundMoney, type StaffRole } from "../lib/finance-lifecycle";
import { nextFinanceNumber } from "../lib/finance-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createScheduleSchema,
  financeListQuerySchema,
  generateScheduleSchema,
  scheduleTransitionSchema,
} from "../validation/finance";
import { entityIdSchema } from "../validation/schemas";

async function findSchedule(agencyId: string, id: string) {
  return db.select().from(paymentSchedules).where(and(
    eq(paymentSchedules.id, id),
    eq(paymentSchedules.agencyId, agencyId),
  )).get();
}

async function validateManualRelations(
  agencyId: string,
  body: {
    payerContactId: string;
    propertyId?: string;
    unitId?: string;
  },
): Promise<string | undefined> {
  const payer = await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, body.payerContactId),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get();
  if (!payer) return "Payer contact not found";
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

function monthsBetween(start: number, end: number): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.max(
    1,
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
      + endDate.getUTCMonth()
      - startDate.getUTCMonth(),
  );
}

function defaultLeaseInstallments(
  frequency: string,
  startsAt: number,
  endsAt: number,
): number {
  const months = monthsBetween(startsAt, endsAt);
  if (frequency === "monthly") return months;
  if (frequency === "quarterly") return Math.max(1, Math.ceil(months / 3));
  if (frequency === "semiannual") return Math.max(1, Math.ceil(months / 6));
  return Math.max(1, Math.ceil(months / 12));
}

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function distribute(total: number, count: number): number[] {
  const base = Math.floor((total / count) * 100) / 100;
  const values = Array.from({ length: count }, () => base);
  values[count - 1] = roundMoney(total - base * (count - 1));
  return values;
}

async function insertSchedule(
  c: Parameters<typeof auditRecord>[0],
  input: {
    agencyId: string;
    userId: string;
    sourceType: "lease" | "sale" | "reservation" | "manual";
    sourceId?: string;
    payerContactId: string;
    propertyId?: string | null;
    unitId?: string | null;
    currency: string;
    description?: string | null;
    items: Array<{ label: string; labelAr?: string | null; dueAt: number; amount: number; notes?: string | null }>;
  },
) {
  const now = Date.now();
  const totalAmount = roundMoney(input.items.reduce((sum, item) => sum + item.amount, 0));
  return db.transaction(async (tx) => {
    const scheduleNumber = await nextFinanceNumber(tx, input.agencyId, "schedule");
    const id = nanoid();
    const [schedule] = await tx.insert(paymentSchedules).values({
      id,
      agencyId: input.agencyId,
      scheduleNumber,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      payerContactId: input.payerContactId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      status: "draft",
      totalAmount,
      paidAmount: 0,
      currency: input.currency,
      description: input.description,
      createdBy: input.userId,
      createdAt: now,
      updatedAt: now,
    }).returning();
    for (const [index, item] of input.items.entries()) {
      await tx.insert(paymentScheduleItems).values({
        id: nanoid(),
        agencyId: input.agencyId,
        scheduleId: id,
        sequence: index + 1,
        label: item.label,
        labelAr: item.labelAr,
        dueAt: item.dueAt,
        amount: roundMoney(item.amount),
        paidAmount: 0,
        status: "pending",
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.insert(financeEvents).values({
      id: nanoid(),
      agencyId: input.agencyId,
      eventType: "schedule.created",
      entityType: "payment_schedule",
      entityId: id,
      amount: totalAmount,
      currency: input.currency,
      actorId: input.userId,
      metadata: JSON.stringify({ sourceType: input.sourceType, sourceId: input.sourceId, scheduleNumber }),
      createdAt: now,
    });
    await tx.insert(auditLogs).values(auditRecord(c, {
      agencyId: input.agencyId,
      action: "payment_schedule.created",
      entityType: "payment_schedule",
      entityId: id,
      metadata: { scheduleNumber, totalAmount, currency: input.currency },
    }));
    return schedule;
  });
}

export const financeSchedules = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, financeListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(paymentSchedules).where(and(
      eq(paymentSchedules.agencyId, agencyId),
      parsed.data.status ? eq(paymentSchedules.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(paymentSchedules.payerContactId, parsed.data.contactId) : undefined,
      parsed.data.sourceType ? eq(paymentSchedules.sourceType, parsed.data.sourceType) : undefined,
      parsed.data.sourceId ? eq(paymentSchedules.sourceId, parsed.data.sourceId) : undefined,
      parsed.data.propertyId ? eq(paymentSchedules.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(paymentSchedules.unitId, parsed.data.unitId) : undefined,
    )).orderBy(desc(paymentSchedules.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ schedules: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createScheduleSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const relationError = await validateManualRelations(agencyId, parsed.data);
    if (relationError) return c.json({ error: relationError }, 404);
    try {
      const schedule = await insertSchedule(c, {
        agencyId,
        userId: user.id,
        ...parsed.data,
      });
      return c.json({ schedule }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not create schedule" }, 409);
    }
  })
  .post("/generate", requireTenant, async (c) => {
    const parsed = await parseJson(c, generateScheduleSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = parsed.data;
    try {
      if (body.sourceType === "lease") {
        const lease = await db.select().from(leases).where(and(
          eq(leases.id, body.sourceId),
          eq(leases.agencyId, agencyId),
        )).get();
        if (!lease || !["active", "renewal_due", "renewed", "completed"].includes(lease.status)) {
          return c.json({ error: "Eligible lease not found" }, 404);
        }
        const count = body.installmentCount
          ?? defaultLeaseInstallments(lease.rentFrequency, lease.startsAt, lease.endsAt);
        const total = lease.rentFrequency === "monthly"
          ? lease.rentAmount * count
          : lease.rentFrequency === "quarterly"
            ? lease.rentAmount * count
            : lease.rentFrequency === "semiannual"
              ? lease.rentAmount * count
              : lease.rentAmount * Math.max(1, Math.ceil(monthsBetween(lease.startsAt, lease.endsAt) / 12));
        const amounts = distribute(roundMoney(total), count);
        const firstDueAt = body.firstDueAt ?? lease.startsAt;
        const monthStep = Math.max(1, Math.round(monthsBetween(lease.startsAt, lease.endsAt) / count));
        const schedule = await insertSchedule(c, {
          agencyId,
          userId: user.id,
          sourceType: "lease",
          sourceId: lease.id,
          payerContactId: lease.tenantContactId,
          unitId: lease.unitId,
          currency: lease.currency,
          description: `Lease ${lease.leaseNumber}`,
          items: amounts.map((amount, index) => ({
            label: `Rent installment ${index + 1}`,
            labelAr: `دفعة الإيجار ${index + 1}`,
            dueAt: addMonths(firstDueAt, monthStep * index),
            amount,
          })),
        });
        return c.json({ schedule }, 201);
      }

      const sale = await db.select().from(sales).where(and(
        eq(sales.id, body.sourceId),
        eq(sales.agencyId, agencyId),
      )).get();
      if (!sale || !["active", "completed"].includes(sale.status)) {
        return c.json({ error: "Eligible sale not found" }, 404);
      }
      const milestones = await db.select().from(saleMilestones).where(and(
        eq(saleMilestones.agencyId, agencyId),
        eq(saleMilestones.saleId, sale.id),
      )).orderBy(asc(saleMilestones.dueAt), asc(saleMilestones.createdAt));
      const items = milestones.length > 0
        ? milestones.map((milestone, index) => ({
            label: milestone.name,
            labelAr: milestone.nameAr,
            dueAt: milestone.dueAt ?? body.firstDueAt ?? sale.agreementAt ?? Date.now(),
            amount: milestone.amount ?? (index === milestones.length - 1 ? sale.agreedValue : 0),
            notes: milestone.notes,
          })).filter((item) => item.amount > 0)
        : [{
            label: "Sale payment",
            labelAr: "دفعة البيع",
            dueAt: body.firstDueAt ?? sale.expectedHandoverAt ?? sale.agreementAt ?? Date.now(),
            amount: sale.agreedValue,
          }];
      const schedule = await insertSchedule(c, {
        agencyId,
        userId: user.id,
        sourceType: "sale",
        sourceId: sale.id,
        payerContactId: sale.buyerContactId,
        propertyId: sale.propertyId,
        unitId: sale.unitId,
        currency: sale.currency,
        description: `Sale ${sale.saleNumber}`,
        items,
      });
      return c.json({ schedule }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not generate schedule" }, 409);
    }
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const schedule = await findSchedule(agencyId, id.data);
    if (!schedule) return c.json({ error: "Not found" }, 404);
    const items = await db.select().from(paymentScheduleItems).where(and(
      eq(paymentScheduleItems.agencyId, agencyId),
      eq(paymentScheduleItems.scheduleId, schedule.id),
    )).orderBy(asc(paymentScheduleItems.sequence));
    return c.json({ schedule: { ...schedule, items } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, scheduleTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findSchedule(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertFinanceTransition("schedule", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requireReason("schedule", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required" }, 400);
    }
    if (parsed.data.toState === "completed" && existing.paidAmount < existing.totalAmount - 0.009) {
      return c.json({ error: "The schedule still has an outstanding balance" }, 409);
    }
    const now = Date.now();
    const schedule = await db.transaction(async (tx) => {
      const [updated] = await tx.update(paymentSchedules).set({
        status: parsed.data.toState,
        activatedAt: parsed.data.toState === "active" ? now : existing.activatedAt,
        completedAt: parsed.data.toState === "completed" ? now : existing.completedAt,
        cancelledAt: parsed.data.toState === "cancelled" ? now : existing.cancelledAt,
        updatedAt: now,
      }).where(and(eq(paymentSchedules.id, existing.id), eq(paymentSchedules.agencyId, agencyId))).returning();
      await tx.insert(financeEvents).values({
        id: nanoid(), agencyId, eventType: `schedule.${parsed.data.toState}`,
        entityType: "payment_schedule", entityId: existing.id,
        amount: existing.totalAmount, currency: existing.currency, actorId: user.id,
        metadata: JSON.stringify({ previousState: existing.status, reason: parsed.data.reason }),
        createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: `payment_schedule.${parsed.data.toState}`,
        entityType: "payment_schedule",
        entityId: existing.id,
        metadata: { previousState: existing.status, reason: parsed.data.reason },
      }));
      return updated;
    });
    return c.json({ schedule }, 200);
  });
