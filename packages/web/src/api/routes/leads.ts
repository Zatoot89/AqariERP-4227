import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { nanoid } from "../lib/id";

export const leads = new Hono()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const { stage, source, q, page, pageSize, all } = c.req.query();
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ leads: [], total: 0, page: 1, pageSize: 0 }, 200);

    let rows = await db.select().from(schema.leads)
      .where(eq(schema.leads.agencyId, profile.agencyId))
      .orderBy(desc(schema.leads.createdAt));

    // Plain agents only see leads assigned to them; admin/manager see all.
    if (profile.role === "agent") rows = rows.filter(l => l.assignedTo === user.id);

    if (stage) rows = rows.filter(l => l.stage === stage);
    if (source) rows = rows.filter(l => l.source === source);
    if (q) rows = rows.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || l.phone?.includes(q));

    const total = rows.length;

    // Kanban view needs every lead to drag across columns — bypass pagination, cap at a sane limit.
    if (all === "true") return c.json({ leads: rows.slice(0, 500), total, page: 1, pageSize: total }, 200);

    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const paged = rows.slice((p - 1) * size, (p - 1) * size + size);

    return c.json({ leads: paged, total, page: p, pageSize: size }, 200);
  })
  // Personal/agency KPI summary for the Dashboard — scoped like the list endpoint
  // (agent sees their own numbers, admin/manager see agency-wide). No role restriction,
  // unlike /api/analytics/* which is admin/manager-only (full leaderboard, sources, etc).
  .get("/stats", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ stats: { totalLeads: 0, closedLeads: 0, conversionRate: 0, stageBreakdown: [] } }, 200);

    let rows = await db.select().from(schema.leads).where(eq(schema.leads.agencyId, profile.agencyId));
    if (profile.role === "agent") rows = rows.filter(l => l.assignedTo === user.id);

    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const stageBreakdown = stages.map(s => ({ stage: s, count: rows.filter(l => l.stage === s).length }));
    const closed = rows.filter(l => l.stage === "closed").length;
    const total = rows.length;

    return c.json({
      stats: {
        totalLeads: total,
        closedLeads: closed,
        conversionRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        stageBreakdown,
      }
    }, 200);
  })
  .post("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const body = await c.req.json();
    const id = nanoid();
    const [lead] = await db.insert(schema.leads).values({
      id,
      agencyId: profile.agencyId,
      assignedTo: body.assignedTo ?? user.id,
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
      agencyId: profile.agencyId,
      leadId: id,
      userId: user.id,
      type: "stage_change",
      body: "Lead created",
      meta: JSON.stringify({ stage: "new" }),
    });
    return c.json({ lead }, 201);
  })
  .get("/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const lead = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param("id"))).get();
    if (!lead) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (profile?.role === "agent" && lead.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    return c.json({ lead }, 200);
  })
  .patch("/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const existing = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param("id"))).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (profile?.role === "agent" && existing.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    const body = await c.req.json();
    const [lead] = await db.update(schema.leads)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(schema.leads.id, c.req.param("id")))
      .returning();
    return c.json({ lead }, 200);
  })
  .delete("/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const existing = await db.select().from(schema.leads).where(eq(schema.leads.id, c.req.param("id"))).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (profile?.role === "agent" && existing.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    await db.delete(schema.leads).where(eq(schema.leads.id, c.req.param("id")));
    return c.json({ ok: true }, 200);
  })
  .patch("/:id/stage", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    const { stage } = await c.req.json();
    const [lead] = await db.update(schema.leads)
      .set({ stage, updatedAt: Date.now() })
      .where(eq(schema.leads.id, c.req.param("id")))
      .returning();
    await db.insert(schema.activities).values({
      id: nanoid(),
      agencyId: profile?.agencyId ?? "",
      leadId: c.req.param("id"),
      userId: user.id,
      type: "stage_change",
      body: `Stage changed to ${stage}`,
      meta: JSON.stringify({ stage }),
    });
    return c.json({ lead }, 200);
  })
  .post("/:id/notes", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    const { body: noteBody } = await c.req.json();
    await db.insert(schema.activities).values({
      id: nanoid(),
      agencyId: profile?.agencyId ?? "",
      leadId: c.req.param("id"),
      userId: user.id,
      type: "note",
      body: noteBody,
    });
    return c.json({ ok: true }, 201);
  })
  .get("/:id/activities", requireAuth, async (c) => {
    const acts = await db.select().from(schema.activities)
      .where(eq(schema.activities.leadId, c.req.param("id")))
      .orderBy(desc(schema.activities.createdAt));
    return c.json({ activities: acts }, 200);
  })
  .get("/:id/properties", requireAuth, async (c) => {
    const links = await db.select().from(schema.leadProperties)
      .where(eq(schema.leadProperties.leadId, c.req.param("id")));
    const propIds = links.map(l => l.propertyId!);
    const props = propIds.length > 0
      ? await Promise.all(propIds.map(pid => db.select().from(schema.properties).where(eq(schema.properties.id, pid)).get()))
      : [];
    return c.json({ properties: props.filter(Boolean), links }, 200);
  })
  .post("/:id/properties", requireAuth, async (c) => {
    const { propertyId, status, notes } = await c.req.json();
    const [link] = await db.insert(schema.leadProperties).values({
      id: nanoid(),
      leadId: c.req.param("id"),
      propertyId,
      status: status ?? "shown",
      notes,
    }).returning();
    return c.json({ link }, 201);
  });
