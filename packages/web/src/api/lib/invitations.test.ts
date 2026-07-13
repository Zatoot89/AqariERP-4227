import { describe, expect, test } from "bun:test";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "./invitations";

describe("staff invitations", () => {
  test("creates high-entropy tokens and stores only deterministic hashes", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(second).not.toBe(first);
    expect(hashInvitationToken(first)).toHaveLength(64);
    expect(hashInvitationToken(first)).toBe(hashInvitationToken(first));
    expect(hashInvitationToken(first)).not.toContain(first);
  });

  test("uses the configured TTL within safe limits", () => {
    const now = 1_700_000_000_000;
    expect(invitationExpiresAt(now, "60")).toBe(now + 60 * 60_000);
  });

  test("falls back to one day for unsafe TTL configuration", () => {
    const now = 1_700_000_000_000;
    expect(invitationExpiresAt(now, "5")).toBe(now + 24 * 60 * 60_000);
    expect(invitationExpiresAt(now, "not-a-number")).toBe(now + 24 * 60 * 60_000);
  });
});
