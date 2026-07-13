import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { agencies, leads, profiles, properties } from "./schema";

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    contactType: text("contact_type").notNull().default("person"),
    displayName: text("display_name").notNull(),
    displayNameAr: text("display_name_ar"),
    legalName: text("legal_name"),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    normalizedName: text("normalized_name").notNull(),
    notes: text("notes"),
    doNotContact: integer("do_not_contact").notNull().default(0),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("contacts_agency_name_idx").on(table.agencyId, table.normalizedName, table.deletedAt),
    index("contacts_agency_type_idx").on(table.agencyId, table.contactType, table.deletedAt),
  ],
);

export const contactRoles = sqliteTable(
  "contact_roles",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    isPrimary: integer("is_primary").notNull().default(0),
    effectiveFrom: integer("effective_from").notNull().$defaultFn(() => Date.now()),
    effectiveTo: integer("effective_to"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    index("contact_roles_agency_role_idx").on(table.agencyId, table.role, table.effectiveTo),
    index("contact_roles_contact_idx").on(table.contactId, table.effectiveTo),
    uniqueIndex("contact_roles_history_unique").on(
      table.agencyId,
      table.contactId,
      table.role,
      table.effectiveFrom,
    ),
  ],
);

export const contactMethods = sqliteTable(
  "contact_methods",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    methodType: text("method_type").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    label: text("label"),
    isPrimary: integer("is_primary").notNull().default(0),
    consentStatus: text("consent_status").notNull().default("unknown"),
    verifiedAt: integer("verified_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("contact_methods_contact_idx").on(table.contactId, table.methodType, table.deletedAt),
    index("contact_methods_duplicate_idx").on(
      table.agencyId,
      table.methodType,
      table.normalizedValue,
      table.deletedAt,
    ),
  ],
);

export const contactAddresses = sqliteTable(
  "contact_addresses",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    addressType: text("address_type").notNull().default("primary"),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    isPrimary: integer("is_primary").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("contact_addresses_contact_idx").on(table.contactId, table.deletedAt)],
);

export const contactIdentifiers = sqliteTable(
  "contact_identifiers",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    identifierType: text("identifier_type").notNull(),
    identifierValue: text("identifier_value").notNull(),
    issuingCountry: text("issuing_country"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("contact_identifiers_contact_idx").on(table.contactId, table.deletedAt),
    uniqueIndex("contact_identifiers_agency_value_unique").on(
      table.agencyId,
      table.identifierType,
      table.identifierValue,
    ),
  ],
);

export const leadContactMappings = sqliteTable(
  "lead_contact_mappings",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("lead_contact_mapping_lead_unique").on(table.agencyId, table.leadId),
    index("lead_contact_mapping_contact_idx").on(table.agencyId, table.contactId),
  ],
);

export const developments = sqliteTable(
  "developments",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => developments.id, {
      onDelete: "set null",
    }),
    developmentType: text("development_type").notNull(),
    code: text("code"),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    description: text("description"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    floorsCount: integer("floors_count"),
    completedAt: integer("completed_at"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("developments_agency_parent_idx").on(table.agencyId, table.parentId, table.deletedAt),
    index("developments_agency_type_idx").on(
      table.agencyId,
      table.developmentType,
      table.deletedAt,
    ),
    uniqueIndex("developments_agency_code_unique").on(table.agencyId, table.code),
  ],
);

