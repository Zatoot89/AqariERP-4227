import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";
import { presignImages } from "../lib/s3";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import {
  createPropertySchema,
  entityIdSchema,
  propertyListQuerySchema,
  updatePropertySchema,
} from "../validation/schemas";

async function findProperty(agencyId: string, propertyId: string) {
  return db
    .select()
    .from(schema.properties)
    .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)))
    .get();
}

function propertyImagePrefix(agencyId: string): string {
  return `agencies/${agencyId}/properties/`;
}

function normalizeImageKeys(value: unknown, agencyId: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  let keys: unknown;
  try {
    keys = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("Invalid image list");
  }
  if (!Array.isArray(keys) || keys.length > 30) throw new Error("Invalid image list");

  const prefix = propertyImagePrefix(agencyId);
  if (!keys.every((key) => typeof key === "string" && key.startsWith(prefix))) {
    throw new Error("One or more image keys are not owned by this agency");
  }
  return JSON.stringify(keys);
}

export const properties = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, propertyListQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const { type, status, q, page, pageSize, all } = queryResult.data;
    let rows = await db.select().from(schema.properties)
      .where(eq(schema.properties.agencyId, agencyId))
      .orderBy(desc(schema.properties.createdAt));

    if (type) rows = rows.filter((property) => property.type === type);
    if (status) rows = rows.filter((property) => property.status === status);
    if (q) {
      const normalizedQuery = q.toLowerCase();
      rows = rows.filter((property) =>
        property.title.toLowerCase().includes(normalizedQuery) ||
        property.location?.toLowerCase().includes(normalizedQuery) ||
        property.city?.toLowerCase().includes(normalizedQuery),
      );
    }

    const total = rows.length;
    const imagePrefix = propertyImagePrefix(agencyId);
    if (all === "true") {
      const capped = rows.slice(0, 500);
      const withImages = await Promise.all(capped.map(async (property) => ({
        ...property,
        imageUrls: await presignImages(property.images, imagePrefix),
      })));
      return c.json({ properties: withImages, total, page: 1, pageSize: total }, 200);
    }

    const currentPage = page ?? 1;
    const size = Math.min(60, pageSize ?? 24);
    const paged = rows.slice((currentPage - 1) * size, (currentPage - 1) * size + size);
    const withImages = await Promise.all(paged.map(async (property) => ({
      ...property,
      imageUrls: await presignImages(property.images, imagePrefix),
    })));
    return c.json({ properties: withImages, total, page: currentPage, pageSize: size }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createPropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const body = bodyResult.data;
    let images: string | null | undefined;
    try {
      images = normalizeImageKeys(body.images, agencyId);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid images" }, 400);
    }

    const [property] = await db.insert(schema.properties).values({
      id: nanoid(),
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
      images,
      externalId: body.externalId,
    }).returning();
    return c.json({ property }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const property = await findProperty(agencyId, idResult.data);
    if (!property) return c.json({ error: "Not found" }, 404);

    const imageUrls = await presignImages(property.images, propertyImagePrefix(agencyId));
    return c.json({ property: { ...property, imageUrls } }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updatePropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const agencyId = c.get("agencyId") as string;
    const propertyId = idResult.data;
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = bodyResult.data;
    let images: string | null | undefined;
    try {
      images = normalizeImageKeys(body.images, agencyId);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid images" }, 400);
    }

    const [property] = await db.update(schema.properties).set({
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
      images,
      externalId: body.externalId,
      updatedAt: Date.now(),
    }).where(
      and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)),
    ).returning();
    return c.json({ property }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const propertyId = idResult.data;
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    await db.delete(schema.properties).where(
      and(eq(schema.properties.id, propertyId), eq(schema.properties.agencyId, agencyId)),
    );
    return c.json({ ok: true }, 200);
  });
