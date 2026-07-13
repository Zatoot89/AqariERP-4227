import { Hono } from "hono";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { contacts, inventoryProperties, units } from "../database/core-domain-schema";
import { attachments, auditLogs } from "../database/schema";
import {
  leases,
  offers,
  reservations,
  sales,
  transactionDocuments as documentTable,
  transactionParties,
  transactionTemplates,
} from "../database/transaction-schema";
import { auditRecord } from "../lib/audit";
import { nextDocumentNumber } from "../lib/document-number";
import { nanoid } from "../lib/id";
import { s3 } from "../lib/s3";
import {
  canonicalSnapshot,
  checksumSha256,
  defaultTemplateHtml,
  renderTransactionHtml,
} from "../lib/transaction-documents";
import { parseJson, parseParam } from "../lib/validation";
import { requireRole, requireTenant } from "../middleware/auth";
import {
  createTemplateSchema,
  generateDocumentSchema,
} from "../validation/transactions";
import { entityIdSchema } from "../validation/schemas";

async function transactionRecord(
  agencyId: string,
  type: "offer" | "reservation" | "lease" | "sale",
  id: string,
) {
  if (type === "offer") {
    return db.select().from(offers).where(and(eq(offers.id, id), eq(offers.agencyId, agencyId))).get();
  }
  if (type === "reservation") {
    return db.select().from(reservations).where(and(
      eq(reservations.id, id),
      eq(reservations.agencyId, agencyId),
    )).get();
  }
  if (type === "lease") {
    return db.select().from(leases).where(and(eq(leases.id, id), eq(leases.agencyId, agencyId))).get();
  }
  return db.select().from(sales).where(and(eq(sales.id, id), eq(sales.agencyId, agencyId))).get();
}

async function buildSnapshot(
  agencyId: string,
  type: "offer" | "reservation" | "lease" | "sale",
  id: string,
  documentNumber: string,
) {
  const transaction = await transactionRecord(agencyId, type, id);
  if (!transaction) return undefined;
  const parties = await db.select().from(transactionParties).where(and(
    eq(transactionParties.agencyId, agencyId),
    eq(transactionParties.transactionType, type),
    eq(transactionParties.transactionId, id),
  ));
  const contactsById = new Map<string, string>();
  for (const party of parties) {
    const contact = await db.select({ name: contacts.displayName }).from(contacts).where(and(
      eq(contacts.id, party.contactId),
      eq(contacts.agencyId, agencyId),
      isNull(contacts.deletedAt),
    )).get();
    contactsById.set(party.contactId, contact?.name ?? party.contactId);
  }
  const propertyId = "propertyId" in transaction ? transaction.propertyId : null;
  const unitId = "unitId" in transaction ? transaction.unitId : null;
  let assetTitle = "";
  if (unitId) {
    const unit = await db.select().from(units).where(and(
      eq(units.id, unitId),
      eq(units.agencyId, agencyId),
    )).get();
    if (unit) {
      const property = await db.select({ title: inventoryProperties.title })
        .from(inventoryProperties).where(and(
          eq(inventoryProperties.id, unit.propertyId),
          eq(inventoryProperties.agencyId, agencyId),
        )).get();
      assetTitle = `${property?.title ?? "Property"} / ${unit.unitNumber}`;
    }
  } else if (propertyId) {
    const property = await db.select({ title: inventoryProperties.title })
      .from(inventoryProperties).where(and(
        eq(inventoryProperties.id, propertyId),
        eq(inventoryProperties.agencyId, agencyId),
      )).get();
    assetTitle = property?.title ?? propertyId;
  }
  const transactionNumber =
    "offerNumber" in transaction ? transaction.offerNumber
      : "reservationNumber" in transaction ? transaction.reservationNumber
        : "leaseNumber" in transaction ? transaction.leaseNumber
          : transaction.saleNumber;
  const amount =
    "offeredAmount" in transaction ? transaction.offeredAmount
      : "depositAmount" in transaction && type === "reservation" ? transaction.depositAmount
        : "rentAmount" in transaction ? transaction.rentAmount
          : transaction.agreedValue;
  const primary = parties[0] ? contactsById.get(parties[0].contactId) ?? "" : "";
  const secondary = parties[1] ? contactsById.get(parties[1].contactId) ?? "" : "";
  return {
    document: {
      number: documentNumber,
      generatedAt: new Date().toISOString(),
    },
    transaction: {
      id,
      type,
      number: transactionNumber,
      status: transaction.status,
      amount: amount ?? "",
      currency: transaction.currency,
      terms: "terms" in transaction ? transaction.terms ?? "" : "",
      record: transaction,
    },
    asset: {
      propertyId,
      unitId,
      title: assetTitle,
    },
    parties: {
      primary,
      secondary,
      records: parties.map((party) => ({
        role: party.partyRole,
        contactId: party.contactId,
        name: contactsById.get(party.contactId) ?? party.contactId,
        isSignatory: party.isSignatory === 1,
      })),
    },
  } satisfies Record<string, unknown>;
}

