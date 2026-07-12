import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { presignImages } from "../lib/s3";

async function findProperty(agencyId: string, propertyId: string) {
  return db
    .select()
    .from(schema.properties)
    .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)))
    .get();
}

export const properties = new Hono()
  .get("/", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const { type, status, q, page, pageSize, all } = c.req.query();
    let rows = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.agencyId, agencyId))
      .orderBy(desc(schema.properties.createdAt));

    if (type) rows = rows.filter((property) => property.type === type);
    if (status) rows = rows.filter((property) => property.status === status);
    if (q) {
      const normalizedQuery = q.toLowerCase();
      rows = rows.filter(
        (property) =>
          property.title.toLowerCase().includes(normalizedQuery) ||
          property.location?.toLowerCase().includes(normalizedQuery) ||
          property.city?.toLowerCase().includes(normalizedQuery),
      );
    }

    const total = rows.length;
    if (all === "true") {
      const capped = rows.slice(0, 500);
      const withImages = await Promise.all(
        capped.map(async (property) => ({
          ...property,
          imageUrls: await presignImages(property.images),
        })),
      );
      return c.json({ properties: withImages, total, page: 1, pageSize: total }, 200);
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const size = Math.min(60, Math.max(1, Number(pageSize) || 24));
    const paged = rows.slice((currentPage - 1) * size, (currentPage - 1) * size + size);
    const withImages = await Promise.all(
      paged.map(async (property) => ({
        ...property,
        imageUrls: await presignImages(property.images),
      })),
    );
    return c.json({ properties: withImages, total, page: currentPage, pageSize: size }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const body = await c.req.json();
    const id = nanoid();

    const [property] = await db
      .insert(schema.properties)
      .values({
        id,
        agencyId,
        listedBy: user.id,
        title: body.title,
        titleAr: body.titleAr,
        type: body.type,
        status: body.status ?? "available",
        price: body.price,
        currency: body.currency ?? "USD",
        areaSqm: body.areaSqm,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        location: body.location,
        locationAr: body.locationAr,
        city: body.city,
        country: body.country,
        description: body.description,
        descriptionAr: body.descriptionAr,
        images: body.images,
        externalId: body.externalId,
      })
      .returning();
    return c.json({ property }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const property = await findProperty(agencyId, c.req.param("id"));
    if (!property) return c.json({ error: "Not found" }, 404);

    const imageUrls = await presignImages(property.images);
    return c.json({ property: { ...property, imageUrls } }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const propertyId = c.req.param("id");
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json();
    const [property] = await db
      .update(schema.properties)
      .set({
        title: body.title,
        titleAr: body.titleAr,
        type: body.type,
        status: body.status,
        price: body.price,
        currency: body.currency,
        areaSqm: body.areaSqm,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        location: body.location,
        locationAr: body.locationAr,
        city: body.city,
        country: body.country,
        description: body.description,
        descriptionAr: body.descriptionAr,
        images: body.images,
        externalId: body.externalId,
        updatedAt: Date.now(),
      })
      .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)))
      .returning();
    return c.json({ property }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const propertyId = c.req.param("id");
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    await db
      .delete(schema.properties)
      .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)));
    return c.json({ ok: true }, 200);
  });
