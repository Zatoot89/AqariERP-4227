# Aqari ERP

Aqari ERP is a bilingual English/Arabic real-estate operations platform. The current product includes secure multi-tenant authentication, agency onboarding, leads, properties, tasks, staff and roles, analytics, WhatsApp integration, responsive web UI, an Expo mobile shell, and an Electron desktop shell.

The roadmap extends this foundation into normalized inventory, contracts, finance, maintenance, documents, and durable automation.

## Architecture

```text
Browser / Expo / Electron
          │
          ▼
Hono API + React web application (Bun)
          │
          ├── Better Auth: users, cookies, non-browser bearer sessions
          ├── Drizzle ORM + LibSQL/Turso: tenant and business data
          ├── S3-compatible storage: agency/property media
          ├── Resend: invitations and reminders
          └── Meta WhatsApp Cloud API: inbound/outbound messages
```

Workspace layout:

```text
packages/
  web/       @aqari/web — API, database, services, React application
  mobile/    @aqari/mobile — Expo / React Native client
  desktop/   @aqari/desktop — Electron package

docs/
  DEPLOYMENT.md
  ENVIRONMENTS.md
  BACKUP_RESTORE.md
```

## Requirements

- Bun 1.3.5
- a LibSQL/Turso or local SQLite-compatible database
- S3-compatible storage for media features
- Resend for production invitations/reminders
- Meta credentials for WhatsApp features
- PM2 or another long-lived process supervisor in production

## Local setup

```sh
cp .env.template .env
bun install --frozen-lockfile
bun run dev
```

Configure at minimum:

```dotenv
NODE_ENV=development
WEBSITE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4200
BETTER_AUTH_SECRET=replace-with-at-least-32-characters
DATABASE_URL=file:local.db
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Generate an encryption key before testing stored integration credentials:

```sh
openssl rand -base64 32
```

### Main commands

```sh
bun run dev              # web development
bun run dev:mobile       # Expo development
bun run dev:desktop      # Electron development
bun run build:web        # production web build
bun run lint
bun run typecheck
bun run test
```

## Account and tenant onboarding

Aqari ERP supports two explicit paths:

- Public self-signup creates a new agency through the authenticated, idempotent bootstrap endpoint.
- Existing agencies add staff through expiring, single-use invitations. Passwords are chosen by recipients and are never emailed.

A successful user must have exactly one profile and agency membership before protected business routes are available.

## Authentication and session policy

### Browser

The browser uses Better Auth's server-managed HttpOnly cookie. It is SameSite=Lax, host-scoped, and Secure in production. Browser code must never store bearer tokens in `localStorage` or `sessionStorage`. All browser API requests use `credentials: "include"`; CSRF and origin checks remain enabled.

### Mobile and desktop

Bearer support exists only for clients that require it. Tokens must be held in platform-secure storage, cleared on sign-out, and treated as expired on a 401 response. Never use plain files, AsyncStorage, or browser storage for long-lived tokens.

## Role matrix

| Capability | Admin | Manager | Agent |
|---|---:|---:|---:|
| View agency leads/properties/tasks | Yes | Yes | Assigned only |
| Create and edit business records | Yes | Yes | Assigned only |
| Assign records to agency staff | Yes | Yes | Self only |
| View analytics | Yes | Yes | No |
| Edit agency settings | Yes | Yes | No |
| Invite/manage agents | Yes | Yes | No |
| Invite/promote managers | Yes | No | No |
| Invite/promote admins | Yes | No | No |
| Manage peer managers/admins | Yes | No | No |
| Change own role/deactivate self | No | No | No |
| Remove the last active admin | No | No | No |

The API is authoritative. Inaccessible cross-tenant IDs return 404.

## Database and migrations

The server runs idempotent compatibility migrations before listening. Planned schema work should use reviewed Drizzle migrations.

```sh
bun run db:generate
bun run db:migrate
bun run db:push       # local/prototype use only
bun run db:studio
```

Back up production before every schema-changing release. See [Backup and restore](docs/BACKUP_RESTORE.md).

## Production deployment

Read these before deploying:

- [Deployment guide](docs/DEPLOYMENT.md)
- [Environment model](docs/ENVIRONMENTS.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- `.env.template`

Production startup fails if database, HTTPS origins, auth, encryption, storage, email, invitation, or WhatsApp settings are unsafe or incomplete.

PM2 process:

```sh
bun run build:web
bun run start
pm2 logs aqari-web
```

Health endpoint:

```text
GET /api/health
```

## Mobile and desktop identity

Mobile:

- display name: Aqari ERP
- Android package: `com.aiarabia.aqari`
- iOS bundle ID: `com.aiarabia.aqari`
- deep-link scheme: `aqari`
- API configuration: `EXPO_PUBLIC_API_URL`

Desktop:

- product name: Aqari ERP
- application ID: `com.aiarabia.aqari.erp`
- production artifacts generated by electron-builder

## Verification

Every pull request runs:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build:web
```

The security suite uses a real LibSQL database with two agencies, admin/manager/agent/inactive roles, and actual Hono routes. It covers tenant isolation, assignments, links, messages, invitations, validation, encrypted credentials, and unsafe production configuration.

## Troubleshooting

### Server refuses startup

Read the complete `Unsafe runtime configuration` error. Compare the named variable with `.env.template`. Do not bypass validation in production.

### Browser signs in but API returns 401

Confirm the browser and API use the same HTTPS origin, `WEBSITE_URL` matches the public URL, the origin is in `ALLOWED_ORIGINS`, and the proxy preserves host/scheme headers. Clear old localStorage tokens left by pre-cookie versions.

### Invitation email is not delivered

Verify `RESEND_API_KEY`, `EMAIL_FROM`, sender-domain verification, and application logs. Revoke the pending invitation before issuing a replacement.

### WhatsApp reports rotation required

The stored token is plaintext, malformed, or encrypted with another key. Follow the credential-rotation procedure in `docs/DEPLOYMENT.md`; never paste secrets into logs or tickets.

### Mobile connects to the wrong environment

`EXPO_PUBLIC_API_URL` is embedded when the build is produced. Rebuild the app with the correct environment value.

### Migration or restore problem

Stop writes, preserve the failed database, and follow `docs/BACKUP_RESTORE.md`. Do not run destructive `db:push` commands against production.
