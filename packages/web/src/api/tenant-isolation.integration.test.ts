import "./context";
import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL = `file:tenant-isolation-${process.pid}.db`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.BETTER_AUTH_SECRET = "tenant-test-secret-with-more-than-32-characters";
process.env.WEBSITE_URL = "http://localhost:3000";
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");

type TestApp = Hono<any>;
let app: TestApp;

const statements = [
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
    id TEXT PRIMARY KEY, agency_id TEXT, lead_id TEXT, wa_message_id TEXT UNIQUE,
    direction TEXT, body TEXT, media_url TEXT, wa_contact_id TEXT,
    wa_contact_name TEXT, received_at INTEGER
  )`,
];

function json(body: unknown): string {
  return JSON.stringify(body);
}

function request(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-test-user", userId);
  if (init.body) headers.set("Content-Type", "application/json");
  return app.request(path, { ...init, headers });
}

beforeAll(async () => {
  const [{ databaseClient }, { db }, schema, leadRoutes, propertyRoutes, taskRoutes, agentRoutes, whatsappRoutes, migrationModule] = await Promise.all([
    import("./database"),
    import("./database"),
    import("./database/schema"),
    import("./routes/leads"),
    import("./routes/properties"),
    import("./routes/tasks"),
    import("./routes/agents"),
    import("./routes/whatsapp"),
    import("./database/migrations"),
  ]);

  for (const statement of statements) await databaseClient.execute(statement);
  await migrationModule.runApplicationMigrations();

  await db.insert(schema.agencies).values([
    { id: "agency-a", name: "Agency A" },
    { id: "agency-b", name: "Agency B" },
  ]).onConflictDoNothing();
  await db.insert(schema.profiles).values([
    { id: "admin-a", agencyId: "agency-a", role: "admin", active: 1 },
    { id: "manager-a", agencyId: "agency-a", role: "manager", active: 1 },
    { id: "agent-a", agencyId: "agency-a", role: "agent", active: 1 },
    { id: "agent-a2", agencyId: "agency-a", role: "agent", active: 1 },
    { id: "inactive-a", agencyId: "agency-a", role: "agent", active: 0 },
    { id: "admin-b", agencyId: "agency-b", role: "admin", active: 1 },
    { id: "agent-b", agencyId: "agency-b", role: "agent", active: 1 },
  ]).onConflictDoNothing();
  await db.insert(schema.leads).values([
    { id: "lead-a", agencyId: "agency-a", assignedTo: "agent-a", name: "Lead A", whatsappId: "971500000001" },
    { id: "lead-a-other", agencyId: "agency-a", assignedTo: "agent-a2", name: "Lead A2" },
    { id: "lead-b", agencyId: "agency-b", assignedTo: "agent-b", name: "Lead B", whatsappId: "971500000002" },
  ]).onConflictDoNothing();
  await db.insert(schema.properties).values([
    { id: "property-a", agencyId: "agency-a", listedBy: "admin-a", title: "Property A" },
    { id: "property-b", agencyId: "agency-b", listedBy: "admin-b", title: "Property B" },
  ]).onConflictDoNothing();
  await db.insert(schema.tasks).values([
    { id: "task-a", agencyId: "agency-a", assignedTo: "agent-a", createdBy: "admin-a", title: "Task A" },
    { id: "task-b", agencyId: "agency-b", assignedTo: "agent-b", createdBy: "admin-b", title: "Task B" },
  ]).onConflictDoNothing();
  await db.insert(schema.whatsappMessages).values({
    id: "message-b",
    agencyId: "agency-b",
    leadId: "lead-b",
    waMessageId: "wa-b",
    direction: "inbound",
    body: "Secret agency B message",
  }).onConflictDoNothing();
  await db.insert(schema.invitations).values({
    id: "invite-b",
    agencyId: "agency-b",
    email: "invite-b@example.com",
    name: "Invite B",
    role: "agent",
    tokenHash: "hash-b",
    invitedBy: "admin-b",
    expiresAt: Date.now() + 60_000,
  }).onConflictDoNothing();

  app = new Hono()
    .use("*", async (c, next) => {
      const userId = c.req.header("x-test-user");
      c.set("user", userId ? ({ id: userId } as any) : null);
      c.set("session", null);
      return next();
    })
    .route("/leads", leadRoutes.leads)
    .route("/properties", propertyRoutes.properties)
    .route("/tasks", taskRoutes.tasks)
    .route("/agents", agentRoutes.agents)
    .route("/whatsapp", whatsappRoutes.whatsapp);
});

describe("two-agency tenant isolation", () => {
  test("admin cannot read or mutate another agency's resources", async () => {
    expect((await request("/leads/lead-b", "admin-a")).status).toBe(404);
    expect((await request("/properties/property-b", "admin-a", {
      method: "PATCH",
      body: json({ title: "Cross-tenant edit" }),
    })).status).toBe(404);
    expect((await request("/tasks/task-b/done", "admin-a", { method: "PATCH" })).status).toBe(404);
    expect((await request("/agents/agent-b", "admin-a")).status).toBe(404);
    expect((await request("/whatsapp/leads/lead-b/messages", "admin-a")).status).toBe(404);
  });

  test("cross-agency assignments and links are rejected", async () => {
    expect((await request("/leads/lead-a", "admin-a", {
      method: "PATCH",
      body: json({ assignedTo: "agent-b" }),
    })).status).toBe(400);
    expect((await request("/leads/lead-a/properties", "admin-a", {
      method: "POST",
      body: json({ propertyId: "property-b" }),
    })).status).toBe(404);
    expect((await request("/tasks", "admin-a", {
      method: "POST",
      body: json({ title: "Invalid assignment", assignedTo: "agent-b" }),
    })).status).toBe(400);
    expect((await request("/tasks", "admin-a", {
      method: "POST",
      body: json({ title: "Invalid lead", leadId: "lead-b" }),
    })).status).toBe(404);
  });

  test("agents can access only their assigned records", async () => {
    expect((await request("/leads/lead-a", "agent-a")).status).toBe(200);
    expect((await request("/leads/lead-a-other", "agent-a")).status).toBe(404);
  });

  test("agents cannot enumerate staff or staff performance", async () => {
    expect((await request("/agents", "agent-a")).status).toBe(403);
    expect((await request("/agents/agent-a2", "agent-a")).status).toBe(403);
    expect((await request("/agents/agent-a2/stats", "agent-a")).status).toBe(403);
  });

  test("inactive profiles are blocked centrally", async () => {
    expect((await request("/leads", "inactive-a")).status).toBe(403);
  });

  test("managers cannot elevate privileges or manage administrators", async () => {
    expect((await request("/agents", "manager-a", {
      method: "POST",
      body: json({ name: "Escalation", email: "escalation@example.com", role: "admin" }),
    })).status).toBe(403);
    expect((await request("/agents/admin-a", "manager-a", {
      method: "PATCH",
      body: json({ active: 0 }),
    })).status).toBe(403);
  });

  test("invitations cannot be revoked across agencies", async () => {
    expect((await request("/agents/invitations/invite-b", "admin-a", {
      method: "DELETE",
    })).status).toBe(404);
  });
});
