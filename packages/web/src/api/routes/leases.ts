import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { availabilityHistory, contacts, units } from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import {
  leases as leaseTable,
  reservations,
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
  createLeaseSchema,
  leaseTransitionSchema,
  renewLeaseSchema,
  transactionListQuerySchema,
} from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";

async function findLease(agencyId: string, id: string) {
  return db.select().from(leaseTable).where(and(
    eq(leaseTable.id, id),
    eq(leaseTable.agencyId, agencyId),
  )).get();
}

async function contactExists(agencyId: string, id: string) {
  return Boolean(await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, id),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get());
}

async function setUnitState(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  options: {
    agencyId: string;
    unitId: string;
    status: "available" | "rented";
    actorId: string;
    reason: string;
    now: number;
  },
) {
  await tx.update(units).set({ status: options.status, updatedAt: options.now }).where(and(
    eq(units.id, options.unitId),
    eq(units.agencyId, options.agencyId),
    isNull(units.deletedAt),
  ));
  await tx.update(availabilityHistory).set({ effectiveTo: options.now }).where(and(
    eq(availabilityHistory.agencyId, options.agencyId),
    eq(availabilityHistory.unitId, options.unitId),
    isNull(availabilityHistory.effectiveTo),
  ));
  await tx.insert(availabilityHistory).values({
    id: nanoid(),
    agencyId: options.agencyId,
    unitId: options.unitId,
    status: options.status,
    effectiveFrom: options.now,
    reason: options.reason,
    changedBy: options.actorId,
    createdAt: options.now,
  });
}

async function insertLeaseParties(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  options: {
    agencyId: string;
    leaseId: string;
    landlordContactId: string;
    tenantContactId: string;
    guarantorContactIds?: string[];
    occupantContactIds?: string[];
    now: number;
  },
) {
  await tx.insert(transactionParties).values([
    {
      id: nanoid(), agencyId: options.agencyId, transactionType: "lease",
      transactionId: options.leaseId, contactId: options.landlordContactId,
      partyRole: "landlord", isSignatory: 1, createdAt: options.now,
    },
    {
      id: nanoid(), agencyId: options.agencyId, transactionType: "lease",
      transactionId: options.leaseId, contactId: options.tenantContactId,
      partyRole: "tenant", isSignatory: 1, createdAt: options.now,
    },
  ]);
  for (const contactId of options.guarantorContactIds ?? []) {
    await tx.insert(transactionParties).values({
      id: nanoid(), agencyId: options.agencyId, transactionType: "lease",
      transactionId: options.leaseId, contactId, partyRole: "guarantor",
      isSignatory: 1, createdAt: options.now,
    });
  }
  for (const contactId of options.occupantContactIds ?? []) {
    await tx.insert(transactionParties).values({
      id: nanoid(), agencyId: options.agencyId, transactionType: "lease",
      transactionId: options.leaseId, contactId, partyRole: "occupant",
      isSignatory: 0, createdAt: options.now,
    });
  }
}