export const inventoryProperties = sqliteTable(
  "inventory_properties",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    developmentId: text("development_id").references(() => developments.id, { onDelete: "set null" }),
    assetCode: text("asset_code"),
    title: text("title").notNull(),
    titleAr: text("title_ar"),
    propertyType: text("property_type").notNull(),
    purpose: text("purpose").notNull().default("both"),
    status: text("status").notNull().default("available"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    addressLine1: text("address_line1"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    landAreaSqm: real("land_area_sqm"),
    builtAreaSqm: real("built_area_sqm"),
    saleAskingPrice: real("sale_asking_price"),
    annualRentAskingPrice: real("annual_rent_asking_price"),
    currency: text("currency").notNull().default("USD"),
    assignedAgentId: text("assigned_agent_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    customFields: text("custom_fields"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("inventory_properties_agency_status_idx").on(
      table.agencyId,
      table.status,
      table.deletedAt,
    ),
    index("inventory_properties_development_idx").on(
      table.agencyId,
      table.developmentId,
      table.deletedAt,
    ),
    uniqueIndex("inventory_properties_agency_code_unique").on(table.agencyId, table.assetCode),
  ],
);

export const units = sqliteTable(
  "units",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull().references(() => inventoryProperties.id, {
      onDelete: "cascade",
    }),
    unitNumber: text("unit_number").notNull(),
    floor: text("floor"),
    unitType: text("unit_type").notNull(),
    purpose: text("purpose").notNull().default("both"),
    status: text("status").notNull().default("available"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    areaSqm: real("area_sqm"),
    balconyAreaSqm: real("balcony_area_sqm"),
    parkingSpaces: integer("parking_spaces").notNull().default(0),
    furnishing: text("furnishing").notNull().default("unfurnished"),
    saleAskingPrice: real("sale_asking_price"),
    annualRentAskingPrice: real("annual_rent_asking_price"),
    currency: text("currency").notNull().default("USD"),
    amenities: text("amenities"),
    customFields: text("custom_fields"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    uniqueIndex("units_property_number_unique").on(table.agencyId, table.propertyId, table.unitNumber),
    index("units_agency_status_idx").on(table.agencyId, table.status, table.deletedAt),
    index("units_property_idx").on(table.propertyId, table.deletedAt),
  ],
);

export const ownershipInterests = sqliteTable(
  "ownership_interests",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    ownerContactId: text("owner_contact_id").notNull().references(() => contacts.id, {
      onDelete: "restrict",
    }),
    propertyId: text("property_id").references(() => inventoryProperties.id, {
      onDelete: "restrict",
    }),
    unitId: text("unit_id").references(() => units.id, { onDelete: "restrict" }),
    ownershipPercentage: real("ownership_percentage").notNull(),
    effectiveFrom: integer("effective_from").notNull(),
    effectiveTo: integer("effective_to"),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("ownership_property_idx").on(table.agencyId, table.propertyId, table.effectiveTo),
    index("ownership_unit_idx").on(table.agencyId, table.unitId, table.effectiveTo),
    index("ownership_contact_idx").on(table.agencyId, table.ownerContactId, table.effectiveTo),
  ],
);

export const listingAgreements = sqliteTable(
  "listing_agreements",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    principalContactId: text("principal_contact_id").notNull().references(() => contacts.id, {
      onDelete: "restrict",
    }),
    propertyId: text("property_id").references(() => inventoryProperties.id, {
      onDelete: "restrict",
    }),
    unitId: text("unit_id").references(() => units.id, { onDelete: "restrict" }),
    assignedAgentId: text("assigned_agent_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    agreementType: text("agreement_type").notNull(),
    status: text("status").notNull().default("draft"),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at"),
    commissionType: text("commission_type"),
    commissionValue: real("commission_value"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("listing_agreements_property_idx").on(table.agencyId, table.propertyId, table.status),
    index("listing_agreements_unit_idx").on(table.agencyId, table.unitId, table.status),
    index("listing_agreements_principal_idx").on(
      table.agencyId,
      table.principalContactId,
      table.status,
    ),
  ],
);

export const availabilityHistory = sqliteTable(
  "availability_history",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    propertyId: text("property_id").references(() => inventoryProperties.id, {
      onDelete: "cascade",
    }),
    unitId: text("unit_id").references(() => units.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    effectiveFrom: integer("effective_from").notNull(),
    effectiveTo: integer("effective_to"),
    reason: text("reason"),
    changedBy: text("changed_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    index("availability_property_idx").on(table.agencyId, table.propertyId, table.effectiveTo),
    index("availability_unit_idx").on(table.agencyId, table.unitId, table.effectiveTo),
  ],
);

export const legacyPropertyMappings = sqliteTable(
  "legacy_property_mappings",
  {
    id: text("id").primaryKey(),
    agencyId: text("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    legacyPropertyId: text("legacy_property_id").notNull().references(() => properties.id, {
      onDelete: "cascade",
    }),
    inventoryPropertyId: text("inventory_property_id").notNull().references(
      () => inventoryProperties.id,
      { onDelete: "cascade" },
    ),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex("legacy_property_mapping_source_unique").on(
      table.agencyId,
      table.legacyPropertyId,
    ),
    uniqueIndex("legacy_property_mapping_target_unique").on(
      table.agencyId,
      table.inventoryPropertyId,
    ),
  ],
);
