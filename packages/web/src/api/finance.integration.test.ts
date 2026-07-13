import "./context";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

process.env.DATABASE_URL = `file:finance-${process.pid}-${Date.now()}.db`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.BETTER_AUTH_SECRET = "finance-integration-test-secret-over-32-characters";
process.env.WEBSITE_URL = "http://localhost:3000";

const agencyA = "fin-agency-a";
const agencyB = "fin-agency-b";
const adminA = "fin-admin-a";
const managerA = "fin-manager-a";
const agentA = "fin-agent-a";
const adminB = "fin-admin-b";
const ownerA = "fin-owner-a";
const tenantA = "fin-tenant-a";
const buyerA = "fin-buyer-a";
const propertyA = "fin-property-a";
const propertySale = "fin-property-sale";
const unitA = "fin-unit-a";
const leaseA = "fin-lease-a";
const saleA = "fin-sale-a";

let app: Hono<any>;
let db: Awaited<typeof import("./database")>["db"];
let databaseClient: Awaited<typeof import("./database")>["databaseClient"];
let schema: typeof import("./database/schema");
let core: typeof import("./database/core-domain-schema");
let transactions: typeof import("./database/transaction-schema");
let finance: typeof import("./database/finance-schema");
let scheduleId = "";
let scheduleItemId = "";
let invoiceId = "";
let receiptId = "";
let secondAllocationId = "";
let expenseId = "";
let commissionId = "";
let firstSplitId = "";
let firstPayoutId = "";

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

