import { databaseClient } from "./index";

const tables = [
  `CREATE TABLE IF NOT EXISTS finance_sequences (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, sequence_key TEXT NOT NULL,
    document_type TEXT NOT NULL, year INTEGER NOT NULL, prefix TEXT NOT NULL,
    padding INTEGER NOT NULL DEFAULT 6, next_number INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS payment_schedules (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, schedule_number TEXT NOT NULL,
    source_type TEXT NOT NULL, source_id TEXT, payer_contact_id TEXT NOT NULL,
    property_id TEXT, unit_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
    total_amount REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD', description TEXT, activated_at INTEGER,
    completed_at INTEGER, cancelled_at INTEGER, created_by TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (payer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_schedule_items (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, schedule_id TEXT NOT NULL,
    sequence INTEGER NOT NULL, label TEXT NOT NULL, label_ar TEXT, due_at INTEGER NOT NULL,
    amount REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', notes TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES payment_schedules(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, invoice_number TEXT NOT NULL,
    contact_id TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT,
    schedule_id TEXT, schedule_item_id TEXT, property_id TEXT, unit_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft', issue_date INTEGER NOT NULL, due_at INTEGER NOT NULL,
    subtotal REAL NOT NULL, tax_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0, balance_due REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD', notes TEXT, issued_at INTEGER, paid_at INTEGER,
    voided_at INTEGER, void_reason TEXT, created_by TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (schedule_id) REFERENCES payment_schedules(id) ON DELETE SET NULL,
    FOREIGN KEY (schedule_item_id) REFERENCES payment_schedule_items(id) ON DELETE SET NULL,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
    sequence INTEGER NOT NULL, description TEXT NOT NULL, description_ar TEXT,
    quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0, line_subtotal REAL NOT NULL,
    line_tax REAL NOT NULL DEFAULT 0, line_total REAL NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, receipt_number TEXT NOT NULL,
    contact_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'posted',
    payment_date INTEGER NOT NULL, amount REAL NOT NULL,
    allocated_amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
    payment_method TEXT NOT NULL, external_reference TEXT, cheque_number TEXT,
    bank_name TEXT, notes TEXT, received_by TEXT, created_at INTEGER NOT NULL,
    voided_at INTEGER, voided_by TEXT, void_reason TEXT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (received_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (voided_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS receipt_allocations (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    allocated_by TEXT, allocated_at INTEGER NOT NULL, reversed_at INTEGER,
    reversed_by TEXT, reversal_reason TEXT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (allocated_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (reversed_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, expense_number TEXT NOT NULL,
    category TEXT NOT NULL, vendor_contact_id TEXT, property_id TEXT, unit_id TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft', description TEXT NOT NULL,
    incurred_at INTEGER NOT NULL, due_at INTEGER, subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD', payment_method TEXT, payment_reference TEXT,
    notes TEXT, submitted_at INTEGER, approved_at INTEGER, approved_by TEXT,
    paid_at INTEGER, paid_by TEXT, rejection_reason TEXT, created_by TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES inventory_properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS commissions (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, commission_number TEXT NOT NULL,
    transaction_type TEXT NOT NULL, transaction_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', basis_type TEXT NOT NULL,
    basis_value REAL NOT NULL, transaction_value REAL NOT NULL,
    gross_commission REAL NOT NULL, approved_amount REAL,
    paid_amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
    notes TEXT, submitted_at INTEGER, approved_at INTEGER, approved_by TEXT,
    created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS commission_splits (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, commission_id TEXT NOT NULL,
    recipient_type TEXT NOT NULL, recipient_profile_id TEXT, recipient_contact_id TEXT,
    split_type TEXT NOT NULL, split_value REAL NOT NULL, amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_profile_id) REFERENCES profiles(id) ON DELETE RESTRICT,
    FOREIGN KEY (recipient_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS commission_payouts (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, commission_id TEXT NOT NULL,
    split_id TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
    payment_date INTEGER NOT NULL, payment_method TEXT NOT NULL,
    payment_reference TEXT, status TEXT NOT NULL DEFAULT 'posted',
    paid_by TEXT, created_at INTEGER NOT NULL, voided_at INTEGER, void_reason TEXT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT,
    FOREIGN KEY (split_id) REFERENCES commission_splits(id) ON DELETE RESTRICT,
    FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS finance_events (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, amount REAL, currency TEXT,
    actor_id TEXT, metadata TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS finance_reconciliation_runs (
    id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, status TEXT NOT NULL,
    discrepancy_count INTEGER NOT NULL DEFAULT 0, result TEXT NOT NULL,
    run_by TEXT, started_at INTEGER NOT NULL, completed_at INTEGER NOT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (run_by) REFERENCES profiles(id) ON DELETE SET NULL
  )`,
];

