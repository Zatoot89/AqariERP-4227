import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { availabilityHistory, contacts, units } from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import {
  offers,
  reservations as reservationTable,
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
  createReservationSchema,
  reservationTransitionSchema,
  transactionListQuerySchema,
} from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";

async function findReservation(agencyId: string, id: string) {
  return db.select().from(reservationTable).where(and(
    eq(reservationTable.id, id),
    eq(reservationTable.agencyId, agencyId),
  )).get();
}

async function setUnitAvailability(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  options: {
    agencyId: string;
    unitId: string;
    status: "available" | "reserved";
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

export const reservations = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, transactionListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(reservationTable).where(and(
      eq(reservationTable.agencyId, agencyId),
      parsed.data.status ? eq(reservationTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(reservationTable.contactId, parsed.data.contactId) : undefined,
      parsed.data.unitId ? eq(reservationTable.unitId, parsed.data.unitId) : undefined,
    )).orderBy(desc(reservationTable.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ reservations: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createReservationSchema);
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
    const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, body.contactId),
      eq(contacts.agencyId, agencyId),
      isNull(contacts.deletedAt),
    )).get();
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    if (body.offerId) {
      const offer = await db.select().from(offers).where(and(
        eq(offers.id, body.offerId),
        eq(offers.agencyId, agencyId),
        eq(offers.status, "accepted"),
      )).get();
      if (!offer || offer.unitId !== body.unitId || offer.buyerContactId !== body.contactId) {
        return c.json({ error: "Accepted offer does not match this unit and contact" }, 409);
      }
    }

    const now = Date.now();
    const reservation = await db.transaction(async (tx) => {
      const reservationNumber = await nextDocumentNumber(tx, agencyId, "reservation");
      const id = nanoid();
      const [created] = await tx.insert(reservationTable).values({
        id,
        agencyId,
        reservationNumber,
        unitId: body.unitId,
        contactId: body.contactId,
        offerId: body.offerId,
        status: "draft",
        startsAt: body.startsAt,
        expiresAt: body.expiresAt,
        depositAmount: body.depositAmount,
        currency: body.currency,
        notes: body.notes,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(transactionParties).values({
        id: nanoid(), agencyId, transactionType: "reservation", transactionId: id,
        contactId: body.contactId, partyRole: "principal", isSignatory: 1, createdAt: now,
      });
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "reservation", transactionId: id,
        fromState: null, toState: "draft", actorId: user.id, createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "reservation.created",
        entityType: "reservation",
        entityId: id,
        metadata: { reservationNumber, unitId: body.unitId, expiresAt: body.expiresAt },
      }));
      return created;
    });
    return c.json({ reservation }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const reservation = await findReservation(agencyId, id.data);
    if (!reservation) return c.json({ error: "Not found" }, 404);
    const [parties, events] = await Promise.all([
      db.select().from(transactionParties).where(and(
        eq(transactionParties.agencyId, agencyId),
        eq(transactionParties.transactionType, "reservation"),
        eq(transactionParties.transactionId, reservation.id),
      )),
      db.select().from(transactionStateEvents).where(and(
        eq(transactionStateEvents.agencyId, agencyId),
        eq(transactionStateEvents.transactionType, "reservation"),
        eq(transactionStateEvents.transactionId, reservation.id),
      )).orderBy(transactionStateEvents.createdAt),
    ]);
    return c.json({ reservation: { ...reservation, parties, events } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, reservationTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findReservation(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertTransition("reservation", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requiresTransitionReason("reservation", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required for this transition" }, 400);
    }
    if (parsed.data.toState === "converted" &&
      (!parsed.data.convertedTransactionType || !parsed.data.convertedTransactionId)) {
      return c.json({ error: "Converted reservations require the resulting lease or sale" }, 400);
    }
    const now = Date.now();
    try {
      const reservation = await db.transaction(async (tx) => {
        const [updated] = await tx.update(reservationTable).set({
          status: parsed.data.toState,
          convertedTransactionType: parsed.data.convertedTransactionType,
          convertedTransactionId: parsed.data.convertedTransactionId,
          activatedAt: parsed.data.toState === "active" ? now : existing.activatedAt,
          releasedAt: ["released", "cancelled"].includes(parsed.data.toState) ? now : existing.releasedAt,
          updatedAt: now,
        }).where(and(
          eq(reservationTable.id, existing.id),
          eq(reservationTable.agencyId, agencyId),
        )).returning();
        if (parsed.data.toState === "active") {
          await setUnitAvailability(tx, {
            agencyId,
            unitId: existing.unitId,
            status: "reserved",
            actorId: user.id,
            reason: `Reservation ${existing.reservationNumber} activated`,
            now,
          });
        }
        if (["released", "expired", "cancelled"].includes(parsed.data.toState)) {
          await setUnitAvailability(tx, {
            agencyId,
            unitId: existing.unitId,
            status: "available",
            actorId: user.id,
            reason: `Reservation ${existing.reservationNumber} ${parsed.data.toState}`,
            now,
          });
        }
        await tx.insert(transactionStateEvents).values({
          id: nanoid(), agencyId, transactionType: "reservation", transactionId: existing.id,
          fromState: existing.status, toState: parsed.data.toState, actorId: user.id,
          reason: parsed.data.reason,
          metadata: JSON.stringify({
            convertedTransactionType: parsed.data.convertedTransactionType,
            convertedTransactionId: parsed.data.convertedTransactionId,
          }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: `reservation.${parsed.data.toState}`,
          entityType: "reservation",
          entityId: existing.id,
          metadata: { previousState: existing.status, reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ reservation }, 200);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : "Reservation transition failed",
      }, 409);
    }
  });
