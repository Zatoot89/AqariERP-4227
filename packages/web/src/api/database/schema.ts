import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export * from "./auth-schema";

export const agencies = sqliteTable(
  "agencies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    plan: text("plan").notNull().default("starter"),
    country: text("country").notNull().default("AE"),
    locale: text("locale").notNull().default("en"),
    currency: text("currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("Asia/Baghdad"),
    // Legacy compatibility only. Structured media ownership lives in attachments.
    logoUrl: text("logo_url"),
    waAccessToken: text("wa_access_token"),
    waPhoneNumberId: text("wa_phone_number_id"),
    waVerifyToken: text("wa_verify_token"),
    waConnectedAt: integer("wa_connected_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [index("agencies_plan_idx").on(table.plan)],
);

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    nameAr: text("name_ar"),
    role: text("role").notNull().default("agent"),
    avatarUrl: text("avatar_url"),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    index("profiles_agency_role_idx").on(table.agencyId, table.role, table.active),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("invitations_agency_email_unique").on(table.agencyId, table.email),
    index("invitations_agency_expiry_idx").on(table.agencyId, table.expiresAt),
  ],
);

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    assignedTo: text("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    phone: text("phone"),
    email: text("email"),
    source: text("source").notNull().default("manual"),
    stage: text("stage").notNull().default("new"),
    budgetMin: real("budget_min"),
    budgetMax: real("budget_max"),
    currency: text("currency").notNull().default("USD"),
    propertyType: text("property_type"),
    bedrooms: integer("bedrooms"),
    preferredArea: text("preferred_area"),
    notes: text("notes"),
    whatsappId: text("whatsapp_id"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("leads_agency_stage_created_idx").on(table.agencyId, table.stage, table.createdAt),
    index("leads_agency_assignee_idx").on(table.agencyId, table.assignedTo, table.deletedAt),
    index("leads_agency_phone_idx").on(table.agencyId, table.phone),
    index("leads_agency_email_idx").on(table.agencyId, table.email),
  ],
);

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    listedBy: text("listed_by").references(() => profiles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    titleAr: text("title_ar"),
    type: text("type"),
    status: text("status").notNull().default("available"),
    price: real("price"),
    currency: text("currency").notNull().default("USD"),
    areaSqm: real("area_sqm"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    location: text("location"),
    locationAr: text("location_ar"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    // Legacy read-only compatibility; new media uses attachments.
    images: text("images"),
    externalId: text("external_id"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("properties_agency_status_created_idx").on(table.agencyId, table.status, table.createdAt),
    index("properties_agency_type_status_idx").on(table.agencyId, table.type, table.status),
    index("properties_agency_city_idx").on(table.agencyId, table.city),
    uniqueIndex("properties_agency_external_unique").on(table.agencyId, table.externalId),
  ],
);

export const leadProperties = sqliteTable(
  "lead_properties",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("shown"),
    notes: text("notes"),
    linkedAt: integer("linked_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("lead_properties_agency_pair_unique").on(
      table.agencyId,
      table.leadId,
      table.propertyId,
    ),
    index("lead_properties_property_idx").on(table.agencyId, table.propertyId),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    assignedTo: text("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    titleAr: text("title_ar"),
    dueAt: integer("due_at"),
    type: text("type").notNull().default("follow_up"),
    done: integer("done").notNull().default(0),
    remindedAt: integer("reminded_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("tasks_agency_assignee_done_due_idx").on(
      table.agencyId,
      table.assignedTo,
      table.done,
      table.dueAt,
    ),
    index("tasks_agency_lead_idx").on(table.agencyId, table.leadId, table.deletedAt),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => profiles.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    body: text("body"),
    meta: text("meta"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    index("activities_agency_created_idx").on(table.agencyId, table.createdAt),
    index("activities_lead_created_idx").on(table.agencyId, table.leadId, table.createdAt),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    index("audit_logs_agency_created_idx").on(table.agencyId, table.createdAt),
    index("audit_logs_entity_idx").on(table.agencyId, table.entityType, table.entityId),
    index("audit_logs_actor_idx").on(table.agencyId, table.actorId, table.createdAt),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    uploadedBy: text("uploaded_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("attachments_agency_owner_idx").on(
      table.agencyId,
      table.ownerType,
      table.ownerId,
      table.status,
    ),
    index("attachments_agency_status_created_idx").on(
      table.agencyId,
      table.status,
      table.createdAt,
    ),
    index("attachments_uploader_status_idx").on(table.uploadedBy, table.status, table.createdAt),
  ],
);

export const whatsappMessages = sqliteTable(
  "whatsapp_messages",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    waMessageId: text("wa_message_id").notNull(),
    direction: text("direction").notNull().default("inbound"),
    body: text("body"),
    mediaUrl: text("media_url"),
    waContactId: text("wa_contact_id"),
    waContactName: text("wa_contact_name"),
    receivedAt: integer("received_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("whatsapp_agency_message_unique").on(table.agencyId, table.waMessageId),
    index("whatsapp_agency_lead_received_idx").on(
      table.agencyId,
      table.leadId,
      table.receivedAt,
    ),
  ],
);
