import { databaseClient } from "./index";

const migrations = [
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
    created_at INTEGER,
    FOREIGN KEY (agency_id) REFERENCES agencies(id),
    FOREIGN KEY (invited_by) REFERENCES profiles(id)
  )`,
  "CREATE INDEX IF NOT EXISTS invitations_agency_idx ON invitations (agency_id)",
  "CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (email)",
  "CREATE INDEX IF NOT EXISTS invitations_expiry_idx ON invitations (expires_at)",
];

export async function runApplicationMigrations(): Promise<void> {
  for (const statement of migrations) {
    await databaseClient.execute(statement);
  }
}
