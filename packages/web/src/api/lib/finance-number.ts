import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { financeSequences } from "../database/finance-schema";
import { nanoid } from "./id";

export type FinanceDocumentType =
  | "schedule"
  | "invoice"
  | "receipt"
  | "expense"
  | "commission";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PREFIX: Record<FinanceDocumentType, string> = {
  schedule: "SCH",
  invoice: "INV",
  receipt: "RCT",
  expense: "EXP",
  commission: "COM",
};

export async function nextFinanceNumber(
  tx: Transaction,
  agencyId: string,
  documentType: FinanceDocumentType,
  now = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const sequenceKey = `${documentType}:${year}`;
  let sequence = await tx.select().from(financeSequences).where(and(
    eq(financeSequences.agencyId, agencyId),
    eq(financeSequences.sequenceKey, sequenceKey),
  )).get();

  if (!sequence) {
    await tx.insert(financeSequences).values({
      id: nanoid(),
      agencyId,
      sequenceKey,
      documentType,
      year,
      prefix: PREFIX[documentType],
      padding: 6,
      nextNumber: 1,
      updatedAt: now.getTime(),
    }).onConflictDoNothing();
    sequence = await tx.select().from(financeSequences).where(and(
      eq(financeSequences.agencyId, agencyId),
      eq(financeSequences.sequenceKey, sequenceKey),
    )).get();
  }
  if (!sequence) throw new Error("Could not initialize finance sequence");

  const current = sequence.nextNumber;
  const updated = await tx.update(financeSequences).set({
    nextNumber: current + 1,
    updatedAt: now.getTime(),
  }).where(and(
    eq(financeSequences.id, sequence.id),
    eq(financeSequences.agencyId, agencyId),
    eq(financeSequences.nextNumber, current),
  )).returning({ id: financeSequences.id });
  if (updated.length !== 1) {
    throw new Error("Finance sequence changed concurrently; retry the transaction");
  }
  return `${sequence.prefix}-${year}-${String(current).padStart(sequence.padding, "0")}`;
}