const indexes = [
  "CREATE UNIQUE INDEX IF NOT EXISTS finance_sequences_unique ON finance_sequences (agency_id, sequence_key)",
  "CREATE UNIQUE INDEX IF NOT EXISTS payment_schedules_agency_number_unique ON payment_schedules (agency_id, schedule_number)",
  "CREATE INDEX IF NOT EXISTS payment_schedules_source_idx ON payment_schedules (agency_id, source_type, source_id)",
  "CREATE INDEX IF NOT EXISTS payment_schedules_status_idx ON payment_schedules (agency_id, status, updated_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS payment_schedule_items_sequence_unique ON payment_schedule_items (agency_id, schedule_id, sequence)",
  "CREATE INDEX IF NOT EXISTS payment_schedule_items_due_idx ON payment_schedule_items (agency_id, status, due_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS invoices_agency_number_unique ON invoices (agency_id, invoice_number)",
  "CREATE INDEX IF NOT EXISTS invoices_contact_status_idx ON invoices (agency_id, contact_id, status)",
  "CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices (agency_id, status, due_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_sequence_unique ON invoice_lines (agency_id, invoice_id, sequence)",
  "CREATE UNIQUE INDEX IF NOT EXISTS receipts_agency_number_unique ON receipts (agency_id, receipt_number)",
  "CREATE INDEX IF NOT EXISTS receipts_contact_date_idx ON receipts (agency_id, contact_id, payment_date)",
  "CREATE INDEX IF NOT EXISTS receipt_allocations_receipt_idx ON receipt_allocations (agency_id, receipt_id, status)",
  "CREATE INDEX IF NOT EXISTS receipt_allocations_invoice_idx ON receipt_allocations (agency_id, invoice_id, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS expenses_agency_number_unique ON expenses (agency_id, expense_number)",
  "CREATE INDEX IF NOT EXISTS expenses_status_date_idx ON expenses (agency_id, status, incurred_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS commissions_agency_number_unique ON commissions (agency_id, commission_number)",
  "CREATE UNIQUE INDEX IF NOT EXISTS commissions_transaction_unique ON commissions (agency_id, transaction_type, transaction_id)",
  "CREATE INDEX IF NOT EXISTS commission_splits_commission_idx ON commission_splits (agency_id, commission_id, status)",
  "CREATE INDEX IF NOT EXISTS commission_payouts_split_idx ON commission_payouts (agency_id, split_id, status)",
  "CREATE INDEX IF NOT EXISTS finance_events_entity_idx ON finance_events (agency_id, entity_type, entity_id, created_at)",
  "CREATE INDEX IF NOT EXISTS finance_reconciliation_runs_idx ON finance_reconciliation_runs (agency_id, completed_at)",
];

