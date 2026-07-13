import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import {
  offers as offerTable,
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
  createCounterOfferSchema,
  createOfferSchema,
  offerTransitionSchema,
  transactionListQuerySchema,
} from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";

async function findOffer(agencyId: string, id: string) {
  return db.select().from(offerTable).where(and(
    eq(offerTable.id, id),
    eq(offerTable.agencyId, agencyId),
  )).get();
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

async function contactExists(agencyId: string, contactId: string | undefined) {
  if (!contactId) return true;
  return Boolean(await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, contactId),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get());
}

export const offers = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, transactionListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(offerTable).where(and(
      eq(offerTable.agencyId, agencyId),
      parsed.data.status ? eq(offerTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(offerTable.buyerContactId, parsed.data.contactId) : undefined,
      parsed.data.propertyId ? eq(offerTable.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(offerTable.unitId, parsed.data.unitId) : undefined,
    )).orderBy(desc(offerTable.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ offers: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createOfferSchema);
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

    const now = Date.now();
    const offer = await db.transaction(async (tx) => {
      const offerNumber = await nextDocumentNumber(tx, agencyId, "offer");
      const id = nanoid();
      const [created] = await tx.insert(offerTable).values({
        id,
        agencyId,
        offerNumber,
        negotiationRootId: id,
        version: 1,
        propertyId: body.propertyId,
        unitId: body.unitId,
        buyerContactId: body.buyerContactId,
        sellerContactId: body.sellerContactId,
        leadId: body.leadId,
        status: "draft",
        offeredAmount: body.offeredAmount,
        currency: body.currency,
        validUntil: body.validUntil,
        terms: body.terms ? JSON.stringify(body.terms) : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(transactionParties).values({
        id: nanoid(), agencyId, transactionType: "offer", transactionId: id,
        contactId: body.buyerContactId, partyRole: "buyer", isSignatory: 1, createdAt: now,
      });
      if (body.sellerContactId) {
        await tx.insert(transactionParties).values({
          id: nanoid(), agencyId, transactionType: "offer", transactionId: id,
          contactId: body.sellerContactId, partyRole: "seller", isSignatory: 1, createdAt: now,
        });
      }
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "offer", transactionId: id,
        fromState: null, toState: "draft", actorId: user.id, createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "offer.created",
        entityType: "offer",
        entityId: id,
        metadata: { offerNumber, amount: body.offeredAmount, currency: body.currency },
      }));
      return created;
    });
    return c.json({ offer }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const offer = await findOffer(agencyId, id.data);
    if (!offer) return c.json({ error: "Not found" }, 404);
    const [versions, parties, events] = await Promise.all([
      db.select().from(offerTable).where(and(
        eq(offerTable.agencyId, agencyId),
        eq(offerTable.negotiationRootId, offer.negotiationRootId),
      )).orderBy(offerTable.version),
      db.select().from(transactionParties).where(and(
        eq(transactionParties.agencyId, agencyId),
        eq(transactionParties.transactionType, "offer"),
        eq(transactionParties.transactionId, offer.id),
      )),
      db.select().from(transactionStateEvents).where(and(
        eq(transactionStateEvents.agencyId, agencyId),
        eq(transactionStateEvents.transactionType, "offer"),
        eq(transactionStateEvents.transactionId, offer.id),
      )).orderBy(transactionStateEvents.createdAt),
    ]);
    return c.json({ offer: { ...offer, versions, parties, events } }, 200);
  })
  .post("/:id/counter", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, createCounterOfferSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const existing = await findOffer(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (!["submitted", "under_review", "countered"].includes(existing.status)) {
      return c.json({ error: "This offer cannot be countered in its current state" }, 409);
    }
    const now = Date.now();
    const counter = await db.transaction(async (tx) => {
      await tx.update(offerTable).set({ status: "countered", updatedAt: now }).where(and(
        eq(offerTable.id, existing.id), eq(offerTable.agencyId, agencyId),
      ));
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "offer", transactionId: existing.id,
        fromState: existing.status, toState: "countered", actorId: user.id, createdAt: now,
      });
      const offerNumber = await nextDocumentNumber(tx, agencyId, "offer");
      const counterId = nanoid();
      const [created] = await tx.insert(offerTable).values({
        id: counterId,
        agencyId,
        offerNumber,
        negotiationRootId: existing.negotiationRootId,
        parentOfferId: existing.id,
        version: existing.version + 1,
        propertyId: existing.propertyId,
        unitId: existing.unitId,
        buyerContactId: existing.buyerContactId,
        sellerContactId: existing.sellerContactId,
        leadId: existing.leadId,
        status: "draft",
        offeredAmount: parsed.data.offeredAmount,
        currency: parsed.data.currency ?? existing.currency,
        validUntil: parsed.data.validUntil ?? existing.validUntil,
        terms: parsed.data.terms ? JSON.stringify(parsed.data.terms) : existing.terms,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "offer", transactionId: counterId,
        fromState: null, toState: "draft", actorId: user.id,
        metadata: JSON.stringify({ parentOfferId: existing.id }), createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "offer.counter_created",
        entityType: "offer",
        entityId: counterId,
        metadata: { parentOfferId: existing.id, version: created.version },
      }));
      return created;
    });
    return c.json({ offer: counter }, 201);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, offerTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findOffer(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertTransition("offer", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requiresTransitionReason("offer", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required for this transition" }, 400);
    }
    const now = Date.now();
    const offer = await db.transaction(async (tx) => {
      const [updated] = await tx.update(offerTable).set({
        status: parsed.data.toState,
        submittedAt: parsed.data.toState === "submitted" ? now : existing.submittedAt,
        acceptedAt: parsed.data.toState === "accepted" ? now : existing.acceptedAt,
        rejectedAt: parsed.data.toState === "rejected" ? now : existing.rejectedAt,
        updatedAt: now,
      }).where(and(eq(offerTable.id, existing.id), eq(offerTable.agencyId, agencyId))).returning();
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "offer", transactionId: existing.id,
        fromState: existing.status, toState: parsed.data.toState, actorId: user.id,
        reason: parsed.data.reason,
        metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
        createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: `offer.${parsed.data.toState}`,
        entityType: "offer",
        entityId: existing.id,
        metadata: { previousState: existing.status, reason: parsed.data.reason },
      }));
      return updated;
    });
    return c.json({ offer }, 200);
  });
