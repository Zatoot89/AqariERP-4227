import { Hono } from "hono";
import { and, asc, eq, isNull, like, or, type SQL } from "drizzle-orm";
import { db } from "../database";
import { developments as developmentTable } from "../database/core-domain-schema";
import { auditLogs } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createDevelopmentSchema,
  developmentListQuerySchema,
  updateDevelopmentSchema,
} from "../validation/core-domain";
import { entityIdSchema } from "../validation/schemas";

async function findDevelopment(agencyId: string, id: string) {
  return db.select().from(developmentTable).where(and(
    eq(developmentTable.id, id),
    eq(developmentTable.agencyId, agencyId),
    isNull(developmentTable.deletedAt),
  )).get();
}

async function validParent(agencyId: string, parentId: string | null | undefined) {
  if (!parentId) return true;
  return Boolean(await findDevelopment(agencyId, parentId));
}

async function createsCycle(agencyId: string, id: string, parentId: string | null | undefined) {
  let currentId = parentId ?? null;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === id || seen.has(currentId)) return true;
    seen.add(currentId);
    const parent = await findDevelopment(agencyId, currentId);
    currentId = parent?.parentId ?? null;
  }
  return false;
}

export const developments = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, developmentListQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { q, developmentType, parentId } = queryResult.data;
    const conditions: SQL[] = [
      eq(developmentTable.agencyId, agencyId),
      isNull(developmentTable.deletedAt),
    ];
    if (developmentType) conditions.push(eq(developmentTable.developmentType, developmentType));
    if (parentId) conditions.push(eq(developmentTable.parentId, parentId));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(
        like(developmentTable.name, pattern),
        like(developmentTable.nameAr, pattern),
        like(developmentTable.code, pattern),
      )!);
    }
    const rows = await db.select().from(developmentTable).where(and(...conditions))
      .orderBy(asc(developmentTable.name));
    return c.json({ developments: rows }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createDevelopmentSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = bodyResult.data;
    if (!(await validParent(agencyId, body.parentId))) {
      return c.json({ error: "Parent development not found" }, 404);
    }
    const id = nanoid();
    const now = Date.now();
    const development = await db.transaction(async (tx) => {
      const [created] = await tx.insert(developmentTable).values({
        id,
        agencyId,
        parentId: body.parentId,
        developmentType: body.developmentType,
        code: body.code,
        name: body.name,
        nameAr: body.nameAr,
        description: body.description,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        region: body.region,
        country: body.country,
        latitude: body.latitude,
        longitude: body.longitude,
        floorsCount: body.floorsCount,
        completedAt: body.completedAt,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "development.created",
        entityType: "development",
        entityId: id,
        metadata: {
          developmentType: created.developmentType,
          parentId: created.parentId,
        },
      }));
      return created;
    });
    return c.json({ development }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const development = await findDevelopment(agencyId, idResult.data);
    if (!development) return c.json({ error: "Not found" }, 404);
    const children = await db.select().from(developmentTable).where(and(
      eq(developmentTable.agencyId, agencyId),
      eq(developmentTable.parentId, development.id),
      isNull(developmentTable.deletedAt),
    )).orderBy(asc(developmentTable.name));
    return c.json({ development: { ...development, children } }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateDevelopmentSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findDevelopment(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = bodyResult.data as Partial<typeof existing>;
    if (body.parentId !== undefined) {
      if (!(await validParent(agencyId, body.parentId))) {
        return c.json({ error: "Parent development not found" }, 404);
      }
      if (await createsCycle(agencyId, existing.id, body.parentId)) {
        return c.json({ error: "Development hierarchy would contain a cycle" }, 400);
      }
    }
    const [development] = await db.update(developmentTable).set({
      parentId: body.parentId,
      developmentType: body.developmentType,
      code: body.code,
      name: body.name,
      nameAr: body.nameAr,
      description: body.description,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      region: body.region,
      country: body.country,
      latitude: body.latitude,
      longitude: body.longitude,
      floorsCount: body.floorsCount,
      completedAt: body.completedAt,
      updatedAt: Date.now(),
    }).where(and(
      eq(developmentTable.id, existing.id),
      eq(developmentTable.agencyId, agencyId),
      isNull(developmentTable.deletedAt),
    )).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "development.updated",
      entityType: "development",
      entityId: existing.id,
      metadata: { changedFields: Object.keys(bodyResult.data) },
    }));
    return c.json({ development }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findDevelopment(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const child = await db.select({ id: developmentTable.id }).from(developmentTable).where(and(
      eq(developmentTable.agencyId, agencyId),
      eq(developmentTable.parentId, existing.id),
      isNull(developmentTable.deletedAt),
    )).get();
    if (child) return c.json({ error: "Move or archive child developments first" }, 409);
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(developmentTable).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(developmentTable.id, existing.id),
        eq(developmentTable.agencyId, agencyId),
      ));
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "development.deleted",
        entityType: "development",
        entityId: existing.id,
      }));
    });
    return c.json({ ok: true }, 200);
  });
