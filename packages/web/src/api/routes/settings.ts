import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { presignGet } from "../lib/s3";

async function withLogoUrl(agency: any) {
  if (!agency) return agency;
  const logoImageUrl = agency.logoUrl ? await presignGet(agency.logoUrl, 86400) : null;
  return { ...agency, logoImageUrl };
}

export const settings = new Hono()
  .get("/agency", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) {
      // Admin with no agency yet — auto-create one
      const agencyId = nanoid();
      const authUser = await db.select().from(schema.user).where(eq(schema.user.id, user.id)).get();
      await db.insert(schema.agencies).values({
        id: agencyId,
        name: authUser?.name ?? "My Agency",
        locale: "en",
        country: "AE",
      });
      await db.update(schema.profiles).set({ agencyId, role: "admin" }).where(eq(schema.profiles.id, user.id));
      const agency = await db.select().from(schema.agencies).where(eq(schema.agencies.id, agencyId)).get();
      return c.json({ agency: await withLogoUrl(agency) }, 200);
    }
    const agency = await db.select().from(schema.agencies).where(eq(schema.agencies.id, profile.agencyId)).get();
    return c.json({ agency: await withLogoUrl(agency) }, 200);
  })
  .patch("/agency", requireAuth, requireRole("admin", "manager"), async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const body = await c.req.json();
    const [agency] = await db.update(schema.agencies).set(body).where(eq(schema.agencies.id, profile.agencyId)).returning();
    return c.json({ agency: await withLogoUrl(agency) }, 200);
  })
  .get("/profile", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    return c.json({ profile }, 200);
  });
