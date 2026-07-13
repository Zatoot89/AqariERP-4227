# Environment model

## Development

Purpose: local feature work with disposable data.

- `NODE_ENV=development`
- local file database or personal development database
- localhost website and exact localhost origins
- local/test S3 bucket or MinIO
- test email sender or no email key
- unsigned WhatsApp webhooks only when explicitly enabled for local testing
- demo seeding may be enabled with a strong local secret

Never use production credentials or customer data.

## Test and CI

Purpose: automated verification.

- `NODE_ENV=test`
- disposable file database
- invalid/non-routable storage endpoint unless a storage test provisions a fixture
- test-only auth and encryption secrets
- no production email or WhatsApp credentials
- deterministic test fixtures for two agencies and all roles

CI must remain reproducible with `bun install --frozen-lockfile`.

## Staging

Purpose: production-like acceptance and migration rehearsal.

- `NODE_ENV=staging`
- HTTPS URL and explicit staging origins
- dedicated database, bucket, auth secret, and encryption key
- verified staging email sender
- Meta test number/application where available
- demo seed disabled
- production-like process manager, proxy, migrations, alerts, and backup policy

Staging data must be synthetic or properly anonymized.

## Production

Purpose: real customer operation.

- `NODE_ENV=production`
- HTTPS `WEBSITE_URL`
- exact `ALLOWED_ORIGINS`
- dedicated hosted LibSQL/Turso database
- dedicated versioned S3-compatible bucket
- strong unique Better Auth and credential-encryption secrets
- verified Resend sender
- verified Meta webhook signature and verification token
- demo seed and unsigned webhooks disabled
- backup, monitoring, incident response, and restore procedures active

The application refuses startup when production-critical configuration is missing or unsafe.

## Mobile builds

`EXPO_PUBLIC_API_URL` is embedded at build time. Produce separate development, staging, and production builds. Never distribute a production-signed build pointing to a preview API.

Production identifiers:

- Android package: `com.aiarabia.aqari`
- iOS bundle identifier: `com.aiarabia.aqari`
- deep-link scheme: `aqari`

## Desktop builds

Electron uses application ID `com.aiarabia.aqari.erp` and product name `Aqari ERP`. Development loads `WEBSITE_URL`; packaged builds load the bundled web output.

Code-sign Windows and macOS release artifacts before distribution. Keep signing credentials outside the repository and CI logs.
