import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../api/database";
import * as schema from "../api/database/schema";
import { nanoid } from "../api/lib/id";
import { deleteObject } from "../api/lib/s3";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const CLEANUP_INTERVAL_MS = positiveInteger(
  process.env.ATTACHMENT_CLEANUP_INTERVAL_MS,
  15 * 60 * 1000,
);
const INITIAL_DELAY_MS = positiveInteger(
  process.env.ATTACHMENT_CLEANUP_INITIAL_DELAY_MS,
  30_000,
);
const PENDING_TTL_MS = positiveInteger(
  process.env.ATTACHMENT_PENDING_TTL_MS,
  60 * 60 * 1000,
);
const BATCH_SIZE = Math.min(
  500,
  positiveInteger(process.env.ATTACHMENT_CLEANUP_BATCH_SIZE, 100),
);

type ObjectRemover = (key: string) => Promise<void>;

export async function cleanupAttachments(
  now = Date.now(),
  removeObject: ObjectRemover = deleteObject,
): Promise<{
  scanned: number;
  purged: number;
  failed: number;
}> {
  const orphanCutoff = now - PENDING_TTL_MS;
  const candidates = await db
    .select()
    .from(schema.attachments)
    .where(or(
      eq(schema.attachments.status, "delete_pending"),
      and(
        inArray(schema.attachments.status, ["pending", "failed"]),
        lt(schema.attachments.createdAt, orphanCutoff),
      ),
    ))
    .limit(BATCH_SIZE);

  let purged = 0;
  let failed = 0;
  for (const attachment of candidates) {
    try {
      await removeObject(attachment.objectKey);
      await db.transaction(async (tx) => {
        await tx
          .update(schema.attachments)
          .set({
            status: "purged",
            deletedAt: attachment.deletedAt ?? now,
            updatedAt: now,
          })
          .where(and(
            eq(schema.attachments.id, attachment.id),
            eq(schema.attachments.agencyId, attachment.agencyId),
          ));
        await tx.insert(schema.auditLogs).values({
          id: nanoid(),
          agencyId: attachment.agencyId,
          actorId: null,
          action: "attachment.purged",
          entityType: "attachment",
          entityId: attachment.id,
          metadata: JSON.stringify({
            ownerType: attachment.ownerType,
            ownerId: attachment.ownerId,
            orphaned: attachment.status !== "delete_pending",
          }),
          createdAt: now,
        });
      });
      purged += 1;
    } catch (error) {
      failed += 1;
      console.error(`[attachment-cleanup] failed for ${attachment.id}:`, error);
    }
  }

  return { scanned: candidates.length, purged, failed };
}

export function startAttachmentCleanupLoop(): void {
  if (process.env.ATTACHMENT_CLEANUP_ENABLED === "false") {
    console.info("[attachment-cleanup] disabled by configuration");
    return;
  }

  setTimeout(() => void cleanupAttachments(), INITIAL_DELAY_MS);
  setInterval(() => void cleanupAttachments(), CLEANUP_INTERVAL_MS);
}
