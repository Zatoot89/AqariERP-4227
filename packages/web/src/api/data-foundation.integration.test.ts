import { beforeAll, describe, expect, test } from "bun:test";

process.env.DATABASE_URL = `file:data-foundation-${process.pid}-${Date.now()}.db`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.ATTACHMENT_PENDING_TTL_MS = "1000";
process.env.ATTACHMENT_CLEANUP_ENABLED = "false";

type Client = Awaited<typeof import("./database")>["databaseClient"];
let client: Client;
let db: Awaited<typeof import("./database")>["db"];
let schema: typeof import("./database/schema");
let cleanupAttachments: typeof import("../services/attachment-cleanup")["cleanupAttachments"];

const baseTables = [
  `CREATE TABLE agencies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, plan TEXT DEFAULT 'starter',
    country TEXT DEFAULT 'AE', locale TEXT DEFAULT 'en', currency TEXT DEFAULT 'USD',
    timezone TEXT DEFAULT 'Asia/Baghdad', logo_url TEXT, wa_access_token TEXT,
    wa_phone_number_id TEXT, wa_verify_token TEXT, wa_connected_at INTEGER, created_at INTEGER
  )`,
  `CREATE TABLE profiles (
    id TEXT PRIMARY KEY, agency_id TEXT, name_ar TEXT, role TEXT NOT NULL DEFAULT 'agent',
    avatar_url TEXT, active INTEGER DEFAULT 1, created_at INTEGER
  )`,
  `CREATE TABLE user (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE leads (
    id TEXT PRIMARY KEY, agency_id TEXT, assigned_to TEXT, name TEXT NOT NULL, name_ar TEXT,
    phone TEXT, email TEXT, source TEXT DEFAULT 'manual', stage TEXT DEFAULT 'new',
    budget_min REAL, budget_max REAL, currency TEXT DEFAULT 'USD', property_type TEXT,
    bedrooms INTEGER, preferred_area TEXT, notes TEXT, whatsapp_id TEXT,
    created_at INTEGER, updated_at INTEGER
  )`,
  `CREATE TABLE properties (
    id TEXT PRIMARY KEY, agency_id TEXT, listed_by TEXT, title TEXT NOT NULL, title_ar TEXT,
    type TEXT, status TEXT DEFAULT 'available', price REAL, currency TEXT DEFAULT 'USD',
    area_sqm REAL, bedrooms INTEGER, bathrooms INTEGER, location TEXT, location_ar TEXT,
    city TEXT, country TEXT, description TEXT, description_ar TEXT, images TEXT,
    external_id TEXT, created_at INTEGER, updated_at INTEGER
  )`,
  `CREATE TABLE lead_properties (
    id TEXT PRIMARY KEY, lead_id TEXT, property_id TEXT, status TEXT DEFAULT 'shown',
    notes TEXT, linked_at INTEGER
  )`,
  `CREATE TABLE tasks (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, assigned_to TEXT, created_by TEXT,
    title TEXT NOT NULL, title_ar TEXT, due_at INTEGER, type TEXT DEFAULT 'follow_up',
    done INTEGER DEFAULT 0, reminded_at INTEGER, created_at INTEGER
  )`,
  `CREATE TABLE activities (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, user_id TEXT,
    type TEXT NOT NULL, body TEXT, meta TEXT, created_at INTEGER
  )`,
  `CREATE TABLE whatsapp_messages (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, wa_message_id TEXT,
    direction TEXT DEFAULT 'inbound', body TEXT, media_url TEXT, wa_contact_id TEXT,
    wa_contact_name TEXT, received_at INTEGER
  )`,
];

async function expectSqlFailure(operation: () => Promise<unknown>) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

beforeAll(async () => {
  const database = await import("./database");
  client = database.databaseClient;
  db = database.db;
  schema = await import("./database/schema");
  for (const statement of baseTables) await client.execute(statement);
  const { runApplicationMigrations } = await import("./database/migrations");
  const { runDataFoundationMigrations } = await import("./database/data-foundation-migrations");
  await runApplicationMigrations();
  await runDataFoundationMigrations();
  cleanupAttachments = (await import("../services/attachment-cleanup")).cleanupAttachments;

  const now = Date.now();
  await db.insert(schema.agencies).values({
    id: "agency-a", name: "Agency A", createdAt: now, updatedAt: now,
  });
  await db.insert(schema.profiles).values({
    id: "admin-a", agencyId: "agency-a", role: "admin", active: 1,
    createdAt: now, updatedAt: now,
  });
});

