import { z } from "zod";

const emptyToNull = (value: unknown) => (value === "" ? null : value);
const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

export const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, "ID contains invalid characters");

const nullableText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const nullableEmail = z.preprocess(
  emptyToNull,
  z.string().trim().email().max(254).nullable().optional(),
);

const nullablePhone = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9() .-]+$/, "Phone number contains invalid characters")
    .nullable()
    .optional(),
);

const nullableNonNegativeNumber = z.preprocess(
  emptyToNull,
  z.number().finite().nonnegative().nullable().optional(),
);

const nullableSmallInteger = z.preprocess(
  emptyToNull,
  z.number().int().min(0).max(100).nullable().optional(),
);

export const leadSourceSchema = z.enum([
  "whatsapp",
  "propertyfinder",
  "bayut",
  "dubizzle",
  "aqarmap",
  "manual",
  "website",
  "referral",
]);

export const leadStageSchema = z.enum([
  "new",
  "contacted",
  "viewing",
  "offer",
  "closed",
  "lost",
]);

export const propertyTypeSchema = z.enum([
  "apartment",
  "villa",
  "office",
  "land",
  "commercial",
]);

export const propertyStatusSchema = z.enum([
  "available",
  "reserved",
  "sold",
  "rented",
]);

export const taskTypeSchema = z.enum([
  "call",
  "viewing",
  "follow_up",
  "document",
  "other",
]);

export const roleSchema = z.enum(["admin", "manager", "agent"]);

export const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code")
  .transform((value) => value.toUpperCase());

export const countrySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Country must be a two-letter code")
  .transform((value) => value.toUpperCase());

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const leadListQuerySchema = paginationQuerySchema
  .extend({
    stage: leadStageSchema.optional(),
    source: leadSourceSchema.optional(),
    q: z.string().trim().max(200).optional(),
    all: z.enum(["true", "false"]).optional(),
  })
  .strict();

const leadFields = {
  name: z.string().trim().min(1).max(200),
  nameAr: nullableText(200),
  phone: nullablePhone,
  email: nullableEmail,
  source: leadSourceSchema.optional(),
  budgetMin: nullableNonNegativeNumber,
  budgetMax: nullableNonNegativeNumber,
  currency: currencySchema.optional(),
  propertyType: propertyTypeSchema.optional(),
  bedrooms: nullableSmallInteger,
  preferredArea: nullableText(300),
  notes: nullableText(5000),
  assignedTo: entityIdSchema.optional(),
};

export const createLeadSchema = z
  .object(leadFields)
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.budgetMin != null &&
      value.budgetMax != null &&
      value.budgetMin > value.budgetMax
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be greater than or equal to minimum budget",
      });
    }
  });

export const updateLeadSchema = z
  .object({
    ...leadFields,
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.budgetMin != null &&
      value.budgetMax != null &&
      value.budgetMin > value.budgetMax
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be greater than or equal to minimum budget",
      });
    }
  });

export const changeLeadStageSchema = z
  .object({ stage: leadStageSchema })
  .strict();

export const addLeadNoteSchema = z
  .object({ body: z.string().trim().min(1).max(5000) })
  .strict();

export const linkLeadPropertySchema = z
  .object({
    propertyId: entityIdSchema,
    status: z.enum(["shown", "interested", "rejected"]).optional(),
    notes: nullableText(2000),
  })
  .strict();

export const propertyListQuerySchema = paginationQuerySchema
  .extend({
    type: propertyTypeSchema.optional(),
    status: propertyStatusSchema.optional(),
    q: z.string().trim().max(200).optional(),
    all: z.enum(["true", "false"]).optional(),
  })
  .strict();

const attachmentIdsSchema = z
  .array(entityIdSchema)
  .max(30)
  .refine((ids) => new Set(ids).size === ids.length, "Attachment IDs must be unique")
  .optional();

const propertyFields = {
  title: z.string().trim().min(1).max(300),
  titleAr: nullableText(300),
  type: propertyTypeSchema.optional(),
  status: propertyStatusSchema.optional(),
  price: nullableNonNegativeNumber,
  currency: currencySchema.optional(),
  areaSqm: nullableNonNegativeNumber,
  bedrooms: nullableSmallInteger,
  bathrooms: nullableSmallInteger,
  location: nullableText(500),
  locationAr: nullableText(500),
  city: nullableText(200),
  country: z.preprocess(emptyToNull, countrySchema.nullable().optional()),
  description: nullableText(10000),
  descriptionAr: nullableText(10000),
  attachmentIds: attachmentIdsSchema,
  externalId: nullableText(200),
};

export const createPropertySchema = z.object(propertyFields).strict();
export const updatePropertySchema = z
  .object({
    ...propertyFields,
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const taskListQuerySchema = paginationQuerySchema
  .extend({
    done: z.enum(["0", "1"]).optional(),
    leadId: entityIdSchema.optional(),
  })
  .strict();

const nullableDueAt = z.preprocess(
  emptyToNull,
  z.number().int().nonnegative().nullable().optional(),
);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    titleAr: nullableText(300),
    dueAt: nullableDueAt,
    type: taskTypeSchema.optional(),
    leadId: entityIdSchema.optional(),
    assignedTo: entityIdSchema.optional(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    titleAr: nullableText(300),
    dueAt: nullableDueAt,
    type: taskTypeSchema.optional(),
    leadId: z.preprocess(emptyToUndefined, entityIdSchema.optional()),
    assignedTo: entityIdSchema.optional(),
  })
  .strict();

export const createAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    role: roleSchema,
    password: z.preprocess(
      emptyToUndefined,
      z.string().min(8).max(128).optional(),
    ),
  })
  .strict();

export const updateAgentSchema = z
  .object({
    role: roleSchema.optional(),
    active: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.active !== undefined, {
    message: "At least one field must be provided",
  });

export const bootstrapAgencySchema = z
  .object({
    agencyName: optionalText(200),
    locale: z.enum(["en", "ar"]).optional(),
    country: countrySchema.optional(),
  })
  .strict();

export const updateAgencySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    nameAr: nullableText(200),
    country: countrySchema.optional(),
    locale: z.enum(["en", "ar"]).optional(),
    currency: currencySchema.optional(),
    timezone: optionalText(100),
    logoAttachmentId: z.preprocess(emptyToNull, entityIdSchema.nullable().optional()),
    waAccessToken: optionalText(4000),
    waPhoneNumberId: optionalText(200),
    waVerifyToken: optionalText(500),
    clearWhatsappCredentials: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const uploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    checksumSha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/).optional(),
    propertyId: entityIdSchema.optional(),
    purpose: z.enum(["property", "agency-logo"]).default("property"),
  })
  .strict();

export const sendWhatsappMessageSchema = z
  .object({ body: z.string().trim().min(1).max(4096) })
  .strict();

export const analyticsQuerySchema = z
  .object({ range: z.enum(["7d", "30d", "90d", "all"]).optional() })
  .strict();

export const auditLogQuerySchema = paginationQuerySchema
  .extend({
    action: z.string().trim().max(100).optional(),
    entityType: z.string().trim().max(100).optional(),
    entityId: entityIdSchema.optional(),
  })
  .strict();
