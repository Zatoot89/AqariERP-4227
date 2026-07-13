import { databaseClient } from "./index";

const statements = [
  `CREATE TRIGGER IF NOT EXISTS activities_sensitive_audit
    AFTER INSERT ON activities
    WHEN NEW.type IN (
      'staff_invitation_created',
      'staff_invitation_revoked',
      'staff_invitation_accepted',
      'staff_profile_updated'
    )
    BEGIN
      INSERT INTO audit_logs (
        id,
        agency_id,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) VALUES (
        lower(hex(randomblob(12))),
        NEW.agency_id,
        NEW.user_id,
        NEW.type,
        CASE
          WHEN NEW.type LIKE 'staff_invitation_%' THEN 'invitation'
          ELSE 'profile'
        END,
        CASE
          WHEN NEW.type LIKE 'staff_invitation_%' THEN json_extract(NEW.meta, '$.invitationId')
          ELSE json_extract(NEW.meta, '$.targetId')
        END,
        NEW.meta,
        NEW.created_at
      );
    END`,
];

export async function runDataFoundationMigrations(): Promise<void> {
  for (const statement of statements) {
    await databaseClient.execute(statement);
  }
}
