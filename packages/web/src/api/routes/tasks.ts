import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { nanoid } from "../lib/id";

export const tasks = new Hono()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ tasks: [], total: 0, page: 1, pageSize: 0 }, 200);
    const { done, leadId, page, pageSize } = c.req.query();
    let rows = await db.select().from(schema.tasks)
      .where(eq(schema.tasks.agencyId, profile.agencyId))
      .orderBy(desc(schema.tasks.dueAt));
    if (profile.role === "agent") rows = rows.filter(t => t.assignedTo === user.id);
    if (done !== undefined) rows = rows.filter(t => String(t.done) === done);
    if (leadId) rows = rows.filter(t => t.leadId === leadId);

    const total = rows.length;
    // Tasks for a specific lead (lead-detail page) always need the full set — no pagination.
    if (leadId) return c.json({ tasks: rows, total, page: 1, pageSize: total }, 200);

    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const paged = rows.slice((p - 1) * size, (p - 1) * size + size);
    return c.json({ tasks: paged, total, page: p, pageSize: size }, 200);
  })
  .post("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const body = await c.req.json();
    const id = nanoid();
    const [task] = await db.insert(schema.tasks).values({
      id,
      agencyId: profile.agencyId,
      createdBy: user.id,
      assignedTo: body.assignedTo ?? user.id,
      leadId: body.leadId,
      title: body.title,
      titleAr: body.titleAr,
      dueAt: body.dueAt,
      type: body.type ?? "follow_up",
    }).returning();
    return c.json({ task }, 201);
  })
  .patch("/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, c.req.param("id"))).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    const isAgent = profile?.role === "agent";
    if (isAgent && existing.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    const body = await c.req.json();
    // Agents can edit their own task's details but can't reassign it to someone else.
    if (isAgent) delete body.assignedTo;
    const [task] = await db.update(schema.tasks).set(body).where(eq(schema.tasks.id, c.req.param("id"))).returning();
    return c.json({ task }, 200);
  })
  .patch("/:id/done", requireAuth, async (c) => {
    const user = c.get("user")!;
    const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, c.req.param("id"))).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (profile?.role === "agent" && existing.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    const [task] = await db.update(schema.tasks).set({ done: 1 }).where(eq(schema.tasks.id, c.req.param("id"))).returning();
    return c.json({ task }, 200);
  })
  .delete("/:id", requireAuth, async (c) => {
    const user = c.get("user")!;
    const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, c.req.param("id"))).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (profile?.role === "agent" && existing.assignedTo !== user.id) return c.json({ error: "Forbidden" }, 403);
    await db.delete(schema.tasks).where(eq(schema.tasks.id, c.req.param("id")));
    return c.json({ ok: true }, 200);
  });