async function renderPdf(
  agencyId: string,
  documentId: string,
  documentNumber: string,
  html: string,
  userId: string,
): Promise<{ attachmentId: string } | undefined> {
  const rendererUrl = process.env.DOCUMENT_RENDERER_URL;
  const bucket = process.env.S3_BUCKET;
  if (!rendererUrl || !bucket) return undefined;
  const response = await fetch(rendererUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.DOCUMENT_RENDERER_TOKEN
        ? { Authorization: `Bearer ${process.env.DOCUMENT_RENDERER_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ html, format: "A4", printBackground: true }),
  });
  if (!response.ok) throw new Error(`PDF renderer returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("PDF renderer returned invalid content");
  }
  const now = Date.now();
  const attachmentId = nanoid();
  const objectKey = `agencies/${agencyId}/transaction-documents/${documentId}/${documentNumber}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: bytes,
    ContentType: "application/pdf",
    ContentLength: bytes.length,
  }));
  await db.insert(attachments).values({
    id: attachmentId,
    agencyId,
    ownerType: "transaction_document",
    ownerId: documentId,
    purpose: "contract-pdf",
    objectKey,
    originalFilename: `${documentNumber}.pdf`,
    mediaType: "application/pdf",
    sizeBytes: bytes.length,
    uploadedBy: userId,
    status: "verified",
    createdAt: now,
    updatedAt: now,
  });
  return { attachmentId };
}

export const transactionDocuments = new Hono()
  .get("/templates", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(transactionTemplates).where(
      eq(transactionTemplates.agencyId, agencyId),
    ).orderBy(desc(transactionTemplates.version));
    return c.json({ templates: rows }, 200);
  })
  .post("/templates", requireTenant, requireRole("admin", "manager"), async (c) => {
    const parsed = await parseJson(c, createTemplateSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const latest = await db.select().from(transactionTemplates).where(and(
      eq(transactionTemplates.agencyId, agencyId),
      eq(transactionTemplates.templateType, parsed.data.templateType),
      eq(transactionTemplates.language, parsed.data.language),
    )).orderBy(desc(transactionTemplates.version)).get();
    const [template] = await db.insert(transactionTemplates).values({
      id: nanoid(),
      agencyId,
      templateType: parsed.data.templateType,
      name: parsed.data.name,
      language: parsed.data.language,
      version: (latest?.version ?? 0) + 1,
      schemaVersion: parsed.data.schemaVersion,
      bodyHtml: parsed.data.bodyHtml,
      active: 1,
      createdBy: user.id,
      createdAt: Date.now(),
    }).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "transaction_template.created",
      entityType: "transaction_template",
      entityId: template.id,
      metadata: {
        templateType: template.templateType,
        language: template.language,
        version: template.version,
      },
    }));
    return c.json({ template }, 201);
  })
  .get("/", requireTenant, async (c) => {
    const agencyId = c.get("agencyId") as string;
    const type = c.req.query("transactionType");
    const id = c.req.query("transactionId");
    const rows = await db.select().from(documentTable).where(and(
      eq(documentTable.agencyId, agencyId),
      type ? eq(documentTable.transactionType, type) : undefined,
      id ? eq(documentTable.transactionId, id) : undefined,
    )).orderBy(desc(documentTable.createdAt));
    return c.json({ documents: rows }, 200);
  })
  .post("/generate", requireTenant, async (c) => {
    const parsed = await parseJson(c, generateDocumentSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = parsed.data;
    let template = body.templateId
      ? await db.select().from(transactionTemplates).where(and(
          eq(transactionTemplates.id, body.templateId),
          eq(transactionTemplates.agencyId, agencyId),
          eq(transactionTemplates.templateType, body.transactionType),
          eq(transactionTemplates.language, body.language),
        )).get()
      : await db.select().from(transactionTemplates).where(and(
          eq(transactionTemplates.agencyId, agencyId),
          eq(transactionTemplates.templateType, body.transactionType),
          eq(transactionTemplates.language, body.language),
          eq(transactionTemplates.active, 1),
        )).orderBy(desc(transactionTemplates.version)).get();
    if (!template) {
      [template] = await db.insert(transactionTemplates).values({
        id: nanoid(),
        agencyId,
        templateType: body.transactionType,
        name: `Default ${body.transactionType} ${body.language}`,
        language: body.language,
        version: 1,
        schemaVersion: 1,
        bodyHtml: defaultTemplateHtml(body.transactionType, body.language),
        active: 1,
        createdBy: user.id,
        createdAt: Date.now(),
      }).returning();
    }
    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, agencyId, "transaction_document");
      const snapshot = await buildSnapshot(
        agencyId,
        body.transactionType,
        body.transactionId,
        documentNumber,
      );
      if (!snapshot) throw new Error("Transaction not found");
      const snapshotJson = canonicalSnapshot(snapshot);
      const html = renderTransactionHtml(template.bodyHtml, snapshot);
      const checksum = checksumSha256(`${snapshotJson}\n${html}`);
      const id = nanoid();
      const [document] = await tx.insert(documentTable).values({
        id,
        agencyId,
        transactionType: body.transactionType,
        transactionId: body.transactionId,
        documentNumber,
        templateId: template.id,
        templateVersion: template.version,
        language: body.language,
        schemaVersion: template.schemaVersion,
        snapshot: snapshotJson,
        renderedHtml: html,
        checksumSha256: checksum,
        status: "html_ready",
        createdBy: user.id,
        createdAt: Date.now(),
      }).returning();
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "transaction_document.generated",
        entityType: "transaction_document",
        entityId: id,
        metadata: {
          documentNumber,
          transactionType: body.transactionType,
          transactionId: body.transactionId,
          templateVersion: template.version,
          checksum,
        },
      }));
      return document;
    });

    let pdfError: string | undefined;
    try {
      const pdf = await renderPdf(
        agencyId,
        created.id,
        created.documentNumber,
        created.renderedHtml,
        user.id,
      );
      if (pdf) {
        const [updated] = await db.update(documentTable).set({
          pdfAttachmentId: pdf.attachmentId,
          status: "pdf_ready",
        }).where(and(
          eq(documentTable.id, created.id),
          eq(documentTable.agencyId, agencyId),
        )).returning();
        return c.json({ document: updated }, 201);
      }
    } catch (error) {
      pdfError = error instanceof Error ? error.message : "PDF rendering failed";
    }
    return c.json({ document: created, ...(pdfError ? { pdfError } : {}) }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const document = await db.select().from(documentTable).where(and(
      eq(documentTable.id, id.data),
      eq(documentTable.agencyId, agencyId),
    )).get();
    if (!document) return c.json({ error: "Not found" }, 404);
    return c.json({ document }, 200);
  })
  .get("/:id/html", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const document = await db.select().from(documentTable).where(and(
      eq(documentTable.id, id.data),
      eq(documentTable.agencyId, agencyId),
    )).get();
    if (!document) return c.json({ error: "Not found" }, 404);
    return c.html(document.renderedHtml, 200, {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:",
      "X-Content-Type-Options": "nosniff",
    });
  });
