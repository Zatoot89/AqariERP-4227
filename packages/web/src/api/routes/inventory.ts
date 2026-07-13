import { Hono } from "hono";
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  or,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../database";
import {
  availabilityHistory,
  contactRoles,
  contacts,
  developments,
  inventoryProperties,
  listingAgreements,
  ownershipInterests,
  units,
} from "../database/core-domain-schema";
import { auditLogs, profiles } from "../database/schema";
import { auditRecord } from "../lib/audit";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireTenant } from "../middleware/auth";
import {
  createInventoryPropertySchema,
  createOwnershipSchema,
  createUnitSchema,
  inventoryPropertyListQuerySchema,
  ownershipListQuerySchema,
  updateInventoryPropertySchema,
  updateUnitSchema,
} from "../validation/core-domain";
import { entityIdSchema } from "../validation/schemas";

async function findInventoryProperty(agencyId: string, id: string) {
  return db.select().from(inventoryProperties).where(and(
    eq(inventoryProperties.id, id),
    eq(inventoryProperties.agencyId, agencyId),
    isNull(inventoryProperties.deletedAt),
  )).get();
}

async function findUnit(agencyId: string, id: string) {
  return db.select().from(units).where(and(
    eq(units.id, id),
    eq(units.agencyId, agencyId),
    isNull(units.deletedAt),
  )).get();
}

async function isAgencyProfile(agencyId: string, id: string | null | undefined) {
  if (!id) return true;
  return Boolean(await db.select({ id: profiles.id }).from(profiles).where(and(
    eq(profiles.id, id),
    eq(profiles.agencyId, agencyId),
    eq(profiles.active, 1),
  )).get());
}

async function isAgencyDevelopment(agencyId: string, id: string | null | undefined) {
  if (!id) return true;
  return Boolean(await db.select({ id: developments.id }).from(developments).where(and(
    eq(developments.id, id),
    eq(developments.agencyId, agencyId),
    isNull(developments.deletedAt),
  )).get());
}

async function isAgencyContact(agencyId: string, id: string) {
  return Boolean(await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.id, id),
    eq(contacts.agencyId, agencyId),
    isNull(contacts.deletedAt),
  )).get());
}

function stringify(value: Record<string, unknown> | string[] | undefined) {
  return value === undefined ? undefined : JSON.stringify(value);
}

async function setAvailability(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  options: {
    agencyId: string;
    propertyId?: string;
    unitId?: string;
    status: string;
    changedBy: string;
    reason?: string | null;
    now: number;
  },
) {
  const targetCondition = options.propertyId
    ? eq(availabilityHistory.propertyId, options.propertyId)
    : eq(availabilityHistory.unitId, options.unitId!);
  await tx.update(availabilityHistory).set({ effectiveTo: options.now }).where(and(
    eq(availabilityHistory.agencyId, options.agencyId),
    targetCondition,
    isNull(availabilityHistory.effectiveTo),
  ));
  await tx.insert(availabilityHistory).values({
    id: nanoid(),
    agencyId: options.agencyId,
    propertyId: options.propertyId,
    unitId: options.unitId,
    status: options.status,
    effectiveFrom: options.now,
    reason: options.reason,
    changedBy: options.changedBy,
    createdAt: options.now,
  });
}

const listingSchema = z.object({
  principalContactId: entityIdSchema,
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  assignedAgentId: entityIdSchema.optional(),
  agreementType: z.enum(["sale", "rent", "both"]),
  status: z.enum(["draft", "active", "expired", "terminated"]).optional(),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative().nullable().optional(),
  commissionType: z.enum(["percentage", "fixed"]).nullable().optional(),
  commissionValue: z.number().finite().nonnegative().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.propertyId) === Boolean(value.unitId)) {
    ctx.addIssue({ code: "custom", path: ["propertyId"], message: "Target exactly one property or unit" });
  }
  if (value.endsAt != null && value.endsAt < value.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endsAt must follow startsAt" });
  }
});

const listingQuerySchema = z.object({
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  contactId: entityIdSchema.optional(),
  status: z.enum(["draft", "active", "expired", "terminated"]).optional(),
}).strict();