const validationTriggers = [
  `CREATE TRIGGER IF NOT EXISTS payment_schedules_validate_insert BEFORE INSERT ON payment_schedules BEGIN
    SELECT CASE WHEN NEW.source_type NOT IN ('lease','sale','reservation','manual') THEN RAISE(ABORT, 'invalid schedule source') END;
    SELECT CASE WHEN NEW.status NOT IN ('draft','active','completed','cancelled') THEN RAISE(ABORT, 'invalid schedule status') END;
    SELECT CASE WHEN NEW.total_amount < 0 OR NEW.paid_amount < 0 OR NEW.paid_amount > NEW.total_amount THEN RAISE(ABORT, 'invalid schedule amounts') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS payment_schedule_items_validate_insert BEFORE INSERT ON payment_schedule_items BEGIN
    SELECT CASE WHEN NEW.amount <= 0 OR NEW.paid_amount < 0 OR NEW.paid_amount > NEW.amount THEN RAISE(ABORT, 'invalid schedule item amounts') END;
    SELECT CASE WHEN NEW.status NOT IN ('pending','partially_paid','paid','waived','overdue') THEN RAISE(ABORT, 'invalid schedule item status') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_schedules s WHERE s.id = NEW.schedule_id AND s.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant schedule item') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS invoices_validate_insert BEFORE INSERT ON invoices BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('draft','issued','partially_paid','paid','overdue','void') THEN RAISE(ABORT, 'invalid invoice status') END;
    SELECT CASE WHEN NEW.subtotal < 0 OR NEW.tax_amount < 0 OR NEW.discount_amount < 0 THEN RAISE(ABORT, 'invalid invoice totals') END;
    SELECT CASE WHEN ABS(NEW.total_amount - (NEW.subtotal + NEW.tax_amount - NEW.discount_amount)) > 0.009 THEN RAISE(ABORT, 'invoice total mismatch') END;
    SELECT CASE WHEN NEW.paid_amount < 0 OR NEW.balance_due < 0 OR ABS((NEW.paid_amount + NEW.balance_due) - NEW.total_amount) > 0.009 THEN RAISE(ABORT, 'invoice balance mismatch') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS invoice_lines_validate_insert BEFORE INSERT ON invoice_lines BEGIN
    SELECT CASE WHEN NEW.quantity <= 0 OR NEW.unit_price < 0 OR NEW.tax_rate < 0 THEN RAISE(ABORT, 'invalid invoice line') END;
    SELECT CASE WHEN ABS(NEW.line_subtotal - (NEW.quantity * NEW.unit_price)) > 0.009 THEN RAISE(ABORT, 'invoice line subtotal mismatch') END;
    SELECT CASE WHEN ABS(NEW.line_tax - (NEW.line_subtotal * NEW.tax_rate / 100.0)) > 0.009 THEN RAISE(ABORT, 'invoice line tax mismatch') END;
    SELECT CASE WHEN ABS(NEW.line_total - (NEW.line_subtotal + NEW.line_tax)) > 0.009 THEN RAISE(ABORT, 'invoice line total mismatch') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.agency_id = NEW.agency_id AND i.status = 'draft') THEN RAISE(ABORT, 'invoice lines require a draft invoice') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipts_validate_insert BEFORE INSERT ON receipts BEGIN
    SELECT CASE WHEN NEW.status <> 'posted' THEN RAISE(ABORT, 'new receipts must be posted') END;
    SELECT CASE WHEN NEW.amount <= 0 OR NEW.allocated_amount < 0 OR NEW.allocated_amount > NEW.amount THEN RAISE(ABORT, 'invalid receipt amounts') END;
    SELECT CASE WHEN NEW.payment_method NOT IN ('cash','card','bank_transfer','cheque','online','other') THEN RAISE(ABORT, 'invalid payment method') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS expenses_validate_insert BEFORE INSERT ON expenses BEGIN
    SELECT CASE WHEN NEW.status NOT IN ('draft','submitted','approved','rejected','paid','cancelled','void') THEN RAISE(ABORT, 'invalid expense status') END;
    SELECT CASE WHEN NEW.subtotal < 0 OR NEW.tax_amount < 0 OR ABS(NEW.total_amount - (NEW.subtotal + NEW.tax_amount)) > 0.009 THEN RAISE(ABORT, 'invalid expense total') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commissions_validate_insert BEFORE INSERT ON commissions BEGIN
    SELECT CASE WHEN NEW.transaction_type NOT IN ('lease','sale') THEN RAISE(ABORT, 'invalid commission transaction') END;
    SELECT CASE WHEN NEW.status NOT IN ('draft','pending_approval','approved','partially_paid','paid','rejected','cancelled') THEN RAISE(ABORT, 'invalid commission status') END;
    SELECT CASE WHEN NEW.basis_type NOT IN ('fixed','percentage') THEN RAISE(ABORT, 'invalid commission basis') END;
    SELECT CASE WHEN NEW.basis_value < 0 OR NEW.transaction_value < 0 OR NEW.gross_commission < 0 OR NEW.paid_amount < 0 THEN RAISE(ABORT, 'invalid commission amounts') END;
    SELECT CASE WHEN NEW.basis_type = 'percentage' AND ABS(NEW.gross_commission - (NEW.transaction_value * NEW.basis_value / 100.0)) > 0.009 THEN RAISE(ABORT, 'commission calculation mismatch') END;
    SELECT CASE WHEN NEW.basis_type = 'fixed' AND ABS(NEW.gross_commission - NEW.basis_value) > 0.009 THEN RAISE(ABORT, 'commission calculation mismatch') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commission_splits_validate_insert BEFORE INSERT ON commission_splits BEGIN
    SELECT CASE WHEN NEW.recipient_type NOT IN ('profile','contact') THEN RAISE(ABORT, 'invalid commission recipient') END;
    SELECT CASE WHEN (NEW.recipient_profile_id IS NULL) = (NEW.recipient_contact_id IS NULL) THEN RAISE(ABORT, 'provide exactly one commission recipient') END;
    SELECT CASE WHEN NEW.recipient_type = 'profile' AND NEW.recipient_profile_id IS NULL THEN RAISE(ABORT, 'profile recipient required') END;
    SELECT CASE WHEN NEW.recipient_type = 'contact' AND NEW.recipient_contact_id IS NULL THEN RAISE(ABORT, 'contact recipient required') END;
    SELECT CASE WHEN NEW.split_type NOT IN ('fixed','percentage') OR NEW.split_value < 0 OR NEW.amount < 0 OR NEW.paid_amount < 0 THEN RAISE(ABORT, 'invalid commission split') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM commissions c WHERE c.id = NEW.commission_id AND c.agency_id = NEW.agency_id AND c.status = 'draft') THEN RAISE(ABORT, 'commission splits require a draft commission') END;
    SELECT CASE WHEN NEW.split_type = 'percentage' AND (SELECT COALESCE(SUM(split_value),0) FROM commission_splits s WHERE s.commission_id = NEW.commission_id AND s.split_type = 'percentage') + NEW.split_value > 100.0001 THEN RAISE(ABORT, 'commission split percentage exceeds 100') END;
    SELECT CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM commission_splits s WHERE s.commission_id = NEW.commission_id) + NEW.amount > (SELECT gross_commission + 0.009 FROM commissions c WHERE c.id = NEW.commission_id) THEN RAISE(ABORT, 'commission split amount exceeds gross commission') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS finance_events_no_update BEFORE UPDATE ON finance_events BEGIN SELECT RAISE(ABORT, 'finance events are append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS finance_events_no_delete BEFORE DELETE ON finance_events BEGIN SELECT RAISE(ABORT, 'finance events are append-only'); END`,
];

