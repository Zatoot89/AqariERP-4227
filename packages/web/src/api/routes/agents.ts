import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { auth } from "../auth";
import { nanoid } from "../lib/id";
import { sendEmail, agentInviteEmail } from "../../services/email";

export const agents = new Hono()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ agents: [] }, 200);

    const agentProfiles = await db.select().from(schema.profiles)
      .where(eq(schema.profiles.agencyId, profile.agencyId));

    const agentList = await Promise.all(agentProfiles.map(async (p) => {
      const authUser = await db.select().from(schema.user).where(eq(schema.user.id, p.id)).get();
      return { ...p, name: authUser?.name ?? "", email: authUser?.email ?? "" };
    }));

    return c.json({ agents: agentList }, 200);
  })
  .post("/", requireAuth, requireRole("admin", "manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);

    const { name, email, role, password } = await c.req.json();
    if (!name || !email || !role) return c.json({ error: "name, email, role required" }, 400);

    // Create user via Better Auth (hashes password with scrypt)
    const tempPassword = password || `Aqari${nanoid(8)}!`;
    let userId: string;
    try {
      const res = await auth.api.signUpEmail({
        body: { name, email, password: tempPassword },
      });
      userId = res.user.id;
    } catch (err: any) {
      return c.json({ error: err?.message ?? "Failed to create user" }, 400);
    }

    // Create profile linking user to agency
    await db.insert(schema.profiles).values({
      id: userId,
      agencyId: profile.agencyId,
      role: role ?? "agent",
      active: 1,
    }).onConflictDoNothing();

    const authUser = await db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
    const newProfile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, userId)).get();

    // Email the new agent their login credentials (best-effort — doesn't block the response)
    const agency = await db.select().from(schema.agencies).where(eq(schema.agencies.id, profile.agencyId)).get();
    const appUrl = process.env.WEBSITE_URL ?? process.env.RUNABLE_URL ?? "";
    sendEmail({
      to: email,
      ...agentInviteEmail({ name, email, password: tempPassword, role: role ?? "agent", agencyName: agency?.name ?? "Aqari CRM", appUrl }),
    }).catch(() => {});

    return c.json({ agent: { ...newProfile, name: authUser?.name ?? "", email: authUser?.email ?? "" } }, 201);
  })
  .get("/:id", requireAuth, async (c) => {
    const p = await db.select().from(schema.profiles).where(eq(schema.profiles.id, c.req.param("id"))).get();
    if (!p) return c.json({ error: "Not found" }, 404);
    const authUser = await db.select().from(schema.user).where(eq(schema.user.id, p.id)).get();
    return c.json({ agent: { ...p, name: authUser?.name ?? "", email: authUser?.email ?? "" } }, 200);
  })
  .get("/:id/stats", requireAuth, async (c) => {
    const agentId = c.req.param("id");
    const allLeads = await db.select().from(schema.leads).where(eq(schema.leads.assignedTo, agentId));
    const closed = allLeads.filter(l => l.stage === "closed").length;
    const lost = allLeads.filter(l => l.stage === "lost").length;
    const active = allLeads.filter(l => !["closed", "lost"].includes(l.stage!)).length;
    return c.json({ stats: { total: allLeads.length, closed, lost, active, conversionRate: allLeads.length > 0 ? Math.round((closed / allLeads.length) * 100) : 0 } }, 200);
  })
  .patch("/:id", requireAuth, requireRole("admin", "manager"), async (c) => {
    const body = await c.req.json();
    const allowed = { role: body.role, active: body.active };
    const [p] = await db.update(schema.profiles).set(allowed).where(eq(schema.profiles.id, c.req.param("id"))).returning();
    return c.json({ agent: p }, 200);
  });