describe("database lifecycle constraints", () => {
  test("rejects invalid role and lead ranges at the database boundary", async () => {
    await expectSqlFailure(() => client.execute({
      sql: "INSERT INTO profiles (id, agency_id, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["bad-role", "agency-a", "owner", 1, Date.now(), Date.now()],
    }));
    await expectSqlFailure(() => client.execute({
      sql: "INSERT INTO leads (id, agency_id, name, source, stage, budget_min, budget_max, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: ["bad-budget", "agency-a", "Bad", "manual", "new", 500, 100, Date.now(), Date.now()],
    }));
  });

  test("enforces unique tenant lead-property links", async () => {
    const now = Date.now();
    await db.insert(schema.leads).values({
      id: "lead-a", agencyId: "agency-a", assignedTo: "admin-a", name: "Lead A",
      source: "manual", stage: "new", createdAt: now, updatedAt: now,
    });
    await db.insert(schema.properties).values({
      id: "property-a", agencyId: "agency-a", listedBy: "admin-a", title: "Property A",
      status: "available", createdAt: now, updatedAt: now,
    });
    await db.insert(schema.leadProperties).values({
      id: "link-a", agencyId: "agency-a", leadId: "lead-a", propertyId: "property-a", linkedAt: now,
    });
    await expectSqlFailure(() => db.insert(schema.leadProperties).values({
      id: "link-b", agencyId: "agency-a", leadId: "lead-a", propertyId: "property-a", linkedAt: now,
    }));
  });

  test("requires soft deletion and keeps audits append-only", async () => {
    await expectSqlFailure(() => db.delete(schema.leads));
    await db.insert(schema.auditLogs).values({
      id: "audit-a", agencyId: "agency-a", actorId: "admin-a",
      action: "test.created", entityType: "test", entityId: "test-a",
      createdAt: Date.now(),
    });
    await expectSqlFailure(() => client.execute("UPDATE audit_logs SET action = 'tampered' WHERE id = 'audit-a'"));
    await expectSqlFailure(() => client.execute("DELETE FROM audit_logs WHERE id = 'audit-a'"));
  });

  test("rejects invalid attachment metadata", async () => {
    await expectSqlFailure(() => client.execute({
      sql: `INSERT INTO attachments (
        id, agency_id, owner_type, owner_id, object_key, original_name,
        mime_type, size_bytes, uploaded_by, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "bad-attachment", "agency-a", "property_draft", "admin-a",
        "agencies/agency-a/bad", "bad.exe", "application/octet-stream",
        50_000_000, "admin-a", "pending", Date.now(), Date.now(),
      ],
    }));
  });
});

describe("attachment cleanup", () => {
  test("purges old pending objects and retains an audit tombstone", async () => {
    const now = Date.now();
    await db.insert(schema.attachments).values({
      id: "orphan-a",
      agencyId: "agency-a",
      ownerType: "property_draft",
      ownerId: "admin-a",
      objectKey: "agencies/agency-a/attachments/orphan-a/photo.png",
      originalName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 100,
      uploadedBy: "admin-a",
      status: "pending",
      createdAt: now - 10_000,
      updatedAt: now - 10_000,
    });

    const removed: string[] = [];
    const result = await cleanupAttachments(now, async (key) => { removed.push(key); });
    expect(result.purged).toBe(1);
    expect(removed).toEqual(["agencies/agency-a/attachments/orphan-a/photo.png"]);

    const attachment = await db.select().from(schema.attachments)
      .where((await import("drizzle-orm")).eq(schema.attachments.id, "orphan-a")).get();
    expect(attachment?.status).toBe("purged");
    const audit = await db.select().from(schema.auditLogs)
      .where((await import("drizzle-orm")).eq(schema.auditLogs.entityId, "orphan-a")).get();
    expect(audit?.action).toBe("attachment.purged");
  });
});
