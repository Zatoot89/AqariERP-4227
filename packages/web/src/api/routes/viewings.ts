import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import { transactionStateEvents, viewings as viewingTable } from "../database/transaction-schema";
import { auditRecord } from "../lib/audit";
import { nextDocumentNumber } from "../lib/document-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import { completeViewingSchema, createViewingSchema, transactionListQuerySchema } from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";

async function viewingTargetExists(agencyId: string, propertyId?: string, unitId?: string) {
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

async function findViewing(agencyId: string, id: string) {
  return db.select().from(viewingTable).where(and(
    eq(viewingTable.id, id),
    eq(viewingTable.agencyId, agencyId),
    isNull(viewingTable.deletedAt),
  )).get();
}

export const viewings = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, transactionListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(viewingTable).where(and(
      eq(viewingTable.agencyId, agencyId),
      parsed.data.status ? eq(viewingTable.status, parsed.data.status) : undefined,
      parsed.data.contactId ? eq(viewingTable.contactId, parsed.data.contactId) : undefined,
      parsed.data.propertyId ? eq(viewingTable.propertyId, parsed.data.propertyId) : undefined,
      parsed.data.unitId ? eq(viewingTable.unitId, parsed.data.unitId) : undefined,
      isNull(viewingTable.deletedAt),
    )).orderBy(desc(viewingTable.scheduledAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ viewings: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createViewingSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = parsed.data;
    if (!(await viewingTargetExists(agencyId, body.propertyId, body.unitId))) {
      return c.json({ error: "Property or unit not found" }, 404);
    }
    const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, body.contactId),
      eq(contacts.agencyId, agencyId),
      isNull(contacts.deletedAt),
    )).get();
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    const assignedAgentId = body.assignedAgentId ?? user.id;
    const agent = await db.select({ id: profiles.id }).from(profiles).where(and(
      eq(profiles.id, assignedAgentId),
      eq(profiles.agencyId, agencyId),
      eq(profiles.active, 1),
    )).get();
    if (!agent) return c.json({ error: "Assigned agent not found" }, 404);

    const now = Date.now();
    const viewing = await db.transaction(async (tx) => {
      const viewingNumber = await nextDocumentNumber(tx, agencyId, "viewing");
      const id = nanoid();
      const [created] = await tx.insert(viewingTable).values({
        id,
        agencyId,
        viewingNumber,
        propertyId: body.propertyId,
        unitId: body.unitId,
        contactId: body.contactId,
        leadId: body.leadId,
        assignedAgentId,
        status: "scheduled",
        scheduledAt: body.scheduledAt,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "viewing", transactionId: id,
        fromState: null, toState: "scheduled", actorId: user.id, createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "viewing.created",
        entityType: "viewing",
        entityId: id,
        metadata: { viewingNumber, scheduledAt: body.scheduledAt },
      }));
      return created;
    });
    return c.json({ viewing }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const viewing = await findViewing(c.get("agencyId") as string, id.data);
    if (!viewing) return c.json({ error: "Not found" }, 404);
    return c.json({ viewing }, 200);
  })
  .patch("/:id/complete", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, completeViewingSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const existing = await findViewing(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.status !== "scheduled") {
      return c.json({ error: "Only scheduled viewings can be completed or cancelled" }, 409);
    }
    const now = Date.now();
    const viewing = await db.transaction(async (tx) => {
      const [updated] = await tx.update(viewingTable).set({
        status: parsed.data.status,
        feedback: parsed.data.feedback,
        rating: parsed.data.rating,
        cancellationReason: parsed.data.reason,
        completedAt: parsed.data.status === "completed" ? now : null,
        updatedAt: now,
      }).where(and(eq(viewingTable.id, existing.id), eq(viewingTable.agencyId, agencyId))).returning();
      await tx.insert(transactionStateEvents).values({
        id: nanoid(), agencyId, transactionType: "viewing", transactionId: existing.id,
        fromState: existing.status, toState: parsed.data.status, actorId: user.id,
        reason: parsed.data.reason, metadata: JSON.stringify({ rating: parsed.data.rating }), createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: `viewing.${parsed.data.status}`,
        entityType: "viewing",
        entityId: existing.id,
      }));
      return updated;
    });
    return c.json({ viewing }, 200);
  });
