import { Hono } from "hono";
import {
  and,
  count,
  desc,
  eq,
  isNull,
} from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createTaskSchema,
  entityIdSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from "../validation/schemas";

type Profile = typeof schema.profiles.$inferSelect;
type Task = typeof schema.tasks.$inferSelect;

async function findTask(agencyId: string, taskId: string): Promise<Task | undefined> {
  return db
    .select()
    .from(schema.tasks)
    .where(and(
      eq(schema.tasks.id, taskId),
      eq(schema.tasks.agencyId, agencyId),
      isNull(schema.tasks.deletedAt),
    ))
    .get();
}

async function isActiveAgencyProfile(agencyId: string, profileId: string): Promise<boolean> {
  return Boolean(await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(and(
      eq(schema.profiles.id, profileId),
      eq(schema.profiles.agencyId, agencyId),
      eq(schema.profiles.active, 1),
    ))
    .get());
}

async function isAgencyLead(agencyId: string, leadId: string): Promise<boolean> {
  return Boolean(await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(
      eq(schema.leads.id, leadId),
      eq(schema.leads.agencyId, agencyId),
      isNull(schema.leads.deletedAt),
    ))
    .get());
}

function canAccessTask(profile: Profile, userId: string, task: Task): boolean {
  return profile.role !== "agent" || task.assignedTo === userId;
}

export const tasks = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, taskListQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { done, leadId, page = 1, pageSize = 50 } = queryResult.data;
    const conditions = [
      eq(schema.tasks.agencyId, agencyId),
      isNull(schema.tasks.deletedAt),
    ];
    if (profile.role === "agent") conditions.push(eq(schema.tasks.assignedTo, user.id));
    if (done !== undefined) conditions.push(eq(schema.tasks.done, Number(done)));
    if (leadId) conditions.push(eq(schema.tasks.leadId, leadId));
    const where = and(...conditions);
    const limit = leadId ? 200 : Math.min(200, pageSize);
    const offset = leadId ? 0 : (page - 1) * limit;

    const [summary] = await db.select({ total: count() }).from(schema.tasks).where(where);
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(where)
      .orderBy(desc(schema.tasks.dueAt), desc(schema.tasks.createdAt))
      .limit(limit)
      .offset(offset);
    return c.json({
      tasks: rows,
      total: summary?.total ?? 0,
      page: leadId ? 1 : page,
      pageSize: leadId ? rows.length : limit,
    }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createTaskSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const body = bodyResult.data;
    const assignedTo = profile.role === "agent" ? user.id : (body.assignedTo ?? user.id);
    if (!(await isActiveAgencyProfile(agencyId, assignedTo))) {
      return c.json({ error: "Invalid assignee" }, 400);
    }
    if (body.leadId && !(await isAgencyLead(agencyId, body.leadId))) {
      return c.json({ error: "Lead not found" }, 404);
    }

    const id = nanoid();
    const now = Date.now();
    const task = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.tasks).values({
        id,
        agencyId,
        createdBy: user.id,
        assignedTo,
        leadId: body.leadId,
        title: body.title,
        titleAr: body.titleAr,
        dueAt: body.dueAt,
        type: body.type ?? "follow_up",
        done: 0,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "task.created",
        entityType: "task",
        entityId: id,
        metadata: { assignedTo, leadId: body.leadId ?? null, type: created.type },
      }));
      return created;
    });
    return c.json({ task }, 201);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateTaskSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const existing = await findTask(agencyId, idResult.data);
    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const body = bodyResult.data;
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

    const now = Date.now();
    const task = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.tasks).set({
        assignedTo,
        leadId: body.leadId,
        title: body.title,
        titleAr: body.titleAr,
        dueAt: body.dueAt,
        type: body.type,
        updatedAt: now,
      }).where(and(
        eq(schema.tasks.id, existing.id),
        eq(schema.tasks.agencyId, agencyId),
        isNull(schema.tasks.deletedAt),
      )).returning();
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "task.updated",
        entityType: "task",
        entityId: existing.id,
        metadata: { changedFields: Object.keys(body), assignedTo },
      }));
      return updated;
    });
    return c.json({ task }, 200);
  })
  .patch("/:id/done", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const existing = await findTask(agencyId, idResult.data);
    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const now = Date.now();
    const task = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.tasks).set({ done: 1, updatedAt: now }).where(and(
        eq(schema.tasks.id, existing.id),
        eq(schema.tasks.agencyId, agencyId),
        isNull(schema.tasks.deletedAt),
      )).returning();
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "task.completed",
        entityType: "task",
        entityId: existing.id,
      }));
      return updated;
    });
    return c.json({ task }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const existing = await findTask(agencyId, idResult.data);
    if (!existing || !canAccessTask(profile, user.id, existing)) {
      return c.json({ error: "Not found" }, 404);
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(schema.tasks).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(schema.tasks.id, existing.id),
        eq(schema.tasks.agencyId, agencyId),
        isNull(schema.tasks.deletedAt),
      ));
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "task.deleted",
        entityType: "task",
        entityId: existing.id,
      }));
    });
    return c.json({ ok: true }, 200);
  });
