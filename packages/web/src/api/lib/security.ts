import { createHmac, timingSafeEqual } from "node:crypto";

export function buildAllowedOrigins(options: {
  configured?: string;
  websiteUrl?: string;
  nodeEnv?: string;
}): Set<string> {
  const origins = new Set(
    (options.configured ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (options.websiteUrl) origins.add(options.websiteUrl);
  if (options.nodeEnv !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:4200");
  }
  return origins;
}

export function resolveAllowedOrigin(origin: string, allowedOrigins: Set<string>): string {
  return allowedOrigins.has(origin) ? origin : "";
}

export function sanitizeUploadFilename(filename: string): string {
  return (
    filename
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9_.-]/g, "_")
      .slice(-180) ?? "upload"
  );
}

export function verifyHmacSha256(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const receivedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
