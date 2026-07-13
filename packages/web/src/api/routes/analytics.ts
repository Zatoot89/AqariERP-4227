import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { parseQuery } from "../lib/validation";
import { requireRole, requireTenant } from "../middleware/auth";
import { analyticsQuerySchema } from "../validation/schemas";

const DAY = 86_400_000;
const RANGE_MS: Record<string, number | null> = {
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  all: null,
};
const STAGES = ["new", "contacted", "viewing", "offer", "closed", "lost"];

function filterByRange<T extends { createdAt: number }>(rows: T[], range?: string): T[] {
  const milliseconds = RANGE_MS[range ?? "all"];
  if (milliseconds == null) return rows;
  const since = Date.now() - milliseconds;
  return rows.filter((row) => row.createdAt >= since);
}

async function agencyLeads(agencyId: string, range?: string) {
  return filterByRange(
    await db
      .select()
      .from(schema.leads)
      .where(and(
        eq(schema.leads.agencyId, agencyId),
        isNull(schema.leads.deletedAt),
      )),
    range,
  );
}

export const analytics = new Hono()
  .use("*", requireTenant, requireRole("admin", "manager"))
  .get("/overview", async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const rows = await agencyLeads(c.get("agencyId") as string, queryResult.data.range);
    const closed = rows.filter((lead) => lead.stage === "closed").length;
    return c.json({
      overview: {
        totalLeads: rows.length,
        closedLeads: closed,
        conversionRate: rows.length > 0 ? Math.round((closed / rows.length) * 100) : 0,
        stageBreakdown: STAGES.map((stage) => ({
          stage,
          count: rows.filter((lead) => lead.stage === stage).length,
        })),
      },
    }, 200);
  })
  .get("/agents", async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const profiles = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.agencyId, agencyId));
    const allLeads = await agencyLeads(agencyId, queryResult.data.range);
    const leaderboard = await Promise.all(profiles.map(async (profile) => {
      const authUser = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, profile.id))
        .get();
      const assigned = allLeads.filter((lead) => lead.assignedTo === profile.id);
      const closed = assigned.filter((lead) => lead.stage === "closed").length;
      return {
        id: profile.id,
        name: authUser?.name ?? "",
        role: profile.role,
        totalLeads: assigned.length,
        closedLeads: closed,
        conversionRate: assigned.length > 0 ? Math.round((closed / assigned.length) * 100) : 0,
      };
    }));
    leaderboard.sort((left, right) => right.closedLeads - left.closedLeads);
    return c.json({ leaderboard }, 200);
  })
  .get("/sources", async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const rows = await agencyLeads(c.get("agencyId") as string, queryResult.data.range);
    const counts: Record<string, number> = {};
    for (const lead of rows) {
      counts[lead.source] = (counts[lead.source] ?? 0) + 1;
    }
    return c.json({
      sources: Object.entries(counts).map(([source, count]) => ({ source, count })),
    }, 200);
  })
  .get("/pipeline", async (c) => {
    const queryResult = parseQuery(c, analyticsQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const rows = await agencyLeads(c.get("agencyId") as string, queryResult.data.range);
    return c.json({
      pipeline: STAGES.map((stage) => ({
        stage,
        count: rows.filter((lead) => lead.stage === stage).length,
      })),
    }, 200);
  });