export const leases = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, transactionListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(leaseTable).where(and(
      eq(leaseTable.agencyId, agencyId),
      parsed.data.status ? eq(leaseTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(leaseTable.tenantContactId, parsed.data.contactId) : undefined,
      parsed.data.unitId ? eq(leaseTable.unitId, parsed.data.unitId) : undefined,
    )).orderBy(desc(leaseTable.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ leases: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createLeaseSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = parsed.data;
    const unit = await db.select().from(units).where(and(
      eq(units.id, body.unitId),
      eq(units.agencyId, agencyId),
      isNull(units.deletedAt),
    )).get();
    if (!unit) return c.json({ error: "Unit not found" }, 404);
    const partyIds = [
      body.landlordContactId,
      body.tenantContactId,
      ...(body.guarantorContactIds ?? []),
      ...(body.occupantContactIds ?? []),
    ];
    for (const contactId of new Set(partyIds)) {
      if (!(await contactExists(agencyId, contactId))) {
        return c.json({ error: `Contact not found: ${contactId}` }, 404);
      }
    }
    if (body.reservationId) {
      const reservation = await db.select().from(reservations).where(and(
        eq(reservations.id, body.reservationId),
        eq(reservations.agencyId, agencyId),
        eq(reservations.unitId, body.unitId),
        eq(reservations.contactId, body.tenantContactId),
        eq(reservations.status, "active"),
      )).get();
      if (!reservation) return c.json({ error: "Active matching reservation not found" }, 409);
    }

    const now = Date.now();
    const lease = await db.transaction(async (tx) => {
      const leaseNumber = await nextDocumentNumber(tx, agencyId, "lease");
      const id = nanoid();
      const [created] = await tx.insert(leaseTable).values({
        id,
        agencyId,
        leaseNumber,
        unitId: body.unitId,
        offerId: body.offerId,
        reservationId: body.reservationId,
        landlordContactId: body.landlordContactId,
        tenantContactId: body.tenantContactId,
        status: "draft",
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        noticeDays: body.noticeDays,
        rentAmount: body.rentAmount,
        rentFrequency: body.rentFrequency,
        securityDeposit: body.securityDeposit,
        currency: body.currency,
        terms: body.terms ? JSON.stringify(body.terms) : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await insertLeaseParties(tx, {
        agencyId,
        leaseId: id,
        landlordContactId: body.landlordContactId,
        tenantContactId: body.tenantContactId,
        guarantorContactIds: body.guarantorContactIds,
        occupantContactIds: body.occupantContactIds,
        now,
      });
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "lease", transactionId: id,
        fromState: null, toState: "draft", actorId: user.id, createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lease.created",
        entityType: "lease",
        entityId: id,
        metadata: { leaseNumber, unitId: body.unitId, startsAt: body.startsAt, endsAt: body.endsAt },
      }));
      return created;
    });
    return c.json({ lease }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const lease = await findLease(agencyId, id.data);
    if (!lease) return c.json({ error: "Not found" }, 404);
    const [parties, events, approvals, renewals] = await Promise.all([
      db.select().from(transactionParties).where(and(
        eq(transactionParties.agencyId, agencyId),
        eq(transactionParties.transactionType, "lease"),
        eq(transactionParties.transactionId, lease.id),
      )),
      db.select().from(transactionStateEvents).where(and(
        eq(transactionStateEvents.agencyId, agencyId),
        eq(transactionStateEvents.transactionType, "lease"),
        eq(transactionStateEvents.transactionId, lease.id),
      )).orderBy(transactionStateEvents.createdAt),
      db.select().from(transactionApprovals).where(and(
        eq(transactionApprovals.agencyId, agencyId),
        eq(transactionApprovals.transactionType, "lease"),
        eq(transactionApprovals.transactionId, lease.id),
      )).orderBy(transactionApprovals.requestedAt),
      db.select().from(leaseTable).where(and(
        eq(leaseTable.agencyId, agencyId),
        eq(leaseTable.parentLeaseId, lease.id),
      )).orderBy(leaseTable.createdAt),
    ]);
    return c.json({ lease: { ...lease, parties, events, approvals, renewals } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, leaseTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findLease(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertTransition("lease", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requiresTransitionReason("lease", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required for this transition" }, 400);
    }
    const now = parsed.data.effectiveAt ?? Date.now();
    try {
      const lease = await db.transaction(async (tx) => {
        const [updated] = await tx.update(leaseTable).set({
          status: parsed.data.toState,
          approvedAt: parsed.data.toState === "active" ? now : existing.approvedAt,
          activatedAt: parsed.data.toState === "active" ? now : existing.activatedAt,
          terminationAt: parsed.data.toState === "terminated" ? now : existing.terminationAt,
          terminationReason: parsed.data.toState === "terminated" ? parsed.data.reason : existing.terminationReason,
          updatedAt: now,
        }).where(and(eq(leaseTable.id, existing.id), eq(leaseTable.agencyId, agencyId))).returning();

        if (parsed.data.toState === "pending_approval") {
          await tx.insert(transactionApprovals).values({
            id: nanoid(), agencyId, transactionType: "lease", transactionId: existing.id,
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
            eq(transactionApprovals.transactionType, "lease"),
            eq(transactionApprovals.transactionId, existing.id),
            eq(transactionApprovals.status, "pending"),
          ));
        }
        if (parsed.data.toState === "active") {
          await setUnitState(tx, {
            agencyId,
            unitId: existing.unitId,
            status: "rented",
            actorId: user.id,
            reason: `Lease ${existing.leaseNumber} activated`,
            now,
          });
          if (existing.reservationId) {
            await tx.update(reservations).set({
              status: "converted",
              convertedTransactionType: "lease",
              convertedTransactionId: existing.id,
              updatedAt: now,
            }).where(and(
              eq(reservations.id, existing.reservationId),
              eq(reservations.agencyId, agencyId),
            ));
          }
        }
        if (["terminated", "expired", "completed", "cancelled", "rejected"].includes(parsed.data.toState)) {
          await setUnitState(tx, {
            agencyId,
            unitId: existing.unitId,
            status: "available",
            actorId: user.id,
            reason: `Lease ${existing.leaseNumber} ${parsed.data.toState}`,
            now,
          });
        }
        await tx.insert(transactionStateEvents).values({
          id: nanoid(), agencyId, transactionType: "lease", transactionId: existing.id,
          fromState: existing.status, toState: parsed.data.toState, actorId: user.id,
          reason: parsed.data.reason,
          metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: `lease.${parsed.data.toState}`,
          entityType: "lease",
          entityId: existing.id,
          metadata: { previousState: existing.status, reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ lease }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Lease transition failed" }, 409);
    }
  })
  .post("/:id/renew", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, renewLeaseSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findLease(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (profile.role === "agent") return c.json({ error: "Renewal requires manager or administrator" }, 403);
    if (!['active', 'renewal_due'].includes(existing.status)) {
      return c.json({ error: "Only active or renewal-due leases can be renewed" }, 409);
    }
    const parties = await db.select().from(transactionParties).where(and(
      eq(transactionParties.agencyId, agencyId),
      eq(transactionParties.transactionType, "lease"),
      eq(transactionParties.transactionId, existing.id),
    ));
    const now = Date.now();
    try {
      const renewal = await db.transaction(async (tx) => {
        const leaseNumber = await nextDocumentNumber(tx, agencyId, "lease");
        const renewalId = nanoid();
        const [created] = await tx.insert(leaseTable).values({
          id: renewalId,
          agencyId,
          leaseNumber,
          parentLeaseId: existing.id,
          unitId: existing.unitId,
          landlordContactId: existing.landlordContactId,
          tenantContactId: existing.tenantContactId,
          status: "draft",
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          noticeDays: existing.noticeDays,
          rentAmount: parsed.data.rentAmount ?? existing.rentAmount,
          rentFrequency: existing.rentFrequency,
          securityDeposit: parsed.data.securityDeposit ?? existing.securityDeposit,
          currency: existing.currency,
          terms: parsed.data.terms ? JSON.stringify(parsed.data.terms) : existing.terms,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        }).returning();
        for (const party of parties) {
          await tx.insert(transactionParties).values({
            id: nanoid(), agencyId, transactionType: "lease", transactionId: renewalId,
            contactId: party.contactId, partyRole: party.partyRole,
            isSignatory: party.isSignatory, signatureStatus: "not_requested", createdAt: now,
          });
        }
        await tx.update(leaseTable).set({ status: "renewed", updatedAt: now }).where(and(
          eq(leaseTable.id, existing.id), eq(leaseTable.agencyId, agencyId),
        ));
        await tx.insert(transactionStateEvents).values([
          {
            id: nanoid(), agencyId, transactionType: "lease", transactionId: existing.id,
            fromState: existing.status, toState: "renewed", actorId: user.id,
            metadata: JSON.stringify({ renewalLeaseId: renewalId }), createdAt: now,
          },
          {
            id: nanoid(), agencyId, transactionType: "lease", transactionId: renewalId,
            fromState: null, toState: "draft", actorId: user.id,
            metadata: JSON.stringify({ parentLeaseId: existing.id }), createdAt: now,
          },
        ]);
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "lease.renewal_created",
          entityType: "lease",
          entityId: renewalId,
          metadata: { parentLeaseId: existing.id, leaseNumber },
        }));
        return created;
      });
      return c.json({ lease: renewal }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Lease renewal failed" }, 409);
    }
  });
