# Aqari ERP deployment guide

## Supported production architecture

Aqari ERP currently expects one long-lived Bun web process per deployment revision:

- Bun serves the Hono API and the built React application.
- PM2 supervises the process using `ecosystem.config.cjs`.
- Turso/LibSQL stores application and authentication data.
- S3-compatible storage holds property and agency media.
- Resend sends invitations and reminders.
- Meta WhatsApp Cloud API delivers inbound and outbound messages.

The current reminder loop runs inside the Bun process. Run exactly one reminder-enabled instance, or set `TASK_REMINDERS_ENABLED=false` on all but one instance. Phase 4 replaces this with durable scheduled jobs.

## Environment separation

Use separate resources and secrets for development, test, staging, and production:

- separate database and database token
- separate S3 bucket or isolated bucket prefix
- separate Better Auth secret
- separate credential-encryption key
- separate Resend sender/domain
- separate WhatsApp test and production configuration where possible
- exact origin allowlists for each environment

Never point a preview or developer build at production data.

## Build and release

1. Create a release branch or pull request.
2. Ensure CI passes frozen install, lint, typecheck, tests, and production build.
3. Back up the production database before a schema-changing release.
4. Build with `bun install --frozen-lockfile` and `bun run build:web`.
5. Provide all production variables from `.env.template` through the host secret manager.
6. Start with `bun run start` or `pm2 start ecosystem.config.cjs --update-env`.
7. Confirm `/api/health` returns HTTP 200.
8. Test sign-in, one tenant-scoped read, upload signing, email delivery, and WhatsApp connection.
9. Observe logs and error rates before completing the rollout.

The server validates configuration and runs idempotent compatibility migrations before listening. A startup failure must block the release rather than be bypassed.

## Reverse proxy and TLS

Terminate TLS at a trusted reverse proxy or platform load balancer. Forward the original HTTPS scheme and host. Redirect HTTP to HTTPS before traffic reaches the application.

Required proxy behavior:

- preserve `Host` and forwarding headers
- support request bodies large enough for API metadata; image bytes upload directly to S3
- do not cache authenticated API responses
- allow WebSocket support if introduced later
- add no wildcard CORS headers; the application owns CORS policy

## Process management

The included PM2 configuration uses one forked process named `aqari-web`, automatic restart, a one-second restart delay, a 1 GB memory restart threshold, and a ten-second shutdown timeout.

For rolling releases:

1. stop new writes or route traffic away from the instance when a migration is not backward compatible
2. deploy and verify one revision
3. restore traffic only after health and smoke checks pass

## Secret rotation

### Better Auth

Changing `BETTER_AUTH_SECRET` invalidates existing sessions. Schedule the change, notify users, rotate the secret, restart every instance, and verify fresh sign-in.

### Credential encryption

`CREDENTIAL_ENCRYPTION_KEY` protects stored integration secrets. Do not simply replace it. Decrypt every encrypted record with the old key, re-encrypt with the new key, then deploy the new key to all instances. Retire the old key only after every agency connection has been tested.

### Database and storage

Rotate database, S3, Resend, and Meta credentials in the provider first, deploy the new secret, verify operation, then revoke the old credential.

## Rollback

Application rollback is safe only while the database remains compatible with the previous revision.

1. stop or drain the failed revision
2. restore the last known-good application revision
3. restore the pre-release database backup only when the migration cannot be reversed safely
4. verify tenant isolation and authentication before reopening traffic
5. record the incident and reconciliation steps

Never restore a database without reconciling S3 objects created after the backup timestamp.
