import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import {
  availabilityHistory,
  contacts,
  inventoryProperties,
  units,
} from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import {
  reservations,
  saleMilestones,
  sales as saleTable,
  transactionApprovals,
  transactionParties,
  transactionStateEvents,
} from "../database/transaction-schema";
import { auditRecord } from "../lib/audit";
import { nextDocumentNumber } from "../lib/document-number";
import { nanoid } from "../lib/id";
import {
  assertTransition,
  requiresTransitionReason,
  type StaffRole,
} from "../lib/transaction-state";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createSaleSchema,
  saleTransitionSchema,
  transactionListQuerySchema,
} from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";
import { z } from "zod";

const milestoneUpdateSchema = z.object({
  status: z.enum(["completed", "waived"]),
  notes: z.string().trim().max(3000).nullable().optional(),
}).strict();

async function findSale(agencyId: string, id: string) {
  return db.select().from(saleTable).where(and(
    eq(saleTable.id, id),
    eq(saleTable.agencyId, agencyId),
  )).get();
}

async function contactExists(agencyId: string, id: string) {
  return Boolean(await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, id),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get());
}

async function assetExists(agencyId: string, propertyId?: string, unitId?: string) {
  if (propertyId) {
    return Boolean(await db.select({ id: inventoryProperties.id }).from(inventoryProperties).where(and(
      eq(inventoryProperties.id, propertyId),
      eq(inventoryProperties.agencyId, agencyId),
      isNull(inventoryProperties.deletedAt),
    )).get());
  }
  return Boolean(await db.select({ id: units.id }).from(units).where(and(
    eq(units.id, unitId!),
    eq(units.agencyId, agencyId),
    isNull(units.deletedAt),
  )).get());
}

async function setAssetState(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  options: {
    agencyId: string;
    propertyId?: string | null;
    unitId?: string | null;
    status: "available" | "reserved" | "sold";
    actorId: string;
    reason: string;
    now: number;
  },
) {
  if (options.unitId) {
    await tx.update(units).set({ status: options.status, updatedAt: options.now }).where(and(
      eq(units.id, options.unitId),
      eq(units.agencyId, options.agencyId),
      isNull(units.deletedAt),
    ));
  } else if (options.propertyId) {
    await tx.update(inventoryProperties).set({ status: options.status, updatedAt: options.now }).where(and(
      eq(inventoryProperties.id, options.propertyId),
      eq(inventoryProperties.agencyId, options.agencyId),
      isNull(inventoryProperties.deletedAt),
    ));
  }
  const target = options.unitId
    ? eq(availabilityHistory.unitId, options.unitId)
    : eq(availabilityHistory.propertyId, options.propertyId!);
  await tx.update(availabilityHistory).set({ effectiveTo: options.now }).where(and(
    eq(availabilityHistory.agencyId, options.agencyId),
    target,
    isNull(availabilityHistory.effectiveTo),
  ));
  await tx.insert(availabilityHistory).values({
    id: nanoid(),
    agencyId: options.agencyId,
    propertyId: options.propertyId ?? undefined,
    unitId: options.unitId ?? undefined,
    status: options.status,
    effectiveFrom: options.now,
    reason: options.reason,
    changedBy: options.actorId,
    createdAt: options.now,
  });
}

