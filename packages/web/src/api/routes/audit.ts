import { Hono } from "hono";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireRole, requireTenant } from "../middleware/auth";
import { parseQuery } from "../lib/validation";
import { auditLogQuerySchema } from "../validation/schemas";

export const audit = new Hono().get(
  "/",
  requireTenant,
  requireRole("admin", "manager"),
  async (c) => {
    const queryResult = parseQuery(c, auditLogQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const { action, entityType, entityId, page = 1, pageSize = 50 } = queryResult.data;
    const conditions = [eq(schema.auditLogs.agencyId, agencyId)];
    if (action) conditions.push(eq(schema.auditLogs.action, action));
    if (entityType) conditions.push(eq(schema.auditLogs.entityType, entityType));
    if (entityId) conditions.push(eq(schema.auditLogs.entityId, entityId));
    const where = and(...conditions);

    const [summary] = await db
      .select({ total: count() })
      .from(schema.auditLogs)
      .where(where);
    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({
      auditLogs: rows,
      total: summary?.total ?? 0,
      page,
      pageSize,
    }, 200);
  },
);
