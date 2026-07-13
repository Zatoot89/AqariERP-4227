import "./context";
import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL = `file:core-domain-${process.pid}-${Date.now()}.db`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.BETTER_AUTH_SECRET = "core-domain-test-secret-with-more-than-32-characters";
process.env.WEBSITE_URL = "http://localhost:3000";

const agencyA = "core-agency-a";
const agencyB = "core-agency-b";
const adminA = "core-admin-a";
const adminB = "core-admin-b";
const legacyLead = "core-legacy-lead";
const legacyProperty = "core-legacy-property";

let app: Hono;
let databaseClient: Awaited<typeof import("./database")>["databaseClient"];
let db: Awaited<typeof import("./database")>["db"];
let schema: typeof import("./database/schema");
let core: typeof import("./database/core-domain-schema");

const baseTables = [
  `CREATE TABLE IF NOT EXISTS agencies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, plan TEXT, country TEXT,
    locale TEXT, currency TEXT, timezone TEXT, logo_url TEXT, wa_access_token TEXT,
    wa_phone_number_id TEXT, wa_verify_token TEXT, wa_connected_at INTEGER, created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY, agency_id TEXT, name_ar TEXT, role TEXT NOT NULL,
    avatar_url TEXT, active INTEGER, created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, agency_id TEXT, assigned_to TEXT, name TEXT NOT NULL, name_ar TEXT,
    phone TEXT, email TEXT, source TEXT, stage TEXT, budget_min REAL, budget_max REAL,
    currency TEXT, property_type TEXT, bedrooms INTEGER, preferred_area TEXT, notes TEXT,
    whatsapp_id TEXT, created_at INTEGER, updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY, agency_id TEXT, listed_by TEXT, title TEXT NOT NULL, title_ar TEXT,
    type TEXT, status TEXT, price REAL, currency TEXT, area_sqm REAL, bedrooms INTEGER,
    bathrooms INTEGER, location TEXT, location_ar TEXT, city TEXT, country TEXT,
    description TEXT, description_ar TEXT, images TEXT, external_id TEXT,
    created_at INTEGER, updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS lead_properties (
    id TEXT PRIMARY KEY, lead_id TEXT, property_id TEXT, status TEXT, notes TEXT, linked_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, assigned_to TEXT, created_by TEXT,
    title TEXT NOT NULL, title_ar TEXT, due_at INTEGER, type TEXT, done INTEGER,
    reminded_at INTEGER, created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, user_id TEXT, type TEXT NOT NULL,
    body TEXT, meta TEXT, created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, wa_message_id TEXT,
    direction TEXT, body TEXT, media_url TEXT, wa_contact_id TEXT,
    wa_contact_name TEXT, received_at INTEGER
  )`,
];

function json(value: unknown): string {
  return JSON.stringify(value);
}

function request(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-test-user", userId);
  if (init.body) headers.set("Content-Type", "application/json");
  return app.request(path, { ...init, headers });
}

