import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
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
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId)))
    .get();
}

async function isActiveAgencyProfile(agencyId: string, profileId: string): Promise<boolean> {
  const profile = await db
    .select()
    .from(schema.profiles)
    .where(and(eq(schema.profiles.id, profileId), eq(schema.profiles.agencyId, agencyId)))
    .get();
  return Boolean(profile && profile.active === 1);
}

export const leads = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, leadListQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { stage, source, q, page, pageSize, all } = queryResult.data;

    let rows = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.agencyId, agencyId))
      .orderBy(desc(schema.leads.createdAt));

    if (profile.role === "agent") rows = rows.filter((lead) => lead.assignedTo === user.id);
    if (stage) rows = rows.filter((lead) => lead.stage === stage);
    if (source) rows = rows.filter((lead) => lead.source === source);
    if (q) {
      const normalizedQuery = q.toLowerCase();
      rows = rows.filter(
        (lead) =>
          lead.name.toLowerCase().includes(normalizedQuery) ||
          lead.phone?.includes(q) ||
          lead.email?.toLowerCase().includes(normalizedQuery),
      );
    }

    const total = rows.length;
    if (all === "true") {
      return c.json({ leads: rows.slice(0, 500), total, page: 1, pageSize: total }, 200);
    }

    const currentPage = page ?? 1;
    const size = Math.min(100, pageSize ?? 30);
    const paged = rows.slice((currentPage - 1) * size, (currentPage - 1) * size + size);
    return c.json({ leads: paged, total, page: currentPage, pageSize: size }, 200);
  })
  .get("/stats", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;

    let rows = await db.select().from(schema.leads).where(eq(schema.leads.agencyId, agencyId));
    if (profile.role === "agent") rows = rows.filter((lead) => lead.assignedTo === user.id);

    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const stageBreakdown = stages.map((stage) => ({
      stage,
      count: rows.filter((lead) => lead.stage === stage).length,
    }));
    const closed = rows.filter((lead) => lead.stage === "closed").length;
    const total = rows.length;

    return c.json({
      stats: {
        totalLeads: total,
        closedLeads: closed,
        conversionRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        stageBreakdown,
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
    const [lead] = await db.insert(schema.leads).values({
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
    }).returning();

    await db.insert(schema.activities).values({
      id: nanoid(),
      agencyId,
      leadId: id,
      userId: user.id,
      type: "stage_change",
      body: "Lead created",
      meta: JSON.stringify({ stage: "new" }),
    });
    return c.json({ lead }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const lead = await findLead(agencyId, idResult.data);
    if (!lead || !canAccessLead(profile, user.id, lead)) {
      return c.json({ error: "Not found" }, 404);
    }
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

    if (!existing || !canAccessLead(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    let assignedTo = existing.assignedTo;
    if (body.assignedTo !== undefined) {
      if (profile.role === "agent" && body.assignedTo !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (!(await isActiveAgencyProfile(agencyId, body.assignedTo))) {
        return c.json({ error: "Invalid assignee" }, 400);
      }
      assignedTo = body.assignedTo;
    }

    const [lead] = await db.update(schema.leads).set({
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
      updatedAt: Date.now(),
    }).where(and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId))).returning();
    return c.json({ lead }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const existing = await findLead(agencyId, leadId);
    if (!existing || !canAccessLead(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    await db.delete(schema.leads).where(
      and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId)),
    );
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
    const leadId = idResult.data;
    const existing = await findLead(agencyId, leadId);
    if (!existing || !canAccessLead(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const { stage } = bodyResult.data;
    const [lead] = await db.update(schema.leads)
      .set({ stage, updatedAt: Date.now() })
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId)))
      .returning();

    await db.insert(schema.activities).values({
      id: nanoid(), agencyId, leadId, userId: user.id,
      type: "stage_change", body: `Stage changed to ${stage}`,
      meta: JSON.stringify({ stage }),
    });
    return c.json({ lead }, 200);
  })
  .post("/:id/notes", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, addLeadNoteSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const lead = await findLead(agencyId, leadId);
    if (!lead || !canAccessLead(profile, user.id, lead)) {
      return c.json({ error: "Not found" }, 404);
    }

    await db.insert(schema.activities).values({
      id: nanoid(), agencyId, leadId, userId: user.id,
      type: "note", body: bodyResult.data.body,
    });
    return c.json({ ok: true }, 201);
  })
  .get("/:id/activities", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const lead = await findLead(agencyId, leadId);
    if (!lead || !canAccessLead(profile, user.id, lead)) {
      return c.json({ error: "Not found" }, 404);
    }

    const activities = await db.select().from(schema.activities)
      .where(and(eq(schema.activities.leadId, leadId), eq(schema.activities.agencyId, agencyId)))
      .orderBy(desc(schema.activities.createdAt));
    return c.json({ activities }, 200);
  })
  .get("/:id/properties", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const lead = await findLead(agencyId, leadId);
    if (!lead || !canAccessLead(profile, user.id, lead)) {
      return c.json({ error: "Not found" }, 404);
    }

    const links = await db.select().from(schema.leadProperties)
      .where(eq(schema.leadProperties.leadId, leadId));
    const propertyIds = links.flatMap((link) => (link.propertyId ? [link.propertyId] : []));
    const properties = await Promise.all(propertyIds.map((propertyId) =>
      db.select().from(schema.properties)
        .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)))
        .get(),
    ));
    return c.json({ properties: properties.filter(Boolean), links }, 200);
  })
  .post("/:id/properties", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, linkLeadPropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = idResult.data;
    const lead = await findLead(agencyId, leadId);
    if (!lead || !canAccessLead(profile, user.id, lead)) {
      return c.json({ error: "Not found" }, 404);
    }

    const { propertyId, status, notes } = bodyResult.data;
    const property = await db.select().from(schema.properties)
      .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)))
      .get();
    if (!property) return c.json({ error: "Property not found" }, 404);

    const [link] = await db.insert(schema.leadProperties).values({
      id: nanoid(), leadId, propertyId, status: status ?? "shown", notes,
    }).returning();
    return c.json({ link }, 201);
  });
