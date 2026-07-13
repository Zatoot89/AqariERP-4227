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
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../database";
import {
  contactAddresses,
  contactMethods,
  contactRoles,
  contacts as contactTable,
} from "../database/core-domain-schema";
import { auditLogs } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  contactListQuerySchema,
  contactMethodSchema,
  contactRoleSchema,
  createContactSchema,
  duplicateContactQuerySchema,
  updateContactSchema,
} from "../validation/core-domain";
import { entityIdSchema } from "../validation/schemas";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeMethod(type: "phone" | "email" | "whatsapp", value: string): string {
  if (type === "email") return value.trim().toLowerCase();
  return value.replace(/[^0-9]/g, "");
}

async function findContact(agencyId: string, contactId: string) {
  return db.select().from(contactTable).where(and(
    eq(contactTable.id, contactId),
    eq(contactTable.agencyId, agencyId),
    isNull(contactTable.deletedAt),
  )).get();
}

async function contactDetails(agencyId: string, contactId: string) {
  const contact = await findContact(agencyId, contactId);
  if (!contact) return undefined;
  const [roles, methods, addresses] = await Promise.all([
    db.select().from(contactRoles).where(and(
      eq(contactRoles.agencyId, agencyId),
      eq(contactRoles.contactId, contactId),
      isNull(contactRoles.effectiveTo),
    )),
    db.select().from(contactMethods).where(and(
      eq(contactMethods.agencyId, agencyId),
      eq(contactMethods.contactId, contactId),
      isNull(contactMethods.deletedAt),
    )),
    db.select().from(contactAddresses).where(and(
      eq(contactAddresses.agencyId, agencyId),
      eq(contactAddresses.contactId, contactId),
      isNull(contactAddresses.deletedAt),
    )),
  ]);
  return { ...contact, roles, methods, addresses };
}

const addRoleSchema = z.object({
  role: contactRoleSchema,
  isPrimary: z.boolean().optional(),
  effectiveFrom: z.number().int().nonnegative().optional(),
}).strict();

