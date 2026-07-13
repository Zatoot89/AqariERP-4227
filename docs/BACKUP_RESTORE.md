# Backup and restore procedure

## Objectives

Backups must protect three related data sets:

1. the LibSQL database
2. S3-compatible objects
3. deployment configuration and secret references

A database-only restore can reference missing objects. An object-only restore can leave files without database ownership metadata. Record one shared backup timestamp and retain the manifests together.

## Backup schedule

Recommended minimum policy:

- provider-native continuous or daily database backups
- daily object-storage versioning or replication
- encrypted weekly logical database export
- backup before every schema-changing deployment
- quarterly restore drill into an isolated environment

Set retention according to legal, contractual, and privacy requirements. Backups must be encrypted and access logged.

## Hosted LibSQL/Turso backup

Use the provider's supported snapshot, point-in-time recovery, or logical export mechanism. Record:

- database name and environment
- backup/snapshot identifier
- UTC creation time
- application commit SHA
- schema/migration version
- row counts for critical tables
- operator and ticket/reference

Do not copy production credentials into the backup manifest.

## Local SQLite backup

For a local file database, stop all writers first. Use SQLite's online backup or vacuum-into mechanism rather than copying an actively written file.

Example with the SQLite CLI:

```sh
sqlite3 local.db ".backup 'backup/aqari-$(date -u +%Y%m%dT%H%M%SZ).db'"
```

Validate the backup:

```sh
sqlite3 backup/aqari-*.db "PRAGMA integrity_check;"
```

The expected result is `ok`.

## Object-storage backup

Enable bucket versioning or provider-native replication. Export an inventory containing at least:

- object key
- size
- content type
- checksum/ETag when meaningful
- creation and last-modified timestamps
- current version identifier

Protect agency prefixes from cross-tenant access in backup tooling as well as in the application.

## Restore drill

Restore only into an isolated environment first:

1. create a new database and storage location
2. restore the database snapshot/export
3. restore or attach the corresponding object versions
4. deploy the application commit recorded in the manifest
5. supply new non-production secrets and origins
6. run migrations
7. run database integrity checks
8. compare critical row counts
9. test authentication, two separate agencies, properties, tasks, uploads, invitations, and WhatsApp metadata
10. verify that no notification, email, or webhook can reach real recipients from the restored environment

## Production restore

1. declare a maintenance window and stop writes
2. capture a final emergency backup of the current state
3. identify the exact recovery point and application revision
4. restore the database
5. restore matching object versions or inventory
6. deploy the compatible application revision
7. rotate any credentials exposed during recovery
8. run smoke and tenant-isolation checks
9. reconcile records created between the recovery point and outage
10. reopen traffic only after business-owner approval

## Reconciliation checklist

After any restore, compare:

- users and active profiles
- agencies and invitation states
- leads, properties, and tasks
- WhatsApp message IDs and activities
- property/agency object keys
- pending or failed emails
- audit events after the recovery point

Never silently discard post-backup financial or contractual records once those modules exist. Phase 3 requires immutable transaction records and a formal reconciliation report.
