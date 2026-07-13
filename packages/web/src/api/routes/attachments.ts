import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { presignGet, s3 } from "../lib/s3";
import { sanitizeUploadFilename } from "../lib/security";
import { parseJson, parseParam } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import { entityIdSchema, uploadRequestSchema } from "../validation/schemas";

function checksumHexToBase64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

export const attachments = new Hono()
  .post("/presign", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, uploadRequestSchema);
    if (!bodyResult.success) return bodyResult.response;
    if (!process.env.S3_BUCKET) return c.json({ error: "Storage is not configured" }, 503);

    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const { filename, contentType, sizeBytes, checksumSha256, propertyId, purpose } = bodyResult.data;

    let ownerType: "property_draft" | "property" | "agency_logo";
    let ownerId: string;
    if (purpose === "agency-logo") {
      const profile = c.get("profile")!;
      if (!profile || !["admin", "manager"].includes(profile.role)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      ownerType = "agency_logo";
      ownerId = agencyId;
    } else if (propertyId) {
      const property = await db
        .select({ id: schema.properties.id })
        .from(schema.properties)
        .where(and(
          eq(schema.properties.id, propertyId),
          eq(schema.properties.agencyId, agencyId),
          isNull(schema.properties.deletedAt),
        ))
        .get();
      if (!property) return c.json({ error: "Property not found" }, 404);
      ownerType = "property";
      ownerId = propertyId;
    } else {
      ownerType = "property_draft";
      ownerId = user.id;
    }

    const attachmentId = nanoid();
    const safeFilename = sanitizeUploadFilename(filename);
    const key = `agencies/${agencyId}/attachments/${attachmentId}/${safeFilename}`;
    const now = Date.now();

    await db.transaction(async (tx) => {
      await tx.insert(schema.attachments).values({
        id: attachmentId,
        agencyId,
        ownerType,
        ownerId,
        objectKey: key,
        originalName: filename,
        mimeType: contentType,
        sizeBytes,
        checksumSha256,
        uploadedBy: user.id,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "attachment.presigned",
        entityType: "attachment",
        entityId: attachmentId,
        metadata: { ownerType, ownerId, mimeType: contentType, sizeBytes },
      }));
    });

    try {
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          ContentType: contentType,
          ContentLength: sizeBytes,
          ...(checksumSha256
            ? { ChecksumSHA256: checksumHexToBase64(checksumSha256) }
            : {}),
          Metadata: {
            attachmentId,
            agencyId,
          },
        }),
        { expiresIn: 600 },
      );
      return c.json({
        attachmentId,
        url,
        key,
        maxSizeBytes: 10 * 1024 * 1024,
        requiredHeaders: {
          "Content-Type": contentType,
          ...(checksumSha256
            ? { "x-amz-checksum-sha256": checksumHexToBase64(checksumSha256) }
            : {}),
        },
      }, 201);
    } catch (error) {
      await db
        .update(schema.attachments)
        .set({ status: "failed", updatedAt: Date.now() })
        .where(and(
          eq(schema.attachments.id, attachmentId),
          eq(schema.attachments.agencyId, agencyId),
        ));
      return c.json({
        error: error instanceof Error ? error.message : "Could not create upload URL",
      }, 503);
    }
  })
  .get("/:id/url", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const agencyId = c.get("agencyId") as string;
    const attachment = await db
      .select()
      .from(schema.attachments)
      .where(and(
        eq(schema.attachments.id, idResult.data),
        eq(schema.attachments.agencyId, agencyId),
        eq(schema.attachments.status, "active"),
      ))
      .get();
    if (!attachment) return c.json({ error: "Not found" }, 404);

    return c.json({
      attachment: {
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        url: await presignGet(attachment.objectKey),
      },
    }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;

    const user = c.get("user")!;
    const profile = c.get("profile")!;
    const agencyId = c.get("agencyId") as string;
    const attachment = await db
      .select()
      .from(schema.attachments)
      .where(and(
        eq(schema.attachments.id, idResult.data),
        eq(schema.attachments.agencyId, agencyId),
      ))
      .get();
    if (!attachment || ["delete_pending", "purged"].includes(attachment.status)) {
      return c.json({ error: "Not found" }, 404);
    }
    if (attachment.ownerType === "agency_logo" && !["admin", "manager"].includes(profile.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (attachment.status === "pending" && attachment.uploadedBy !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.attachments)
        .set({ status: "delete_pending", deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.attachments.id, attachment.id),
          eq(schema.attachments.agencyId, agencyId),
        ));
      if (attachment.ownerType === "agency_logo") {
        await tx
          .update(schema.agencies)
          .set({ logoUrl: null, updatedAt: now })
          .where(and(
            eq(schema.agencies.id, agencyId),
            eq(schema.agencies.logoUrl, attachment.objectKey),
          ));
      }
      await tx.insert(schema.auditLogs).values(auditRecord(c, {
        agencyId,
        action: "attachment.delete_requested",
        entityType: "attachment",
        entityId: attachment.id,
        metadata: { ownerType: attachment.ownerType, ownerId: attachment.ownerId },
      }));
    });

    return c.json({ ok: true }, 202);
  });
