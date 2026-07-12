import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const DAY = 86400000;
const RANGE_MS: Record<string, number | null> = {
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  all: null,
};

function filterByRange<T extends { createdAt: number | null }>(rows: T[], range?: string): T[] {
  const ms = RANGE_MS[range ?? "all"];
  if (ms == null) return rows;
  const since = Date.now() - ms;
  return rows.filter(r => (r.createdAt ?? 0) >= since);
}

export const analytics = new Hono()
  .get("/overview", requireAuth, requireRole("admin","manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ overview: {} }, 200);

    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, profile.agencyId)),
      c.req.query("range")
    );
    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const stageBreakdown = stages.map(s => ({ stage: s, count: allLeads.filter(l => l.stage === s).length }));
    const closed = allLeads.filter(l => l.stage === "closed").length;
    const total = allLeads.length;

    return c.json({
      overview: {
        totalLeads: total,
        closedLeads: closed,
        conversionRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        stageBreakdown,
      }
    }, 200);
  })
  .get("/agents", requireAuth, requireRole("admin","manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ leaderboard: [] }, 200);

    const range = c.req.query("range");
    const agentProfiles = await db.select().from(schema.profiles).where(eq(schema.profiles.agencyId, profile.agencyId));
    const leaderboard = await Promise.all(agentProfiles.map(async (p) => {
      const authUser = await db.select().from(schema.user).where(eq(schema.user.id, p.id)).get();
      const agentLeads = filterByRange(
        await db.select().from(schema.leads).where(eq(schema.leads.assignedTo, p.id)),
        range
      );
      const closed = agentLeads.filter(l => l.stage === "closed").length;
      return {
        id: p.id,
        name: authUser?.name ?? "",
        role: p.role,
        totalLeads: agentLeads.length,
        closedLeads: closed,
        conversionRate: agentLeads.length > 0 ? Math.round((closed / agentLeads.length) * 100) : 0,
      };
    }));
    leaderboard.sort((a, b) => b.closedLeads - a.closedLeads);
    return c.json({ leaderboard }, 200);
  })
  .get("/sources", requireAuth, requireRole("admin","manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ sources: [] }, 200);
    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, profile.agencyId)),
      c.req.query("range")
    );
    const sourceMap: Record<string, number> = {};
    for (const l of allLeads) {
      const src = l.source ?? "manual";
      sourceMap[src] = (sourceMap[src] ?? 0) + 1;
    }
    const sources = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));
    return c.json({ sources }, 200);
  })
  .get("/pipeline", requireAuth, requireRole("admin","manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ pipeline: [] }, 200);
    const allLeads = filterByRange(
      await db.select().from(schema.leads).where(eq(schema.leads.agencyId, profile.agencyId)),
      c.req.query("range")
    );
    const stages = ["new", "contacted", "viewing", "offer", "closed", "lost"];
    const pipeline = stages.map(s => ({ stage: s, count: allLeads.filter(l => l.stage === s).length }));
    return c.json({ pipeline }, 200);
  });
