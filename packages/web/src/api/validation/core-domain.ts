import { z } from "zod";
import { entityIdSchema } from "./schemas";

const emptyToNull = (value: unknown) => value === "" ? null : value;
const nullableText = (max: number) => z.preprocess(
  emptyToNull,
  z.string().trim().max(max).nullable().optional(),
);
const nullableNonNegative = z.preprocess(
  emptyToNull,
  z.number().finite().nonnegative().nullable().optional(),
);
const nullableInteger = z.preprocess(
  emptyToNull,
  z.number().int().nonnegative().nullable().optional(),
);
const nullableTimestamp = z.preprocess(
  emptyToNull,
  z.number().int().nonnegative().nullable().optional(),
);

export const contactRoleSchema = z.enum([
  "owner",
  "landlord",
  "tenant",
  "buyer",
  "seller",
  "broker",
  "vendor",
  "guarantor",
  "prospect",
]);

export const contactMethodSchema = z.object({
  methodType: z.enum(["phone", "email", "whatsapp"]),
  value: z.string().trim().min(1).max(320),
  label: nullableText(100),
  isPrimary: z.boolean().optional(),
  consentStatus: z.enum(["unknown", "granted", "denied", "withdrawn"]).optional(),
}).strict();

export const contactAddressSchema = z.object({
  addressType: z.string().trim().min(1).max(50).optional(),
  line1: nullableText(500),
  line2: nullableText(500),
  city: nullableText(200),
  region: nullableText(200),
  postalCode: nullableText(50),
  country: z.preprocess(emptyToNull, z.string().trim().length(2).toUpperCase().nullable().optional()),
  isPrimary: z.boolean().optional(),
}).strict();

const contactBaseSchema = z.object({
  contactType: z.enum(["person", "company"]),
  displayName: z.string().trim().min(1).max(250),
  displayNameAr: nullableText(250),
  legalName: nullableText(300),
  preferredLanguage: z.enum(["en", "ar"]).optional(),
  notes: nullableText(5000),
  doNotContact: z.boolean().optional(),
});

export const createContactSchema = contactBaseSchema.extend({
  roles: z.array(contactRoleSchema).max(9).optional(),
  methods: z.array(contactMethodSchema).max(20).optional(),
  addresses: z.array(contactAddressSchema).max(10).optional(),
}).strict();

export const updateContactSchema = contactBaseSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const contactListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: contactRoleSchema.optional(),
  contactType: z.enum(["person", "company"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
}).strict();

export const duplicateContactQuerySchema = z.object({
  name: z.string().trim().max(250).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(320).optional(),
}).strict().refine((value) => Boolean(value.name || value.phone || value.email), {
  message: "Provide a name, phone, or email",
});

const developmentBaseSchema = z.object({
  parentId: z.preprocess(emptyToNull, entityIdSchema.nullable().optional()),
  developmentType: z.enum(["compound", "project", "building"]),
  code: nullableText(100),
  name: z.string().trim().min(1).max(300),
  nameAr: nullableText(300),
  description: nullableText(5000),
  addressLine1: nullableText(500),
  addressLine2: nullableText(500),
  city: nullableText(200),
  region: nullableText(200),
  country: z.preprocess(emptyToNull, z.string().trim().length(2).toUpperCase().nullable().optional()),
  latitude: z.preprocess(emptyToNull, z.number().min(-90).max(90).nullable().optional()),
  longitude: z.preprocess(emptyToNull, z.number().min(-180).max(180).nullable().optional()),
  floorsCount: nullableInteger,
  completedAt: nullableTimestamp,
});

export const createDevelopmentSchema = developmentBaseSchema.strict();
export const updateDevelopmentSchema = developmentBaseSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const developmentListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  developmentType: z.enum(["compound", "project", "building"]).optional(),
  parentId: entityIdSchema.optional(),
}).strict();

export const inventoryStatusSchema = z.enum([
  "available",
  "reserved",
  "sold",
  "rented",
  "occupied",
  "off_market",
]);
export const inventoryPurposeSchema = z.enum(["sale", "rent", "both"]);
export const inventoryPropertyTypeSchema = z.enum([
  "apartment",
  "villa",
  "office",
  "land",
  "commercial",
  "building",
  "warehouse",
  "retail",
  "other",
]);

const inventoryPropertyBaseSchema = z.object({
  developmentId: z.preprocess(emptyToNull, entityIdSchema.nullable().optional()),
  assetCode: nullableText(100),
  title: z.string().trim().min(1).max(300),
  titleAr: nullableText(300),
  propertyType: inventoryPropertyTypeSchema,
  purpose: inventoryPurposeSchema.optional(),
  status: inventoryStatusSchema.optional(),
  description: nullableText(10000),
  descriptionAr: nullableText(10000),
  addressLine1: nullableText(500),
  city: nullableText(200),
  region: nullableText(200),
  country: z.preprocess(emptyToNull, z.string().trim().length(2).toUpperCase().nullable().optional()),
  landAreaSqm: nullableNonNegative,
  builtAreaSqm: nullableNonNegative,
  saleAskingPrice: nullableNonNegative,
  annualRentAskingPrice: nullableNonNegative,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  assignedAgentId: z.preprocess(emptyToNull, entityIdSchema.nullable().optional()),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const createInventoryPropertySchema = inventoryPropertyBaseSchema.strict();
export const updateInventoryPropertySchema = inventoryPropertyBaseSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const inventoryPropertyListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: inventoryStatusSchema.optional(),
  propertyType: inventoryPropertyTypeSchema.optional(),
  purpose: inventoryPurposeSchema.optional(),
  developmentId: entityIdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
}).strict();

const unitBaseSchema = z.object({
  unitNumber: z.string().trim().min(1).max(100),
  floor: nullableText(50),
  unitType: z.string().trim().min(1).max(100),
  purpose: inventoryPurposeSchema.optional(),
  status: inventoryStatusSchema.optional(),
  bedrooms: nullableInteger,
  bathrooms: nullableInteger,
  areaSqm: nullableNonNegative,
  balconyAreaSqm: nullableNonNegative,
  parkingSpaces: z.number().int().min(0).max(100).optional(),
  furnishing: z.enum(["unfurnished", "semi_furnished", "furnished"]).optional(),
  saleAskingPrice: nullableNonNegative,
  annualRentAskingPrice: nullableNonNegative,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const createUnitSchema = unitBaseSchema.strict();
export const updateUnitSchema = unitBaseSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createOwnershipSchema = z.object({
  ownerContactId: entityIdSchema,
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  ownershipPercentage: z.number().positive().max(100),
  effectiveFrom: z.number().int().nonnegative(),
  effectiveTo: nullableTimestamp,
  reference: nullableText(300),
  notes: nullableText(3000),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.propertyId) === Boolean(value.unitId)) {
    ctx.addIssue({
      code: "custom",
      path: ["propertyId"],
      message: "Provide exactly one propertyId or unitId",
    });
  }
  if (value.effectiveTo != null && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["effectiveTo"],
      message: "effectiveTo must be after effectiveFrom",
    });
  }
});

export const ownershipListQuerySchema = z.object({
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  contactId: entityIdSchema.optional(),
  active: z.enum(["true", "false"]).optional(),
}).strict().refine(
  (value) => Boolean(value.propertyId || value.unitId || value.contactId),
  { message: "Provide a propertyId, unitId, or contactId" },
);
