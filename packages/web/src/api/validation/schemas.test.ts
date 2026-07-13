import { describe, expect, test } from "bun:test";
import {
  auditLogQuerySchema,
  createAgentSchema,
  createLeadSchema,
  createPropertySchema,
  createTaskSchema,
  entityIdSchema,
  leadListQuerySchema,
  sendWhatsappMessageSchema,
  updateAgencySchema,
  updateLeadSchema,
  uploadRequestSchema,
} from "./schemas";

describe("entity IDs", () => {
  test("accepts generated-style IDs and rejects path-like values", () => {
    expect(entityIdSchema.safeParse("abc_123-XYZ").success).toBe(true);
    expect(entityIdSchema.safeParse("../../agency-b").success).toBe(false);
  });
});

describe("lead payloads", () => {
  test("rejects server-owned and unknown fields", () => {
    const result = createLeadSchema.safeParse({
      name: "Valid Lead",
      agencyId: "agency-b",
      stage: "closed",
      createdAt: 1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects inverted budgets and normalizes clearable fields", () => {
    expect(createLeadSchema.safeParse({
      name: "Budget Lead",
      budgetMin: 900,
      budgetMax: 100,
    }).success).toBe(false);

    const update = updateLeadSchema.parse({
      phone: "",
      email: "",
      currency: "aed",
    });
    expect(update.phone).toBeNull();
    expect(update.email).toBeNull();
    expect(update.currency).toBe("AED");
  });
});

describe("property payloads", () => {
  test("rejects raw object keys and accepts unique attachment IDs", () => {
    expect(createPropertySchema.safeParse({
      title: "Unsafe",
      images: JSON.stringify(["agencies/other/property.jpg"]),
    }).success).toBe(false);

    const parsed = createPropertySchema.parse({
      title: "Structured",
      attachmentIds: ["attachment-a", "attachment-b"],
    });
    expect(parsed.attachmentIds).toEqual(["attachment-a", "attachment-b"]);
    expect(createPropertySchema.safeParse({
      title: "Duplicate",
      attachmentIds: ["attachment-a", "attachment-a"],
    }).success).toBe(false);
  });

  test("rejects negative property values", () => {
    expect(createPropertySchema.safeParse({
      title: "Invalid",
      price: -1,
    }).success).toBe(false);
  });
});

describe("task and staff payloads", () => {
  test("rejects invalid task types and creator override", () => {
    expect(createTaskSchema.safeParse({ title: "Task", type: "system" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "Task", createdBy: "other" }).success).toBe(false);
  });

  test("requires staff identity and strong explicit passwords", () => {
    expect(createAgentSchema.safeParse({
      name: "Agent",
      email: "not-an-email",
      role: "agent",
    }).success).toBe(false);
    expect(createAgentSchema.safeParse({
      name: "Agent",
      email: "agent@example.com",
      role: "agent",
      password: "short",
    }).success).toBe(false);
  });
});

describe("agency settings", () => {
  test("rejects plan and direct raw logo mutation", () => {
    expect(updateAgencySchema.safeParse({ plan: "enterprise" }).success).toBe(false);
    expect(updateAgencySchema.safeParse({ logoUrl: "agencies/other/logo.png" }).success).toBe(false);
    expect(updateAgencySchema.safeParse({ logoAttachmentId: "attachment-logo" }).success).toBe(true);
  });

  test("requires at least one field", () => {
    expect(updateAgencySchema.safeParse({}).success).toBe(false);
  });
});

describe("uploads and queries", () => {
  test("requires size metadata and rejects unsupported or oversized uploads", () => {
    expect(uploadRequestSchema.safeParse({
      filename: "payload.svg",
      contentType: "image/svg+xml",
      sizeBytes: 100,
    }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({
      filename: "huge.png",
      contentType: "image/png",
      sizeBytes: 10 * 1024 * 1024 + 1,
    }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({
      filename: "missing-size.png",
      contentType: "image/png",
    }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({
      filename: "safe.webp",
      contentType: "image/webp",
      sizeBytes: 2048,
      checksumSha256: "a".repeat(64),
      purpose: "property",
    }).success).toBe(true);
  });

  test("rejects invalid pagination and audit filters", () => {
    expect(leadListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ pageSize: "999" }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ entityId: "../../other" }).success).toBe(false);
  });

  test("limits WhatsApp message length", () => {
    expect(sendWhatsappMessageSchema.safeParse({ body: "x".repeat(4097) }).success).toBe(false);
    expect(sendWhatsappMessageSchema.safeParse({ body: " hello " }).success).toBe(true);
  });
});
