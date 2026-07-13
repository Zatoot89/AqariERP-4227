import { databaseClient } from "./index";

type TableName =
  | "agencies"
  | "profiles"
  | "leads"
  | "properties"
  | "lead_properties"
  | "tasks";

async function hasColumn(table: TableName, column: string): Promise<boolean> {
  const result = await databaseClient.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => String(row.name) === column);
}

async function addColumn(table: TableName, column: string, definition: string): Promise<void> {
  if (!(await hasColumn(table, column))) {
    await databaseClient.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const createStatements = [
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    accepted_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    agency_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    checksum_sha256 TEXT,
    uploaded_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE CASCADE
  )`,
];

const indexStatements = [
  "CREATE INDEX IF NOT EXISTS invitations_agency_expiry_idx ON invitations (agency_id, expires_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS invitations_agency_email_unique ON invitations (agency_id, email)",
  "CREATE INDEX IF NOT EXISTS profiles_agency_role_idx ON profiles (agency_id, role, active)",
  "CREATE INDEX IF NOT EXISTS leads_agency_stage_created_idx ON leads (agency_id, stage, created_at)",
  "CREATE INDEX IF NOT EXISTS leads_agency_assignee_idx ON leads (agency_id, assigned_to, deleted_at)",
  "CREATE INDEX IF NOT EXISTS leads_agency_phone_idx ON leads (agency_id, phone)",
  "CREATE INDEX IF NOT EXISTS leads_agency_email_idx ON leads (agency_id, email)",
  "CREATE INDEX IF NOT EXISTS properties_agency_status_created_idx ON properties (agency_id, status, created_at)",
  "CREATE INDEX IF NOT EXISTS properties_agency_type_status_idx ON properties (agency_id, type, status)",
  "CREATE INDEX IF NOT EXISTS properties_agency_city_idx ON properties (agency_id, city)",
  "CREATE INDEX IF NOT EXISTS lead_properties_property_idx ON lead_properties (agency_id, property_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS lead_properties_agency_pair_unique ON lead_properties (agency_id, lead_id, property_id)",
  "CREATE INDEX IF NOT EXISTS tasks_agency_assignee_done_due_idx ON tasks (agency_id, assigned_to, done, due_at)",
  "CREATE INDEX IF NOT EXISTS tasks_agency_lead_idx ON tasks (agency_id, lead_id, deleted_at)",
  "CREATE INDEX IF NOT EXISTS activities_agency_created_idx ON activities (agency_id, created_at)",
  "CREATE INDEX IF NOT EXISTS activities_lead_created_idx ON activities (agency_id, lead_id, created_at)",
  "CREATE INDEX IF NOT EXISTS audit_logs_agency_created_idx ON audit_logs (agency_id, created_at)",
  "CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (agency_id, entity_type, entity_id)",
  "CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (agency_id, actor_id, created_at)",
  "CREATE INDEX IF NOT EXISTS attachments_agency_owner_idx ON attachments (agency_id, owner_type, owner_id, status)",
  "CREATE INDEX IF NOT EXISTS attachments_agency_status_created_idx ON attachments (agency_id, status, created_at)",
  "CREATE INDEX IF NOT EXISTS attachments_uploader_status_idx ON attachments (uploaded_by, status, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_agency_message_unique ON whatsapp_messages (agency_id, wa_message_id)",
  "CREATE INDEX IF NOT EXISTS whatsapp_agency_lead_received_idx ON whatsapp_messages (agency_id, lead_id, received_at)",
];

const triggerStatements = [
  `CREATE TRIGGER IF NOT EXISTS profiles_validate_insert
    BEFORE INSERT ON profiles BEGIN
      SELECT CASE WHEN NEW.role NOT IN ('admin','manager','agent') THEN RAISE(ABORT, 'invalid profile role') END;
      SELECT CASE WHEN NEW.active NOT IN (0,1) THEN RAISE(ABORT, 'invalid profile active flag') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS profiles_validate_update
    BEFORE UPDATE OF role, active ON profiles BEGIN
      SELECT CASE WHEN NEW.role NOT IN ('admin','manager','agent') THEN RAISE(ABORT, 'invalid profile role') END;
      SELECT CASE WHEN NEW.active NOT IN (0,1) THEN RAISE(ABORT, 'invalid profile active flag') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS leads_validate_insert
    BEFORE INSERT ON leads BEGIN
      SELECT CASE WHEN NEW.stage NOT IN ('new','contacted','viewing','offer','closed','lost') THEN RAISE(ABORT, 'invalid lead stage') END;
      SELECT CASE WHEN NEW.source NOT IN ('whatsapp','propertyfinder','bayut','dubizzle','aqarmap','manual','website','referral') THEN RAISE(ABORT, 'invalid lead source') END;
      SELECT CASE WHEN NEW.budget_min IS NOT NULL AND NEW.budget_max IS NOT NULL AND NEW.budget_min > NEW.budget_max THEN RAISE(ABORT, 'invalid lead budget range') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS leads_validate_update
    BEFORE UPDATE OF stage, source, budget_min, budget_max ON leads BEGIN
      SELECT CASE WHEN NEW.stage NOT IN ('new','contacted','viewing','offer','closed','lost') THEN RAISE(ABORT, 'invalid lead stage') END;
      SELECT CASE WHEN NEW.source NOT IN ('whatsapp','propertyfinder','bayut','dubizzle','aqarmap','manual','website','referral') THEN RAISE(ABORT, 'invalid lead source') END;
      SELECT CASE WHEN NEW.budget_min IS NOT NULL AND NEW.budget_max IS NOT NULL AND NEW.budget_min > NEW.budget_max THEN RAISE(ABORT, 'invalid lead budget range') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS properties_validate_insert
    BEFORE INSERT ON properties BEGIN
      SELECT CASE WHEN NEW.status NOT IN ('available','reserved','sold','rented') THEN RAISE(ABORT, 'invalid property status') END;
      SELECT CASE WHEN NEW.type IS NOT NULL AND NEW.type NOT IN ('apartment','villa','office','land','commercial') THEN RAISE(ABORT, 'invalid property type') END;
      SELECT CASE WHEN NEW.price IS NOT NULL AND NEW.price < 0 THEN RAISE(ABORT, 'invalid property price') END;
      SELECT CASE WHEN NEW.area_sqm IS NOT NULL AND NEW.area_sqm < 0 THEN RAISE(ABORT, 'invalid property area') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS properties_validate_update
    BEFORE UPDATE OF status, type, price, area_sqm ON properties BEGIN
      SELECT CASE WHEN NEW.status NOT IN ('available','reserved','sold','rented') THEN RAISE(ABORT, 'invalid property status') END;
      SELECT CASE WHEN NEW.type IS NOT NULL AND NEW.type NOT IN ('apartment','villa','office','land','commercial') THEN RAISE(ABORT, 'invalid property type') END;
      SELECT CASE WHEN NEW.price IS NOT NULL AND NEW.price < 0 THEN RAISE(ABORT, 'invalid property price') END;
      SELECT CASE WHEN NEW.area_sqm IS NOT NULL AND NEW.area_sqm < 0 THEN RAISE(ABORT, 'invalid property area') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS tasks_validate_insert
    BEFORE INSERT ON tasks BEGIN
      SELECT CASE WHEN NEW.done NOT IN (0,1) THEN RAISE(ABORT, 'invalid task done flag') END;
      SELECT CASE WHEN NEW.type NOT IN ('call','viewing','follow_up','document','other') THEN RAISE(ABORT, 'invalid task type') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS tasks_validate_update
    BEFORE UPDATE OF done, type ON tasks BEGIN
      SELECT CASE WHEN NEW.done NOT IN (0,1) THEN RAISE(ABORT, 'invalid task done flag') END;
      SELECT CASE WHEN NEW.type NOT IN ('call','viewing','follow_up','document','other') THEN RAISE(ABORT, 'invalid task type') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS attachments_validate_insert
    BEFORE INSERT ON attachments BEGIN
      SELECT CASE WHEN NEW.owner_type NOT IN ('property_draft','property','agency_logo') THEN RAISE(ABORT, 'invalid attachment owner type') END;
      SELECT CASE WHEN NEW.status NOT IN ('pending','active','delete_pending','purged','failed') THEN RAISE(ABORT, 'invalid attachment status') END;
      SELECT CASE WHEN NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','image/avif') THEN RAISE(ABORT, 'invalid attachment mime type') END;
      SELECT CASE WHEN NEW.size_bytes <= 0 OR NEW.size_bytes > 10485760 THEN RAISE(ABORT, 'invalid attachment size') END;
      SELECT CASE WHEN NEW.checksum_sha256 IS NOT NULL AND length(NEW.checksum_sha256) <> 64 THEN RAISE(ABORT, 'invalid attachment checksum') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS attachments_validate_update
    BEFORE UPDATE OF owner_type, status, mime_type, size_bytes, checksum_sha256 ON attachments BEGIN
      SELECT CASE WHEN NEW.owner_type NOT IN ('property_draft','property','agency_logo') THEN RAISE(ABORT, 'invalid attachment owner type') END;
      SELECT CASE WHEN NEW.status NOT IN ('pending','active','delete_pending','purged','failed') THEN RAISE(ABORT, 'invalid attachment status') END;
      SELECT CASE WHEN NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','image/avif') THEN RAISE(ABORT, 'invalid attachment mime type') END;
      SELECT CASE WHEN NEW.size_bytes <= 0 OR NEW.size_bytes > 10485760 THEN RAISE(ABORT, 'invalid attachment size') END;
      SELECT CASE WHEN NEW.checksum_sha256 IS NOT NULL AND length(NEW.checksum_sha256) <> 64 THEN RAISE(ABORT, 'invalid attachment checksum') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
    BEFORE UPDATE ON audit_logs BEGIN
      SELECT RAISE(ABORT, 'audit logs are append-only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
    BEFORE DELETE ON audit_logs BEGIN
      SELECT RAISE(ABORT, 'audit logs are append-only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS activities_no_update
    BEFORE UPDATE ON activities BEGIN
      SELECT RAISE(ABORT, 'activities are append-only');
    END`,
  `CREATE TRIGGER IF NOT EXISTS leads_no_physical_delete
    BEFORE DELETE ON leads BEGIN
      SELECT RAISE(ABORT, 'leads require soft deletion');
    END`,
  `CREATE TRIGGER IF NOT EXISTS properties_no_physical_delete
    BEFORE DELETE ON properties BEGIN
      SELECT RAISE(ABORT, 'properties require soft deletion');
    END`,
  `CREATE TRIGGER IF NOT EXISTS tasks_no_physical_delete
    BEFORE DELETE ON tasks BEGIN
      SELECT RAISE(ABORT, 'tasks require soft deletion');
    END`,
  `CREATE TRIGGER IF NOT EXISTS attachments_no_physical_delete
    BEFORE DELETE ON attachments BEGIN
      SELECT RAISE(ABORT, 'attachments require lifecycle cleanup');
    END`,
];

export async function runApplicationMigrations(): Promise<void> {
  await databaseClient.execute("PRAGMA foreign_keys = ON");

  for (const statement of createStatements) {
    await databaseClient.execute(statement);
  }

  await addColumn("agencies", "updated_at", "INTEGER");
  await addColumn("profiles", "updated_at", "INTEGER");
  await addColumn("leads", "deleted_at", "INTEGER");
  await addColumn("properties", "deleted_at", "INTEGER");
  await addColumn("tasks", "updated_at", "INTEGER");
  await addColumn("tasks", "deleted_at", "INTEGER");
  await addColumn("lead_properties", "agency_id", "TEXT");

  const now = Date.now();
  await databaseClient.execute({
    sql: "UPDATE agencies SET updated_at = COALESCE(updated_at, created_at, ?)",
    args: [now],
  });
  await databaseClient.execute({
    sql: "UPDATE profiles SET updated_at = COALESCE(updated_at, created_at, ?)",
    args: [now],
  });
  await databaseClient.execute({
    sql: "UPDATE tasks SET updated_at = COALESCE(updated_at, created_at, ?)",
    args: [now],
  });
  await databaseClient.execute(
    `UPDATE lead_properties
       SET agency_id = (
         SELECT leads.agency_id FROM leads WHERE leads.id = lead_properties.lead_id
       )
     WHERE agency_id IS NULL`,
  );
  await databaseClient.execute(
    `DELETE FROM lead_properties
     WHERE rowid NOT IN (
       SELECT MIN(rowid) FROM lead_properties
       GROUP BY agency_id, lead_id, property_id
     )`,
  );

  for (const statement of indexStatements) {
    await databaseClient.execute(statement);
  }
  for (const statement of triggerStatements) {
    await databaseClient.execute(statement);
  }
}
