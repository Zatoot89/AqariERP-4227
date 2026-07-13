type RuntimeEnv = Record<string, string | undefined>;

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEncryptionKey(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function configuredOrigins(env: RuntimeEnv): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requireValues(env: RuntimeEnv, names: string[], errors: string[]): void {
  for (const name of names) {
    if (!env[name]?.trim()) errors.push(`${name} is required in production`);
  }
}

export function validateRuntimeConfig(env: RuntimeEnv = process.env): string[] {
  const errors: string[] = [];
  const production = env.NODE_ENV === "production";

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    errors.push("BETTER_AUTH_SECRET must be at least 32 characters");
  }
  if (!env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL is required");
  }

  if (production) {
    if (!isHttpsUrl(env.WEBSITE_URL)) {
      errors.push("WEBSITE_URL must be a valid HTTPS URL in production");
    }

    const origins = configuredOrigins(env);
    if (origins.length === 0) {
      errors.push("ALLOWED_ORIGINS must explicitly list trusted production origins");
    }
    if (env.WEBSITE_URL && !origins.includes(env.WEBSITE_URL)) {
      errors.push("ALLOWED_ORIGINS must include WEBSITE_URL");
    }
    for (const origin of origins) {
      if (!isHttpsUrl(origin)) errors.push(`Untrusted non-HTTPS production origin: ${origin}`);
    }

    if (!isValidEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY)) {
      errors.push("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }

    requireValues(
      env,
      [
        "S3_ENDPOINT",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_BUCKET",
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "WHATSAPP_APP_SECRET",
        "WA_VERIFY_TOKEN",
      ],
      errors,
    );

    if (env.ALLOW_UNSIGNED_WHATSAPP_WEBHOOKS === "true") {
      errors.push("Unsigned WhatsApp webhooks are forbidden in production");
    }
    if (env.ENABLE_DEMO_SEED === "true") {
      errors.push("Demo seeding is forbidden in production");
    }
  }

  if (
    env.WHATSAPP_GRAPH_API_VERSION &&
    !/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_API_VERSION)
  ) {
    errors.push("WHATSAPP_GRAPH_API_VERSION must look like v20.0");
  }

  const invitationTtl = Number(env.INVITATION_TTL_MINUTES ?? 1440);
  if (!Number.isInteger(invitationTtl) || invitationTtl < 15 || invitationTtl > 10080) {
    errors.push("INVITATION_TTL_MINUTES must be an integer between 15 and 10080");
  }

  return [...new Set(errors)];
}

export function assertRuntimeConfig(env: RuntimeEnv = process.env): void {
  const errors = validateRuntimeConfig(env);
  if (errors.length > 0) {
    throw new Error(`Unsafe runtime configuration:\n- ${errors.join("\n- ")}`);
  }
}
