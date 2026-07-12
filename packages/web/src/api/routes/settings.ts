import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireAuth, requireRole, requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { presignGet } from "../lib/s3";

async function safeAgency(agency: typeof schema.agencies.$inferSelect | undefined) {
  if (!agency) return agency;
  const {
    waAccessToken: redactedAccessToken,
    waVerifyToken: redactedVerifyToken,
    ...visibleAgency
  } = agency;
  void redactedAccessToken;
  void redactedVerifyToken;

  const logoImageUrl = agency.logoUrl ? await presignGet(agency.logoUrl, 86400) : null;
  return {
    ...visibleAgency,
    logoImageUrl,
    whatsappConfigured: Boolean(agency.waAccessToken && agency.waPhoneNumberId),
  };
}

export const settings = new Hono()
  .post("/bootstrap", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json().catch(() => ({}));

    const result = await db.transaction(async (tx) => {
      const existingProfile = await tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, user.id))
        .get();

      if (existingProfile?.active === 0) {
        return { error: "Account is inactive" as const };
      }

      if (existingProfile?.agencyId) {
        const existingAgency = await tx
          .select()
          .from(schema.agencies)
          .where(eq(schema.agencies.id, existingProfile.agencyId))
          .get();
        return { agency: existingAgency };
      }

      const authUser = await tx
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, user.id))
        .get();
      const agencyId = nanoid();
      const [agency] = await tx
        .insert(schema.agencies)
        .values({
          id: agencyId,
          name:
            typeof body.agencyName === "string" && body.agencyName.trim()
              ? body.agencyName.trim()
              : authUser?.name ?? "My Agency",
          locale: body.locale === "ar" ? "ar" : "en",
          country:
            typeof body.country === "string" && body.country.trim()
              ? body.country.trim().toUpperCase().slice(0, 2)
              : "AE",
        })
        .returning();

      if (existingProfile) {
        await tx
          .update(schema.profiles)
          .set({ agencyId, role: "admin", active: 1 })
          .where(eq(schema.profiles.id, user.id));
      } else {
        await tx.insert(schema.profiles).values({
          id: user.id,
          agencyId,
          role: "admin",
          active: 1,
        });
      }

      return { agency };
    });

    if ("error" in result) return c.json({ error: result.error }, 403);
    return c.json({ agency: await safeAgency(result.agency) }, 201);
  })
  .get("/agency", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const agency = await db
      .select()
      .from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId))
      .get();
    if (!agency) return c.json({ error: "Agency not found" }, 404);
    return c.json({ agency: await safeAgency(agency) }, 200);
  })
  .patch(
    "/agency",
    requireTenant,
    requireRole("admin", "manager"),
    async (c) => {
      const agencyId = c.get("agencyId") as string;
      const body = await c.req.json();
      const [agency] = await db
        .update(schema.agencies)
        .set({
          name: body.name,
          nameAr: body.nameAr,
          country: body.country,
          locale: body.locale,
          currency: body.currency,
          timezone: body.timezone,
          logoUrl: body.logoUrl,
          waAccessToken: body.waAccessToken,
          waPhoneNumberId: body.waPhoneNumberId,
          waVerifyToken: body.waVerifyToken,
        })
        .where(eq(schema.agencies.id, agencyId))
        .returning();
      return c.json({ agency: await safeAgency(agency) }, 200);
    },
  )
  .get("/profile", requireTenant, async (c) => {
    const profile = c.get("profile");
    return c.json({ profile }, 200);
  });