const tenantTriggers = [
  `CREATE TRIGGER IF NOT EXISTS payment_schedules_tenant_insert BEFORE INSERT ON payment_schedules BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.payer_contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant schedule payer') END;
    SELECT CASE WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant schedule property') END;
    SELECT CASE WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units u WHERE u.id = NEW.unit_id AND u.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant schedule unit') END;
    SELECT CASE WHEN NEW.source_type = 'lease' AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.id = NEW.source_id AND l.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'invalid lease schedule source') END;
    SELECT CASE WHEN NEW.source_type = 'sale' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = NEW.source_id AND s.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'invalid sale schedule source') END;
    SELECT CASE WHEN NEW.source_type = 'reservation' AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = NEW.source_id AND r.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'invalid reservation schedule source') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS invoices_tenant_insert BEFORE INSERT ON invoices BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant invoice contact') END;
    SELECT CASE WHEN NEW.schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_schedules s WHERE s.id = NEW.schedule_id AND s.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant invoice schedule') END;
    SELECT CASE WHEN NEW.schedule_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_schedule_items i WHERE i.id = NEW.schedule_item_id AND i.agency_id = NEW.agency_id AND (NEW.schedule_id IS NULL OR i.schedule_id = NEW.schedule_id)) THEN RAISE(ABORT, 'cross-tenant invoice schedule item') END;
    SELECT CASE WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant invoice property') END;
    SELECT CASE WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units u WHERE u.id = NEW.unit_id AND u.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant invoice unit') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipts_tenant_insert BEFORE INSERT ON receipts BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant receipt contact') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS expenses_tenant_insert BEFORE INSERT ON expenses BEGIN
    SELECT CASE WHEN NEW.vendor_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.vendor_contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant expense vendor') END;
    SELECT CASE WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_properties p WHERE p.id = NEW.property_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant expense property') END;
    SELECT CASE WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM units u WHERE u.id = NEW.unit_id AND u.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant expense unit') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commissions_tenant_insert BEFORE INSERT ON commissions BEGIN
    SELECT CASE WHEN NEW.transaction_type = 'lease' AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.id = NEW.transaction_id AND l.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant commission lease') END;
    SELECT CASE WHEN NEW.transaction_type = 'sale' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = NEW.transaction_id AND s.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant commission sale') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commission_splits_tenant_insert BEFORE INSERT ON commission_splits BEGIN
    SELECT CASE WHEN NEW.recipient_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = NEW.recipient_profile_id AND p.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant commission profile') END;
    SELECT CASE WHEN NEW.recipient_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.recipient_contact_id AND c.agency_id = NEW.agency_id) THEN RAISE(ABORT, 'cross-tenant commission contact') END;
  END`,
];

