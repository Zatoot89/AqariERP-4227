import { createHash, randomBytes } from "node:crypto";

const DEFAULT_TTL_MINUTES = 24 * 60;

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationExpiresAt(
  now = Date.now(),
  configuredMinutes = process.env.INVITATION_TTL_MINUTES,
): number {
  const parsed = Number(configuredMinutes);
  const minutes = Number.isFinite(parsed) && parsed >= 15 && parsed <= 10080
    ? parsed
    : DEFAULT_TTL_MINUTES;
  return now + minutes * 60_000;
}
