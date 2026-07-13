import "./context";
import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";

process.env.DATABASE_URL = `file:transaction-lifecycle-${process.pid}-${Date.now()}.db`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.BETTER_AUTH_SECRET = "transaction-lifecycle-test-secret-over-32-characters";
process.env.WEBSITE_URL = "http://localhost:3000";
process.env.DOCUMENT_RENDERER_URL = "";

const agencyA = "tx-agency-a";
const agencyB = "tx-agency-b";
const adminA = "tx-admin-a";
const managerA = "tx-manager-a";
const agentA = "tx-agent-a";
const adminB = "tx-admin-b";
const ownerA = "tx-owner-a";
const buyerA = "tx-buyer-a";
const tenantA = "tx-tenant-a";
const propertyA = "tx-property-a";
const unitA = "tx-unit-a";
const propertyB = "tx-property-b";
const unitB = "tx-unit-b";

let app: Hono;
let databaseClient: Awaited<typeof import("./database")>["databaseClient"];
let db: Awaited<typeof import("./database")>["db"];
let schema: typeof import("./database/schema");
let core: typeof import("./database/core-domain-schema");
let transactionsSchema: typeof import("./database/transaction-schema");

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

async function createOffer(userId = agentA) {
  const response = await request("/transactions/offers", userId, {
    method: "POST",
    body: json({
      unitId: unitA,
      buyerContactId: buyerA,
      sellerContactId: ownerA,
      offeredAmount: 950000,
      currency: "AED",
      validUntil: Date.now() + 7 * 86400000,
      terms: { financing: "cash" },
    }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ offer: { id: string; offerNumber: string; version: number } }>;
}

beforeAll(async () => {
  const database = await import("./database");
  databaseClient = database.databaseClient;
  db = database.db;
  schema = await import("./database/schema");
  core = await import("./database/core-domain-schema");
  transactionsSchema = await import("./database/transaction-schema");

  for (const statement of baseTables) await databaseClient.execute(statement);
  const { runApplicationMigrations } = await import("./database/migrations");
  const { runDataFoundationMigrations } = await import("./database/data-foundation-migrations");
  const { runCoreDomainMigrations } = await import("./database/core-domain-migrations");
  const { runTransactionMigrations } = await import("./database/transaction-migrations");
  await runApplicationMigrations();
  await runDataFoundationMigrations();
  await runCoreDomainMigrations();
  await runTransactionMigrations();
  await runTransactionMigrations();

  const now = Date.now();
  await db.insert(schema.agencies).values([
    { id: agencyA, name: "Transaction Agency A", createdAt: now, updatedAt: now },
    { id: agencyB, name: "Transaction Agency B", createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(schema.user).values([
    { id: adminA, name: "Admin A", email: "tx-admin-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: managerA, name: "Manager A", email: "tx-manager-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: agentA, name: "Agent A", email: "tx-agent-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: adminB, name: "Admin B", email: "tx-admin-b@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
  ]).onConflictDoNothing();
  await db.insert(schema.profiles).values([
    { id: adminA, agencyId: agencyA, role: "admin", active: 1, createdAt: now, updatedAt: now },
    { id: managerA, agencyId: agencyA, role: "manager", active: 1, createdAt: now, updatedAt: now },
    { id: agentA, agencyId: agencyA, role: "agent", active: 1, createdAt: now, updatedAt: now },
    { id: adminB, agencyId: agencyB, role: "admin", active: 1, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.contacts).values([
    { id: ownerA, agencyId: agencyA, contactType: "person", displayName: "Owner A", preferredLanguage: "en", normalizedName: "owner a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: buyerA, agencyId: agencyA, contactType: "person", displayName: "Buyer A", preferredLanguage: "en", normalizedName: "buyer a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: tenantA, agencyId: agencyA, contactType: "person", displayName: "Tenant A", preferredLanguage: "en", normalizedName: "tenant a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: "tx-contact-b", agencyId: agencyB, contactType: "person", displayName: "Contact B", preferredLanguage: "en", normalizedName: "contact b", createdBy: adminB, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.inventoryProperties).values([
    { id: propertyA, agencyId: agencyA, title: "Tower A", propertyType: "building", purpose: "both", status: "available", currency: "AED", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: propertyB, agencyId: agencyB, title: "Tower B", propertyType: "building", purpose: "both", status: "available", currency: "AED", createdBy: adminB, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.units).values([
    { id: unitA, agencyId: agencyA, propertyId: propertyA, unitNumber: "A-101", unitType: "apartment", purpose: "both", status: "available", parkingSpaces: 1, furnishing: "unfurnished", currency: "AED", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: unitB, agencyId: agencyB, propertyId: propertyB, unitNumber: "B-101", unitType: "apartment", purpose: "both", status: "available", parkingSpaces: 1, furnishing: "unfurnished", currency: "AED", createdBy: adminB, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.availabilityHistory).values([
    { id: "tx-availability-a", agencyId: agencyA, unitId: unitA, status: "available", effectiveFrom: now, changedBy: adminA, createdAt: now },
    { id: "tx-availability-b", agencyId: agencyB, unitId: unitB, status: "available", effectiveFrom: now, changedBy: adminB, createdAt: now },
  ]).onConflictDoNothing();

  const { transactions } = await import("./routes/transactions");
  app = new Hono()
    .use("*", async (c, next) => {
      const userId = c.req.header("x-test-user");
      c.set("user", userId ? ({ id: userId } as { id: string }) : null);
      c.set("session", null);
      await next();
    })
    .route("/transactions", transactions);
});

describe("offer negotiation lifecycle", () => {
  test("assigns permanent numbers, preserves counter versions, and protects acceptance", async () => {
    const first = await createOffer();
    expect(first.offer.offerNumber).toMatch(/^OFR-\d{4}-\d{6}$/);
    expect(first.offer.version).toBe(1);

    const submit = await request(`/transactions/offers/${first.offer.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "submitted" }),
    });
    expect(submit.status).toBe(200);

    const agentAccept = await request(`/transactions/offers/${first.offer.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "accepted" }),
    });
    expect(agentAccept.status).toBe(403);

    const counterResponse = await request(`/transactions/offers/${first.offer.id}/counter`, managerA, {
      method: "POST",
      body: json({ offeredAmount: 975000, currency: "AED", terms: { financing: "cash" } }),
    });
    expect(counterResponse.status).toBe(201);
    const counter = await counterResponse.json() as { offer: { id: string; version: number } };
    expect(counter.offer.version).toBe(2);

    await request(`/transactions/offers/${counter.offer.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "submitted" }),
    });
    const managerAccept = await request(`/transactions/offers/${counter.offer.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "accepted" }),
    });
    expect(managerAccept.status).toBe(200);

    const detail = await request(`/transactions/offers/${counter.offer.id}`, managerA);
    const payload = await detail.json() as { offer: { versions: Array<{ version: number }> } };
    expect(payload.offer.versions.map((item) => item.version)).toEqual([1, 2]);
  });
});

describe("reservation and contract conflicts", () => {
  test("requires manager activation and prevents double reservation", async () => {
    const now = Date.now();
    const firstResponse = await request("/transactions/reservations", agentA, {
      method: "POST",
      body: json({
        unitId: unitA,
        contactId: buyerA,
        startsAt: now,
        expiresAt: now + 3 * 86400000,
        depositAmount: 10000,
        currency: "AED",
      }),
    });
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json() as { reservation: { id: string } };

    expect((await request(`/transactions/reservations/${first.reservation.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(403);
    expect((await request(`/transactions/reservations/${first.reservation.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(200);

    const secondResponse = await request("/transactions/reservations", agentA, {
      method: "POST",
      body: json({
        unitId: unitA,
        contactId: tenantA,
        startsAt: now + 1000,
        expiresAt: now + 2 * 86400000,
        currency: "AED",
      }),
    });
    expect(secondResponse.status).toBe(201);
    const second = await secondResponse.json() as { reservation: { id: string } };
    const conflict = await request(`/transactions/reservations/${second.reservation.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    });
    expect(conflict.status).toBe(409);
  });

  test("converts a matching reservation into an active lease without a false conflict", async () => {
    const activeReservation = await db.select().from(transactionsSchema.reservations).where(and(
      eq(transactionsSchema.reservations.agencyId, agencyA),
      eq(transactionsSchema.reservations.unitId, unitA),
      eq(transactionsSchema.reservations.status, "active"),
    )).get();
    expect(activeReservation).toBeTruthy();

    const now = Date.now();
    const leaseResponse = await request("/transactions/leases", agentA, {
      method: "POST",
      body: json({
        unitId: unitA,
        reservationId: activeReservation!.id,
        landlordContactId: ownerA,
        tenantContactId: buyerA,
        startsAt: now + 5 * 86400000,
        endsAt: now + 370 * 86400000,
        rentAmount: 120000,
        rentFrequency: "annual",
        securityDeposit: 10000,
        currency: "AED",
      }),
    });
    expect(leaseResponse.status).toBe(201);
    const lease = await leaseResponse.json() as { lease: { id: string } };
    expect((await request(`/transactions/leases/${lease.lease.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "pending_approval" }),
    })).status).toBe(200);
    expect((await request(`/transactions/leases/${lease.lease.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(200);

    const reservationAfter = await db.select().from(transactionsSchema.reservations)
      .where(eq(transactionsSchema.reservations.id, activeReservation!.id)).get();
    expect(reservationAfter?.status).toBe("converted");
  });
});

describe("lease renewal and sale milestones", () => {
  test("creates a linked renewal without overwriting original terms", async () => {
    const activeLease = await db.select().from(transactionsSchema.leases).where(and(
      eq(transactionsSchema.leases.agencyId, agencyA),
      eq(transactionsSchema.leases.status, "active"),
    )).get();
    expect(activeLease).toBeTruthy();
    const originalEndsAt = activeLease!.endsAt;
    const response = await request(`/transactions/leases/${activeLease!.id}/renew`, managerA, {
      method: "POST",
      body: json({
        startsAt: originalEndsAt + 1,
        endsAt: originalEndsAt + 365 * 86400000,
        rentAmount: activeLease!.rentAmount + 5000,
      }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as { lease: { parentLeaseId: string; status: string } };
    expect(payload.lease.parentLeaseId).toBe(activeLease!.id);
    expect(payload.lease.status).toBe("draft");
    const original = await db.select().from(transactionsSchema.leases)
      .where(eq(transactionsSchema.leases.id, activeLease!.id)).get();
    expect(original?.endsAt).toBe(originalEndsAt);
    expect(original?.status).toBe("renewed");
  });

  test("does not complete a sale until milestones are complete", async () => {
    const now = Date.now();
    const saleResponse = await request("/transactions/sales", agentA, {
      method: "POST",
      body: json({
        propertyId: propertyA,
        buyerContactId: buyerA,
        sellerContactId: ownerA,
        agreedValue: 3000000,
        currency: "AED",
        milestones: [{ name: "Final payment", amount: 2500000, dueAt: now + 30 * 86400000 }],
      }),
    });
    expect(saleResponse.status).toBe(201);
    const sale = await saleResponse.json() as { sale: { id: string } };
    await request(`/transactions/sales/${sale.sale.id}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "pending_approval" }),
    });
    expect((await request(`/transactions/sales/${sale.sale.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(200);
    expect((await request(`/transactions/sales/${sale.sale.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "completed" }),
    })).status).toBe(409);

    const milestone = await db.select().from(transactionsSchema.saleMilestones).where(
      eq(transactionsSchema.saleMilestones.saleId, sale.sale.id),
    ).get();
    expect(milestone).toBeTruthy();
    expect((await request(
      `/transactions/sales/${sale.sale.id}/milestones/${milestone!.id}`,
      managerA,
      { method: "PATCH", body: json({ status: "completed" }) },
    )).status).toBe(200);
    expect((await request(`/transactions/sales/${sale.sale.id}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "completed" }),
    })).status).toBe(200);
  });
});

describe("versioned transaction documents", () => {
  test("stores a reproducible bilingual snapshot and never claims a PDF without a renderer", async () => {
    const acceptedOffer = await db.select().from(transactionsSchema.offers).where(and(
      eq(transactionsSchema.offers.agencyId, agencyA),
      eq(transactionsSchema.offers.status, "accepted"),
    )).get();
    expect(acceptedOffer).toBeTruthy();
    const response = await request("/transactions/documents/generate", agentA, {
      method: "POST",
      body: json({
        transactionType: "offer",
        transactionId: acceptedOffer!.id,
        language: "ar",
      }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as {
      document: {
        id: string;
        status: string;
        checksumSha256: string;
        snapshot: string;
        renderedHtml: string;
      };
    };
    expect(payload.document.status).toBe("html_ready");
    expect(payload.document.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.document.renderedHtml).toContain('dir="rtl"');

    const { canonicalSnapshot, checksumSha256 } = await import("./lib/transaction-documents");
    const canonical = canonicalSnapshot(JSON.parse(payload.document.snapshot) as Record<string, unknown>);
    expect(checksumSha256(`${canonical}\n${payload.document.renderedHtml}`))
      .toBe(payload.document.checksumSha256);

    expect((await request(`/transactions/documents/${payload.document.id}`, adminB)).status).toBe(404);
  });
});
