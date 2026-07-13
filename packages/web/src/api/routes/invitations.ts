import { Hono } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as schema from "../database/schema";
import { hashInvitationToken } from "../lib/invitations";
import { parseJson } from "../lib/validation";
import { acceptInvitationSchema } from "../validation/invitations";

export const invitations = new Hono().post("/accept", async (c) => {
  if (c.get("user")) {
    return c.json({ error: "Sign out before accepting an invitation" }, 409);
  }

  const bodyResult = await parseJson(c, acceptInvitationSchema);
  if (!bodyResult.success) return bodyResult.response;

  const tokenHash = hashInvitationToken(bodyResult.data.token);
  const now = Date.now();
  const invitation = await db.select().from(schema.invitations)
    .where(and(
      eq(schema.invitations.tokenHash, tokenHash),
      isNull(schema.invitations.acceptedAt),
      isNull(schema.invitations.revokedAt),
      gt(schema.invitations.expiresAt, now),
    ))
    .get();

  if (!invitation) {
    return c.json({ error: "Invitation is invalid, expired, revoked, or already used" }, 400);
  }

  let userId: string | null = null;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: invitation.name,
        email: invitation.email,
        password: bodyResult.data.password,
      },
    });
    userId = result.user.id;

    await db.transaction(async (tx) => {
      const accepted = await tx.update(schema.invitations)
        .set({ acceptedAt: now })
        .where(and(
          eq(schema.invitations.id, invitation.id),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          gt(schema.invitations.expiresAt, now),
        ))
        .returning({ id: schema.invitations.id });

      if (accepted.length !== 1) {
        throw new Error("Invitation was already claimed");
      }

      await tx.insert(schema.profiles).values({
        id: userId!,
        agencyId: invitation.agencyId,
        role: invitation.role,
        active: 1,
      });
    });
  } catch (error) {
    if (userId) {
      await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
    }
    const message = error instanceof Error ? error.message : "Invitation acceptance failed";
    const status = message.includes("already") ? 409 : 400;
    return c.json({ error: message }, status);
  }

  return c.json({ ok: true, email: invitation.email }, 201);
});
