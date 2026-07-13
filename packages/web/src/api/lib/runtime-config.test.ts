import { describe, expect, test } from "bun:test";
import { validateRuntimeConfig } from "./runtime-config";

const safeProductionEnv = {
  NODE_ENV: "production",
  WEBSITE_URL: "https://app.example.com",
  ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
  BETTER_AUTH_SECRET: "a-secure-auth-secret-with-more-than-32-characters",
  DATABASE_URL: "libsql://database.example.com",
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  S3_ENDPOINT: "https://storage.example.com",
  S3_ACCESS_KEY_ID: "storage-key",
  S3_SECRET_ACCESS_KEY: "storage-secret",
  S3_BUCKET: "aqari-production",
  RESEND_API_KEY: "resend-key",
  EMAIL_FROM: "Aqari ERP <noreply@example.com>",
  INVITATION_TTL_MINUTES: "1440",
  WHATSAPP_APP_SECRET: "meta-app-secret",
  WA_VERIFY_TOKEN: "webhook-verify-token",
  WHATSAPP_GRAPH_API_VERSION: "v20.0",
};

describe("runtime configuration", () => {
  test("accepts a secure production configuration", () => {
    expect(validateRuntimeConfig(safeProductionEnv)).toEqual([]);
  });

  test("rejects unsafe production settings", () => {
    const errors = validateRuntimeConfig({
      ...safeProductionEnv,
      WEBSITE_URL: "http://app.example.com",
      ALLOWED_ORIGINS: "http://app.example.com",
      BETTER_AUTH_SECRET: "short",
      CREDENTIAL_ENCRYPTION_KEY: "invalid",
      ALLOW_UNSIGNED_WHATSAPP_WEBHOOKS: "true",
      ENABLE_DEMO_SEED: "true",
    });

    expect(errors.join("\n")).toContain("HTTPS URL");
    expect(errors.join("\n")).toContain("at least 32 characters");
    expect(errors.join("\n")).toContain("base64-encoded 32-byte key");
    expect(errors.join("\n")).toContain("Unsigned WhatsApp webhooks");
    expect(errors.join("\n")).toContain("Demo seeding");
  });

  test("rejects missing production service dependencies", () => {
    const errors = validateRuntimeConfig({
      ...safeProductionEnv,
      DATABASE_URL: "",
      S3_BUCKET: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    }).join("\n");

    expect(errors).toContain("DATABASE_URL");
    expect(errors).toContain("S3_BUCKET");
    expect(errors).toContain("RESEND_API_KEY");
    expect(errors).toContain("EMAIL_FROM");
  });

  test("rejects invalid invitation TTL and Graph API versions", () => {
    const errors = validateRuntimeConfig({
      ...safeProductionEnv,
      INVITATION_TTL_MINUTES: "5",
      WHATSAPP_GRAPH_API_VERSION: "latest",
    }).join("\n");

    expect(errors).toContain("INVITATION_TTL_MINUTES");
    expect(errors).toContain("v20.0");
  });
});
