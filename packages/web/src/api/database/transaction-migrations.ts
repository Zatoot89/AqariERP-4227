import { databaseClient } from "./index";

const tables = [
  `CREATE TABLE IF NOT EXISTS viewings (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, viewing_number TEXT NOT NULL,
    property_id TEXT, unit_id TEXT, contact_id TEXT NOT NULL, lead_id TEXT,
    assigned_agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_at INTEGER NOT NULL, completed_at INTEGER, feedback TEXT, rating INTEGER,
    cancellation_reason TEXT, created_by TEXT, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, deleted_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_agent_id) REFERENCES profiles(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, offer_number TEXT NOT NULL,
    negotiation_root_id TEXT NOT NULL, parent_offer_id TEXT, version INTEGER NOT NULL DEFAULT 1,
    property_id TEXT, unit_id TEXT, buyer_contact_id TEXT NOT NULL, seller_contact_id TEXT,
    lead_id TEXT, status TEXT NOT NULL DEFAULT 'draft', offered_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD', valid_until INTEGER, terms TEXT,
    submitted_at INTEGER, accepted_at INTEGER, rejected_at INTEGER, created_by TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (seller_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, reservation_number TEXT NOT NULL,
    unit_id TEXT NOT NULL, contact_id TEXT NOT NULL, offer_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft', starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    deposit_amount REAL, currency TEXT NOT NULL DEFAULT 'USD', notes TEXT,
    converted_transaction_type TEXT, converted_transaction_id TEXT,
    activated_at INTEGER, released_at INTEGER, created_by TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, lease_number TEXT NOT NULL,
    parent_lease_id TEXT, unit_id TEXT NOT NULL, offer_id TEXT, reservation_id TEXT,
    landlord_contact_id TEXT NOT NULL, tenant_contact_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
    notice_days INTEGER NOT NULL DEFAULT 30, rent_amount REAL NOT NULL,
    rent_frequency TEXT NOT NULL DEFAULT 'annual', security_deposit REAL,
    currency TEXT NOT NULL DEFAULT 'USD', terms TEXT, handover_at INTEGER,
    termination_at INTEGER, termination_reason TEXT, approved_at INTEGER,
    activated_at INTEGER, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
    FOREIGN KEY (landlord_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, sale_number TEXT NOT NULL,
    property_id TEXT, unit_id TEXT, offer_id TEXT, reservation_id TEXT,
    buyer_contact_id TEXT NOT NULL, seller_contact_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', agreed_value REAL NOT NULL,
    deposit_amount REAL, currency TEXT NOT NULL DEFAULT 'USD', agreement_at INTEGER,
    expected_handover_at INTEGER, handover_at INTEGER, completed_at INTEGER,
    termination_at INTEGER, termination_reason TEXT, terms TEXT, approved_at INTEGER,
    activated_at INTEGER, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
    FOREIGN KEY (buyer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (seller_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_parties (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, transaction_type TEXT NOT NULL,
    transaction_id TEXT NOT NULL, contact_id TEXT NOT NULL, party_role TEXT NOT NULL,
    is_signatory INTEGER NOT NULL DEFAULT 0, signature_status TEXT NOT NULL DEFAULT 'not_requested',
    signed_at INTEGER, created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sale_milestones (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, sale_id TEXT NOT NULL,
    name TEXT NOT NULL, name_ar TEXT, amount REAL, due_at INTEGER,
    status TEXT NOT NULL DEFAULT 'pending', completed_at INTEGER, notes TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_approvals (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, transaction_type TEXT NOT NULL,
    transaction_id TEXT NOT NULL, requested_by TEXT NOT NULL, approver_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', requested_at INTEGER NOT NULL,
    decided_at INTEGER, note TEXT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE RESTRICT,
    FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_state_events (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, transaction_type TEXT NOT NULL,
    transaction_id TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, actor_id TEXT,
    reason TEXT, metadata TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS document_sequences (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, sequence_key TEXT NOT NULL,
    document_type TEXT NOT NULL, year INTEGER NOT NULL, prefix TEXT NOT NULL,
    padding INTEGER NOT NULL DEFAULT 6, next_number INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_templates (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, template_type TEXT NOT NULL,
    name TEXT NOT NULL, language TEXT NOT NULL, version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1, body_html TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_documents (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, transaction_type TEXT NOT NULL,
    transaction_id TEXT NOT NULL, document_number TEXT NOT NULL, template_id TEXT NOT NULL,
    template_version INTEGER NOT NULL, language TEXT NOT NULL, schema_version INTEGER NOT NULL,
    snapshot TEXT NOT NULL, rendered_html TEXT NOT NULL, checksum_sha256 TEXT NOT NULL,
    pdf_attachment_id TEXT, status TEXT NOT NULL DEFAULT 'html_ready', created_by TEXT,
    created_at INTEGER NOT NULL, voided_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES transaction_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (pdf_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
];

const indexes = [
  "CREATE UNIQUE INDEX IF NOT EXISTS viewings_agency_number_unique ON viewings (agency_id, viewing_number)",
  "CREATE INDEX IF NOT EXISTS viewings_agency_schedule_idx ON viewings (agency_id, scheduled_at, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS offers_agency_number_unique ON offers (agency_id, offer_number)",
  "CREATE UNIQUE INDEX IF NOT EXISTS offers_negotiation_version_unique ON offers (agency_id, negotiation_root_id, version)",
  "CREATE INDEX IF NOT EXISTS offers_agency_status_idx ON offers (agency_id, status, updated_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS reservations_agency_number_unique ON reservations (agency_id, reservation_number)",
  "CREATE INDEX IF NOT EXISTS reservations_unit_status_idx ON reservations (agency_id, unit_id, status, expires_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS leases_agency_number_unique ON leases (agency_id, lease_number)",
  "CREATE INDEX IF NOT EXISTS leases_unit_period_idx ON leases (agency_id, unit_id, starts_at, ends_at, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS sales_agency_number_unique ON sales (agency_id, sale_number)",
  "CREATE INDEX IF NOT EXISTS sales_unit_status_idx ON sales (agency_id, unit_id, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS transaction_parties_unique ON transaction_parties (agency_id, transaction_type, transaction_id, contact_id, party_role)",
  "CREATE INDEX IF NOT EXISTS transaction_parties_transaction_idx ON transaction_parties (agency_id, transaction_type, transaction_id)",
  "CREATE INDEX IF NOT EXISTS sale_milestones_sale_idx ON sale_milestones (agency_id, sale_id, status)",
  "CREATE INDEX IF NOT EXISTS transaction_approvals_transaction_idx ON transaction_approvals (agency_id, transaction_type, transaction_id, status)",
  "CREATE INDEX IF NOT EXISTS transaction_state_events_idx ON transaction_state_events (agency_id, transaction_type, transaction_id, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS document_sequences_unique ON document_sequences (agency_id, sequence_key)",
  "CREATE UNIQUE INDEX IF NOT EXISTS transaction_templates_version_unique ON transaction_templates (agency_id, template_type, language, version)",
  "CREATE INDEX IF NOT EXISTS transaction_templates_active_idx ON transaction_templates (agency_id, template_type, language, active)",
  "CREATE UNIQUE INDEX IF NOT EXISTS transaction_documents_number_unique ON transaction_documents (agency_id, document_number)",
  "CREATE INDEX IF NOT EXISTS transaction_documents_transaction_idx ON transaction_documents (agency_id, transaction_type, transaction_id, created_at)",
];

const validationTriggers = [
  `CREATE TRIGGER IF NOT EXISTS viewings_validate_insert BEFORE INSERT ON viewings BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'viewing must target exactly one asset') END;
    SELECT CASE WHEN NEW.status NOT IN ('scheduled','completed','cancelled','no_show') THEN RAISE(ABORT, 'invalid viewing status') END;
    SELECT CASE WHEN NEW.rating IS NOT NULL AND (NEW.rating < 1 OR NEW.rating > 5) THEN RAISE(ABORT, 'invalid viewing rating') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS offers_validate_insert BEFORE INSERT ON offers BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'offer must target exactly one asset') END;
    SELECT CASE WHEN NEW.status NOT IN ('draft','submitted','under_review','countered','accepted','rejected','expired','withdrawn') THEN RAISE(ABORT, 'invalid offer status') END;
    SELECT CASE WHEN NEW.offered_amount < 0 THEN RAISE(ABORT, 'invalid offer amount') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS reservations_validate_insert BEFORE INSERT ON reservations BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('draft','active','converted','released','expired','cancelled') THEN RAISE(ABORT, 'invalid reservation status') END;
    SELECT CASE WHEN NEW.expires_at <= NEW.starts_at THEN RAISE(ABORT, 'invalid reservation period') END;
    SELECT CASE WHEN NEW.deposit_amount IS NOT NULL AND NEW.deposit_amount < 0 THEN RAISE(ABORT, 'invalid reservation deposit') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS leases_validate_insert BEFORE INSERT ON leases BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('draft','pending_approval','active','renewal_due','renewed','rejected','terminated','expired','completed','cancelled') THEN RAISE(ABORT, 'invalid lease status') END;
    SELECT CASE WHEN NEW.ends_at <= NEW.starts_at THEN RAISE(ABORT, 'invalid lease period') END;
    SELECT CASE WHEN NEW.rent_amount < 0 OR NEW.notice_days < 0 THEN RAISE(ABORT, 'invalid lease financial terms') END;
    SELECT CASE WHEN NEW.rent_frequency NOT IN ('monthly','quarterly','semiannual','annual','custom') THEN RAISE(ABORT, 'invalid rent frequency') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS sales_validate_insert BEFORE INSERT ON sales BEGIN
    SELECT CASE WHEN (NEW.property_id IS NULL) = (NEW.unit_id IS NULL) THEN RAISE(ABORT, 'sale must target exactly one asset') END;
    SELECT CASE WHEN NEW.status NOT IN ('draft','pending_approval','active','completed','rejected','terminated','cancelled') THEN RAISE(ABORT, 'invalid sale status') END;
    SELECT CASE WHEN NEW.agreed_value < 0 OR (NEW.deposit_amount IS NOT NULL AND NEW.deposit_amount < 0) THEN RAISE(ABORT, 'invalid sale values') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS transaction_parties_validate_insert BEFORE INSERT ON transaction_parties BEGIN
    SELECT CASE WHEN NEW.transaction_type NOT IN ('offer','reservation','lease','sale') THEN RAISE(ABORT, 'invalid party transaction type') END;
    SELECT CASE WHEN NEW.party_role NOT IN ('buyer','seller','landlord','tenant','occupant','guarantor','broker','witness','principal') THEN RAISE(ABORT, 'invalid party role') END;
    SELECT CASE WHEN NEW.is_signatory NOT IN (0,1) THEN RAISE(ABORT, 'invalid signatory flag') END;
    SELECT CASE WHEN NEW.signature_status NOT IN ('not_requested','requested','signed','declined') THEN RAISE(ABORT, 'invalid signature status') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS state_events_no_update BEFORE UPDATE ON transaction_state_events BEGIN SELECT RAISE(ABORT, 'state events are append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS state_events_no_delete BEFORE DELETE ON transaction_state_events BEGIN SELECT RAISE(ABORT, 'state events are append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS transaction_templates_no_update BEFORE UPDATE ON transaction_templates BEGIN SELECT RAISE(ABORT, 'template versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS transaction_templates_no_delete BEFORE DELETE ON transaction_templates BEGIN SELECT RAISE(ABORT, 'template versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS transaction_documents_no_delete BEFORE DELETE ON transaction_documents BEGIN SELECT RAISE(ABORT, 'transaction documents are immutable'); END`,
];

const conflictTriggers = [
  `CREATE TRIGGER IF NOT EXISTS reservations_prevent_conflict_insert BEFORE INSERT ON reservations WHEN NEW.status = 'active' BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.status = 'active' AND r.expires_at > NEW.starts_at AND NEW.expires_at > r.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.status IN ('pending_approval','active','renewal_due')
      AND l.ends_at > NEW.starts_at AND NEW.expires_at > l.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting lease') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has an active sale') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS reservations_prevent_conflict_update BEFORE UPDATE OF status, starts_at, expires_at, unit_id ON reservations WHEN NEW.status = 'active' BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.id <> NEW.id AND r.status = 'active' AND r.expires_at > NEW.starts_at AND NEW.expires_at > r.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.status IN ('pending_approval','active','renewal_due')
      AND l.ends_at > NEW.starts_at AND NEW.expires_at > l.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting lease') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has an active sale') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS leases_prevent_conflict_insert BEFORE INSERT ON leases WHEN NEW.status IN ('pending_approval','active','renewal_due') BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.status IN ('pending_approval','active','renewal_due')
      AND l.ends_at > NEW.starts_at AND NEW.ends_at > l.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting lease') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.status = 'active' AND r.expires_at > NEW.starts_at AND NEW.ends_at > r.starts_at
    ) THEN RAISE(ABORT, 'unit has an active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has an active sale') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS leases_prevent_conflict_update BEFORE UPDATE OF status, starts_at, ends_at, unit_id ON leases WHEN NEW.status IN ('pending_approval','active','renewal_due') BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.id <> NEW.id AND l.status IN ('pending_approval','active','renewal_due')
      AND l.ends_at > NEW.starts_at AND NEW.ends_at > l.starts_at
    ) THEN RAISE(ABORT, 'unit has a conflicting lease') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.status = 'active' AND r.expires_at > NEW.starts_at AND NEW.ends_at > r.starts_at
    ) THEN RAISE(ABORT, 'unit has an active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has an active sale') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS sales_prevent_conflict_insert BEFORE INSERT ON sales WHEN NEW.unit_id IS NOT NULL AND NEW.status IN ('pending_approval','active') BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has a conflicting sale') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.status = 'active'
    ) THEN RAISE(ABORT, 'unit has an active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.status IN ('pending_approval','active','renewal_due')
    ) THEN RAISE(ABORT, 'unit has an active lease') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS sales_prevent_conflict_update BEFORE UPDATE OF status, unit_id ON sales WHEN NEW.unit_id IS NOT NULL AND NEW.status IN ('pending_approval','active') BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM sales s WHERE s.agency_id = NEW.agency_id AND s.unit_id = NEW.unit_id
      AND s.id <> NEW.id AND s.status IN ('pending_approval','active')
    ) THEN RAISE(ABORT, 'unit has a conflicting sale') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r WHERE r.agency_id = NEW.agency_id AND r.unit_id = NEW.unit_id
      AND r.status = 'active'
    ) THEN RAISE(ABORT, 'unit has an active reservation') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM leases l WHERE l.agency_id = NEW.agency_id AND l.unit_id = NEW.unit_id
      AND l.status IN ('pending_approval','active','renewal_due')
    ) THEN RAISE(ABORT, 'unit has an active lease') END;
  END`,
];

export async function runTransactionMigrations(): Promise<void> {
  await databaseClient.execute("PRAGMA foreign_keys = ON");
  for (const statement of tables) await databaseClient.execute(statement);
  for (const statement of indexes) await databaseClient.execute(statement);
  for (const statement of validationTriggers) await databaseClient.execute(statement);
  for (const statement of conflictTriggers) await databaseClient.execute(statement);
}
