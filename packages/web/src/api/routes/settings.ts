import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireAuth, requireRole, requireTenant } from "../middleware/auth";
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

  const logoImageUrl =
    agency.logoUrl?.startsWith(agencyLogoPrefix(agency.id))
      ? await presignGet(agency.logoUrl, 86400)
      : null;
  return {
    ...visibleAgency,
    logoImageUrl,
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
          .set({ agencyId, role: "admin", active: 1 })
          .where(eq(schema.profiles.id, user.id));
      } else {
        await tx.insert(schema.profiles).values({
          id: user.id, agencyId, role: "admin", active: 1,
        });
      }
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

      const agencyId = c.get("agencyId") as string;
      const body = bodyResult.data;
      let logoUrl: string | null | undefined;
      if (body.logoUrl !== undefined) {
        if (body.logoUrl === null) {
          logoUrl = null;
        } else if (body.logoUrl.startsWith(agencyLogoPrefix(agencyId))) {
          logoUrl = body.logoUrl;
        } else {
          return c.json({ error: "Invalid agency logo key" }, 400);
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

      const [agency] = await db.update(schema.agencies).set({
        name: body.name,
        nameAr: body.nameAr,
        country: body.country,
        locale: body.locale,
        currency: body.currency,
        timezone: body.timezone,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
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
      }).where(eq(schema.agencies.id, agencyId)).returning();
      return c.json({ agency: await safeAgency(agency) }, 200);
    },
  )
  .get("/profile", requireTenant, async (c) => {
    const profile = c.get("profile");
    return c.json({ profile }, 200);
  });