const endOwnershipSchema = z.object({
  effectiveTo: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
}).strict();

const updateListingStatusSchema = z.object({
  status: z.enum(["draft", "active", "expired", "terminated"]),
  endsAt: z.number().int().nonnegative().nullable().optional(),
}).strict();

export const inventory = new Hono()
  .get("/properties", requireTenant, async (c) => {
    const queryResult = parseQuery(c, inventoryPropertyListQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { q, status, propertyType, purpose, developmentId, page, pageSize } = queryResult.data;
    const conditions: SQL[] = [
      eq(inventoryProperties.agencyId, agencyId),
      isNull(inventoryProperties.deletedAt),
    ];
    if (status) conditions.push(eq(inventoryProperties.status, status));
    if (propertyType) conditions.push(eq(inventoryProperties.propertyType, propertyType));
    if (purpose) conditions.push(eq(inventoryProperties.purpose, purpose));
    if (developmentId) conditions.push(eq(inventoryProperties.developmentId, developmentId));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(
        like(inventoryProperties.title, pattern),
        like(inventoryProperties.titleAr, pattern),
        like(inventoryProperties.assetCode, pattern),
        like(inventoryProperties.city, pattern),
      )!);
    }
    const where = and(...conditions);
    const [summary] = await db.select({ total: count() }).from(inventoryProperties).where(where);
    const rows = await db.select().from(inventoryProperties).where(where)
      .orderBy(desc(inventoryProperties.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return c.json({ properties: rows, total: summary?.total ?? 0, page, pageSize }, 200);
  })
  .post("/properties", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createInventoryPropertySchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = bodyResult.data;
    if (!(await isAgencyDevelopment(agencyId, body.developmentId))) {
      return c.json({ error: "Development not found" }, 404);
    }
    if (!(await isAgencyProfile(agencyId, body.assignedAgentId))) {
      return c.json({ error: "Assigned agent not found" }, 404);
    }
    const id = nanoid();
    const now = Date.now();
    const property = await db.transaction(async (tx) => {
      const [created] = await tx.insert(inventoryProperties).values({
        id,
        agencyId,
        developmentId: body.developmentId,
        assetCode: body.assetCode,
        title: body.title,
        titleAr: body.titleAr,
        propertyType: body.propertyType,
        purpose: body.purpose ?? "both",
        status: body.status ?? "available",
        description: body.description,
        descriptionAr: body.descriptionAr,
        addressLine1: body.addressLine1,
        city: body.city,
        region: body.region,
        country: body.country,
        landAreaSqm: body.landAreaSqm,
        builtAreaSqm: body.builtAreaSqm,
        saleAskingPrice: body.saleAskingPrice,
        annualRentAskingPrice: body.annualRentAskingPrice,
        currency: body.currency ?? "USD",
        assignedAgentId: body.assignedAgentId,
        customFields: stringify(body.customFields),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await setAvailability(tx, {
        agencyId,
        propertyId: id,
        status: created.status,
        changedBy: user.id,
        reason: "Property created",
        now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "inventory_property.created",
        entityType: "inventory_property",
        entityId: id,
        metadata: { status: created.status, propertyType: created.propertyType },
      }));
      return created;
    });
    return c.json({ property }, 201);
  })
  .get("/properties/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const property = await findInventoryProperty(agencyId, idResult.data);
    if (!property) return c.json({ error: "Not found" }, 404);
    const [unitRows, ownershipRows, listingRows, history] = await Promise.all([
      db.select().from(units).where(and(
        eq(units.agencyId, agencyId),
        eq(units.propertyId, property.id),
        isNull(units.deletedAt),
      )),
      db.select().from(ownershipInterests).where(and(
        eq(ownershipInterests.agencyId, agencyId),
        eq(ownershipInterests.propertyId, property.id),
        isNull(ownershipInterests.deletedAt),
      )),
      db.select().from(listingAgreements).where(and(
        eq(listingAgreements.agencyId, agencyId),
        eq(listingAgreements.propertyId, property.id),
        isNull(listingAgreements.deletedAt),
      )),
      db.select().from(availabilityHistory).where(and(
        eq(availabilityHistory.agencyId, agencyId),
        eq(availabilityHistory.propertyId, property.id),
      )).orderBy(desc(availabilityHistory.effectiveFrom)),
    ]);
    return c.json({
      property: {
        ...property,
        customFields: property.customFields ? JSON.parse(property.customFields) : {},
        units: unitRows,
        ownership: ownershipRows,
        listings: listingRows,
        availabilityHistory: history,
      },
    }, 200);
  })
  .patch("/properties/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateInventoryPropertySchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const existing = await findInventoryProperty(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = bodyResult.data as Partial<typeof existing> & {
      customFields?: Record<string, unknown>;
    };
    if (body.developmentId !== undefined && !(await isAgencyDevelopment(agencyId, body.developmentId))) {
      return c.json({ error: "Development not found" }, 404);
    }
    if (body.assignedAgentId !== undefined && !(await isAgencyProfile(agencyId, body.assignedAgentId))) {
      return c.json({ error: "Assigned agent not found" }, 404);
    }
    const now = Date.now();
    const property = await db.transaction(async (tx) => {
      const [updated] = await tx.update(inventoryProperties).set({
        developmentId: body.developmentId,
        assetCode: body.assetCode,
        title: body.title,
        titleAr: body.titleAr,
        propertyType: body.propertyType,
        purpose: body.purpose,
        status: body.status,
        description: body.description,
        descriptionAr: body.descriptionAr,
        addressLine1: body.addressLine1,
        city: body.city,
        region: body.region,
        country: body.country,
        landAreaSqm: body.landAreaSqm,
        builtAreaSqm: body.builtAreaSqm,
        saleAskingPrice: body.saleAskingPrice,
        annualRentAskingPrice: body.annualRentAskingPrice,
        currency: body.currency,
        assignedAgentId: body.assignedAgentId,
        customFields: stringify(body.customFields),
        updatedAt: now,
      }).where(and(
        eq(inventoryProperties.id, existing.id),
        eq(inventoryProperties.agencyId, agencyId),
        isNull(inventoryProperties.deletedAt),
      )).returning();
      if (body.status && body.status !== existing.status) {
        await setAvailability(tx, {
          agencyId,
          propertyId: existing.id,
          status: body.status,
          changedBy: user.id,
          reason: "Property status updated",
          now,
        });
      }
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "inventory_property.updated",
        entityType: "inventory_property",
        entityId: existing.id,
        metadata: { changedFields: Object.keys(bodyResult.data) },
      }));
      return updated;
    });
    return c.json({ property }, 200);
  })
  .delete("/properties/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findInventoryProperty(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(inventoryProperties).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(inventoryProperties.id, existing.id),
        eq(inventoryProperties.agencyId, agencyId),
      ));
      await tx.update(units).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(units.agencyId, agencyId),
        eq(units.propertyId, existing.id),
        isNull(units.deletedAt),
      ));
      await tx.update(availabilityHistory).set({ effectiveTo: now }).where(and(
        eq(availabilityHistory.agencyId, agencyId),
        eq(availabilityHistory.propertyId, existing.id),
        isNull(availabilityHistory.effectiveTo),
      ));
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "inventory_property.deleted",
        entityType: "inventory_property",
        entityId: existing.id,
      }));
    });
    return c.json({ ok: true }, 200);
  })
  .get("/properties/:id/units", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    if (!(await findInventoryProperty(agencyId, idResult.data))) {
      return c.json({ error: "Property not found" }, 404);
    }
    const rows = await db.select().from(units).where(and(
      eq(units.agencyId, agencyId),
      eq(units.propertyId, idResult.data),
      isNull(units.deletedAt),
    )).orderBy(units.unitNumber);
    return c.json({ units: rows }, 200);
  })
  .post("/properties/:id/units", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, createUnitSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const property = await findInventoryProperty(agencyId, idResult.data);
    if (!property) return c.json({ error: "Property not found" }, 404);
    const body = bodyResult.data;
    const id = nanoid();
    const now = Date.now();
    const unit = await db.transaction(async (tx) => {
      const [created] = await tx.insert(units).values({
        id,
        agencyId,
        propertyId: property.id,
        unitNumber: body.unitNumber,
        floor: body.floor,
        unitType: body.unitType,
        purpose: body.purpose ?? "both",
        status: body.status ?? "available",
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        areaSqm: body.areaSqm,
        balconyAreaSqm: body.balconyAreaSqm,
        parkingSpaces: body.parkingSpaces ?? 0,
        furnishing: body.furnishing ?? "unfurnished",
        saleAskingPrice: body.saleAskingPrice,
        annualRentAskingPrice: body.annualRentAskingPrice,
        currency: body.currency ?? property.currency,
        amenities: stringify(body.amenities),
        customFields: stringify(body.customFields),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await setAvailability(tx, {
        agencyId,
        unitId: id,
        status: created.status,
        changedBy: user.id,
        reason: "Unit created",
        now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "unit.created",
        entityType: "unit",
        entityId: id,
        metadata: { propertyId: property.id, status: created.status },
      }));
      return created;
    });
    return c.json({ unit }, 201);
  })
  .get("/units/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const unit = await findUnit(agencyId, idResult.data);
    if (!unit) return c.json({ error: "Not found" }, 404);
    const [ownership, listings, history] = await Promise.all([
      db.select().from(ownershipInterests).where(and(
        eq(ownershipInterests.agencyId, agencyId),
        eq(ownershipInterests.unitId, unit.id),
        isNull(ownershipInterests.deletedAt),
      )),
      db.select().from(listingAgreements).where(and(
        eq(listingAgreements.agencyId, agencyId),
        eq(listingAgreements.unitId, unit.id),
        isNull(listingAgreements.deletedAt),
      )),
      db.select().from(availabilityHistory).where(and(
        eq(availabilityHistory.agencyId, agencyId),
        eq(availabilityHistory.unitId, unit.id),
      )).orderBy(desc(availabilityHistory.effectiveFrom)),
    ]);
    return c.json({ unit: { ...unit, ownership, listings, availabilityHistory: history } }, 200);
  })
  .patch("/units/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateUnitSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const existing = await findUnit(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = bodyResult.data as Partial<typeof existing> & {
      amenities?: string[];
      customFields?: Record<string, unknown>;
    };
    const now = Date.now();
    const unit = await db.transaction(async (tx) => {
      const [updated] = await tx.update(units).set({
        unitNumber: body.unitNumber,
        floor: body.floor,
        unitType: body.unitType,
        purpose: body.purpose,
        status: body.status,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        areaSqm: body.areaSqm,
        balconyAreaSqm: body.balconyAreaSqm,
        parkingSpaces: body.parkingSpaces,
        furnishing: body.furnishing,
        saleAskingPrice: body.saleAskingPrice,
        annualRentAskingPrice: body.annualRentAskingPrice,
        currency: body.currency,
        amenities: stringify(body.amenities),
        customFields: stringify(body.customFields),
        updatedAt: now,
      }).where(and(
        eq(units.id, existing.id),
        eq(units.agencyId, agencyId),
        isNull(units.deletedAt),
      )).returning();
      if (body.status && body.status !== existing.status) {
        await setAvailability(tx, {
          agencyId,
          unitId: existing.id,
          status: body.status,
          changedBy: user.id,
          reason: "Unit status updated",
          now,
        });
      }
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "unit.updated",
        entityType: "unit",
        entityId: existing.id,
        metadata: { changedFields: Object.keys(bodyResult.data) },
      }));
      return updated;
    });
    return c.json({ unit }, 200);
  })
  .delete("/units/:id", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await findUnit(agencyId, idResult.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const now = Date.now();
    await db.transaction(async (tx) => {
      await tx.update(units).set({ deletedAt: now, updatedAt: now }).where(and(
        eq(units.id, existing.id),
        eq(units.agencyId, agencyId),
      ));
      await tx.update(availabilityHistory).set({ effectiveTo: now }).where(and(
        eq(availabilityHistory.agencyId, agencyId),
        eq(availabilityHistory.unitId, existing.id),
        isNull(availabilityHistory.effectiveTo),
      ));
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "unit.deleted",
        entityType: "unit",
        entityId: existing.id,
        metadata: { propertyId: existing.propertyId },
      }));
    });
    return c.json({ ok: true }, 200);
  })
  .get("/ownership", requireTenant, async (c) => {
    const queryResult = parseQuery(c, ownershipListQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { propertyId, unitId, contactId, active } = queryResult.data;
    const conditions: SQL[] = [
      eq(ownershipInterests.agencyId, agencyId),
      isNull(ownershipInterests.deletedAt),
    ];
    if (propertyId) conditions.push(eq(ownershipInterests.propertyId, propertyId));
    if (unitId) conditions.push(eq(ownershipInterests.unitId, unitId));
    if (contactId) conditions.push(eq(ownershipInterests.ownerContactId, contactId));
    if (active === "true") conditions.push(isNull(ownershipInterests.effectiveTo));
    if (active === "false") conditions.push(isNotNull(ownershipInterests.effectiveTo));
    const rows = await db.select().from(ownershipInterests).where(and(...conditions))
      .orderBy(desc(ownershipInterests.effectiveFrom));
    return c.json({ ownership: rows }, 200);
  })
  .post("/ownership", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, createOwnershipSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = bodyResult.data;
    if (!(await isAgencyContact(agencyId, body.ownerContactId))) {
      return c.json({ error: "Owner contact not found" }, 404);
    }
    if (body.propertyId && !(await findInventoryProperty(agencyId, body.propertyId))) {
      return c.json({ error: "Property not found" }, 404);
    }
    if (body.unitId && !(await findUnit(agencyId, body.unitId))) {
      return c.json({ error: "Unit not found" }, 404);
    }
    const targetCondition = body.propertyId
      ? eq(ownershipInterests.propertyId, body.propertyId)
      : eq(ownershipInterests.unitId, body.unitId!);
    const activeRows = await db.select().from(ownershipInterests).where(and(
      eq(ownershipInterests.agencyId, agencyId),
      targetCondition,
      isNull(ownershipInterests.effectiveTo),
      isNull(ownershipInterests.deletedAt),
    ));
    const activeTotal = activeRows.reduce((sum, row) => sum + row.ownershipPercentage, 0);
    if (activeTotal + body.ownershipPercentage > 100.000001) {
      return c.json({
        error: "Active ownership would exceed 100 percent",
        activeTotal,
      }, 409);
    }
    const id = nanoid();
    const now = Date.now();
    const ownership = await db.transaction(async (tx) => {
      const ownerRole = await tx.select({ id: contactRoles.id }).from(contactRoles).where(and(
        eq(contactRoles.agencyId, agencyId),
        eq(contactRoles.contactId, body.ownerContactId),
        eq(contactRoles.role, "owner"),
        isNull(contactRoles.effectiveTo),
      )).get();
      if (!ownerRole) {
        await tx.insert(contactRoles).values({
          id: nanoid(),
          agencyId,
          contactId: body.ownerContactId,
          role: "owner",
          isPrimary: 0,
          effectiveFrom: body.effectiveFrom,
          createdAt: now,
        });
      }
      const [created] = await tx.insert(ownershipInterests).values({
        id,
        agencyId,
        ownerContactId: body.ownerContactId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        ownershipPercentage: body.ownershipPercentage,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
        reference: body.reference,
        notes: body.notes,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "ownership.created",
        entityType: "ownership_interest",
        entityId: id,
        metadata: {
          ownerContactId: body.ownerContactId,
          propertyId: body.propertyId,
          unitId: body.unitId,
          ownershipPercentage: body.ownershipPercentage,
        },
      }));
      return created;
    });
    return c.json({ ownership }, 201);
  })
  .patch("/ownership/:id/end", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, endOwnershipSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await db.select().from(ownershipInterests).where(and(
      eq(ownershipInterests.id, idResult.data),
      eq(ownershipInterests.agencyId, agencyId),
      isNull(ownershipInterests.effectiveTo),
      isNull(ownershipInterests.deletedAt),
    )).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const effectiveTo = bodyResult.data.effectiveTo ?? Date.now();
    if (effectiveTo < existing.effectiveFrom) {
      return c.json({ error: "End date cannot precede ownership start" }, 400);
    }
    const [ownership] = await db.update(ownershipInterests).set({
      effectiveTo,
      notes: bodyResult.data.notes ?? existing.notes,
      updatedAt: Date.now(),
    }).where(and(
      eq(ownershipInterests.id, existing.id),
      eq(ownershipInterests.agencyId, agencyId),
    )).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "ownership.ended",
      entityType: "ownership_interest",
      entityId: existing.id,
      metadata: { effectiveTo },
    }));
    return c.json({ ownership }, 200);
  })
  .get("/listings", requireTenant, async (c) => {
    const queryResult = parseQuery(c, listingQuerySchema);
    if (!queryResult.success) return queryResult.response;
    const agencyId = c.get("agencyId") as string;
    const { propertyId, unitId, contactId, status } = queryResult.data;
    const conditions: SQL[] = [
      eq(listingAgreements.agencyId, agencyId),
      isNull(listingAgreements.deletedAt),
    ];
    if (propertyId) conditions.push(eq(listingAgreements.propertyId, propertyId));
    if (unitId) conditions.push(eq(listingAgreements.unitId, unitId));
    if (contactId) conditions.push(eq(listingAgreements.principalContactId, contactId));
    if (status) conditions.push(eq(listingAgreements.status, status));
    const rows = await db.select().from(listingAgreements).where(and(...conditions))
      .orderBy(desc(listingAgreements.createdAt));
    return c.json({ listings: rows }, 200);
  })
  .post("/listings", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, listingSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const body = bodyResult.data;
    if (!(await isAgencyContact(agencyId, body.principalContactId))) {
      return c.json({ error: "Principal contact not found" }, 404);
    }
    if (body.propertyId && !(await findInventoryProperty(agencyId, body.propertyId))) {
      return c.json({ error: "Property not found" }, 404);
    }
    if (body.unitId && !(await findUnit(agencyId, body.unitId))) {
      return c.json({ error: "Unit not found" }, 404);
    }
    if (!(await isAgencyProfile(agencyId, body.assignedAgentId))) {
      return c.json({ error: "Assigned agent not found" }, 404);
    }
    const id = nanoid();
    const now = Date.now();
    const listing = await db.transaction(async (tx) => {
      const [created] = await tx.insert(listingAgreements).values({
        id,
        agencyId,
        principalContactId: body.principalContactId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        assignedAgentId: body.assignedAgentId,
        agreementType: body.agreementType,
        status: body.status ?? "draft",
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        commissionType: body.commissionType,
        commissionValue: body.commissionValue,
        notes: body.notes,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: "listing_agreement.created",
        entityType: "listing_agreement",
        entityId: id,
        metadata: {
          principalContactId: body.principalContactId,
          propertyId: body.propertyId,
          unitId: body.unitId,
          status: created.status,
        },
      }));
      return created;
    });
    return c.json({ listing }, 201);
  })
  .patch("/listings/:id/status", requireTenant, async (c) => {
    const idResult = parseParam(c, entityIdSchema);
    if (!idResult.success) return idResult.response;
    const bodyResult = await parseJson(c, updateListingStatusSchema);
    if (!bodyResult.success) return bodyResult.response;
    const agencyId = c.get("agencyId") as string;
    const existing = await db.select().from(listingAgreements).where(and(
      eq(listingAgreements.id, idResult.data),
      eq(listingAgreements.agencyId, agencyId),
      isNull(listingAgreements.deletedAt),
    )).get();
    if (!existing) return c.json({ error: "Not found" }, 404);
    const [listing] = await db.update(listingAgreements).set({
      status: bodyResult.data.status,
      endsAt: bodyResult.data.endsAt,
      updatedAt: Date.now(),
    }).where(and(
      eq(listingAgreements.id, existing.id),
      eq(listingAgreements.agencyId, agencyId),
    )).returning();
    await db.insert(auditLogs).values(auditRecord(c, {
      agencyId,
      action: "listing_agreement.status_updated",
      entityType: "listing_agreement",
      entityId: existing.id,
      metadata: { previousStatus: existing.status, nextStatus: bodyResult.data.status },
    }));
    return c.json({ listing }, 200);
  });
