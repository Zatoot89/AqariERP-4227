import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireRole, requireTenant } from "../middleware/auth";
import { auth } from "../auth";
import { nanoid } from "../lib/id";
import { sendEmail, agentInviteEmail } from "../../services/email";

const ROLES = new Set(["admin", "manager", "agent"]);
type Profile = typeof schema.profiles.$inferSelect;

async function findAgencyProfile(agencyId: string, profileId: string): Promise<Profile | undefined> {
  return db
    .select()
    .from(schema.profiles)
    .where(and(eq(schema.profiles.id, profileId), eq(schema.profiles.agencyId, agencyId)))
    .get();
}

export const agents = new Hono()
  .get("/", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const agentProfiles = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.agencyId, agencyId));

    const agentList = await Promise.all(
      agentProfiles.map(async (profile) => {
        const authUser = await db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, profile.id))
          .get();
        return { ...profile, name: authUser?.name ?? "", email: authUser?.email ?? "" };
      }),
    );

    return c.json({ agents: agentList }, 200);
  })
  .post("/", requireTenant, requireRole("admin", "manager"), async (c) => {
    const caller = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { name, email, role, password } = await c.req.json();

    if (!name || !email || !role) {
      return c.json({ error: "name, email, role required" }, 400);
    }
    if (!ROLES.has(role)) return c.json({ error: "Invalid role" }, 400);
    if (caller.role === "manager" && role !== "agent") {
      return c.json({ error: "Managers may only create agents" }, 403);
    }

    const tempPassword = password || `Aqari${nanoid(8)}!`;
    let userId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: { name, email, password: tempPassword },
      });
      userId = result.user.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      return c.json({ error: message }, 400);
    }

    await db
      .insert(schema.profiles)
      .values({
        id: userId,
        agencyId,
        role,
        active: 1,
      })
      .onConflictDoNothing();

    const authUser = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .get();
    const newProfile = await findAgencyProfile(agencyId, userId);
    const agency = await db
      .select()
      .from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId))
      .get();
    const appUrl = process.env.WEBSITE_URL ?? process.env.RUNABLE_URL ?? "";

    sendEmail({
      to: email,
      ...agentInviteEmail({
        name,
        email,
        password: tempPassword,
        role,
        agencyName: agency?.name ?? "Aqari CRM",
        appUrl,
      }),
    }).catch(() => {});

    return c.json(
      {
        agent: {
          ...newProfile,
          name: authUser?.name ?? "",
          email: authUser?.email ?? "",
        },
      },
      201,
    );
  })
  .get("/:id", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const profile = await findAgencyProfile(agencyId, c.req.param("id"));
    if (!profile) return c.json({ error: "Not found" }, 404);

    const authUser = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, profile.id))
      .get();
    return c.json(
      { agent: { ...profile, name: authUser?.name ?? "", email: authUser?.email ?? "" } },
      200,
    );
  })
  .get("/:id/stats", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const agentId = c.req.param("id");
    const profile = await findAgencyProfile(agencyId, agentId);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const allLeads = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.assignedTo, agentId), eq(schema.leads.agencyId, agencyId)));
    const closed = allLeads.filter((lead) => lead.stage === "closed").length;
    const lost = allLeads.filter((lead) => lead.stage === "lost").length;
    const active = allLeads.filter((lead) => !["closed", "lost"].includes(lead.stage ?? "")).length;

    return c.json(
      {
        stats: {
          total: allLeads.length,
          closed,
          lost,
          active,
          conversionRate:
            allLeads.length > 0 ? Math.round((closed / allLeads.length) * 100) : 0,
        },
      },
      200,
    );
  })
  .patch("/:id", requireTenant, requireRole("admin", "manager"), async (c) => {
    const user = c.get("user")!;
    const caller = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const targetId = c.req.param("id");
    const target = await findAgencyProfile(agencyId, targetId);
    if (!target) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json();
    if (body.role !== undefined && !ROLES.has(body.role)) {
      return c.json({ error: "Invalid role" }, 400);
    }
    if (caller.role === "manager" && (target.role === "admin" || body.role !== undefined && body.role !== "agent")) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (targetId === user.id && (body.role !== undefined || body.active === 0)) {
      return c.json({ error: "You cannot change your own role or deactivate yourself" }, 400);
    }

    const nextRole = body.role ?? target.role;
    const nextActive = body.active ?? target.active;
    if (target.role === "admin" && (nextRole !== "admin" || nextActive !== 1)) {
      const agencyProfiles = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.agencyId, agencyId));
      const activeAdmins = agencyProfiles.filter(
        (profile) => profile.role === "admin" && profile.active === 1,
      );
      if (activeAdmins.length <= 1) {
        return c.json({ error: "The agency must keep at least one active admin" }, 400);
      }
    }

    const [profile] = await db
      .update(schema.profiles)
      .set({ role: body.role, active: body.active })
      .where(and(eq(schema.profiles.id, targetId), eq(schema.profiles.agencyId, agencyId)))
      .returning();
    return c.json({ agent: profile }, 200);
  });
