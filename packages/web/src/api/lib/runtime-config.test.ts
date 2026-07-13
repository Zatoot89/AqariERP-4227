import { describe, expect, test } from "bun:test";
import { validateRuntimeConfig } from "./runtime-config";

const safeProductionEnv = {
  NODE_ENV: "production",
  WEBSITE_URL: "https://app.example.com",
  ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
  BETTER_AUTH_SECRET: "a-secure-auth-secret-with-more-than-32-characters",
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
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

  test("rejects unsupported Graph API version formats", () => {
    expect(
      validateRuntimeConfig({
        ...safeProductionEnv,
        WHATSAPP_GRAPH_API_VERSION: "latest",
      }).join("\n"),
    ).toContain("v20.0");
  });
});
