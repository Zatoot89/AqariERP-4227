import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Auth tables (Better Auth) ────────────────────────────────────────────────
export * from "./auth-schema";

// ─── Agencies ─────────────────────────────────────────────────────────────────
export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  plan: text("plan").default("starter"), // starter | growth | full
  country: text("country").default("AE"), // IQ | SA | AE
  locale: text("locale").default("en"), // default lang for agency
  currency: text("currency").default("USD"),
  timezone: text("timezone").default("Asia/Baghdad"),
  logoUrl: text("logo_url"),
  // WhatsApp Cloud API (Meta) — set by admin in Settings
  waAccessToken: text("wa_access_token"),
  waPhoneNumberId: text("wa_phone_number_id"),
  waVerifyToken: text("wa_verify_token"),
  waConnectedAt: integer("wa_connected_at"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── User profiles (extends Better Auth user) ─────────────────────────────────
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), // matches Better Auth user.id
  agencyId: text("agency_id").references(() => agencies.id),
  nameAr: text("name_ar"),
  role: text("role").notNull().default("agent"), // admin | manager | agent
  avatarUrl: text("avatar_url"),
  active: integer("active").default(1),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  assignedTo: text("assigned_to"), // references profiles.id
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  phone: text("phone"),
  email: text("email"),
  source: text("source").default("manual"), // whatsapp | propertyfinder | bayut | dubizzle | aqarmap | manual | website | referral
  stage: text("stage").default("new"), // new | contacted | viewing | offer | closed | lost
  budgetMin: real("budget_min"),
  budgetMax: real("budget_max"),
  currency: text("currency").default("USD"),
  propertyType: text("property_type"), // apartment | villa | office | land | commercial
  bedrooms: integer("bedrooms"),
  preferredArea: text("preferred_area"),
  notes: text("notes"),
  whatsappId: text("whatsapp_id"), // WA contact ID for webhook matching
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

// ─── Properties ───────────────────────────────────────────────────────────────
export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  listedBy: text("listed_by"), // references profiles.id
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  type: text("type"), // apartment | villa | office | land | commercial
  status: text("status").default("available"), // available | reserved | sold | rented
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
  images: text("images"), // JSON array of image URLs
  externalId: text("external_id"), // portal listing ID (Phase 2)
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

// ─── Lead ↔ Property links ────────────────────────────────────────────────────
export const leadProperties = sqliteTable("lead_properties", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  propertyId: text("property_id").references(() => properties.id),
  status: text("status").default("shown"), // shown | interested | rejected
  notes: text("notes"),
  linkedAt: integer("linked_at").$defaultFn(() => Date.now()),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  assignedTo: text("assigned_to"), // references profiles.id
  createdBy: text("created_by"), // references profiles.id
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  dueAt: integer("due_at"),
  type: text("type").default("follow_up"), // call | viewing | follow_up | document | other
  done: integer("done").default(0),
  remindedAt: integer("reminded_at"), // set once an overdue reminder email has been sent, to avoid duplicates
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── Activity log ─────────────────────────────────────────────────────────────
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  userId: text("user_id"),
  type: text("type").notNull(), // stage_change | note | task | whatsapp_msg | call | viewing
  body: text("body"),
  meta: text("meta"), // JSON
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

// ─── WhatsApp messages ────────────────────────────────────────────────────────
export const whatsappMessages = sqliteTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  leadId: text("lead_id").references(() => leads.id),
  waMessageId: text("wa_message_id").unique(),
  direction: text("direction").default("inbound"), // inbound | outbound
  body: text("body"),
  mediaUrl: text("media_url"),
  waContactId: text("wa_contact_id"),
  waContactName: text("wa_contact_name"),
  receivedAt: integer("received_at").$defaultFn(() => Date.now()),
});