async function expectFailure(operation: () => Promise<unknown>) {
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
  databaseClient = database.databaseClient;
  db = database.db;
  schema = await import("./database/schema");
  core = await import("./database/core-domain-schema");
  for (const statement of baseTables) await databaseClient.execute(statement);

  const { runApplicationMigrations } = await import("./database/migrations");
  const { runDataFoundationMigrations } = await import("./database/data-foundation-migrations");
  const { runCoreDomainMigrations } = await import("./database/core-domain-migrations");
  await runApplicationMigrations();
  await runDataFoundationMigrations();

  const now = Date.now();
  await db.insert(schema.agencies).values([
    { id: agencyA, name: "Core Agency A", createdAt: now, updatedAt: now },
    { id: agencyB, name: "Core Agency B", createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(schema.user).values([
    {
      id: adminA,
      name: "Admin A",
      email: "core-admin-a@example.com",
      emailVerified: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
    {
      id: adminB,
      name: "Admin B",
      email: "core-admin-b@example.com",
      emailVerified: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  ]).onConflictDoNothing();
  await db.insert(schema.profiles).values([
    { id: adminA, agencyId: agencyA, role: "admin", active: 1, createdAt: now, updatedAt: now },
    { id: adminB, agencyId: agencyB, role: "admin", active: 1, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(schema.leads).values({
    id: legacyLead,
    agencyId: agencyA,
    assignedTo: adminA,
    name: "Legacy Buyer",
    phone: "+971 50 123 4567",
    email: "Legacy.Buyer@example.com",
    source: "manual",
    stage: "new",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.properties).values({
    id: legacyProperty,
    agencyId: agencyA,
    listedBy: adminA,
    title: "Legacy Villa",
    type: "villa",
    status: "available",
    price: 1_000_000,
    currency: "AED",
    areaSqm: 350,
    city: "Dubai",
    country: "AE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await runCoreDomainMigrations();
  await runCoreDomainMigrations();

  const [{ contacts }, { developments }, { inventory }] = await Promise.all([
    import("./routes/contacts"),
    import("./routes/developments"),
    import("./routes/inventory"),
  ]);
  app = new Hono()
    .use("*", async (c, next) => {
      const userId = c.req.header("x-test-user");
      c.set("user", userId ? ({ id: userId } as { id: string }) : null);
      c.set("session", null);
      await next();
    })
    .route("/contacts", contacts)
    .route("/developments", developments)
    .route("/inventory", inventory);
});

describe("core domain migration", () => {
  test("backfills legacy leads and properties exactly once", async () => {
    const { eq } = await import("drizzle-orm");
    const leadMapping = await db.select().from(core.leadContactMappings)
      .where(eq(core.leadContactMappings.leadId, legacyLead));
    const propertyMapping = await db.select().from(core.legacyPropertyMappings)
      .where(eq(core.legacyPropertyMappings.legacyPropertyId, legacyProperty));
    expect(leadMapping).toHaveLength(1);
    expect(propertyMapping).toHaveLength(1);

    const contact = await db.select().from(core.contacts)
      .where(eq(core.contacts.id, `legacy_contact_${legacyLead}`)).get();
    expect(contact?.displayName).toBe("Legacy Buyer");
    const property = await db.select().from(core.inventoryProperties)
      .where(eq(core.inventoryProperties.id, `inventory_${legacyProperty}`)).get();
    expect(property?.title).toBe("Legacy Villa");
    expect(property?.saleAskingPrice).toBe(1_000_000);
  });

  test("database triggers reject cross-tenant relationships", async () => {
    const now = Date.now();
    await db.insert(core.contacts).values({
      id: "core-contact-b",
      agencyId: agencyB,
      contactType: "person",
      displayName: "Agency B Owner",
      preferredLanguage: "en",
      normalizedName: "agency b owner",
      createdBy: adminB,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    await expectFailure(() => db.insert(core.contactRoles).values({
      id: "core-cross-role",
      agencyId: agencyA,
      contactId: "core-contact-b",
      role: "owner",
      effectiveFrom: now,
      createdAt: now,
    }));
    await expectFailure(() => databaseClient.execute({
      sql: `INSERT INTO units (
        id, agency_id, property_id, unit_number, unit_type, purpose, status,
        parking_spaces, furnishing, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "core-cross-unit",
        agencyB,
        `inventory_${legacyProperty}`,
        "B-1",
        "apartment",
        "rent",
        "available",
        0,
        "unfurnished",
        "AED",
        now,
        now,
      ],
    }));
  });
});

describe("core domain routes", () => {
  test("creates multi-role contacts and finds normalized duplicates", async () => {
    const response = await request("/contacts", adminA, {
      method: "POST",
      body: json({
        contactType: "person",
        displayName: "Amina Saleh",
        roles: ["owner", "seller"],
        methods: [
          { methodType: "phone", value: "+971 55 777 1212", isPrimary: true },
          { methodType: "email", value: "Amina@example.com" },
        ],
      }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as {
      contact: { id: string; roles: unknown[]; methods: unknown[] };
    };
    expect(payload.contact.roles).toHaveLength(2);
    expect(payload.contact.methods).toHaveLength(2);

    const duplicate = await request("/contacts/duplicates?phone=971557771212", adminA);
    expect(duplicate.status).toBe(200);
    const duplicatePayload = await duplicate.json() as { contacts: Array<{ id: string }> };
    expect(duplicatePayload.contacts.some((row) => row.id === payload.contact.id)).toBe(true);
  });

  test("creates developments, properties, units, and enforces ownership totals", async () => {
    const developmentResponse = await request("/developments", adminA, {
      method: "POST",
      body: json({
        developmentType: "building",
        code: "BLDG-CORE",
        name: "Core Tower",
        city: "Dubai",
        country: "AE",
      }),
    });
    expect(developmentResponse.status).toBe(201);
    const development = await developmentResponse.json() as { development: { id: string } };

    const propertyResponse = await request("/inventory/properties", adminA, {
      method: "POST",
      body: json({
        developmentId: development.development.id,
        assetCode: "ASSET-CORE",
        title: "Core Tower Asset",
        propertyType: "building",
        purpose: "both",
        status: "available",
        currency: "AED",
      }),
    });
    expect(propertyResponse.status).toBe(201);
    const property = await propertyResponse.json() as { property: { id: string } };

    const unitResponse = await request(
      `/inventory/properties/${property.property.id}/units`,
      adminA,
      {
        method: "POST",
        body: json({
          unitNumber: "1201",
          unitType: "apartment",
          purpose: "rent",
          status: "available",
          bedrooms: 2,
          bathrooms: 2,
          areaSqm: 120,
          currency: "AED",
        }),
      },
    );
    expect(unitResponse.status).toBe(201);

    const contactResponse = await request("/contacts", adminA, {
      method: "POST",
      body: json({
        contactType: "person",
        displayName: "Core Owner",
        roles: ["owner"],
      }),
    });
    const owner = await contactResponse.json() as { contact: { id: string } };

    const firstOwnership = await request("/inventory/ownership", adminA, {
      method: "POST",
      body: json({
        ownerContactId: owner.contact.id,
        propertyId: property.property.id,
        ownershipPercentage: 60,
        effectiveFrom: Date.now(),
      }),
    });
    expect(firstOwnership.status).toBe(201);

    const excessOwnership = await request("/inventory/ownership", adminA, {
      method: "POST",
      body: json({
        ownerContactId: owner.contact.id,
        propertyId: property.property.id,
        ownershipPercentage: 50,
        effectiveFrom: Date.now(),
      }),
    });
    expect(excessOwnership.status).toBe(409);
  });

  test("does not expose or link another agency's domain records", async () => {
    expect((await request("/contacts/core-contact-b", adminA)).status).toBe(404);
    expect((await request("/inventory/properties", adminB, {
      method: "POST",
      body: json({
        developmentId: "nonexistent-a-development",
        title: "Cross Tenant",
        propertyType: "villa",
      }),
    })).status).toBe(404);
  });
});
