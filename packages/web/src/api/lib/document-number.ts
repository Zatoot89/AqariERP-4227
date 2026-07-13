import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { documentSequences } from "../database/transaction-schema";
import { nanoid } from "./id";

export type DocumentType =
  | "viewing"
  | "offer"
  | "reservation"
  | "lease"
  | "sale"
  | "transaction_document";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEFAULT_PREFIX: Record<DocumentType, string> = {
  viewing: "VWG",
  offer: "OFR",
  reservation: "RSV",
  lease: "LSE",
  sale: "SAL",
  transaction_document: "DOC",
};

export async function nextDocumentNumber(
  tx: Transaction,
  agencyId: string,
  documentType: DocumentType,
  now = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const sequenceKey = `${documentType}:${year}`;
  let sequence = await tx.select().from(documentSequences).where(and(
    eq(documentSequences.agencyId, agencyId),
    eq(documentSequences.sequenceKey, sequenceKey),
  )).get();

  if (!sequence) {
    await tx.insert(documentSequences).values({
      id: nanoid(),
      agencyId,
      sequenceKey,
      documentType,
      year,
      prefix: DEFAULT_PREFIX[documentType],
      padding: 6,
      nextNumber: 1,
      updatedAt: now.getTime(),
    }).onConflictDoNothing();
    sequence = await tx.select().from(documentSequences).where(and(
      eq(documentSequences.agencyId, agencyId),
      eq(documentSequences.sequenceKey, sequenceKey),
    )).get();
  }

  if (!sequence) throw new Error("Could not initialize document sequence");
  const current = sequence.nextNumber;
  const updated = await tx.update(documentSequences).set({
    nextNumber: current + 1,
    updatedAt: now.getTime(),
  }).where(and(
    eq(documentSequences.id, sequence.id),
    eq(documentSequences.agencyId, agencyId),
    eq(documentSequences.nextNumber, current),
  )).returning({ id: documentSequences.id });
  if (updated.length !== 1) {
    throw new Error("Document sequence changed concurrently; retry the transaction");
  }

  return `${sequence.prefix}-${year}-${String(current).padStart(sequence.padding, "0")}`;
}