const stateTriggers = [
  `CREATE TRIGGER IF NOT EXISTS schedules_state_transition BEFORE UPDATE OF status ON payment_schedules WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT ((OLD.status = 'draft' AND NEW.status IN ('active','cancelled')) OR (OLD.status = 'active' AND NEW.status IN ('completed','cancelled'))) THEN RAISE(ABORT, 'invalid schedule transition') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS invoices_state_transition BEFORE UPDATE OF status ON invoices WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (
      (OLD.status = 'draft' AND NEW.status IN ('issued','void')) OR
      (OLD.status = 'issued' AND NEW.status IN ('partially_paid','paid','overdue','void')) OR
      (OLD.status = 'partially_paid' AND NEW.status IN ('paid','overdue','void')) OR
      (OLD.status = 'overdue' AND NEW.status IN ('partially_paid','paid','void'))
    ) THEN RAISE(ABORT, 'invalid invoice transition') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipts_state_transition BEFORE UPDATE OF status ON receipts WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (OLD.status = 'posted' AND NEW.status = 'void') THEN RAISE(ABORT, 'invalid receipt transition') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS expenses_state_transition BEFORE UPDATE OF status ON expenses WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (
      (OLD.status = 'draft' AND NEW.status IN ('submitted','cancelled')) OR
      (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected','cancelled')) OR
      (OLD.status = 'approved' AND NEW.status IN ('paid','void'))
    ) THEN RAISE(ABORT, 'invalid expense transition') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commissions_state_transition BEFORE UPDATE OF status ON commissions WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (
      (OLD.status = 'draft' AND NEW.status IN ('pending_approval','cancelled')) OR
      (OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected','cancelled')) OR
      (OLD.status = 'approved' AND NEW.status IN ('partially_paid','paid','cancelled')) OR
      (OLD.status = 'partially_paid' AND NEW.status IN ('paid','cancelled'))
    ) THEN RAISE(ABORT, 'invalid commission transition') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commission_payouts_state_transition BEFORE UPDATE OF status ON commission_payouts WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (OLD.status = 'posted' AND NEW.status = 'void') THEN RAISE(ABORT, 'invalid payout transition') END;
  END`,
];