export const contacts = new Hono()
  .get("/duplicates", requireTenant, async (c) => {
    const queryResult = parseQuery(c, duplicateContactQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { name, phone, email } = queryResult.data;
    const candidateIds = new Set<string>();

    if (phone) {
      const normalized = normalizeMethod("phone", phone);
      const rows = await db.select({ contactId: contactMethods.contactId })
        .from(contactMethods).where(and(
          eq(contactMethods.agencyId, agencyId),
          inArray(contactMethods.methodType, ["phone", "whatsapp"]),
          eq(contactMethods.normalizedValue, normalized),
          isNull(contactMethods.deletedAt),
        ));
      rows.forEach((row) => candidateIds.add(row.contactId));
    }
    if (email) {
      const rows = await db.select({ contactId: contactMethods.contactId })
        .from(contactMethods).where(and(
          eq(contactMethods.agencyId, agencyId),
          eq(contactMethods.methodType, "email"),
          eq(contactMethods.normalizedValue, normalizeMethod("email", email)),
          isNull(contactMethods.deletedAt),
        ));
      rows.forEach((row) => candidateIds.add(row.contactId));
    }
    if (name) {
      const rows = await db.select({ id: contactTable.id }).from(contactTable).where(and(
        eq(contactTable.agencyId, agencyId),
        eq(contactTable.normalizedName, normalizeName(name)),
        isNull(contactTable.deletedAt),
      ));
      rows.forEach((row) => candidateIds.add(row.id));
    }

    if (candidateIds.size === 0) return c.json({ contacts: [] }, 200);
    const rows = await db.select().from(contactTable).where(and(
      eq(contactTable.agencyId, agencyId),
      inArray(contactTable.id, [...candidateIds]),
      isNull(contactTable.deletedAt),
    ));
    return c.json({ contacts: rows }, 200);
  })
  .get("/", requireTenant, async (c) => {
    const queryResult = parseQuery(c, contactListQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { q, role, contactType, page, pageSize } = queryResult.data;
    const conditions: SQL[] = [
      eq(contactTable.agencyId, agencyId),
      isNull(contactTable.deletedAt),
    ];

    if (contactType) conditions.push(eq(contactTable.contactType, contactType));
    if (q) {
      const pattern = `%${normalizeName(q)}%`;
      conditions.push(or(
        like(contactTable.normalizedName, pattern),
        like(contactTable.displayNameAr, `%${q}%`),
      )!);
    }
    if (role) {
      const roleRows = await db.select({ contactId: contactRoles.contactId })
        .from(contactRoles).where(and(
          eq(contactRoles.agencyId, agencyId),
          eq(contactRoles.role, role),
          isNull(contactRoles.effectiveTo),
        ));
      if (roleRows.length === 0) {
        return c.json({ contacts: [], total: 0, page, pageSize }, 200);
      }
      conditions.push(inArray(contactTable.id, roleRows.map((row) => row.contactId)));
    }

    const where = and(...conditions);
    const [summary] = await db.select({ total: count() }).from(contactTable).where(where);
    const rows = await db.select().from(contactTable).where(where)
      .orderBy(desc(contactTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ contacts: rows, total: summary?.total ?? 0, page, pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createContactSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = bodyResult.data;
    const contactId = nanoid();
    const now = Date.now();

    const contact = await db.transaction(async (tx) => {
      const [created] = await tx.insert(contactTable).values({
        id: contactId,
        agencyId,
        contactType: body.contactType,
        displayName: body.displayName,
        displayNameAr: body.displayNameAr,
        legalName: body.legalName,
        preferredLanguage: body.preferredLanguage ?? "en",
        normalizedName: normalizeName(body.displayName),
        notes: body.notes,
        doNotContact: body.doNotContact ? 1 : 0,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();

      for (const [index, role] of (body.roles ?? []).entries()) {
        await tx.insert(contactRoles).values({
          id: nanoid(),
          agencyId,
          contactId,
          role,
          isPrimary: index === 0 ? 1 : 0,
          effectiveFrom: now,
          createdAt: now,
        });
      }
      for (const [index, method] of (body.methods ?? []).entries()) {
        await tx.insert(contactMethods).values({
          id: nanoid(),
          agencyId,
          contactId,
          methodType: method.methodType,
          value: method.value,
          normalizedValue: normalizeMethod(method.methodType, method.value),
          label: method.label,
          isPrimary: method.isPrimary || index === 0 ? 1 : 0,
          consentStatus: method.consentStatus ?? "unknown",
          createdAt: now,
          updatedAt: now,
        });
      }
      for (const [index, address] of (body.addresses ?? []).entries()) {
        await tx.insert(contactAddresses).values({
          id: nanoid(),
          agencyId,
          contactId,
          addressType: address.addressType ?? "primary",
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
          isPrimary: address.isPrimary || index === 0 ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "contact.created",
        entityType: "contact",
        entityId: contactId,
        metadata: {
          contactType: created.contactType,
          roles: body.roles ?? [],
          methodCount: body.methods?.length ?? 0,
        },
      }));
      return created;
    });
    return c.json({ contact: await contactDetails(agencyId, contact.id) }, 201);
  })
  .get("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const contact = await contactDetails(agencyId, idResult.data);
    if (!contact) return c.json({ error: "Not found" }, 404);
    return c.json({ contact }, 200);
  })
  .patch("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateContactSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findContact(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = bodyResult.data as Partial<{
      contactType: "person" | "company";
      displayName: string;
      displayNameAr: string | null;
      legalName: string | null;
      preferredLanguage: "en" | "ar";
      notes: string | null;
      doNotContact: boolean;
    }>;
    const now = Date.now();
    const [contact] = await db.update(contactTable).set({
      contactType: body.contactType,
      displayName: body.displayName,
      displayNameAr: body.displayNameAr,
      legalName: body.legalName,
      preferredLanguage: body.preferredLanguage,
      normalizedName: body.displayName ? normalizeName(body.displayName) : undefined,
      notes: body.notes,
      doNotContact: body.doNotContact === undefined ? undefined : body.doNotContact ? 1 : 0,
      updatedAt: now,
    }).where(and(
      eq(contactTable.id, existing.id),
      eq(contactTable.agencyId, agencyId),
      isNull(contactTable.deletedAt),
    )).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "contact.updated",
      entityType: "contact",
      entityId: existing.id,
      metadata: { changedFields: Object.keys(body) },
    }));
    return c.json({ contact }, 200);
  })
  .delete("/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findContact(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(contactTable).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(contactTable.id, existing.id),
        eq(contactTable.agencyId, agencyId),
      ));
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "contact.deleted",
        entityType: "contact",
        entityId: existing.id,
      }));
    });
    return c.json({ ok: true }, 200);
  })
  .post("/:id/roles", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, addRoleSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const contact = await findContact(agencyId, idResult.data);
    if (!contact) return c.json({ error: "Not found" }, 404);
    const now = Date.now();
    const [role] = await db.insert(contactRoles).values({
      id: nanoid(),
      agencyId,
      contactId: contact.id,
      role: bodyResult.data.role,
      isPrimary: bodyResult.data.isPrimary ? 1 : 0,
      effectiveFrom: bodyResult.data.effectiveFrom ?? now,
      createdAt: now,
    }).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "contact.role_added",
      entityType: "contact",
      entityId: contact.id,
      metadata: { role: role.role, roleId: role.id },
    }));
    return c.json({ role }, 201);
  })
  .delete("/:id/roles/:roleId", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const roleIdResult = parseParam(c, entityIdSchema, "roleId");
    if (!roleIdResult.success) return roleIdResult.response;
    const agencyId = c.get("agencyId") as string;
    const now = Date.now();
    const [role] = await db.update(contactRoles).set({ effectiveTo: now }).where(and(
      eq(contactRoles.id, roleIdResult.data),
      eq(contactRoles.contactId, idResult.data),
      eq(contactRoles.agencyId, agencyId),
      isNull(contactRoles.effectiveTo),
    )).returning();
    if (!role) return c.json({ error: "Not found" }, 404);
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "contact.role_ended",
      entityType: "contact",
      entityId: idResult.data,
      metadata: { role: role.role, roleId: role.id },
    }));
    return c.json({ ok: true }, 200);
  })
  .post("/:id/methods", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, contactMethodSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const contact = await findContact(agencyId, idResult.data);
    if (!contact) return c.json({ error: "Not found" }, 404);
    const method = bodyResult.data;
    const now = Date.now();
    const [created] = await db.insert(contactMethods).values({
      id: nanoid(),
      agencyId,
      contactId: contact.id,
      methodType: method.methodType,
      value: method.value,
      normalizedValue: normalizeMethod(method.methodType, method.value),
      label: method.label,
      isPrimary: method.isPrimary ? 1 : 0,
      consentStatus: method.consentStatus ?? "unknown",
      createdAt: now,
      updatedAt: now,
    }).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "contact.method_added",
      entityType: "contact",
      entityId: contact.id,
      metadata: { methodId: created.id, methodType: created.methodType },
    }));
    return c.json({ method: created }, 201);
  });
