import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import { contacts } from "../database/core-domain-schema";
import {
  commissionPayouts,
  commissions as commissionTable,
  commissionSplits,
  financeEvents,
} from "../database/finance-schema";
import { auditLogs, profiles } from "../database/schema";
import { leases, sales } from "../database/transaction-schema";
import { auditRecord } from "../lib/audit";
import { assertFinanceTransition, requireReason, roundMoney, type StaffRole } from "../lib/finance-lifecycle";
import { nextFinanceNumber } from "../lib/finance-number";
import { nanoid } from "../lib/id";
import { parseJson, parseParam, parseQuery } from "../lib/validation";
import { requireRole, requireTenant } from "../middleware/auth";
import {
  commissionTransitionSchema,
  createCommissionPayoutSchema,
  createCommissionSchema,
  financeListQuerySchema,
  voidCommissionPayoutSchema,
} from "../validation/finance";
import { entityIdSchema } from "../validation/schemas";

async function findCommission(agencyId: string, id: string) {
  return db.select().from(commissionTable).where(and(
    eq(commissionTable.id, id),
    eq(commissionTable.agencyId, agencyId),
  )).get();
}

async function transactionValue(
  agencyId: string,
  type: "lease" | "sale",
  id: string,
): Promise<{ value: number; currency: string } | undefined> {
  if (type === "lease") {
    const lease = await db.select().from(leases).where(and(
      eq(leases.id, id),
      eq(leases.agencyId, agencyId),
    )).get();
    if (!lease || !["active", "renewal_due", "renewed", "completed"].includes(lease.status)) return undefined;
    return { value: lease.rentAmount, currency: lease.currency };
  }
  const sale = await db.select().from(sales).where(and(
    eq(sales.id, id),
    eq(sales.agencyId, agencyId),
  )).get();
  if (!sale || !["active", "completed"].includes(sale.status)) return undefined;
  return { value: sale.agreedValue, currency: sale.currency };
}

