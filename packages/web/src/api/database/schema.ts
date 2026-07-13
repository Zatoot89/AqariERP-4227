import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Auth tables (Better Auth) ────────────────────────────────────────────────
export * from "./auth-schema";

// ─── Agencies ─────────────────────────────────────────────────────────────────
export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  plan: text("plan").default("starter"),
  country: text("country").default("AE"),
  locale: text("locale").default("en"),
  currency: text("currency").default("USD"),
  timezone: text("timezone").default("Asia/Baghdad"),
  logoUrl: text("logo_url"),
  waAccessToken: text("wa_access_token"),
  waPhoneNumberId: text("wa_phone_number_id"),
  waVerifyToken: text("wa_verify_token"),
  waConnectedAt: integer("wa_connected_at"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── User profiles (extends Better Auth user) ─────────────────────────────────
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  nameAr: text("name_ar"),
  role: text("role").notNull().default("agent"),
  avatarUrl: text("avatar_url"),
  active: integer("active").default(1),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── Staff invitations ────────────────────────────────────────────────────────
export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").notNull().references(() => agencies.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").notNull().references(() => profiles.id),
  expiresAt: integer("expires_at").notNull(),
  acceptedAt: integer("accepted_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  assignedTo: text("assigned_to"),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  phone: text("phone"),
  email: text("email"),
  source: text("source").default("manual"),
  stage: text("stage").default("new"),
  budgetMin: real("budget_min"),
  budgetMax: real("budget_max"),
  currency: text("currency").default("USD"),
  propertyType: text("property_type"),
  bedrooms: integer("bedrooms"),
  preferredArea: text("preferred_area"),
  notes: text("notes"),
  whatsappId: text("whatsapp_id"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

// ─── Properties ───────────────────────────────────────────────────────────────
export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  listedBy: text("listed_by"),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  type: text("type"),
  status: text("status").default("available"),
  price: real("price"),
  currency: text("currency").default("USD"),
  areaSqm: real("area_sqm"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  location: text("location"),
  locationAr: text("location_ar"),
  city: text("city"),
  country: text("country"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  images: text("images"),
  externalId: text("external_id"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

// ─── Lead ↔ Property links ────────────────────────────────────────────────────
export const leadProperties = sqliteTable("lead_properties", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  propertyId: text("property_id").references(() => properties.id),
  status: text("status").default("shown"),
  notes: text("notes"),
  linkedAt: integer("linked_at").$defaultFn(() => Date.now()),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  dueAt: integer("due_at"),
  type: text("type").default("follow_up"),
  done: integer("done").default(0),
  remindedAt: integer("reminded_at"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── Activity log ─────────────────────────────────────────────────────────────
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  userId: text("user_id"),
  type: text("type").notNull(),
  body: text("body"),
  meta: text("meta"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── WhatsApp messages ────────────────────────────────────────────────────────
export const whatsappMessages = sqliteTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  waMessageId: text("wa_message_id").unique(),
  direction: text("direction").default("inbound"),
  body: text("body"),
  mediaUrl: text("media_url"),
  waContactId: text("wa_contact_id"),
  waContactName: text("wa_contact_name"),
  receivedAt: integer("received_at").$defaultFn(() => Date.now()),
});