const freezeTriggers = [
  `CREATE TRIGGER IF NOT EXISTS schedules_freeze_financials BEFORE UPDATE ON payment_schedules WHEN OLD.status <> 'draft' AND (
    OLD.source_type IS NOT NEW.source_type OR OLD.source_id IS NOT NEW.source_id OR
    OLD.payer_contact_id IS NOT NEW.payer_contact_id OR OLD.total_amount IS NOT NEW.total_amount OR
    OLD.currency IS NOT NEW.currency
  ) BEGIN SELECT RAISE(ABORT, 'active schedule financials are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS schedule_items_freeze BEFORE UPDATE ON payment_schedule_items WHEN
    (SELECT status FROM payment_schedules s WHERE s.id = OLD.schedule_id) <> 'draft' AND (
      OLD.sequence IS NOT NEW.sequence OR OLD.label IS NOT NEW.label OR OLD.due_at IS NOT NEW.due_at OR OLD.amount IS NOT NEW.amount
    ) BEGIN SELECT RAISE(ABORT, 'active schedule items are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS invoices_freeze_financials BEFORE UPDATE ON invoices WHEN OLD.status <> 'draft' AND (
    OLD.contact_id IS NOT NEW.contact_id OR OLD.source_type IS NOT NEW.source_type OR OLD.source_id IS NOT NEW.source_id OR
    OLD.subtotal IS NOT NEW.subtotal OR OLD.tax_amount IS NOT NEW.tax_amount OR
    OLD.discount_amount IS NOT NEW.discount_amount OR OLD.total_amount IS NOT NEW.total_amount OR OLD.currency IS NOT NEW.currency
  ) BEGIN SELECT RAISE(ABORT, 'issued invoice financials are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS invoice_lines_no_update BEFORE UPDATE ON invoice_lines BEGIN SELECT RAISE(ABORT, 'invoice lines are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS invoice_lines_no_delete BEFORE DELETE ON invoice_lines BEGIN SELECT RAISE(ABORT, 'invoice lines are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS financial_documents_no_delete_schedules BEFORE DELETE ON payment_schedules BEGIN SELECT RAISE(ABORT, 'financial schedules are retained'); END`,
  `CREATE TRIGGER IF NOT EXISTS financial_documents_no_delete_invoices BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT, 'invoices are retained'); END`,
  `CREATE TRIGGER IF NOT EXISTS financial_documents_no_delete_receipts BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT, 'receipts are retained'); END`,
  `CREATE TRIGGER IF NOT EXISTS financial_documents_no_delete_expenses BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT, 'expenses are retained'); END`,
  `CREATE TRIGGER IF NOT EXISTS financial_documents_no_delete_commissions BEFORE DELETE ON commissions BEGIN SELECT RAISE(ABORT, 'commissions are retained'); END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_allocations_no_delete BEFORE DELETE ON receipt_allocations BEGIN SELECT RAISE(ABORT, 'allocations use reversals'); END`,
  `CREATE TRIGGER IF NOT EXISTS commission_payouts_no_delete BEFORE DELETE ON commission_payouts BEGIN SELECT RAISE(ABORT, 'payouts use voiding'); END`,
];

