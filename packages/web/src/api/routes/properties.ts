import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { presignImages } from "../lib/s3";

export const properties = new Hono()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ properties: [], total: 0, page: 1, pageSize: 0 }, 200);
    const { type, status, q, page, pageSize, all } = c.req.query();
    let rows = await db.select().from(schema.properties)
      .where(eq(schema.properties.agencyId, profile.agencyId))
      .orderBy(desc(schema.properties.createdAt));
    if (type) rows = rows.filter(p => p.type === type);
    if (status) rows = rows.filter(p => p.status === status);
    if (q) rows = rows.filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || p.location?.toLowerCase().includes(q.toLowerCase()));

    const total = rows.length;

    // Used by the "link property to lead" search dropdown, which needs every property.
    if (all === "true") {
      const capped = rows.slice(0, 500);
      const withImages = await Promise.all(capped.map(async (prop) => ({ ...prop, imageUrls: await presignImages(prop.images) })));
      return c.json({ properties: withImages, total, page: 1, pageSize: total }, 200);
    }

    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(60, Math.max(1, Number(pageSize) || 24));
    const paged = rows.slice((p - 1) * size, (p - 1) * size + size);

    const withImages = await Promise.all(paged.map(async (prop) => ({ ...prop, imageUrls: await presignImages(prop.images) })));
    return c.json({ properties: withImages, total, page: p, pageSize: size }, 200);
  })
  .post("/", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const body = await c.req.json();
    const id = nanoid();
    const [prop] = await db.insert(schema.properties).values({
      id,
      agencyId: profile.agencyId,
      listedBy: user.id,
      ...body,
    }).returning();
    return c.json({ property: prop }, 201);
  })
  .get("/:id", requireAuth, async (c) => {
    const prop = await db.select().from(schema.properties).where(eq(schema.properties.id, c.req.param("id"))).get();
    if (!prop) return c.json({ error: "Not found" }, 404);
    const imageUrls = await presignImages(prop.images);
    return c.json({ property: { ...prop, imageUrls } }, 200);
  })
  .patch("/:id", requireAuth, async (c) => {
    const body = await c.req.json();
    const [prop] = await db.update(schema.properties)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(schema.properties.id, c.req.param("id")))
      .returning();
    return c.json({ property: prop }, 200);
  })
  .delete("/:id", requireAuth, async (c) => {
    await db.delete(schema.properties).where(eq(schema.properties.id, c.req.param("id")));
    return c.json({ ok: true }, 200);
  });
