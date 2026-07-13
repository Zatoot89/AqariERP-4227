import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";
const ALGORITHM = "aes-256-gcm";

function decodeKey(encoded: string | undefined): Buffer {
  if (!encoded) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function isEncryptedCredential(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

export function encryptCredential(
  value: string,
  encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY,
): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Credential must not be empty");

  const key = decodeKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptCredential(
  value: string | null | undefined,
  encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY,
): string | null {
  if (!value) return null;

  if (!isEncryptedCredential(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Plaintext integration credentials are not permitted in production");
    }
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted credential format");

  const [marker, version, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  if (`${marker}:${version}` !== PREFIX) {
    throw new Error("Unsupported encrypted credential version");
  }

  const key = decodeKey(encodedKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivEncoded, "base64"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
