import { databaseClient } from "./index";

const createStatements = [
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    contact_type TEXT NOT NULL DEFAULT 'person',
    display_name TEXT NOT NULL,
    display_name_ar TEXT,
    legal_name TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    normalized_name TEXT NOT NULL,
    notes TEXT,
    do_not_contact INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS contact_roles (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    role TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    effective_from INTEGER NOT NULL,
    effective_to INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS contact_methods (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    method_type TEXT NOT NULL,
    value TEXT NOT NULL,
    normalized_value TEXT NOT NULL,
    label TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    consent_status TEXT NOT NULL DEFAULT 'unknown',
    verified_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS contact_addresses (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    address_type TEXT NOT NULL DEFAULT 'primary',
    line1 TEXT,
    line2 TEXT,
    city TEXT,
    region TEXT,
    postal_code TEXT,
    country TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS contact_identifiers (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    identifier_type TEXT NOT NULL,
    identifier_value TEXT NOT NULL,
    issuing_country TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS lead_contact_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS developments (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    parent_id TEXT,
    development_type TEXT NOT NULL,
    code TEXT,
    name TEXT NOT NULL,
    name_ar TEXT,
    description TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    region TEXT,
    country TEXT,
    latitude REAL,
    longitude REAL,
    floors_count INTEGER,
    completed_at INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES developments(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_properties (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    development_id TEXT,
    asset_code TEXT,
    title TEXT NOT NULL,
    title_ar TEXT,
    property_type TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'both',
    status TEXT NOT NULL DEFAULT 'available',
    description TEXT,
    description_ar TEXT,
    address_line1 TEXT,
    city TEXT,
    region TEXT,
    country TEXT,
    land_area_sqm REAL,
    built_area_sqm REAL,
    sale_asking_price REAL,
    annual_rent_asking_price REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    assigned_agent_id TEXT,
    custom_fields TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (development_id) REFERENCES developments(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_agent_id) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    floor TEXT,
    unit_type TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'both',
    status TEXT NOT NULL DEFAULT 'available',
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_sqm REAL,
    balcony_area_sqm REAL,
    parking_spaces INTEGER NOT NULL DEFAULT 0,
    furnishing TEXT NOT NULL DEFAULT 'unfurnished',
    sale_asking_price REAL,
    annual_rent_asking_price REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    amenities TEXT,
    custom_fields TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ownership_interests (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    owner_contact_id TEXT NOT NULL,
    property_id TEXT,
    unit_id TEXT,
    ownership_percentage REAL NOT NULL,
    effective_from INTEGER NOT NULL,
    effective_to INTEGER,
    reference TEXT,
    notes TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS listing_agreements (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    principal_contact_id TEXT NOT NULL,
    property_id TEXT,
    unit_id TEXT,
    assigned_agent_id TEXT,
    agreement_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    starts_at INTEGER NOT NULL,
    ends_at INTEGER,
    commission_type TEXT,
    commission_value REAL,
    notes TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (principal_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_agent_id) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS availability_history (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    property_id TEXT,
    unit_id TEXT,
    status TEXT NOT NULL,
    effective_from INTEGER NOT NULL,
    effective_to INTEGER,
    reason TEXT,
    changed_by TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS legacy_property_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    legacy_property_id TEXT NOT NULL,
    inventory_property_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (legacy_property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_property_id) REFERENCES inventory_properties(id) ON DELETE CASCADE
  )`,
];

const indexStatements = [
  "CREATE INDEX IF NOT EXISTS contacts_agency_name_idx ON contacts (agency_id, normalized_name, deleted_at)",
  "CREATE INDEX IF NOT EXISTS contacts_agency_type_idx ON contacts (agency_id, contact_type, deleted_at)",
  "CREATE INDEX IF NOT EXISTS contact_roles_agency_role_idx ON contact_roles (agency_id, role, effective_to)",
  "CREATE INDEX IF NOT EXISTS contact_roles_contact_idx ON contact_roles (contact_id, effective_to)",
  "CREATE UNIQUE INDEX IF NOT EXISTS contact_roles_history_unique ON contact_roles (agency_id, contact_id, role, effective_from)",
  "CREATE INDEX IF NOT EXISTS contact_methods_contact_idx ON contact_methods (contact_id, method_type, deleted_at)",
  "CREATE INDEX IF NOT EXISTS contact_methods_duplicate_idx ON contact_methods (agency_id, method_type, normalized_value, deleted_at)",
  "CREATE INDEX IF NOT EXISTS contact_addresses_contact_idx ON contact_addresses (contact_id, deleted_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS contact_identifiers_agency_value_unique ON contact_identifiers (agency_id, identifier_type, identifier_value)",
  "CREATE UNIQUE INDEX IF NOT EXISTS lead_contact_mapping_lead_unique ON lead_contact_mappings (agency_id, lead_id)",
  "CREATE INDEX IF NOT EXISTS lead_contact_mapping_contact_idx ON lead_contact_mappings (agency_id, contact_id)",
  "CREATE INDEX IF NOT EXISTS developments_agency_parent_idx ON developments (agency_id, parent_id, deleted_at)",
  "CREATE INDEX IF NOT EXISTS developments_agency_type_idx ON developments (agency_id, development_type, deleted_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS developments_agency_code_unique ON developments (agency_id, code) WHERE code IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS inventory_properties_agency_status_idx ON inventory_properties (agency_id, status, deleted_at)",
  "CREATE INDEX IF NOT EXISTS inventory_properties_development_idx ON inventory_properties (agency_id, development_id, deleted_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS inventory_properties_agency_code_unique ON inventory_properties (agency_id, asset_code) WHERE asset_code IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS units_property_number_unique ON units (agency_id, property_id, unit_number)",
  "CREATE INDEX IF NOT EXISTS units_agency_status_idx ON units (agency_id, status, deleted_at)",
  "CREATE INDEX IF NOT EXISTS units_property_idx ON units (property_id, deleted_at)",
  "CREATE INDEX IF NOT EXISTS ownership_property_idx ON ownership_interests (agency_id, property_id, effective_to)",
  "CREATE INDEX IF NOT EXISTS ownership_unit_idx ON ownership_interests (agency_id, unit_id, effective_to)",
  "CREATE INDEX IF NOT EXISTS ownership_contact_idx ON ownership_interests (agency_id, owner_contact_id, effective_to)",
  "CREATE INDEX IF NOT EXISTS listing_agreements_property_idx ON listing_agreements (agency_id, property_id, status)",
  "CREATE INDEX IF NOT EXISTS listing_agreements_unit_idx ON listing_agreements (agency_id, unit_id, status)",
  "CREATE INDEX IF NOT EXISTS listing_agreements_principal_idx ON listing_agreements (agency_id, principal_contact_id, status)",
  "CREATE INDEX IF NOT EXISTS availability_property_idx ON availability_history (agency_id, property_id, effective_to)",
  "CREATE INDEX IF NOT EXISTS availability_unit_idx ON availability_history (agency_id, unit_id, effective_to)",
  "CREATE UNIQUE INDEX IF NOT EXISTS legacy_property_mapping_source_unique ON legacy_property_mappings (agency_id, legacy_property_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS legacy_property_mapping_target_unique ON legacy_property_mappings (agency_id, inventory_property_id)",
];

const validationTriggers = [
  `CREATE TRIGGER IF NOT EXISTS contacts_validate_insert BEFORE INSERT ON contacts BEGIN
    SELECT CASE WHEN NEW.contact_type NOT IN ('person','company') THEN RAISE(ABORT, 'invalid contact type') END;
    SELECT CASE WHEN NEW.preferred_language NOT IN ('en','ar') THEN RAISE(ABORT, 'invalid contact language') END;
    SELECT CASE WHEN NEW.do_not_contact NOT IN (0,1) THEN RAISE(ABORT, 'invalid contact preference') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contacts_validate_update BEFORE UPDATE OF contact_type, preferred_language, do_not_contact ON contacts BEGIN
    SELECT CASE WHEN NEW.contact_type NOT IN ('person','company') THEN RAISE(ABORT, 'invalid contact type') END;
    SELECT CASE WHEN NEW.preferred_language NOT IN ('en','ar') THEN RAISE(ABORT, 'invalid contact language') END;
    SELECT CASE WHEN NEW.do_not_contact NOT IN (0,1) THEN RAISE(ABORT, 'invalid contact preference') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contact_roles_validate_insert BEFORE INSERT ON contact_roles BEGIN
    SELECT CASE WHEN NEW.role NOT IN ('owner','landlord','tenant','buyer','seller','broker','vendor','guarantor','prospect') THEN RAISE(ABORT, 'invalid contact role') END;
    SELECT CASE WHEN NEW.is_primary NOT IN (0,1) THEN RAISE(ABORT, 'invalid primary flag') END;
    SELECT CASE WHEN NEW.effective_to IS NOT NULL AND NEW.effective_to < NEW.effective_from THEN RAISE(ABORT, 'invalid role date range') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant contact role') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contact_methods_validate_insert BEFORE INSERT ON contact_methods BEGIN
    SELECT CASE WHEN NEW.method_type NOT IN ('phone','email','whatsapp') THEN RAISE(ABORT, 'invalid contact method') END;
    SELECT CASE WHEN NEW.is_primary NOT IN (0,1) THEN RAISE(ABORT, 'invalid primary flag') END;
    SELECT CASE WHEN NEW.consent_status NOT IN ('unknown','granted','denied','withdrawn') THEN RAISE(ABORT, 'invalid consent status') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant contact method') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contact_children_validate_insert BEFORE INSERT ON contact_addresses BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant contact address') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contact_identifiers_validate_insert BEFORE INSERT ON contact_identifiers BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant contact identifier') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS developments_validate_insert BEFORE INSERT ON developments BEGIN
    SELECT CASE WHEN NEW.development_type NOT IN ('compound','project','building') THEN RAISE(ABORT, 'invalid development type') END;
    SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM developments d WHERE d.id = NEW.parent_id AND d.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant development parent') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS inventory_properties_validate_insert BEFORE INSERT ON inventory_properties BEGIN
    SELECT CASE WHEN NEW.property_type NOT IN ('apartment','villa','office','land','commercial','building','warehouse','retail','other') THEN RAISE(ABORT, 'invalid inventory property type') END;
    SELECT CASE WHEN NEW.purpose NOT IN ('sale','rent','both') THEN RAISE(ABORT, 'invalid inventory purpose') END;
    SELECT CASE WHEN NEW.status NOT IN ('available','reserved','sold','rented','occupied','off_market') THEN RAISE(ABORT, 'invalid inventory status') END;
    SELECT CASE WHEN NEW.sale_asking_price IS NOT NULL AND NEW.sale_asking_price < 0 THEN RAISE(ABORT, 'invalid sale asking price') END;
    SELECT CASE WHEN NEW.annual_rent_asking_price IS NOT NULL AND NEW.annual_rent_asking_price < 0 THEN RAISE(ABORT, 'invalid rent asking price') END;
    SELECT CASE WHEN NEW.development_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM developments d WHERE d.id = NEW.development_id AND d.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant development') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS units_validate_insert BEFORE INSERT ON units BEGIN
    SELECT CASE WHEN NEW.purpose NOT IN ('sale','rent','both') THEN RAISE(ABORT, 'invalid unit purpose') END;
    SELECT CASE WHEN NEW.status NOT IN ('available','reserved','sold','rented','occupied','off_market') THEN RAISE(ABORT, 'invalid unit status') END;
    SELECT CASE WHEN NEW.furnishing NOT IN ('unfurnished','semi_furnished','furnished') THEN RAISE(ABORT, 'invalid furnishing') END;
    SELECT CASE WHEN NEW.bedrooms IS NOT NULL AND NEW.bedrooms < 0 THEN RAISE(ABORT, 'invalid bedrooms') END;
    SELECT CASE WHEN NEW.bathrooms IS NOT NULL AND NEW.bathrooms < 0 THEN RAISE(ABORT, 'invalid bathrooms') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant unit property') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS ownership_validate_insert BEFORE INSERT ON ownership_interests BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'ownership must target exactly one asset') END;
    SELECT CASE WHEN NEW.ownership_percentage <= 0 OR NEW.ownership_percentage > 100 THEN RAISE(ABORT, 'invalid ownership percentage') END;
    SELECT CASE WHEN NEW.effective_to IS NOT NULL AND NEW.effective_to < NEW.effective_from THEN RAISE(ABORT, 'invalid ownership date range') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.owner_contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant owner') END;
    SELECT CASE WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant property ownership') END;
    SELECT CASE WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units u WHERE u.id = NEW.unit_id AND u.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant unit ownership') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS listing_agreements_validate_insert BEFORE INSERT ON listing_agreements BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'listing must target exactly one asset') END;
    SELECT CASE WHEN NEW.agreement_type NOT IN ('sale','rent','both') THEN RAISE(ABORT, 'invalid listing agreement type') END;
    SELECT CASE WHEN NEW.status NOT IN ('draft','active','expired','terminated') THEN RAISE(ABORT, 'invalid listing status') END;
    SELECT CASE WHEN NEW.ends_at IS NOT NULL AND NEW.ends_at < NEW.starts_at THEN RAISE(ABORT, 'invalid listing date range') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.principal_contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant listing principal') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS availability_validate_insert BEFORE INSERT ON availability_history BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'availability must target exactly one asset') END;
    SELECT CASE WHEN NEW.status NOT IN ('available','reserved','sold','rented','occupied','off_market') THEN RAISE(ABORT, 'invalid availability status') END;
    SELECT CASE WHEN NEW.effective_to IS NOT NULL AND NEW.effective_to < NEW.effective_from THEN RAISE(ABORT, 'invalid availability date range') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS lead_contact_mappings_validate_insert BEFORE INSERT ON lead_contact_mappings BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant lead mapping') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant contact mapping') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS legacy_property_mappings_validate_insert BEFORE INSERT ON legacy_property_mappings BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = NEW.legacy_property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant legacy property mapping') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.inventory_property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant inventory property mapping') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS contacts_no_physical_delete BEFORE DELETE ON contacts BEGIN SELECT RAISE(ABORT, 'contacts require soft deletion'); END`,
  `CREATE TRIGGER IF NOT EXISTS developments_no_physical_delete BEFORE DELETE ON developments BEGIN SELECT RAISE(ABORT, 'developments require soft deletion'); END`,
  `CREATE TRIGGER IF NOT EXISTS inventory_properties_no_physical_delete BEFORE DELETE ON inventory_properties BEGIN SELECT RAISE(ABORT, 'inventory properties require soft deletion'); END`,
  `CREATE TRIGGER IF NOT EXISTS units_no_physical_delete BEFORE DELETE ON units BEGIN SELECT RAISE(ABORT, 'units require soft deletion'); END`,
  `CREATE TRIGGER IF NOT EXISTS ownership_no_physical_delete BEFORE DELETE ON ownership_interests BEGIN SELECT RAISE(ABORT, 'ownership interests require soft deletion'); END`,
  `CREATE TRIGGER IF NOT EXISTS listing_agreements_no_physical_delete BEFORE DELETE ON listing_agreements BEGIN SELECT RAISE(ABORT, 'listing agreements require soft deletion'); END`,
];

const backfillStatements = [
  `INSERT OR IGNORE INTO contacts (
    id, agency_id, contact_type, display_name, display_name_ar, preferred_language,
    normalized_name, notes, do_not_contact, created_by, created_at, updated_at, deleted_at
  )
  SELECT
    'legacy_contact_' || l.id,
    l.agency_id,
    'person',
    l.name,
    l.name_ar,
    CASE WHEN l.name_ar IS NOT NULL THEN 'ar' ELSE 'en' END,
    lower(trim(l.name)),
    l.notes,
    0,
    l.assigned_to,
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    COALESCE(l.updated_at, l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    l.deleted_at
  FROM leads l
  WHERE l.agency_id IS NOT NULL`,
  `INSERT OR IGNORE INTO lead_contact_mappings (id, agency_id, lead_id, contact_id, created_at)
  SELECT
    'lead_contact_' || l.id,
    l.agency_id,
    l.id,
    'legacy_contact_' || l.id,
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM leads l
  WHERE l.agency_id IS NOT NULL`,
  `INSERT OR IGNORE INTO contact_roles (
    id, agency_id, contact_id, role, is_primary, effective_from, created_at
  )
  SELECT
    'prospect_role_' || l.id,
    l.agency_id,
    'legacy_contact_' || l.id,
    'prospect',
    1,
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM leads l
  WHERE l.agency_id IS NOT NULL`,
  `INSERT OR IGNORE INTO contact_methods (
    id, agency_id, contact_id, method_type, value, normalized_value, label,
    is_primary, consent_status, created_at, updated_at
  )
  SELECT
    'phone_method_' || l.id,
    l.agency_id,
    'legacy_contact_' || l.id,
    'phone',
    l.phone,
    replace(replace(replace(replace(replace(trim(l.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
    'legacy',
    1,
    'unknown',
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    COALESCE(l.updated_at, l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM leads l
  WHERE l.agency_id IS NOT NULL AND l.phone IS NOT NULL AND trim(l.phone) <> ''`,
  `INSERT OR IGNORE INTO contact_methods (
    id, agency_id, contact_id, method_type, value, normalized_value, label,
    is_primary, consent_status, created_at, updated_at
  )
  SELECT
    'email_method_' || l.id,
    l.agency_id,
    'legacy_contact_' || l.id,
    'email',
    l.email,
    lower(trim(l.email)),
    'legacy',
    CASE WHEN l.phone IS NULL OR trim(l.phone) = '' THEN 1 ELSE 0 END,
    'unknown',
    COALESCE(l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    COALESCE(l.updated_at, l.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM leads l
  WHERE l.agency_id IS NOT NULL AND l.email IS NOT NULL AND trim(l.email) <> ''`,
  `INSERT OR IGNORE INTO inventory_properties (
    id, agency_id, asset_code, title, title_ar, property_type, purpose, status,
    description, description_ar, address_line1, city, country, built_area_sqm,
    sale_asking_price, currency, assigned_agent_id, created_by, created_at, updated_at, deleted_at
  )
  SELECT
    'inventory_' || p.id,
    p.agency_id,
    p.external_id,
    p.title,
    p.title_ar,
    COALESCE(p.type, 'other'),
    CASE WHEN p.status = 'rented' THEN 'rent' ELSE 'sale' END,
    CASE
      WHEN p.status IN ('available','reserved','sold','rented') THEN p.status
      ELSE 'available'
    END,
    p.description,
    p.description_ar,
    p.location,
    p.city,
    p.country,
    p.area_sqm,
    p.price,
    COALESCE(p.currency, 'USD'),
    p.listed_by,
    p.listed_by,
    COALESCE(p.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    COALESCE(p.updated_at, p.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    p.deleted_at
  FROM properties p
  WHERE p.agency_id IS NOT NULL`,
  `INSERT OR IGNORE INTO legacy_property_mappings (
    id, agency_id, legacy_property_id, inventory_property_id, created_at
  )
  SELECT
    'legacy_property_' || p.id,
    p.agency_id,
    p.id,
    'inventory_' || p.id,
    COALESCE(p.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM properties p
  WHERE p.agency_id IS NOT NULL`,
  `INSERT OR IGNORE INTO availability_history (
    id, agency_id, property_id, status, effective_from, changed_by, created_at
  )
  SELECT
    'initial_availability_' || p.id,
    p.agency_id,
    'inventory_' || p.id,
    CASE WHEN p.status IN ('available','reserved','sold','rented') THEN p.status ELSE 'available' END,
    COALESCE(p.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000),
    p.listed_by,
    COALESCE(p.created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
  FROM properties p
  WHERE p.agency_id IS NOT NULL`,
];

export async function runCoreDomainMigrations(): Promise<void> {
  await databaseClient.execute("PRAGMA foreign_keys = ON");
  for (const statement of createStatements) await databaseClient.execute(statement);
  for (const statement of indexStatements) await databaseClient.execute(statement);
  for (const statement of validationTriggers) await databaseClient.execute(statement);
  for (const statement of backfillStatements) await databaseClient.execute(statement);
}