export const sales = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, transactionListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(saleTable).where(and(
      eq(saleTable.agencyId, agencyId),
      parsed.data.status ? eq(saleTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(saleTable.buyerContactId, parsed.data.contactId) : undefined,
      parsed.data.propertyId ? eq(saleTable.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(saleTable.unitId, parsed.data.unitId) : undefined,
    )).orderBy(desc(saleTable.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ sales: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createSaleSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = parsed.data;
    if (!(await assetExists(agencyId, body.propertyId, body.unitId))) {
      return c.json({ error: "Property or unit not found" }, 404);
    }
    if (!(await contactExists(agencyId, body.buyerContactId))) {
      return c.json({ error: "Buyer contact not found" }, 404);
    }
    if (!(await contactExists(agencyId, body.sellerContactId))) {
      return c.json({ error: "Seller contact not found" }, 404);
    }
    if (body.reservationId) {
      const reservation = await db.select().from(reservations).where(and(
        eq(reservations.id, body.reservationId),
        eq(reservations.agencyId, agencyId),
        eq(reservations.status, "active"),
      )).get();
      if (!reservation || reservation.unitId !== body.unitId || reservation.contactId !== body.buyerContactId) {
        return c.json({ error: "Active matching reservation not found" }, 409);
      }
    }

    const now = Date.now();
    const sale = await db.transaction(async (tx) => {
      const saleNumber = await nextDocumentNumber(tx, agencyId, "sale");
      const id = nanoid();
      const [created] = await tx.insert(saleTable).values({
        id,
        agencyId,
        saleNumber,
        propertyId: body.propertyId,
        unitId: body.unitId,
        offerId: body.offerId,
        reservationId: body.reservationId,
        buyerContactId: body.buyerContactId,
        sellerContactId: body.sellerContactId,
        status: "draft",
        agreedValue: body.agreedValue,
        depositAmount: body.depositAmount,
        currency: body.currency,
        agreementAt: body.agreementAt,
        expectedHandoverAt: body.expectedHandoverAt,
        terms: body.terms ? JSON.stringify(body.terms) : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(transactionParties).values([
        {
          id: nanoid(), agencyId, transactionType: "sale", transactionId: id,
          contactId: body.buyerContactId, partyRole: "buyer", isSignatory: 1, createdAt: now,
        },
        {
          id: nanoid(), agencyId, transactionType: "sale", transactionId: id,
          contactId: body.sellerContactId, partyRole: "seller", isSignatory: 1, createdAt: now,
        },
      ]);
      for (const milestone of body.milestones ?? []) {
        await tx.insert(saleMilestones).values({
          id: nanoid(),
          agencyId,
          saleId: id,
          name: milestone.name,
          nameAr: milestone.nameAr,
          amount: milestone.amount,
          dueAt: milestone.dueAt,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "sale", transactionId: id,
        fromState: null, toState: "draft", actorId: user.id, createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "sale.created",
        entityType: "sale",
        entityId: id,
        metadata: { saleNumber, agreedValue: body.agreedValue, currency: body.currency },
      }));
      return created;
    });
    return c.json({ sale }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const sale = await findSale(agencyId, id.data);
    if (!sale) return c.json({ error: "Not found" }, 404);
    const [parties, milestones, events, approvals] = await Promise.all([
      db.select().from(transactionParties).where(and(
        eq(transactionParties.agencyId, agencyId),
        eq(transactionParties.transactionType, "sale"),
        eq(transactionParties.transactionId, sale.id),
      )),
      db.select().from(saleMilestones).where(and(
        eq(saleMilestones.agencyId, agencyId),
        eq(saleMilestones.saleId, sale.id),
      )).orderBy(saleMilestones.createdAt),
      db.select().from(transactionStateEvents).where(and(
        eq(transactionStateEvents.agencyId, agencyId),
        eq(transactionStateEvents.transactionType, "sale"),
        eq(transactionStateEvents.transactionId, sale.id),
      )).orderBy(transactionStateEvents.createdAt),
      db.select().from(transactionApprovals).where(and(
        eq(transactionApprovals.agencyId, agencyId),
        eq(transactionApprovals.transactionType, "sale"),
        eq(transactionApprovals.transactionId, sale.id),
      )).orderBy(transactionApprovals.requestedAt),
    ]);
    return c.json({ sale: { ...sale, parties, milestones, events, approvals } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, saleTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findSale(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertTransition("sale", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requiresTransitionReason("sale", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required for this transition" }, 400);
    }
    if (parsed.data.toState === "completed") {
      const incomplete = await db.select({ id: saleMilestones.id }).from(saleMilestones).where(and(
        eq(saleMilestones.agencyId, agencyId),
        eq(saleMilestones.saleId, existing.id),
        eq(saleMilestones.status, "pending"),
      )).get();
      if (incomplete) return c.json({ error: "Complete or waive all sale milestones first" }, 409);
    }
    const now = parsed.data.effectiveAt ?? Date.now();
    try {
      const sale = await db.transaction(async (tx) => {
        const [updated] = await tx.update(saleTable).set({
          status: parsed.data.toState,
          approvedAt: parsed.data.toState === "active" ? now : existing.approvedAt,
          activatedAt: parsed.data.toState === "active" ? now : existing.activatedAt,
          completedAt: parsed.data.toState === "completed" ? now : existing.completedAt,
          handoverAt: parsed.data.toState === "completed" ? now : existing.handoverAt,
          terminationAt: parsed.data.toState === "terminated" ? now : existing.terminationAt,
          terminationReason: parsed.data.toState === "terminated" ? parsed.data.reason : existing.terminationReason,
          updatedAt: now,
        }).where(and(eq(saleTable.id, existing.id), eq(saleTable.agencyId, agencyId))).returning();
        if (parsed.data.toState === "pending_approval") {
          await tx.insert(transactionApprovals).values({
            id: nanoid(), agencyId, transactionType: "sale", transactionId: existing.id,
            requestedBy: user.id, status: "pending", requestedAt: now,
          });
        }
        if (["active", "rejected"].includes(parsed.data.toState)) {
          await tx.update(transactionApprovals).set({
            status: parsed.data.toState === "active" ? "approved" : "rejected",
            approverId: user.id,
            decidedAt: now,
            note: parsed.data.reason,
          }).where(and(
            eq(transactionApprovals.agencyId, agencyId),
            eq(transactionApprovals.transactionType, "sale"),
            eq(transactionApprovals.transactionId, existing.id),
            eq(transactionApprovals.status, "pending"),
          ));
        }
        if (parsed.data.toState === "active") {
          await setAssetState(tx, {
            agencyId,
            propertyId: existing.propertyId,
            unitId: existing.unitId,
            status: "reserved",
            actorId: user.id,
            reason: `Sale ${existing.saleNumber} activated`,
            now,
          });
          if (existing.reservationId) {
            await tx.update(reservations).set({
              status: "converted",
              convertedTransactionType: "sale",
              convertedTransactionId: existing.id,
              updatedAt: now,
            }).where(and(
              eq(reservations.id, existing.reservationId),
              eq(reservations.agencyId, agencyId),
            ));
          }
        }
        if (parsed.data.toState === "completed") {
          await setAssetState(tx, {
            agencyId,
            propertyId: existing.propertyId,
            unitId: existing.unitId,
            status: "sold",
            actorId: user.id,
            reason: `Sale ${existing.saleNumber} completed`,
            now,
          });
        }
        if (["rejected", "terminated", "cancelled"].includes(parsed.data.toState)) {
          await setAssetState(tx, {
            agencyId,
            propertyId: existing.propertyId,
            unitId: existing.unitId,
            status: "available",
            actorId: user.id,
            reason: `Sale ${existing.saleNumber} ${parsed.data.toState}`,
            now,
          });
        }
        await tx.insert(transactionStateEvents).values({
          id: nanoid(), agencyId, transactionType: "sale", transactionId: existing.id,
          fromState: existing.status, toState: parsed.data.toState, actorId: user.id,
          reason: parsed.data.reason,
          metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: `sale.${parsed.data.toState}`,
          entityType: "sale",
          entityId: existing.id,
          metadata: { previousState: existing.status, reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ sale }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Sale transition failed" }, 409);
    }
  })
  .patch("/:id/milestones/:milestoneId", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const milestoneId = parseParam(c, entityIdSchema, "milestoneId");
    if (!milestoneId.success) return milestoneId.response;
    const parsed = await parseJson(c, milestoneUpdateSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const sale = await findSale(agencyId, id.data);
    if (!sale) return c.json({ error: "Sale not found" }, 404);
    const now = Date.now();
    const [milestone] = await db.update(saleMilestones).set({
      status: parsed.data.status,
      completedAt: parsed.data.status === "completed" ? now : null,
      notes: parsed.data.notes,
      updatedAt: now,
    }).where(and(
      eq(saleMilestones.id, milestoneId.data),
      eq(saleMilestones.saleId, sale.id),
      eq(saleMilestones.agencyId, agencyId),
    )).returning();
    if (!milestone) return c.json({ error: "Milestone not found" }, 404);
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: `sale_milestone.${parsed.data.status}`,
      entityType: "sale_milestone",
      entityId: milestone.id,
      metadata: { saleId: sale.id },
    }));
    return c.json({ milestone }, 200);
  });
