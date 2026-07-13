import { Hono } from "hono";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireRole, requireTenant } from "../middleware/auth";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "../lib/invitations";
import { nanoid } from "../lib/id";
import { parseJson, parseParam } from "../lib/validation";
import { createInvitationSchema } from "../validation/invitations";
import { entityIdSchema, updateAgentSchema } from "../validation/schemas";
import { sendEmail, agentInviteEmail } from "../../services/email";

type Profile = typeof schema.profiles.$inferSelect;

async function findAgencyProfile(agencyId: string, profileId: string): Promise<Profile | undefined> {
  return db.select().from(schema.profiles)
    .where(and(eq(schema.profiles.id, profileId), eq(schema.profiles.agencyId, agencyId)))
    .get();
}

export const agents = new Hono()
  .get("/", requireTenant, requireRole("admin", "manager"), async (c) => {
    const agencyId = c.get("agencyId") as string;
    const agentProfiles = await db.select().from(schema.profiles)
      .where(eq(schema.profiles.agencyId, agencyId));

    const agentList = await Promise.all(agentProfiles.map(async (profile) => {
      const authUser = await db.select().from(schema.user)
        .where(eq(schema.user.id, profile.id)).get();
      return { ...profile, name: authUser?.name ?? "", email: authUser?.email ?? "" };
    }));
    return c.json({ agents: agentList }, 200);
  })
  .get("/invitations", requireTenant, requireRole("admin", "manager"), async (c) => {
    const caller = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      name: schema.invitations.name,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      acceptedAt: schema.invitations.acceptedAt,
      revokedAt: schema.invitations.revokedAt,
      createdAt: schema.invitations.createdAt,
    }).from(schema.invitations)
      .where(eq(schema.invitations.agencyId, agencyId))
      .orderBy(desc(schema.invitations.createdAt));
    const invitations = caller.role === "manager"
      ? rows.filter((invitation) => invitation.role === "agent")
      : rows;
    return c.json({ invitations }, 200);
  })
  .post("/", requireTenant, requireRole("admin", "manager"), async (c) => {
    const bodyResult = await parseJson(c, createInvitationSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const caller = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const { name, email, role } = bodyResult.data;
    if (caller.role === "manager" && role !== "agent") {
      return c.json({ error: "Managers may only invite agents" }, 403);
    }

    const existingUser = await db.select({ id: schema.user.id }).from(schema.user)
      .where(eq(schema.user.email, email)).get();
    if (existingUser) return c.json({ error: "A user with this email already exists" }, 409);

    const existingInvitation = await db.select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(and(
        eq(schema.invitations.agencyId, agencyId),
        eq(schema.invitations.email, email),
        isNull(schema.invitations.acceptedAt),
        isNull(schema.invitations.revokedAt),
        gt(schema.invitations.expiresAt, Date.now()),
      ))
      .get();
    if (existingInvitation) {
      return c.json({ error: "An active invitation already exists for this email" }, 409);
    }

    const token = createInvitationToken();
    const expiresAt = invitationExpiresAt();
    const invitationId = nanoid();
    await db.insert(schema.invitations).values({
      id: invitationId,
      agencyId,
      email,
      name,
      role,
      tokenHash: hashInvitationToken(token),
      invitedBy: user.id,
      expiresAt,
    });

    const agency = await db.select().from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId)).get();
    const appUrl = process.env.WEBSITE_URL ?? process.env.RUNABLE_URL ?? "";
    const invitationUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
    const emailResult = await sendEmail({
      to: email,
      ...agentInviteEmail({
        name,
        role,
        agencyName: agency?.name ?? "Aqari ERP",
        invitationUrl,
        expiresAt,
      }),
    });

    return c.json({
      invitation: { id: invitationId, email, name, role, expiresAt },
      emailSent: Boolean(emailResult),
      ...(process.env.NODE_ENV !== "production" ? { invitationUrl } : {}),
    }, 201);
  })
  .delete(
    "/invitations/:id",
    requireTenant,
    requireRole("admin", "manager"),
    async (c) => {
      const idResult = parseParam(c, entityIdSchema);
      if (!idResult.success) return idResult.response;
      const caller = c.get("profile") as Profile;
      const agencyId = c.get("agencyId") as string;
      const invitation = await db.select().from(schema.invitations)
        .where(and(
          eq(schema.invitations.id, idResult.data),
          eq(schema.invitations.agencyId, agencyId),
        ))
        .get();
      if (!invitation) return c.json({ error: "Not found" }, 404);
      if (caller.role === "manager" && invitation.role !== "agent") {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (invitation.acceptedAt) return c.json({ error: "Accepted invitations cannot be revoked" }, 409);

      await db.update(schema.invitations).set({ revokedAt: Date.now() })
        .where(and(
          eq(schema.invitations.id, invitation.id),
          eq(schema.invitations.agencyId, agencyId),
        ));
      return c.json({ ok: true }, 200);
    },
  )
  .get("/:id", requireTenant, requireRole("admin", "manager"), async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const profile = await findAgencyProfile(agencyId, idResult.data);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const authUser = await db.select().from(schema.user)
      .where(eq(schema.user.id, profile.id)).get();
    return c.json({
      agent: { ...profile, name: authUser?.name ?? "", email: authUser?.email ?? "" },
    }, 200);
  })
  .get("/:id/stats", requireTenant, requireRole("admin", "manager"), async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const agentId = idResult.data;
    const profile = await findAgencyProfile(agencyId, agentId);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const allLeads = await db.select().from(schema.leads)
      .where(and(eq(schema.leads.assignedTo, agentId), eq(schema.leads.agencyId, agencyId)));
    const closed = allLeads.filter((lead) => lead.stage === "closed").length;
    const lost = allLeads.filter((lead) => lead.stage === "lost").length;
    const active = allLeads.filter((lead) => !["closed", "lost"].includes(lead.stage ?? "")).length;
    return c.json({
      stats: {
        total: allLeads.length,
        closed,
        lost,
        active,
        conversionRate: allLeads.length > 0 ? Math.round((closed / allLeads.length) * 100) : 0,
      },
    }, 200);
  })
  .patch("/:id", requireTenant, requireRole("admin", "manager"), async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateAgentSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const caller = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const targetId = idResult.data;
    const body = bodyResult.data;
    const target = await findAgencyProfile(agencyId, targetId);
    if (!target) return c.json({ error: "Not found" }, 404);

    if (caller.role === "manager" && target.role !== "agent") {
      return c.json({ error: "Managers may only manage agents" }, 403);
    }
    if (caller.role === "manager" && body.role !== undefined && body.role !== "agent") {
      return c.json({ error: "Managers cannot promote agents" }, 403);
    }
    if (targetId === user.id && (body.role !== undefined || body.active === 0)) {
      return c.json({ error: "You cannot change your own role or deactivate yourself" }, 400);
    }

    const nextRole = body.role ?? target.role;
    const nextActive = body.active ?? target.active;
    if (target.role === "admin" && (nextRole !== "admin" || nextActive !== 1)) {
      const agencyProfiles = await db.select().from(schema.profiles)
        .where(eq(schema.profiles.agencyId, agencyId));
      const activeAdmins = agencyProfiles.filter(
        (profile) => profile.role === "admin" && profile.active === 1,
      );
      if (activeAdmins.length <= 1) {
        return c.json({ error: "The agency must keep at least one active admin" }, 400);
      }
    }

    const [profile] = await db.update(schema.profiles)
      .set({ role: body.role, active: body.active })
      .where(and(eq(schema.profiles.id, targetId), eq(schema.profiles.agencyId, agencyId)))
      .returning();
    return c.json({ agent: profile }, 200);
  });
