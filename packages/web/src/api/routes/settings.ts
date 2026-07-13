import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireAuth, requireRole, requireTenant } from "../middleware/auth";
import {
  attachmentsWithUrls,
  listActiveAttachments,
  verifyAttachmentObject,
} from "../lib/attachments";
import { auditRecord } from "../lib/audit";
import { encryptCredential, isEncryptedCredential } from "../lib/credentials";
import { nanoid } from "../lib/id";
import { presignGet } from "../lib/s3";
import { parseJson } from "../lib/validation";
import {
  bootstrapAgencySchema,
  updateAgencySchema,
} from "../validation/schemas";

function agencyLogoPrefix(agencyId: string): string {
  return `agencies/${agencyId}/branding/`;
}

async function safeAgency(agency: typeof schema.agencies.$inferSelect | undefined) {
  if (!agency) return agency;
  const {
    waAccessToken: redactedAccessToken,
    waVerifyToken: redactedVerifyToken,
    ...visibleAgency
  } = agency;
  void redactedVerifyToken;

  const structuredLogos = await listActiveAttachments(agency.id, "agency_logo", agency.id);
  const structuredLogo = structuredLogos.at(-1);
  const structuredMedia = structuredLogo
    ? (await attachmentsWithUrls([structuredLogo]))[0]
    : undefined;
  const legacyLogoUrl =
    !structuredMedia && agency.logoUrl?.startsWith(agencyLogoPrefix(agency.id))
      ? await presignGet(agency.logoUrl, 86_400)
      : null;

  return {
    ...visibleAgency,
    logoAttachmentId: structuredLogo?.id ?? null,
    logoImageUrl: structuredMedia?.url ?? legacyLogoUrl,
    whatsappConfigured: Boolean(agency.waAccessToken && agency.waPhoneNumberId),
    whatsappCredentialEncrypted: isEncryptedCredential(redactedAccessToken),
    whatsappNeedsRotation: Boolean(
      redactedAccessToken && !isEncryptedCredential(redactedAccessToken),
    ),
  };
}

