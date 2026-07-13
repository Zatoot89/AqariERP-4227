import { Hono } from "hono";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
} from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  addLeadNoteSchema,
  changeLeadStageSchema,
  createLeadSchema,
  entityIdSchema,
  leadListQuerySchema,
  linkLeadPropertySchema,
  updateLeadSchema,
} from "../validation/schemas";

type Profile = typeof schema.profiles.$inferSelect;
type Lead = typeof schema.leads.$inferSelect;

function canAccessLead(profile: Profile, userId: string, lead: Lead): boolean {
  return profile.role !== "agent" || lead.assignedTo === userId;
}

async function findLead(agencyId: string, leadId: string): Promise<Lead | undefined> {
  return db
    .select()
    .from(schema.leads)
    .where(and(
      eq(schema.leads.id, leadId),
      eq(schema.leads.agencyId, agencyId),
      isNull(schema.leads.deletedAt),
    ))
    .get();
}

async function isActiveAgencyProfile(agencyId: string, profileId: string): Promise<boolean> {
  const profile = await db
    .select()
    .from(schema.profiles)
    .where(and(
      eq(schema.profiles.id, profileId),
      eq(schema.profiles.agencyId, agencyId),
      eq(schema.profiles.active, 1),
    ))
    .get();
  return Boolean(profile);
}

