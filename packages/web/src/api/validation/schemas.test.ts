import { describe, expect, test } from "bun:test";
import {
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
    expect(entityIdSchema.safeParse("lead_01-AbC").success).toBe(true);
    expect(entityIdSchema.safeParse("../../other-tenant").success).toBe(false);
    expect(entityIdSchema.safeParse("").success).toBe(false);
  });
});

describe("lead validation", () => {
  test("rejects unknown and server-owned fields", () => {
    const result = createLeadSchema.safeParse({
      name: "Ahmed",
      agencyId: "other-agency",
      stage: "closed",
    });
    expect(result.success).toBe(false);
  });

  test("normalizes currency and clears optional values", () => {
    const result = updateLeadSchema.safeParse({
      phone: "",
      email: "",
      currency: "aed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.email).toBeNull();
      expect(result.data.currency).toBe("AED");
    }
  });

  test("rejects inverted budget ranges", () => {
    const result = createLeadSchema.safeParse({
      name: "Client",
      budgetMin: 500000,
      budgetMax: 100000,
    });
    expect(result.success).toBe(false);
  });

  test("validates list pagination and enums", () => {
    const valid = leadListQuerySchema.safeParse({
      page: "2",
      pageSize: "30",
      stage: "viewing",
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.page).toBe(2);

    expect(leadListQuerySchema.safeParse({ pageSize: "1000" }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ stage: "hacked" }).success).toBe(false);
  });
});

describe("property and upload validation", () => {
  test("rejects negative prices and unexpected ownership fields", () => {
    expect(createPropertySchema.safeParse({ title: "Villa", price: -1 }).success).toBe(false);
    expect(
      createPropertySchema.safeParse({ title: "Villa", listedBy: "another-user" }).success,
    ).toBe(false);
  });

  test("enforces image upload type and size", () => {
    expect(
      uploadRequestSchema.safeParse({
        filename: "villa.webp",
        contentType: "image/webp",
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      uploadRequestSchema.safeParse({
        filename: "malware.exe",
        contentType: "application/octet-stream",
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
    expect(
      uploadRequestSchema.safeParse({
        filename: "huge.jpg",
        contentType: "image/jpeg",
        sizeBytes: 11 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });
});

describe("staff, tasks, settings, and messaging", () => {
  test("requires a valid staff role and strong supplied password", () => {
    expect(
      createAgentSchema.safeParse({
        name: "Agent",
        email: "agent@example.com",
        role: "agent",
        password: "StrongPass123!",
      }).success,
    ).toBe(true);
    expect(
      createAgentSchema.safeParse({
        name: "Agent",
        email: "not-email",
        role: "owner",
        password: "123",
      }).success,
    ).toBe(false);
  });

  test("rejects invalid task dates and server fields", () => {
    expect(createTaskSchema.safeParse({ title: "Call client", dueAt: Date.now() }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: "Call client", dueAt: -1 }).success).toBe(false);
    expect(
      createTaskSchema.safeParse({ title: "Call client", agencyId: "other-agency" }).success,
    ).toBe(false);
  });

  test("does not accept an empty settings update", () => {
    expect(updateAgencySchema.safeParse({}).success).toBe(false);
    expect(updateAgencySchema.safeParse({ currency: "aed" }).success).toBe(true);
    expect(updateAgencySchema.safeParse({ plan: "full" }).success).toBe(false);
  });

  test("trims and limits WhatsApp message bodies", () => {
    const valid = sendWhatsappMessageSchema.safeParse({ body: "  Hello  " });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.body).toBe("Hello");
    expect(sendWhatsappMessageSchema.safeParse({ body: "" }).success).toBe(false);
    expect(sendWhatsappMessageSchema.safeParse({ body: "x".repeat(4097) }).success).toBe(false);
  });
});