beforeAll(async () => {
  const database = await import("./database");
  db = database.db;
  databaseClient = database.databaseClient;
  schema = await import("./database/schema");
  core = await import("./database/core-domain-schema");
  transactions = await import("./database/transaction-schema");
  finance = await import("./database/finance-schema");

  for (const statement of baseTables) await databaseClient.execute(statement);
  const { runApplicationMigrations } = await import("./database/migrations");
  const { runDataFoundationMigrations } = await import("./database/data-foundation-migrations");
  const { runCoreDomainMigrations } = await import("./database/core-domain-migrations");
  const { runTransactionMigrations } = await import("./database/transaction-migrations");
  const { runFinanceMigrations } = await import("./database/finance-migrations");
  await runApplicationMigrations();
  await runDataFoundationMigrations();
  await runCoreDomainMigrations();
  await runTransactionMigrations();
  await runFinanceMigrations();
  await runFinanceMigrations();

  const now = Date.now();
  await db.insert(schema.agencies).values([
    { id: agencyA, name: "Finance Agency A", createdAt: now },
    { id: agencyB, name: "Finance Agency B", createdAt: now },
  ]).onConflictDoNothing();
  await db.insert(schema.user).values([
    { id: adminA, name: "Admin A", email: "finance-admin-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: managerA, name: "Manager A", email: "finance-manager-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: agentA, name: "Agent A", email: "finance-agent-a@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
    { id: adminB, name: "Admin B", email: "finance-admin-b@example.com", emailVerified: false, createdAt: new Date(now), updatedAt: new Date(now) },
  ]).onConflictDoNothing();
  await db.insert(schema.profiles).values([
    { id: adminA, agencyId: agencyA, role: "admin", active: 1, createdAt: now },
    { id: managerA, agencyId: agencyA, role: "manager", active: 1, createdAt: now },
    { id: agentA, agencyId: agencyA, role: "agent", active: 1, createdAt: now },
    { id: adminB, agencyId: agencyB, role: "admin", active: 1, createdAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.contacts).values([
    { id: ownerA, agencyId: agencyA, contactType: "person", displayName: "Owner A", preferredLanguage: "en", normalizedName: "owner a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: tenantA, agencyId: agencyA, contactType: "person", displayName: "Tenant A", preferredLanguage: "en", normalizedName: "tenant a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: buyerA, agencyId: agencyA, contactType: "person", displayName: "Buyer A", preferredLanguage: "en", normalizedName: "buyer a", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: "fin-contact-b", agencyId: agencyB, contactType: "person", displayName: "Contact B", preferredLanguage: "en", normalizedName: "contact b", createdBy: adminB, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.inventoryProperties).values([
    { id: propertyA, agencyId: agencyA, title: "Rental Tower", propertyType: "building", purpose: "rent", status: "available", currency: "AED", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: propertySale, agencyId: agencyA, title: "Sale Property", propertyType: "villa", purpose: "sale", status: "available", currency: "AED", createdBy: adminA, createdAt: now, updatedAt: now },
    { id: "fin-property-b", agencyId: agencyB, title: "Other Agency", propertyType: "villa", purpose: "sale", status: "available", currency: "AED", createdBy: adminB, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing();
  await db.insert(core.units).values({
    id: unitA, agencyId: agencyA, propertyId: propertyA, unitNumber: "A-101",
    unitType: "apartment", purpose: "rent", status: "rented", parkingSpaces: 1,
    furnishing: "unfurnished", currency: "AED", createdBy: adminA, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(transactions.leases).values({
    id: leaseA,
    agencyId: agencyA,
    leaseNumber: "LSE-2026-900001",
    unitId: unitA,
    landlordContactId: ownerA,
    tenantContactId: tenantA,
    status: "active",
    startsAt: now,
    endsAt: now + 365 * 86400000,
    noticeDays: 30,
    rentAmount: 120000,
    rentFrequency: "annual",
    securityDeposit: 10000,
    currency: "AED",
    createdBy: adminA,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(transactions.sales).values({
    id: saleA,
    agencyId: agencyA,
    saleNumber: "SAL-2026-900001",
    propertyId: propertySale,
    buyerContactId: buyerA,
    sellerContactId: ownerA,
    status: "active",
    agreedValue: 1000000,
    depositAmount: 100000,
    currency: "AED",
    agreementAt: now,
    createdBy: adminA,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const { finance: financeRoutes } = await import("./routes/finance");
  app = new Hono<any>()
    .use("*", async (c, next) => {
      const userId = c.req.header("x-test-user");
      c.set("user", userId ? ({ id: userId } as { id: string }) : null);
      c.set("session", null);
      await next();
    })
    .route("/finance", financeRoutes);
});

describe("schedule invoice and receipt lifecycle", () => {
  test("generates and activates a lease schedule", async () => {
    const response = await request("/finance/schedules/generate", agentA, {
      method: "POST",
      body: json({ sourceType: "lease", sourceId: leaseA, installmentCount: 4 }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json() as { schedule: { id: string; scheduleNumber: string; totalAmount: number } };
    scheduleId = payload.schedule.id;
    expect(payload.schedule.scheduleNumber).toMatch(/^SCH-\d{4}-\d{6}$/);
    expect(payload.schedule.totalAmount).toBe(480000);

    expect((await request(`/finance/schedules/${scheduleId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(403);
    expect((await request(`/finance/schedules/${scheduleId}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "active" }),
    })).status).toBe(200);

    const detail = await request(`/finance/schedules/${scheduleId}`, agentA);
    const schedule = await detail.json() as { schedule: { items: Array<{ id: string; amount: number }> } };
    expect(schedule.schedule.items).toHaveLength(4);
    scheduleItemId = schedule.schedule.items[0].id;
    expect(schedule.schedule.items[0].amount).toBe(120000);
  });

  test("issues an invoice and allocates a receipt without overpayment", async () => {
    const invoiceResponse = await request(`/finance/invoices/from-schedule-item/${scheduleItemId}`, agentA, { method: "POST" });
    expect(invoiceResponse.status).toBe(201);
    const created = await invoiceResponse.json() as { invoice: { id: string; invoiceNumber: string } };
    invoiceId = created.invoice.id;
    expect(created.invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect((await request(`/finance/invoices/${invoiceId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "issued" }),
    })).status).toBe(200);

    const receiptResponse = await request("/finance/receipts", agentA, {
      method: "POST",
      body: json({
        contactId: tenantA,
        paymentDate: Date.now(),
        amount: 120000,
        currency: "AED",
        paymentMethod: "bank_transfer",
        externalReference: "BANK-001",
        allocations: [{ invoiceId, amount: 60000 }],
      }),
    });
    expect(receiptResponse.status).toBe(201);
    const receiptPayload = await receiptResponse.json() as { receipt: { id: string; allocatedAmount: number } };
    receiptId = receiptPayload.receipt.id;
    expect(receiptPayload.receipt.allocatedAmount).toBe(60000);

    const secondAllocationResponse = await request(`/finance/receipts/${receiptId}/allocate`, agentA, {
      method: "POST",
      body: json({ invoiceId, amount: 60000 }),
    });
    expect(secondAllocationResponse.status).toBe(201);
    const allocationPayload = await secondAllocationResponse.json() as { allocation: { id: string } };
    secondAllocationId = allocationPayload.allocation.id;

    const invoice = await db.select().from(finance.invoices).where(eq(finance.invoices.id, invoiceId)).get();
    expect(invoice?.status).toBe("paid");
    expect(invoice?.balanceDue).toBe(0);

    expect((await request(`/finance/receipts/${receiptId}/allocate`, agentA, {
      method: "POST",
      body: json({ invoiceId, amount: 1 }),
    })).status).toBe(409);
  });

  test("reverses an allocation and restores every derived balance", async () => {
    expect((await request(`/finance/receipts/${receiptId}/allocations/${secondAllocationId}/reverse`, managerA, {
      method: "PATCH",
      body: json({ reason: "Bank transfer reversed" }),
    })).status).toBe(200);
    const [invoice, receipt, item, schedule] = await Promise.all([
      db.select().from(finance.invoices).where(eq(finance.invoices.id, invoiceId)).get(),
      db.select().from(finance.receipts).where(eq(finance.receipts.id, receiptId)).get(),
      db.select().from(finance.paymentScheduleItems).where(eq(finance.paymentScheduleItems.id, scheduleItemId)).get(),
      db.select().from(finance.paymentSchedules).where(eq(finance.paymentSchedules.id, scheduleId)).get(),
    ]);
    expect(invoice?.status).toBe("partially_paid");
    expect(invoice?.paidAmount).toBe(60000);
    expect(invoice?.balanceDue).toBe(60000);
    expect(receipt?.allocatedAmount).toBe(60000);
    expect(item?.paidAmount).toBe(60000);
    expect(schedule?.paidAmount).toBe(60000);
  });
});

describe("expense approval lifecycle", () => {
  test("requires management approval and payment", async () => {
    const response = await request("/finance/expenses", agentA, {
      method: "POST",
      body: json({
        category: "maintenance",
        propertyId: propertyA,
        unitId: unitA,
        description: "Air conditioning repair",
        incurredAt: Date.now(),
        subtotal: 1000,
        taxAmount: 50,
        currency: "AED",
      }),
    });
    expect(response.status).toBe(201);
    expenseId = (await response.json() as { expense: { id: string } }).expense.id;
    expect((await request(`/finance/expenses/${expenseId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "submitted" }),
    })).status).toBe(200);
    expect((await request(`/finance/expenses/${expenseId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "approved" }),
    })).status).toBe(403);
    expect((await request(`/finance/expenses/${expenseId}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "approved" }),
    })).status).toBe(200);
    expect((await request(`/finance/expenses/${expenseId}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "paid", paymentMethod: "bank_transfer", paymentReference: "EXP-PAY-1" }),
    })).status).toBe(200);
    const expense = await db.select().from(finance.expenses).where(eq(finance.expenses.id, expenseId)).get();
    expect(expense?.status).toBe("paid");
    expect(expense?.totalAmount).toBe(1050);
  });
});

describe("commission approval and payouts", () => {
  test("calculates splits, approves, pays, rejects overpayment, and voids", async () => {
    const response = await request("/finance/commissions", agentA, {
      method: "POST",
      body: json({
        transactionType: "sale",
        transactionId: saleA,
        basisType: "percentage",
        basisValue: 2,
        currency: "AED",
        splits: [
          { recipientType: "profile", recipientProfileId: agentA, splitType: "percentage", splitValue: 60 },
          { recipientType: "profile", recipientProfileId: managerA, splitType: "percentage", splitValue: 40 },
        ],
      }),
    });
    expect(response.status).toBe(201);
    commissionId = (await response.json() as { commission: { id: string } }).commission.id;
    await request(`/finance/commissions/${commissionId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "pending_approval" }),
    });
    expect((await request(`/finance/commissions/${commissionId}/transition`, agentA, {
      method: "PATCH",
      body: json({ toState: "approved" }),
    })).status).toBe(403);
    expect((await request(`/finance/commissions/${commissionId}/transition`, managerA, {
      method: "PATCH",
      body: json({ toState: "approved" }),
    })).status).toBe(200);

    const detail = await request(`/finance/commissions/${commissionId}`, managerA);
    const commission = await detail.json() as { commission: { grossCommission: number; splits: Array<{ id: string; amount: number }> } };
    expect(commission.commission.grossCommission).toBe(20000);
    expect(commission.commission.splits.map((split) => split.amount)).toEqual([12000, 8000]);
    firstSplitId = commission.commission.splits[0].id;

    const payoutResponse = await request(`/finance/commissions/${commissionId}/payouts`, managerA, {
      method: "POST",
      body: json({ splitId: firstSplitId, amount: 12000, paymentDate: Date.now(), paymentMethod: "bank_transfer" }),
    });
    expect(payoutResponse.status).toBe(201);
    firstPayoutId = (await payoutResponse.json() as { payout: { id: string } }).payout.id;
    expect((await request(`/finance/commissions/${commissionId}/payouts`, managerA, {
      method: "POST",
      body: json({ splitId: firstSplitId, amount: 1, paymentDate: Date.now(), paymentMethod: "cash" }),
    })).status).toBe(409);
    expect((await request(`/finance/commissions/${commissionId}/payouts/${firstPayoutId}/void`, managerA, {
      method: "PATCH",
      body: json({ reason: "Incorrect bank account" }),
    })).status).toBe(200);
    const afterVoid = await db.select().from(finance.commissions).where(eq(finance.commissions.id, commissionId)).get();
    expect(afterVoid?.paidAmount).toBe(0);
    expect(afterVoid?.status).toBe("approved");
  });
});

describe("reconciliation and tenant isolation", () => {
  test("reports a clean operational subledger", async () => {
    const response = await request("/finance/reports/reconcile", managerA, { method: "POST" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { reconciliation: { status: string; discrepancies: unknown[] } };
    expect(payload.reconciliation.status).toBe("clean");
    expect(payload.reconciliation.discrepancies).toEqual([]);
  });

  test("does not expose another agency's finance documents", async () => {
    expect((await request(`/finance/invoices/${invoiceId}`, adminB)).status).toBe(404);
    expect((await request(`/finance/receipts/${receiptId}`, adminB)).status).toBe(404);
    expect((await request(`/finance/expenses/${expenseId}`, adminB)).status).toBe(404);
    expect((await request(`/finance/commissions/${commissionId}`, adminB)).status).toBe(404);
  });

  test("database rejects cross-tenant finance relationships", async () => {
    expect(db.insert(finance.receipts).values({
      id: "cross-tenant-receipt",
      agencyId: agencyA,
      receiptNumber: "RCT-2026-999999",
      contactId: "fin-contact-b",
      status: "posted",
      paymentDate: Date.now(),
      amount: 100,
      allocatedAmount: 0,
      currency: "AED",
      paymentMethod: "cash",
      receivedBy: adminA,
      createdAt: Date.now(),
    })).rejects.toThrow();
  });
});