export const leads = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, leadListQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { stage, source, q, page = 1, pageSize = 30, all } = queryResult.data;
    const conditions = [
      eq(schema.leads.agencyId, agencyId),
      isNull(schema.leads.deletedAt),
    ];
    if (profile.role === "agent") conditions.push(eq(schema.leads.assignedTo, user.id));
    if (stage) conditions.push(eq(schema.leads.stage, stage));
    if (source) conditions.push(eq(schema.leads.source, source));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(
        like(schema.leads.name, pattern),
        like(schema.leads.phone, pattern),
        like(schema.leads.email, pattern),
      )!);
    }
    const where = and(...conditions);
    const limit = all === "true" ? 500 : Math.min(100, pageSize);
    const offset = all === "true" ? 0 : (page - 1) * limit;

    const [summary] = await db.select({ total: count() }).from(schema.leads).where(where);
    const rows = await db
      .select()
      .from(schema.leads)
      .where(where)
      .orderBy(desc(schema.leads.createdAt))
      .limit(limit)
      .offset(offset);
    return c.json({
      leads: rows,
      total: summary?.total ?? 0,
      page: all === "true" ? 1 : page,
      pageSize: all === "true" ? rows.length : limit,
    }, 200);
  })
  .get("/stats", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const conditions = [
      eq(schema.leads.agencyId, agencyId),
      isNull(schema.leads.deletedAt),
    ];
    if (profile.role === "agent") conditions.push(eq(schema.leads.assignedTo, user.id));
    const rows = await db.select().from(schema.leads).where(and(...conditions));
    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const closed = rows.filter((lead) => lead.stage === "closed").length;
    return c.json({
      stats: {
        totalLeads: rows.length,
        closedLeads: closed,
        conversionRate: rows.length > 0 ? Math.round((closed / rows.length) * 100) : 0,
        stageBreakdown: stages.map((stage) => ({
          stage,
          count: rows.filter((lead) => lead.stage === stage).length,
        })),
      },
    }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createLeadSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const body = bodyResult.data;
    const assignedTo = profile.role === "agent" ? user.id : (body.assignedTo ?? user.id);
    if (!(await isActiveAgencyProfile(agencyId, assignedTo))) {
      return c.json({ error: "Invalid assignee" }, 400);
    }

    const id = nanoid();
    const now = Date.now();
    const lead = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.leads).values({
        id,
        agencyId,
        assignedTo,
        name: body.name,
        nameAr: body.nameAr,
        phone: body.phone,
        email: body.email,
        source: body.source ?? "manual",
        stage: "new",
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        currency: body.currency ?? "USD",
        propertyType: body.propertyType,
        bedrooms: body.bedrooms,
        preferredArea: body.preferredArea,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(schema.activities).values({
        id: nanoid(), agencyId, leadId: id, userId: user.id,
        type: "stage_change", body: "Lead created",
        meta: JSON.stringify({ stage: "new" }), createdAt: now,
      });
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.created",
        entityType: "lead",
        entityId: id,
        metadata: { assignedTo, source: created.source },
      }));
      return created;
    });
    return c.json({ lead }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const lead = await findLead(c.get("agencyId") as string, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);
    return c.json({ lead }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateLeadSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const body = bodyResult.data;
    const existing = await findLead(agencyId, leadId);
    if (!existing || !canAccessLead(profile, user.id, existing)) return c.json({ error: "Not found" }, 404);

    let assignedTo = existing.assignedTo;
    if (body.assignedTo !== undefined) {
      if (profile.role === "agent" && body.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
      if (!(await isActiveAgencyProfile(agencyId, body.assignedTo))) return c.json({ error: "Invalid assignee" }, 400);
      assignedTo = body.assignedTo;
    }

    const now = Date.now();
    const lead = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.leads).set({
        assignedTo,
        name: body.name,
        nameAr: body.nameAr,
        phone: body.phone,
        email: body.email,
        source: body.source,
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        currency: body.currency,
        propertyType: body.propertyType,
        bedrooms: body.bedrooms,
        preferredArea: body.preferredArea,
        notes: body.notes,
        updatedAt: now,
      }).where(and(
        eq(schema.leads.id, leadId),
        eq(schema.leads.agencyId, agencyId),
        isNull(schema.leads.deletedAt),
      )).returning();
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.updated",
        entityType: "lead",
        entityId: leadId,
        metadata: { changedFields: Object.keys(body), assignedTo },
      }));
      return updated;
    });
    return c.json({ lead }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);

    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(schema.leads).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(schema.leads.id, lead.id),
        eq(schema.leads.agencyId, agencyId),
        isNull(schema.leads.deletedAt),
      ));
      await tx.update(schema.tasks).set({ leadId: null, updatedAt: now }).where(and(
        eq(schema.tasks.agencyId, agencyId),
        eq(schema.tasks.leadId, lead.id),
        isNull(schema.tasks.deletedAt),
      ));
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.deleted",
        entityType: "lead",
        entityId: lead.id,
      }));
    });
    return c.json({ ok: true }, 200);
  })
  .patch("/:id/stage", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, changeLeadStageSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);

    const stage = bodyResult.data.stage;
    const now = Date.now();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(schema.leads).set({ stage, updatedAt: now }).where(and(
        eq(schema.leads.id, lead.id), eq(schema.leads.agencyId, agencyId), isNull(schema.leads.deletedAt),
      )).returning();
      await tx.insert(schema.activities).values({
        id: nanoid(), agencyId, leadId: lead.id, userId: user.id,
        type: "stage_change", body: `Stage changed to ${stage}`,
        meta: JSON.stringify({ previousStage: lead.stage, stage }), createdAt: now,
      });
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.stage_changed",
        entityType: "lead",
        entityId: lead.id,
        metadata: { previousStage: lead.stage, stage },
      }));
      return row;
    });
    return c.json({ lead: updated }, 200);
  })
  .post("/:id/notes", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, addLeadNoteSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);

    await db.transaction(async (tx) => {
      await tx.insert(schema.activities).values({
        id: nanoid(), agencyId, leadId: lead.id, userId: user.id,
        type: "note", body: bodyResult.data.body, createdAt: Date.now(),
      });
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.note_added",
        entityType: "lead",
        entityId: lead.id,
      }));
    });
    return c.json({ ok: true }, 201);
  })
  .get("/:id/activities", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);
    const activities = await db.select().from(schema.activities).where(and(
      eq(schema.activities.leadId, lead.id), eq(schema.activities.agencyId, agencyId),
    )).orderBy(desc(schema.activities.createdAt));
    return c.json({ activities }, 200);
  })
  .get("/:id/properties", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);

    const links = await db.select().from(schema.leadProperties).where(and(
      eq(schema.leadProperties.agencyId, agencyId), eq(schema.leadProperties.leadId, lead.id),
    ));
    const propertyIds = links.map((link) => link.propertyId);
    const properties = propertyIds.length === 0 ? [] : await db.select().from(schema.properties).where(and(
      eq(schema.properties.agencyId, agencyId), inArray(schema.properties.id, propertyIds), isNull(schema.properties.deletedAt),
    ));
    return c.json({ properties, links }, 200);
  })
  .post("/:id/properties", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, linkLeadPropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);
    const property = await db.select({ id: schema.properties.id }).from(schema.properties).where(and(
      eq(schema.properties.id, bodyResult.data.propertyId),
      eq(schema.properties.agencyId, agencyId),
      isNull(schema.properties.deletedAt),
    )).get();
    if (!property) return c.json({ error: "Property not found" }, 404);

    const linkId = nanoid();
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx.insert(schema.leadProperties).values({
        id: linkId,
        agencyId,
        leadId: lead.id,
        propertyId: property.id,
        status: bodyResult.data.status ?? "shown",
        notes: bodyResult.data.notes,
        linkedAt: Date.now(),
      }).onConflictDoNothing().returning();
      if (rows.length !== 1) return null;
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.property_linked",
        entityType: "lead",
        entityId: lead.id,
        metadata: { propertyId: property.id, linkId },
      }));
      return rows[0];
    });
    if (!inserted) return c.json({ error: "Property is already linked" }, 409);
    return c.json({ link: inserted }, 201);
  })
  .delete("/:id/properties/:propertyId", requireTenant, async (c) => {
    const leadIdResult = parseParam(c, entityIdSchema, "id");
    if (!leadIdResult.success) return leadIdResult.response;
    const propertyIdResult = parseParam(c, entityIdSchema, "propertyId");
    if (!propertyIdResult.success) return propertyIdResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, leadIdResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) return c.json({ error: "Not found" }, 404);

    const removed = await db.transaction(async (tx) => {
      const rows = await tx.delete(schema.leadProperties).where(and(
        eq(schema.leadProperties.agencyId, agencyId),
        eq(schema.leadProperties.leadId, lead.id),
        eq(schema.leadProperties.propertyId, propertyIdResult.data),
      )).returning({ id: schema.leadProperties.id });
      if (rows.length === 0) return false;
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "lead.property_unlinked",
        entityType: "lead",
        entityId: lead.id,
        metadata: { propertyId: propertyIdResult.data },
      }));
      return true;
    });
    if (!removed) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true }, 200);
  });