export const settings = new Hono()
  .post("/bootstrap", requireAuth, async (c) => {
    const bodyResult = await parseJson(c, bootstrapAgencySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const body = bodyResult.data;
    const result = await db.transaction(async (tx) => {
      const existingProfile = await tx.select().from(schema.profiles)
        .where(eq(schema.profiles.id, user.id)).get();

      if (existingProfile?.active === 0) {
        return { error: "Account is inactive" as const };
      }
      if (existingProfile?.agencyId) {
        const existingAgency = await tx.select().from(schema.agencies)
          .where(eq(schema.agencies.id, existingProfile.agencyId)).get();
        return { agency: existingAgency };
      }

      const authUser = await tx.select().from(schema.user)
        .where(eq(schema.user.id, user.id)).get();
      const agencyId = nanoid();
      const [agency] = await tx.insert(schema.agencies).values({
        id: agencyId,
        name: body.agencyName ?? authUser?.name ?? "My Agency",
        locale: body.locale ?? "en",
        country: body.country ?? "AE",
      }).returning();

      if (existingProfile) {
        await tx.update(schema.profiles)
          .set({ agencyId, role: "admin", active: 1, updatedAt: Date.now() })
          .where(eq(schema.profiles.id, user.id));
      } else {
        await tx.insert(schema.profiles).values({
          id: user.id,
          agencyId,
          role: "admin",
          active: 1,
        });
      }
      await tx.insert(schema.activities).values({
        id: nanoid(),
        agencyId,
        userId: user.id,
        type: "agency_created",
        body: "Agency created",
        meta: JSON.stringify({ locale: agency.locale, country: agency.country }),
      });
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "agency.created",
        entityType: "agency",
        entityId: agencyId,
        metadata: { locale: agency.locale, country: agency.country },
      }));
      return { agency };
    });

    if ("error" in result) return c.json({ error: result.error }, 403);
    return c.json({ agency: await safeAgency(result.agency) }, 201);
  })
  .get("/agency", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const agency = await db.select().from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId)).get();
    if (!agency) return c.json({ error: "Agency not found" }, 404);
    return c.json({ agency: await safeAgency(agency) }, 200);
  })
  .patch(
    "/agency",
    requireTenant,
    requireRole("admin", "manager"),
    async (c) => {
      const bodyResult = await parseJson(c, updateAgencySchema);
      if (!bodyResult.success) return bodyResult.response;

      const user = c.get("user")!;
      const agencyId = c.get("agencyId") as string;
      const body = bodyResult.data;
      const existingAgency = await db.select().from(schema.agencies)
        .where(eq(schema.agencies.id, agencyId)).get();
      if (!existingAgency) return c.json({ error: "Agency not found" }, 404);

      let selectedLogo: typeof schema.attachments.$inferSelect | undefined;
      if (typeof body.logoAttachmentId === "string") {
        selectedLogo = await db.select().from(schema.attachments).where(and(
          eq(schema.attachments.id, body.logoAttachmentId),
          eq(schema.attachments.agencyId, agencyId),
          eq(schema.attachments.ownerType, "agency_logo"),
          eq(schema.attachments.ownerId, agencyId),
        )).get();
        if (!selectedLogo) return c.json({ error: "Agency logo attachment not found" }, 404);
        const usable =
          selectedLogo.status === "active" ||
          (selectedLogo.status === "pending" && selectedLogo.uploadedBy === user.id);
        if (!usable) return c.json({ error: "Agency logo attachment cannot be claimed" }, 400);
        if (selectedLogo.status === "pending") {
          try {
            await verifyAttachmentObject(selectedLogo);
          } catch (error) {
            return c.json({
              error: error instanceof Error ? error.message : "Logo verification failed",
            }, 400);
          }
        }
      }

      const clearWhatsappCredentials = body.clearWhatsappCredentials === true;
      let encryptedAccessToken: string | undefined;
      let encryptedVerifyToken: string | undefined;
      try {
        encryptedAccessToken = body.waAccessToken
          ? encryptCredential(body.waAccessToken)
          : undefined;
        encryptedVerifyToken = body.waVerifyToken
          ? encryptCredential(body.waVerifyToken)
          : undefined;
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Credential encryption failed" },
          503,
        );
      }

      const now = Date.now();
      const agency = await db.transaction(async (tx) => {
        if (body.logoAttachmentId !== undefined) {
          const activeLogos = await tx.select().from(schema.attachments).where(and(
            eq(schema.attachments.agencyId, agencyId),
            eq(schema.attachments.ownerType, "agency_logo"),
            eq(schema.attachments.ownerId, agencyId),
            eq(schema.attachments.status, "active"),
          ));
          for (const activeLogo of activeLogos) {
            if (activeLogo.id === selectedLogo?.id) continue;
            await tx.update(schema.attachments).set({
              status: "delete_pending",
              deletedAt: now,
              updatedAt: now,
            }).where(and(
              eq(schema.attachments.id, activeLogo.id),
              eq(schema.attachments.agencyId, agencyId),
            ));
          }

          if (selectedLogo?.status === "pending") {
            const activated = await tx.update(schema.attachments).set({
              status: "active",
              deletedAt: null,
              updatedAt: now,
            }).where(and(
              eq(schema.attachments.id, selectedLogo.id),
              eq(schema.attachments.agencyId, agencyId),
              eq(schema.attachments.ownerType, "agency_logo"),
              eq(schema.attachments.ownerId, agencyId),
              eq(schema.attachments.uploadedBy, user.id),
              eq(schema.attachments.status, "pending"),
            )).returning({ id: schema.attachments.id });
            if (activated.length !== 1) {
              throw new Error("Logo attachment changed concurrently; try again");
            }
          }
        }

        const [updatedAgency] = await tx.update(schema.agencies).set({
          name: body.name,
          nameAr: body.nameAr,
          country: body.country,
          locale: body.locale,
          currency: body.currency,
          timezone: body.timezone,
          ...(body.logoAttachmentId !== undefined
            ? { logoUrl: selectedLogo?.objectKey ?? null }
            : {}),
          ...(clearWhatsappCredentials
            ? {
                waAccessToken: null,
                waPhoneNumberId: null,
                waVerifyToken: null,
                waConnectedAt: null,
              }
            : {
                ...(encryptedAccessToken ? { waAccessToken: encryptedAccessToken } : {}),
                ...(body.waPhoneNumberId ? { waPhoneNumberId: body.waPhoneNumberId } : {}),
                ...(encryptedVerifyToken ? { waVerifyToken: encryptedVerifyToken } : {}),
              }),
          updatedAt: now,
        }).where(eq(schema.agencies.id, agencyId)).returning();

        const safeFields = Object.keys(body).filter(
          (field) => !["waAccessToken", "waVerifyToken"].includes(field),
        );
        const whatsappCredentialAction = clearWhatsappCredentials
          ? "cleared"
          : encryptedAccessToken || encryptedVerifyToken
            ? "updated"
            : undefined;
        await tx.insert(schema.activities).values({
          id: nanoid(),
          agencyId,
          userId: user.id,
          type: "agency_settings_updated",
          body: "Agency settings updated",
          meta: JSON.stringify({
            changedFields: safeFields,
            ...(whatsappCredentialAction ? { whatsappCredentialAction } : {}),
          }),
        });
        await tx.insert(schema.auditLogs).values(auditRecord(c, {
          agencyId,
          action: "agency.settings_updated",
          entityType: "agency",
          entityId: agencyId,
          metadata: {
            changedFields: safeFields,
            logoAction: body.logoAttachmentId === undefined
              ? undefined
              : selectedLogo
                ? "updated"
                : "cleared",
            ...(whatsappCredentialAction ? { whatsappCredentialAction } : {}),
          },
        }));
        return updatedAgency;
      });

      return c.json({ agency: await safeAgency(agency) }, 200);
    },
  )
  .get("/profile", requireTenant, async (c) => {
    const profile = c.get("profile");
    return c.json({ profile }, 200);
  });
