import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  buildAllowedOrigins,
  resolveAllowedOrigin,
  sanitizeUploadFilename,
  verifyHmacSha256,
} from "./security";

describe("origin policy", () => {
  test("allows only configured production origins", () => {
    const origins = buildAllowedOrigins({
      configured: "https://app.aqari.example, https://admin.aqari.example",
      websiteUrl: "https://app.aqari.example",
      nodeEnv: "production",
    });

    expect(resolveAllowedOrigin("https://app.aqari.example", origins)).toBe(
      "https://app.aqari.example",
    );
    expect(resolveAllowedOrigin("https://attacker.example", origins)).toBe("");
    expect(origins.has("http://localhost:3000")).toBe(false);
  });

  test("adds local origins outside production", () => {
    const origins = buildAllowedOrigins({ nodeEnv: "development" });
    expect(origins.has("http://localhost:3000")).toBe(true);
    expect(origins.has("http://localhost:4200")).toBe(true);
  });
});

describe("upload filename policy", () => {
  test("removes path traversal and unsafe characters", () => {
    expect(sanitizeUploadFilename("../../owner passport (final).png")).toBe(
      "owner_passport__final_.png",
    );
  });
});

describe("WhatsApp webhook signatures", () => {
  test("accepts the matching HMAC and rejects altered payloads", () => {
    const secret = "test-app-secret";
    const payload = JSON.stringify({ entry: [{ id: "1" }] });
    const digest = createHmac("sha256", secret).update(payload).digest("hex");
    const signature = `sha256=${digest}`;

    expect(verifyHmacSha256(payload, signature, secret)).toBe(true);
    expect(verifyHmacSha256(`${payload}x`, signature, secret)).toBe(false);
    expect(verifyHmacSha256(payload, "sha256=invalid", secret)).toBe(false);
  });
});
