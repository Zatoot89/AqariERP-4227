import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireRole, requireTenant } from "../middleware/auth";
import { parseQuery } from "../lib/validation";
import { analyticsQuerySchema } from "../validation/schemas";

const DAY = 86400000;
const RANGE_MS = {
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  all: null,
} as const;

type Range = keyof typeof RANGE_MS;

function filterByRange<T extends { createdAt: number | null }>(
  rows: T[],
  range: Range = "all",
): T[] {
  const ms = RANGE_MS[range];
  if (ms == null) return rows;
  const since = Date.now() - ms;
  return rows.filter((row) => (row.createdAt ?? 0) >= since);
}

export const analytics = new Hono()
  .get("/overview", requireTenant, requireRole("admin", "manager"), async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, agencyId)),
      queryResult.data.range,
    );
    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const stageBreakdown = stages.map((stage) => ({
      stage,
      count: allLeads.filter((lead) => lead.stage === stage).length,
    }));
    const closed = allLeads.filter((lead) => lead.stage === "closed").length;
    const total = allLeads.length;
    return c.json({
      overview: {
        totalLeads: total,
        closedLeads: closed,
        conversionRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        stageBreakdown,
      },
    }, 200);
  })
  .get("/agents", requireTenant, requireRole("admin", "manager"), async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const agentProfiles = await db.select().from(schema.profiles)
      .where(eq(schema.profiles.agencyId, agencyId));
    const leaderboard = await Promise.all(agentProfiles.map(async (profile) => {
      const authUser = await db.select().from(schema.user)
        .where(eq(schema.user.id, profile.id)).get();
      const agentLeads = filterByRange(
        await db.select().from(schema.leads).where(and(
          eq(schema.leads.assignedTo, profile.id),
          eq(schema.leads.agencyId, agencyId),
        )),
        queryResult.data.range,
      );
      const closed = agentLeads.filter((lead) => lead.stage === "closed").length;
      return {
        id: profile.id,
        name: authUser?.name ?? "",
        role: profile.role,
        totalLeads: agentLeads.length,
        closedLeads: closed,
        conversionRate:
          agentLeads.length > 0 ? Math.round((closed / agentLeads.length) * 100) : 0,
      };
    }));
    leaderboard.sort((left, right) => right.closedLeads - left.closedLeads);
    return c.json({ leaderboard }, 200);
  })
  .get("/sources", requireTenant, requireRole("admin", "manager"), async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, agencyId)),
      queryResult.data.range,
    );
    const sourceMap: Record<string, number> = {};
    for (const lead of allLeads) {
      const source = lead.source ?? "manual";
      sourceMap[source] = (sourceMap[source] ?? 0) + 1;
    }
    const sources = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));
    return c.json({ sources }, 200);
  })
  .get("/pipeline", requireTenant, requireRole("admin", "manager"), async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, agencyId)),
      queryResult.data.range,
    );
    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const pipeline = stages.map((stage) => ({
      stage,
      count: allLeads.filter((lead) => lead.stage === stage).length,
    }));
    return c.json({ pipeline }, 200);
  });