const allocationTriggers = [
  `CREATE TRIGGER IF NOT EXISTS receipt_allocations_validate_insert BEFORE INSERT ON receipt_allocations BEGIN
    SELECT CASE WHEN NEW.amount <= 0 OR NEW.status <> 'active' THEN RAISE(ABORT, 'invalid allocation') END;
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM receipts r JOIN invoices i ON i.id = NEW.invoice_id
      WHERE r.id = NEW.receipt_id AND r.agency_id = NEW.agency_id AND i.agency_id = NEW.agency_id
      AND r.status = 'posted' AND i.status IN ('issued','partially_paid','overdue')
      AND r.contact_id = i.contact_id AND r.currency = i.currency
    ) THEN RAISE(ABORT, 'receipt and invoice are not allocatable') END;
    SELECT CASE WHEN (SELECT allocated_amount + NEW.amount FROM receipts r WHERE r.id = NEW.receipt_id) > (SELECT amount + 0.009 FROM receipts r WHERE r.id = NEW.receipt_id) THEN RAISE(ABORT, 'receipt allocation exceeds unallocated amount') END;
    SELECT CASE WHEN (SELECT paid_amount + NEW.amount FROM invoices i WHERE i.id = NEW.invoice_id) > (SELECT total_amount + 0.009 FROM invoices i WHERE i.id = NEW.invoice_id) THEN RAISE(ABORT, 'allocation exceeds invoice balance') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_allocations_apply AFTER INSERT ON receipt_allocations WHEN NEW.status = 'active' BEGIN
    UPDATE receipts SET allocated_amount = allocated_amount + NEW.amount WHERE id = NEW.receipt_id AND agency_id = NEW.agency_id;
    UPDATE invoices SET
      paid_amount = paid_amount + NEW.amount,
      balance_due = balance_due - NEW.amount,
      status = CASE WHEN balance_due - NEW.amount <= 0.009 THEN 'paid' ELSE 'partially_paid' END,
      paid_at = CASE WHEN balance_due - NEW.amount <= 0.009 THEN NEW.allocated_at ELSE paid_at END,
      updated_at = NEW.allocated_at
    WHERE id = NEW.invoice_id AND agency_id = NEW.agency_id;
    UPDATE payment_schedule_items SET
      paid_amount = paid_amount + NEW.amount,
      status = CASE WHEN paid_amount + NEW.amount >= amount - 0.009 THEN 'paid' ELSE 'partially_paid' END,
      updated_at = NEW.allocated_at
    WHERE id = (SELECT schedule_item_id FROM invoices WHERE id = NEW.invoice_id)
      AND agency_id = NEW.agency_id;
    UPDATE payment_schedules SET
      paid_amount = paid_amount + NEW.amount,
      status = CASE WHEN paid_amount + NEW.amount >= total_amount - 0.009 THEN 'completed' ELSE status END,
      completed_at = CASE WHEN paid_amount + NEW.amount >= total_amount - 0.009 THEN NEW.allocated_at ELSE completed_at END,
      updated_at = NEW.allocated_at
    WHERE id = (SELECT schedule_id FROM invoices WHERE id = NEW.invoice_id)
      AND agency_id = NEW.agency_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_allocations_validate_reverse BEFORE UPDATE OF status ON receipt_allocations WHEN OLD.status <> NEW.status BEGIN
    SELECT CASE WHEN NOT (OLD.status = 'active' AND NEW.status = 'reversed' AND NEW.reversed_at IS NOT NULL AND NEW.reversal_reason IS NOT NULL) THEN RAISE(ABORT, 'invalid allocation reversal') END;
    SELECT CASE WHEN (SELECT status FROM receipts WHERE id = OLD.receipt_id) NOT IN ('posted','void') THEN RAISE(ABORT, 'receipt cannot be reversed') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_allocations_reverse AFTER UPDATE OF status ON receipt_allocations WHEN OLD.status = 'active' AND NEW.status = 'reversed' BEGIN
    UPDATE receipts SET allocated_amount = allocated_amount - OLD.amount WHERE id = OLD.receipt_id AND agency_id = OLD.agency_id;
    UPDATE invoices SET
      paid_amount = paid_amount - OLD.amount,
      balance_due = balance_due + OLD.amount,
      status = CASE WHEN paid_amount - OLD.amount <= 0.009 THEN CASE WHEN due_at < NEW.reversed_at THEN 'overdue' ELSE 'issued' END ELSE 'partially_paid' END,
      paid_at = NULL,
      updated_at = NEW.reversed_at
    WHERE id = OLD.invoice_id AND agency_id = OLD.agency_id;
    UPDATE payment_schedule_items SET
      paid_amount = paid_amount - OLD.amount,
      status = CASE WHEN paid_amount - OLD.amount <= 0.009 THEN CASE WHEN due_at < NEW.reversed_at THEN 'overdue' ELSE 'pending' END ELSE 'partially_paid' END,
      updated_at = NEW.reversed_at
    WHERE id = (SELECT schedule_item_id FROM invoices WHERE id = OLD.invoice_id)
      AND agency_id = OLD.agency_id;
    UPDATE payment_schedules SET
      paid_amount = paid_amount - OLD.amount,
      status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
      completed_at = NULL,
      updated_at = NEW.reversed_at
    WHERE id = (SELECT schedule_id FROM invoices WHERE id = OLD.invoice_id)
      AND agency_id = OLD.agency_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS invoices_prevent_void_with_allocations BEFORE UPDATE OF status ON invoices WHEN NEW.status = 'void' BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM receipt_allocations a WHERE a.invoice_id = NEW.id AND a.status = 'active') THEN RAISE(ABORT, 'reverse invoice allocations before voiding') END;
  END`,
];

