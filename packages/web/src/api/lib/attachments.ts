import { and, asc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { headObject, presignGet } from "./s3";

export type Attachment = typeof schema.attachments.$inferSelect;

export async function listActiveAttachments(
  agencyId: string,
  ownerType: "property" | "agency_logo",
  ownerId: string,
): Promise<Attachment[]> {
  return db
    .select()
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.agencyId, agencyId),
      eq(schema.attachments.ownerType, ownerType),
      eq(schema.attachments.ownerId, ownerId),
      eq(schema.attachments.status, "active"),
    ))
    .orderBy(asc(schema.attachments.createdAt));
}

export async function attachmentsWithUrls(attachments: Attachment[]) {
  return Promise.all(attachments.map(async (attachment) => ({
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    createdAt: attachment.createdAt,
    url: await presignGet(attachment.objectKey),
  })));
}

function checksumHexToBase64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

export async function verifyAttachmentObject(attachment: Attachment): Promise<void> {
  if (process.env.ATTACHMENT_VERIFY_OBJECTS === "false") return;

  const object = await headObject(attachment.objectKey);
  if (object.ContentLength !== attachment.sizeBytes) {
    throw new Error(`Attachment ${attachment.id} size does not match uploaded object`);
  }
  const actualType = object.ContentType?.split(";")[0]?.trim().toLowerCase();
  if (actualType !== attachment.mimeType) {
    throw new Error(`Attachment ${attachment.id} content type does not match uploaded object`);
  }
  if (
    attachment.checksumSha256 &&
    object.ChecksumSHA256 &&
    object.ChecksumSHA256 !== checksumHexToBase64(attachment.checksumSha256)
  ) {
    throw new Error(`Attachment ${attachment.id} checksum does not match uploaded object`);
  }
}
