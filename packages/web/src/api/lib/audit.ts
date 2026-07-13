import type { Context } from "hono";
import * as schema from "../database/schema";
import { nanoid } from "./id";

export type AuditInput = {
  agencyId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

function requestIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || null;
}

export function auditRecord(c: Context, input: AuditInput): typeof schema.auditLogs.$inferInsert {
  return {
    id: nanoid(),
    agencyId: input.agencyId,
    actorId: input.actorId ?? c.get("user")?.id ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    ipAddress: requestIp(c),
    userAgent: c.req.header("user-agent")?.slice(0, 1000) ?? null,
    createdAt: Date.now(),
  };
}