const commissionTriggers = [
  `CREATE TRIGGER IF NOT EXISTS commission_payouts_validate_insert BEFORE INSERT ON commission_payouts BEGIN
    SELECT CASE WHEN NEW.amount <= 0 OR NEW.status <> 'posted' THEN RAISE(ABORT, 'invalid commission payout') END;
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM commission_splits s JOIN commissions c ON c.id = s.commission_id
      WHERE s.id = NEW.split_id AND s.commission_id = NEW.commission_id
      AND s.agency_id = NEW.agency_id AND c.agency_id = NEW.agency_id
      AND c.status IN ('approved','partially_paid') AND NEW.currency = c.currency
    ) THEN RAISE(ABORT, 'commission split is not payable') END;
    SELECT CASE WHEN (SELECT paid_amount + NEW.amount FROM commission_splits s WHERE s.id = NEW.split_id) > (SELECT amount + 0.009 FROM commission_splits s WHERE s.id = NEW.split_id) THEN RAISE(ABORT, 'payout exceeds split balance') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commission_payouts_apply AFTER INSERT ON commission_payouts WHEN NEW.status = 'posted' BEGIN
    UPDATE commission_splits SET
      paid_amount = paid_amount + NEW.amount,
      status = CASE WHEN paid_amount + NEW.amount >= amount - 0.009 THEN 'paid' ELSE 'partially_paid' END,
      updated_at = NEW.created_at
    WHERE id = NEW.split_id AND agency_id = NEW.agency_id;
    UPDATE commissions SET
      paid_amount = paid_amount + NEW.amount,
      status = CASE WHEN paid_amount + NEW.amount >= COALESCE(approved_amount, gross_commission) - 0.009 THEN 'paid' ELSE 'partially_paid' END,
      updated_at = NEW.created_at
    WHERE id = NEW.commission_id AND agency_id = NEW.agency_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS commission_payouts_void AFTER UPDATE OF status ON commission_payouts WHEN OLD.status = 'posted' AND NEW.status = 'void' BEGIN
    UPDATE commission_splits SET
      paid_amount = paid_amount - OLD.amount,
      status = CASE WHEN paid_amount - OLD.amount <= 0.009 THEN 'pending' ELSE 'partially_paid' END,
      updated_at = NEW.voided_at
    WHERE id = OLD.split_id AND agency_id = OLD.agency_id;
    UPDATE commissions SET
      paid_amount = paid_amount - OLD.amount,
      status = CASE WHEN paid_amount - OLD.amount <= 0.009 THEN 'approved' ELSE 'partially_paid' END,
      updated_at = NEW.voided_at
    WHERE id = OLD.commission_id AND agency_id = OLD.agency_id;
  END`,
];

export async function runFinanceMigrations(): Promise<void> {
  await databaseClient.execute("PRAGMA foreign_keys = ON");
  for (const statement of tables) await databaseClient.execute(statement);
  for (const statement of indexes) await databaseClient.execute(statement);
  for (const statement of validationTriggers) await databaseClient.execute(statement);
  for (const statement of tenantTriggers) await databaseClient.execute(statement);
  for (const statement of stateTriggers) await databaseClient.execute(statement);
  for (const statement of freezeTriggers) await databaseClient.execute(statement);
  for (const statement of allocationTriggers) await databaseClient.execute(statement);
  for (const statement of commissionTriggers) await databaseClient.execute(statement);
}
