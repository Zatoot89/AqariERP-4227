# Aqari ERP

A bilingual real-estate CRM and ERP foundation built as a Bun/Turborepo monorepo with a Hono API, React web application, Expo mobile client, Electron desktop shell, Drizzle ORM, and LibSQL/Turso.

## Project structure

```text
.env                         Secrets (gitignored)
packages/
  web/                       Unified API and React web application
    src/api/                 Hono routes, authorization, validation, database
    src/web/                 Browser interface
  mobile/                    Expo + React Native client
  desktop/                   Electron shell
```

## Local setup

1. Copy `.env.template` to `.env`.
2. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, storage settings, and the required development origins.
3. Install dependencies with `bun install --frozen-lockfile`.
4. Run the normal workspace development command.

The server runs idempotent application migrations before accepting requests. Schema changes must remain backward compatible and must include an explicit migration path.

## Authentication and session policy

### Browser

The browser uses Better Auth's server-managed session cookie. The cookie is HttpOnly, SameSite=Lax, host scoped, and Secure in production. Browser code must never store or read bearer tokens from `localStorage` or `sessionStorage`.

All browser API calls use `credentials: "include"`. CSRF and origin checks remain enabled.

### Mobile and desktop

The bearer plugin remains enabled only for non-browser clients that require token authentication. Those clients must store tokens in platform-secure storage, never AsyncStorage, plain files, or browser storage. A client must clear the token at sign-out and treat expiration or a 401 response as requiring reauthentication.

## Role and permission matrix

| Capability | Admin | Manager | Agent |
|---|---:|---:|---:|
| View agency leads/properties/tasks | Yes | Yes | Assigned records only |
| Create and edit leads/properties/tasks | Yes | Yes | Assigned records only |
| Assign records to agency staff | Yes | Yes | Self only |
| View analytics | Yes | Yes | No |
| Edit agency settings | Yes | Yes | No |
| Invite an agent | Yes | Yes | No |
| Invite or promote a manager | Yes | No | No |
| Invite or promote an admin | Yes | No | No |
| Deactivate staff | Yes | Agents only | No |
| Change own role or deactivate self | No | No | No |
| Remove/demote last active admin | No | No | No |

The API—not the UI—is authoritative. Every tenant-owned database operation must include the caller's `agencyId`; inaccessible cross-tenant IDs return 404.

## Staff invitation lifecycle

Staff accounts are created through invitations rather than emailed passwords:

1. An admin or manager creates an invitation within their agency.
2. The system stores only a SHA-256 hash of a random token.
3. The recipient receives a single-use URL and chooses a password.
4. Acceptance atomically claims the invitation and creates the agency profile.
5. Expired, revoked, accepted, or concurrently claimed invitations are rejected.
6. If account creation cannot be completed, compensating cleanup removes the partial auth user.

Configure `INVITATION_TTL_MINUTES`; the supported range is 15 minutes to seven days.

## WhatsApp credential storage and rotation

WhatsApp access and verification tokens are encrypted with AES-256-GCM before database storage. Plaintext credentials are never returned by settings APIs and are decrypted only immediately before a Meta API request.

Set `CREDENTIAL_ENCRYPTION_KEY` to a base64-encoded 32-byte key:

```sh
openssl rand -base64 32
```

Keep the key in the deployment secret manager, not in source control. To rotate it:

1. Keep the application unavailable for settings writes during the rotation window.
2. Decrypt each stored credential with the old key.
3. Re-encrypt it with the new key.
4. Replace the deployment secret and restart all instances.
5. Test the WhatsApp connection for each configured agency.
6. Remove the old key only after every record has been migrated.

Legacy plaintext credentials are rejected in production and reported as requiring rotation.

## Production configuration

Startup fails when production configuration is unsafe. At minimum:

- `WEBSITE_URL` must be an HTTPS URL.
- `ALLOWED_ORIGINS` must explicitly include `WEBSITE_URL`; wildcard credentialed origins are not allowed.
- `BETTER_AUTH_SECRET` must be at least 32 characters.
- `CREDENTIAL_ENCRYPTION_KEY` must decode to exactly 32 bytes.
- `WHATSAPP_APP_SECRET` and `WA_VERIFY_TOKEN` must be set.
- unsigned webhooks and demo seeding must be disabled.
- `WHATSAPP_GRAPH_API_VERSION` must use a version such as `v20.0`.

The server applies CSP, frame restrictions, content-type protection, permissions policy, and a strict referrer policy to API and static responses.

## Verification

Every pull request runs:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build:web
```

The integration suite creates two agencies and exercises real Hono routes against a LibSQL database to prove cross-tenant isolation for admins, managers, agents, inactive users, assignments, linked records, messages, tasks, properties, and invitations.

## Database commands

```sh
cd packages/web
bun run db:push
bun run db:generate
bun run db:migrate
bun run db:studio
```

Use generated Drizzle migrations for planned schema releases. The startup migration layer is reserved for idempotent compatibility migrations required before application code can safely run.