export const financeCommissions = new Hono()
  .get("/", requireTenant, async (c) => {
    const parsed = parseQuery(c, financeListQuerySchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const rows = await db.select().from(commissionTable).where(and(
      eq(commissionTable.agencyId, agencyId),
      parsed.data.status ? eq(commissionTable.status, parsed.data.status) : undefined,
      parsed.data.sourceType ? eq(commissionTable.transactionType, parsed.data.sourceType) : undefined,
      parsed.data.sourceId ? eq(commissionTable.transactionId, parsed.data.sourceId) : undefined,
    )).orderBy(desc(commissionTable.updatedAt))
      .limit(parsed.data.pageSize)
      .offset((parsed.data.page - 1) * parsed.data.pageSize);
    return c.json({ commissions: rows, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
  })
  .post("/", requireTenant, async (c) => {
    const parsed = await parseJson(c, createCommissionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const transaction = await transactionValue(agencyId, parsed.data.transactionType, parsed.data.transactionId);
    if (!transaction) return c.json({ error: "Eligible lease or sale not found" }, 404);
    if (parsed.data.currency !== transaction.currency) {
      return c.json({ error: "Commission currency must match the transaction currency" }, 400);
    }
    const grossCommission = roundMoney(
      parsed.data.basisType === "percentage"
        ? transaction.value * parsed.data.basisValue / 100
        : parsed.data.basisValue,
    );
    const splits = parsed.data.splits.map((split) => ({
      ...split,
      amount: roundMoney(
        split.splitType === "percentage"
          ? grossCommission * split.splitValue / 100
          : split.splitValue,
      ),
    }));
    const totalSplit = roundMoney(splits.reduce((sum, split) => sum + split.amount, 0));
    const totalPercentage = splits
      .filter((split) => split.splitType === "percentage")
      .reduce((sum, split) => sum + split.splitValue, 0);
    if (totalPercentage > 100.0001 || totalSplit > grossCommission + 0.009) {
      return c.json({ error: "Commission splits exceed the gross commission" }, 400);
    }
    for (const split of splits) {
      if (split.recipientProfileId) {
        const profile = await db.select({ id: profiles.id }).from(profiles).where(and(
          eq(profiles.id, split.recipientProfileId),
          eq(profiles.agencyId, agencyId),
          eq(profiles.active, 1),
        )).get();
        if (!profile) return c.json({ error: "Commission profile recipient not found" }, 404);
      }
      if (split.recipientContactId) {
        const contact = await db.select({ id: contacts.id }).from(contacts).where(and(
          eq(contacts.id, split.recipientContactId),
          eq(contacts.agencyId, agencyId),
        )).get();
        if (!contact) return c.json({ error: "Commission contact recipient not found" }, 404);
      }
    }
    const now = Date.now();
    try {
      const commission = await db.transaction(async (tx) => {
        const commissionNumber = await nextFinanceNumber(tx, agencyId, "commission");
        const id = nanoid();
        const [created] = await tx.insert(commissionTable).values({
          id,
          agencyId,
          commissionNumber,
          transactionType: parsed.data.transactionType,
          transactionId: parsed.data.transactionId,
          status: "draft",
          basisType: parsed.data.basisType,
          basisValue: parsed.data.basisValue,
          transactionValue: transaction.value,
          grossCommission,
          paidAmount: 0,
          currency: parsed.data.currency,
          notes: parsed.data.notes,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        }).returning();
        for (const split of splits) {
          await tx.insert(commissionSplits).values({
            id: nanoid(),
            agencyId,
            commissionId: id,
            recipientType: split.recipientType,
            recipientProfileId: split.recipientProfileId,
            recipientContactId: split.recipientContactId,
            splitType: split.splitType,
            splitValue: split.splitValue,
            amount: split.amount,
            paidAmount: 0,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "commission.created", entityType: "commission",
          entityId: id, amount: grossCommission, currency: parsed.data.currency,
          actorId: user.id, metadata: JSON.stringify({ commissionNumber, transactionType: parsed.data.transactionType, transactionId: parsed.data.transactionId }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "commission.created",
          entityType: "commission",
          entityId: id,
          metadata: { commissionNumber, grossCommission, currency: parsed.data.currency },
        }));
        return created;
      });
      return c.json({ commission }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not create commission" }, 409);
    }
  })
  .get("/:id", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const agencyId = c.get("agencyId") as string;
    const commission = await findCommission(agencyId, id.data);
    if (!commission) return c.json({ error: "Not found" }, 404);
    const [splits, payouts] = await Promise.all([
      db.select().from(commissionSplits).where(and(
        eq(commissionSplits.agencyId, agencyId),
        eq(commissionSplits.commissionId, commission.id),
      )).orderBy(commissionSplits.createdAt),
      db.select().from(commissionPayouts).where(and(
        eq(commissionPayouts.agencyId, agencyId),
        eq(commissionPayouts.commissionId, commission.id),
      )).orderBy(desc(commissionPayouts.paymentDate)),
    ]);
    return c.json({ commission: { ...commission, splits, payouts } }, 200);
  })
  .patch("/:id/transition", requireTenant, async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, commissionTransitionSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const profile = c.get("profile") as typeof profiles.$inferSelect;
    const existing = await findCommission(agencyId, id.data);
    if (!existing) return c.json({ error: "Not found" }, 404);
    try {
      assertFinanceTransition("commission", existing.status, parsed.data.toState, profile.role as StaffRole);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid transition" }, 403);
    }
    if (requireReason("commission", parsed.data.toState) && !parsed.data.reason) {
      return c.json({ error: "A reason is required" }, 400);
    }
    if (parsed.data.toState === "cancelled" && existing.paidAmount > 0.009) {
      return c.json({ error: "A paid commission cannot be cancelled; void payouts first" }, 409);
    }
    let approvedAmount = existing.approvedAmount;
    if (parsed.data.toState === "approved") {
      approvedAmount = parsed.data.approvedAmount ?? existing.grossCommission;
      const splits = await db.select().from(commissionSplits).where(and(
        eq(commissionSplits.agencyId, agencyId),
        eq(commissionSplits.commissionId, existing.id),
      ));
      const splitTotal = roundMoney(splits.reduce((sum, split) => sum + split.amount, 0));
      if (Math.abs(splitTotal - approvedAmount) > 0.009) {
        return c.json({ error: "Commission split amounts must equal the approved amount" }, 409);
      }
    }
    const now = Date.now();
    const commission = await db.transaction(async (tx) => {
      const [updated] = await tx.update(commissionTable).set({
        status: parsed.data.toState,
        submittedAt: parsed.data.toState === "pending_approval" ? now : existing.submittedAt,
        approvedAt: parsed.data.toState === "approved" ? now : existing.approvedAt,
        approvedBy: parsed.data.toState === "approved" ? user.id : existing.approvedBy,
        approvedAmount,
        updatedAt: now,
      }).where(and(eq(commissionTable.id, existing.id), eq(commissionTable.agencyId, agencyId))).returning();
      await tx.insert(financeEvents).values({
        id: nanoid(), agencyId, eventType: `commission.${parsed.data.toState}`,
        entityType: "commission", entityId: existing.id,
        amount: approvedAmount ?? existing.grossCommission, currency: existing.currency,
        actorId: user.id, metadata: JSON.stringify({ previousState: existing.status, reason: parsed.data.reason }),
        createdAt: now,
      });
      await tx.insert(auditLogs).values(auditRecord(c, {
        agencyId,
        action: `commission.${parsed.data.toState}`,
        entityType: "commission",
        entityId: existing.id,
        metadata: { previousState: existing.status, reason: parsed.data.reason },
      }));
      return updated;
    });
    return c.json({ commission }, 200);
  })
  .post("/:id/payouts", requireTenant, requireRole("admin", "manager"), async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const parsed = await parseJson(c, createCommissionPayoutSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const commission = await findCommission(agencyId, id.data);
    if (!commission || !["approved", "partially_paid"].includes(commission.status)) {
      return c.json({ error: "Approved commission not found" }, 404);
    }
    const now = Date.now();
    try {
      const payout = await db.transaction(async (tx) => {
        const [created] = await tx.insert(commissionPayouts).values({
          id: nanoid(),
          agencyId,
          commissionId: commission.id,
          splitId: parsed.data.splitId,
          amount: parsed.data.amount,
          currency: commission.currency,
          paymentDate: parsed.data.paymentDate,
          paymentMethod: parsed.data.paymentMethod,
          paymentReference: parsed.data.paymentReference,
          status: "posted",
          paidBy: user.id,
          createdAt: now,
        }).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "commission.payout_posted",
          entityType: "commission_payout", entityId: created.id,
          amount: -parsed.data.amount, currency: commission.currency,
          actorId: user.id, metadata: JSON.stringify({ commissionId: commission.id, splitId: parsed.data.splitId }),
          createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "commission.payout_posted",
          entityType: "commission_payout",
          entityId: created.id,
          metadata: { commissionId: commission.id, splitId: parsed.data.splitId, amount: parsed.data.amount },
        }));
        return created;
      });
      return c.json({ payout }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Commission payout failed" }, 409);
    }
  })
  .patch("/:id/payouts/:payoutId/void", requireTenant, requireRole("admin", "manager"), async (c) => {
    const id = parseParam(c, entityIdSchema);
    if (!id.success) return id.response;
    const payoutId = parseParam(c, entityIdSchema, "payoutId");
    if (!payoutId.success) return payoutId.response;
    const parsed = await parseJson(c, voidCommissionPayoutSchema);
    if (!parsed.success) return parsed.response;
    const agencyId = c.get("agencyId") as string;
    const user = c.get("user")!;
    const now = Date.now();
    try {
      const payout = await db.transaction(async (tx) => {
        const existing = await tx.select().from(commissionPayouts).where(and(
          eq(commissionPayouts.id, payoutId.data),
          eq(commissionPayouts.commissionId, id.data),
          eq(commissionPayouts.agencyId, agencyId),
          eq(commissionPayouts.status, "posted"),
        )).get();
        if (!existing) throw new Error("Posted payout not found");
        const [updated] = await tx.update(commissionPayouts).set({
          status: "void",
          voidedAt: now,
          voidReason: parsed.data.reason,
        }).where(eq(commissionPayouts.id, existing.id)).returning();
        await tx.insert(financeEvents).values({
          id: nanoid(), agencyId, eventType: "commission.payout_voided",
          entityType: "commission_payout", entityId: existing.id,
          amount: existing.amount, currency: existing.currency,
          actorId: user.id, metadata: JSON.stringify({ reason: parsed.data.reason }), createdAt: now,
        });
        await tx.insert(auditLogs).values(auditRecord(c, {
          agencyId,
          action: "commission.payout_voided",
          entityType: "commission_payout",
          entityId: existing.id,
          metadata: { reason: parsed.data.reason },
        }));
        return updated;
      });
      return c.json({ payout }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Payout void failed" }, 409);
    }
  });
