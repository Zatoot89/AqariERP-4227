import { Hono } from "hono";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
} from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { attachmentsWithUrls, listActiveAttachments, verifyAttachmentObject } from "../lib/attachments";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { presignImages } from "../lib/s3";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createPropertySchema,
  entityIdSchema,
  propertyListQuerySchema,
  updatePropertySchema,
} from "../validation/schemas";

type Attachment = typeof schema.attachments.$inferSelect;

async function findProperty(agencyId: string, propertyId: string) {
  return db
    .select()
    .from(schema.properties)
    .where(and(
      eq(schema.properties.id, propertyId),
      eq(schema.properties.agencyId, agencyId),
      isNull(schema.properties.deletedAt),
    ))
    .get();
}

function propertyImagePrefix(agencyId: string): string {
  return `agencies/${agencyId}/properties/`;
}

async function propertyWithMedia(property: typeof schema.properties.$inferSelect) {
  const structured = await listActiveAttachments(property.agencyId, "property", property.id);
  const attachments = await attachmentsWithUrls(structured);
  const legacyUrls = await presignImages(property.images, propertyImagePrefix(property.agencyId));
  return {
    ...property,
    attachments,
    attachmentIds: attachments.map((attachment) => attachment.id),
    imageUrls: [...attachments.map((attachment) => attachment.url), ...legacyUrls],
  };
}

async function loadAttachments(agencyId: string, ids: string[]): Promise<Attachment[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.agencyId, agencyId),
      inArray(schema.attachments.id, ids),
    ));
}

function ensureCreateAttachments(
  attachments: Attachment[],
  ids: string[],
  agencyId: string,
  userId: string,
): string | null {
  if (attachments.length !== ids.length) return "One or more attachments were not found";
  const invalid = attachments.find((attachment) =>
    attachment.agencyId !== agencyId ||
    attachment.uploadedBy !== userId ||
    attachment.ownerType !== "property_draft" ||
    attachment.ownerId !== userId ||
    attachment.status !== "pending"
  );
  return invalid ? "One or more attachments cannot be claimed" : null;
}

function ensureUpdateAttachments(
  attachments: Attachment[],
  ids: string[],
  agencyId: string,
  propertyId: string,
  userId: string,
): string | null {
  if (attachments.length !== ids.length) return "One or more attachments were not found";
  const invalid = attachments.find((attachment) => {
    if (attachment.agencyId !== agencyId) return true;
    if (
      attachment.status === "active" &&
      attachment.ownerType === "property" &&
      attachment.ownerId === propertyId
    ) return false;
    if (
      attachment.status === "pending" &&
      attachment.uploadedBy === userId &&
      (
        (attachment.ownerType === "property_draft" && attachment.ownerId === userId) ||
        (attachment.ownerType === "property" && attachment.ownerId === propertyId)
      )
    ) return false;
    return true;
  });
  return invalid ? "One or more attachments cannot be used for this property" : null;
}

