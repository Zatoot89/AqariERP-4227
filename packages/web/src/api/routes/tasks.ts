import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";

type Profile = typeof schema.profiles.$inferSelect;
type Task = typeof schema.tasks.$inferSelect;

async function findTask(agencyId: string, taskId: string): Promise<Task | undefined> {
  return db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.agencyId, agencyId)))
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

async function isAgencyLead(agencyId: string, leadId: string): Promise<boolean> {
  const lead = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId)))
    .get();
  return Boolean(lead);
}

function canAccessTask(profile: Profile, userId: string, task: Task): boolean {
  return profile.role !== "agent" || task.assignedTo === userId;
}

export const tasks = new Hono()
  .get("/", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { done, leadId, page, pageSize } = c.req.query();

    let rows = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.agencyId, agencyId))
      .orderBy(desc(schema.tasks.dueAt));

    if (profile.role === "agent") rows = rows.filter((task) => task.assignedTo === user.id);
    if (done !== undefined) rows = rows.filter((task) => String(task.done) === done);
    if (leadId) rows = rows.filter((task) => task.leadId === leadId);

    const total = rows.length;
    if (leadId) return c.json({ tasks: rows, total, page: 1, pageSize: total }, 200);

    const currentPage = Math.max(1, Number(page) || 1);
    const size = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const paged = rows.slice((currentPage - 1) * size, (currentPage - 1) * size + size);
    return c.json({ tasks: paged, total, page: currentPage, pageSize: size }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const body = await c.req.json();

    const assignedTo = profile.role === "agent" ? user.id : (body.assignedTo ?? user.id);
    if (!(await isActiveAgencyProfile(agencyId, assignedTo))) {
      return c.json({ error: "Invalid assignee" }, 400);
    }
    if (body.leadId && !(await isAgencyLead(agencyId, body.leadId))) {
      return c.json({ error: "Lead not found" }, 404);
    }

    const [task] = await db
      .insert(schema.tasks)
      .values({
        id: nanoid(),
        agencyId,
        createdBy: user.id,
        assignedTo,
        leadId: body.leadId,
        title: body.title,
        titleAr: body.titleAr,
        dueAt: body.dueAt,
        type: body.type ?? "follow_up",
      })
      .returning();
    return c.json({ task }, 201);
  })
  .patch("/:id", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const taskId = c.req.param("id");
    const existing = await findTask(agencyId, taskId);

    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const body = await c.req.json();
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

    if (body.leadId && !(await isAgencyLead(agencyId, body.leadId))) {
      return c.json({ error: "Lead not found" }, 404);
    }

    const [task] = await db
      .update(schema.tasks)
      .set({
        assignedTo,
        leadId: body.leadId,
        title: body.title,
        titleAr: body.titleAr,
        dueAt: body.dueAt,
        type: body.type,
      })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.agencyId, agencyId)))
      .returning();
    return c.json({ task }, 200);
  })
  .patch("/:id/done", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const taskId = c.req.param("id");
    const existing = await findTask(agencyId, taskId);

    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const [task] = await db
      .update(schema.tasks)
      .set({ done: 1 })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.agencyId, agencyId)))
      .returning();
    return c.json({ task }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const taskId = c.req.param("id");
    const existing = await findTask(agencyId, taskId);

    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    await db
      .delete(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.agencyId, agencyId)));
    return c.json({ ok: true }, 200);
  });
