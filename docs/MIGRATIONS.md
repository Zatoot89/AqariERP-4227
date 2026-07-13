# Database migration and lifecycle guide

## Migration policy

Aqari ERP uses two complementary migration paths:

- reviewed Drizzle migrations for planned schema releases
- idempotent startup compatibility migrations for columns, indexes, triggers, and tables that must exist before the current application can run safely

Every schema-changing release requires a database backup, staging rehearsal, documented rollback decision, and successful integrity/tenant-isolation checks.

## Phase 1 data-foundation migration

The data-foundation migration:

- enables SQLite foreign-key enforcement per connection
- adds update and soft-delete timestamps
- introduces structured `attachments` and append-only `audit_logs`
- adds tenant/status/assignee/search indexes
- backfills `lead_properties.agency_id`
- removes duplicate lead-property pairs before creating the unique index
- enforces enum/range invariants with database triggers
- prevents physical deletion of leads, properties, tasks, and attachments
- prevents audit and CRM activity mutation

The migration is idempotent and safe to rerun.

## Pre-deployment checks

Before production deployment:

1. create and verify a database backup
2. confirm every profile, lead, property, task, activity, and WhatsApp message has a valid agency
3. review duplicate property external IDs and lead-property pairs
4. confirm existing enum values are valid
5. inventory legacy property `images` JSON and agency `logo_url` object keys
6. confirm the S3 bucket and cleanup worker configuration
7. run the migration in staging using a recent production-shaped backup
8. execute the full test and tenant-isolation suite

The migration intentionally does not delete legacy object-key JSON. Existing legacy media remains readable while new writes use structured attachments.

## Structured media transition

New uploads follow this lifecycle:

1. the API creates a tenant-owned `attachments` row with status `pending`
2. the API returns a short-lived PUT URL tied to that object key, MIME type, size, and optional checksum
3. property or agency-logo mutation verifies the object and atomically changes the attachment to `active`
4. removal changes the state to `delete_pending`
5. cleanup deletes the object and retains a `purged` metadata tombstone and audit event
6. expired pending/failed uploads are treated as orphans and cleaned automatically

Legacy `properties.images` and `agencies.logo_url` are compatibility-only fields. Do not write new raw object keys to them except the server-maintained logo compatibility pointer. A future migration may convert and remove legacy rows after inventory reconciliation.

## Rollback strategy

Database constraints and structured ownership should normally be forward-fixed, not removed. An application rollback is safe only when the previous application can tolerate:

- new nullable lifecycle columns
- new attachment/audit tables
- new indexes
- database triggers preventing physical deletion

Before rolling back application code:

1. stop writes
2. preserve the failed database and current S3 inventory
3. determine whether the prior version physically deletes leads/properties/tasks
4. if it does, do not run that version against the migrated database
5. restore the pre-deployment database backup and matching S3 recovery point instead
6. deploy the prior application revision
7. reconcile data written after the backup

Do not drop the audit ledger or attachment metadata to make an older application run.

## Integrity verification

After migration, run:

```sql
PRAGMA foreign_keys;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

Expected results:

- `foreign_keys` returns `1`
- `integrity_check` returns `ok`
- `foreign_key_check` returns no rows

Then verify:

- invalid roles/stages/statuses and out-of-range values are rejected
- physical deletion of lifecycle entities is rejected
- audit rows cannot be updated or deleted
- archived records are absent from APIs, analytics, reminders, and WhatsApp routing
- cross-tenant attachment reads/deletes return 404
- orphan and requested deletions advance to `purged`

## Audit retention

`audit_logs` is append-only at the database level. Retention/export policy must be defined before customer onboarding according to legal, contractual, and privacy requirements. Redaction processes must preserve event identity and must never store passwords, invitation tokens, access tokens, or encryption keys in audit metadata.
