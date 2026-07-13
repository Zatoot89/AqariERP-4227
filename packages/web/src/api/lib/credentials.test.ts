import { describe, expect, test } from "bun:test";
import {
  decryptCredential,
  encryptCredential,
  isEncryptedCredential,
} from "./credentials";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 9).toString("base64");

describe("credential encryption", () => {
  test("round-trips without exposing plaintext", () => {
    const encrypted = encryptCredential("secret-access-token", key);
    expect(isEncryptedCredential(encrypted)).toBe(true);
    expect(encrypted).not.toContain("secret-access-token");
    expect(decryptCredential(encrypted, key)).toBe("secret-access-token");
  });

  test("rejects the wrong key and malformed envelopes", () => {
    const encrypted = encryptCredential("secret-access-token", key);
    expect(() => decryptCredential(encrypted, otherKey)).toThrow();
    expect(() => decryptCredential("enc:v1:not-valid", key)).toThrow(
      "Invalid encrypted credential format",
    );
  });

  test("requires an exact 32-byte base64 key", () => {
    expect(() => encryptCredential("secret", "dG9vLXNob3J0")).toThrow(
      "base64-encoded 32-byte key",
    );
  });
});