export const properties = new Hono()
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, propertyListQuerySchema);
    if (!queryResult.success) return queryResult.response;

    const agencyId = c.get("agencyId") as string;
    const { type, status, q, page = 1, pageSize = 24, all } = queryResult.data;
    const conditions = [
      eq(schema.properties.agencyId, agencyId),
      isNull(schema.properties.deletedAt),
    ];
    if (type) conditions.push(eq(schema.properties.type, type));
    if (status) conditions.push(eq(schema.properties.status, status));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(
        like(schema.properties.title, pattern),
        like(schema.properties.location, pattern),
        like(schema.properties.city, pattern),
      )!);
    }
    const where = and(...conditions);
    const limit = all === "true" ? 500 : Math.min(60, pageSize);
    const offset = all === "true" ? 0 : (page - 1) * limit;

    const [summary] = await db
      .select({ total: count() })
      .from(schema.properties)
      .where(where);
    const rows = await db
      .select()
      .from(schema.properties)
      .where(where)
      .orderBy(desc(schema.properties.createdAt))
      .limit(limit)
      .offset(offset);
    const properties = await Promise.all(rows.map(propertyWithMedia));

    return c.json({
      properties,
      total: summary?.total ?? 0,
      page: all === "true" ? 1 : page,
      pageSize: all === "true" ? properties.length : limit,
    }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createPropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const body = bodyResult.data;
    const attachmentIds = body.attachmentIds ?? [];
    const selectedAttachments = await loadAttachments(agencyId, attachmentIds);
    const attachmentError = ensureCreateAttachments(
      selectedAttachments,
      attachmentIds,
      agencyId,
      user.id,
    );
    if (attachmentError) return c.json({ error: attachmentError }, 400);

    try {
      await Promise.all(selectedAttachments.map(verifyAttachmentObject));
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : "Attachment verification failed",
      }, 400);
    }

    const propertyId = nanoid();
    const now = Date.now();
    const property = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.properties).values({
        id: propertyId,
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
        images: null,
        externalId: body.externalId,
        createdAt: now,
        updatedAt: now,
      }).returning();

      if (attachmentIds.length > 0) {
        const claimed = await tx
          .update(schema.attachments)
          .set({
            ownerType: "property",
            ownerId: propertyId,
            status: "active",
            updatedAt: now,
          })
          .where(and(
            eq(schema.attachments.agencyId, agencyId),
            eq(schema.attachments.uploadedBy, user.id),
            eq(schema.attachments.ownerType, "property_draft"),
            eq(schema.attachments.ownerId, user.id),
            eq(schema.attachments.status, "pending"),
            inArray(schema.attachments.id, attachmentIds),
          ))
          .returning({ id: schema.attachments.id });
        if (claimed.length !== attachmentIds.length) {
          throw new Error("Attachments changed concurrently; try again");
        }
      }

      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "property.created",
        entityType: "property",
        entityId: propertyId,
        metadata: { attachmentCount: attachmentIds.length, status: created.status },
      }));
      return created;
    });

    return c.json({ property: await propertyWithMedia(property) }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const property = await findProperty(agencyId, idResult.data);
    if (!property) return c.json({ error: "Not found" }, 404);
    return c.json({ property: await propertyWithMedia(property) }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updatePropertySchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const propertyId = idResult.data;
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = bodyResult.data;
    const attachmentIds = body.attachmentIds;
    let selectedAttachments: Attachment[] = [];
    if (attachmentIds) {
      selectedAttachments = await loadAttachments(agencyId, attachmentIds);
      const attachmentError = ensureUpdateAttachments(
        selectedAttachments,
        attachmentIds,
        agencyId,
        propertyId,
        user.id,
      );
      if (attachmentError) return c.json({ error: attachmentError }, 400);
      try {
        await Promise.all(
          selectedAttachments
            .filter((attachment) => attachment.status === "pending")
            .map(verifyAttachmentObject),
        );
      } catch (error) {
        return c.json({
          error: error instanceof Error ? error.message : "Attachment verification failed",
        }, 400);
      }
    }

    const now = Date.now();
    const property = await db.transaction(async (tx) => {
      if (attachmentIds) {
        const current = await tx
          .select()
          .from(schema.attachments)
          .where(and(
            eq(schema.attachments.agencyId, agencyId),
            eq(schema.attachments.ownerType, "property"),
            eq(schema.attachments.ownerId, propertyId),
            eq(schema.attachments.status, "active"),
          ));
        const selected = new Set(attachmentIds);
        const removedIds = current
          .filter((attachment) => !selected.has(attachment.id))
          .map((attachment) => attachment.id);
        if (removedIds.length > 0) {
          await tx
            .update(schema.attachments)
            .set({ status: "delete_pending", deletedAt: now, updatedAt: now })
            .where(and(
              eq(schema.attachments.agencyId, agencyId),
              inArray(schema.attachments.id, removedIds),
            ));
        }

        const pendingIds = selectedAttachments
          .filter((attachment) => attachment.status === "pending")
          .map((attachment) => attachment.id);
        if (pendingIds.length > 0) {
          const claimed = await tx
            .update(schema.attachments)
            .set({
              ownerType: "property",
              ownerId: propertyId,
              status: "active",
              updatedAt: now,
            })
            .where(and(
              eq(schema.attachments.agencyId, agencyId),
              eq(schema.attachments.uploadedBy, user.id),
              eq(schema.attachments.status, "pending"),
              inArray(schema.attachments.id, pendingIds),
            ))
            .returning({ id: schema.attachments.id });
          if (claimed.length !== pendingIds.length) {
            throw new Error("Attachments changed concurrently; try again");
          }
        }
      }

      const [updated] = await tx
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
          externalId: body.externalId,
          updatedAt: now,
        })
        .where(and(
          eq(schema.properties.id, propertyId),
          eq(schema.properties.agencyId, agencyId),
          isNull(schema.properties.deletedAt),
        ))
        .returning();
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "property.updated",
        entityType: "property",
        entityId: propertyId,
        metadata: {
          changedFields: Object.keys(body).filter((field) => field !== "attachmentIds"),
          attachmentCount: attachmentIds?.length,
        },
      }));
      return updated;
    });

    return c.json({ property: await propertyWithMedia(property) }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const propertyId = idResult.data;
    const existing = await findProperty(agencyId, propertyId);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.properties)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.properties.id, propertyId),
          eq(schema.properties.agencyId, agencyId),
          isNull(schema.properties.deletedAt),
        ));
      await tx
        .update(schema.attachments)
        .set({ status: "delete_pending", deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.attachments.agencyId, agencyId),
          eq(schema.attachments.ownerType, "property"),
          eq(schema.attachments.ownerId, propertyId),
          eq(schema.attachments.status, "active"),
        ));
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "property.deleted",
        entityType: "property",
        entityId: propertyId,
      }));
    });
    return c.json({ ok: true }, 200);
  });
