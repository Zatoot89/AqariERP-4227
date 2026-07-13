import { z } from "zod";
import {
  leaseStateSchema,
  offerStateSchema,
  reservationStateSchema,
  saleStateSchema,
} from "./transaction-states";
import { entityIdSchema } from "./schemas";

const emptyToNull = (value: unknown) => value === "" ? null : value;
const nullableText = (max: number) => z.preprocess(
  emptyToNull,
  z.string().trim().max(max).nullable().optional(),
);
const nullableTimestamp = z.preprocess(
  emptyToNull,
  z.number().int().nonnegative().nullable().optional(),
);
const nullableAmount = z.preprocess(
  emptyToNull,
  z.number().finite().nonnegative().nullable().optional(),
);

const assetTarget = {
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
};

function exactlyOneAsset(
  value: { propertyId?: string; unitId?: string },
  ctx: z.RefinementCtx,
): void {
  if (Boolean(value.propertyId) === Boolean(value.unitId)) {
    ctx.addIssue({
      code: "custom",
      path: ["propertyId"],
      message: "Provide exactly one propertyId or unitId",
    });
  }
}

export const transactionListQuerySchema = z.object({
  status: z.string().trim().max(50).optional(),
  contactId: entityIdSchema.optional(),
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
}).strict();

export const createViewingSchema = z.object({
  ...assetTarget,
  contactId: entityIdSchema,
  leadId: entityIdSchema.optional(),
  assignedAgentId: entityIdSchema.optional(),
  scheduledAt: z.number().int().nonnegative(),
}).strict().superRefine(exactlyOneAsset);

export const completeViewingSchema = z.object({
  status: z.enum(["completed", "cancelled", "no_show"]),
  feedback: nullableText(5000),
  rating: z.number().int().min(1).max(5).optional(),
  reason: nullableText(1000),
}).strict();

export const createOfferSchema = z.object({
  ...assetTarget,
  buyerContactId: entityIdSchema,
  sellerContactId: entityIdSchema.optional(),
  leadId: entityIdSchema.optional(),
  offeredAmount: z.number().finite().nonnegative(),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  validUntil: nullableTimestamp,
  terms: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine(exactlyOneAsset);

export const createCounterOfferSchema = z.object({
  offeredAmount: z.number().finite().nonnegative(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  validUntil: nullableTimestamp,
  terms: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const createReservationSchema = z.object({
  unitId: entityIdSchema,
  contactId: entityIdSchema,
  offerId: entityIdSchema.optional(),
  startsAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  depositAmount: nullableAmount,
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  notes: nullableText(3000),
}).strict().refine((value) => value.expiresAt > value.startsAt, {
  path: ["expiresAt"],
  message: "expiresAt must be after startsAt",
});

export const createLeaseSchema = z.object({
  unitId: entityIdSchema,
  offerId: entityIdSchema.optional(),
  reservationId: entityIdSchema.optional(),
  landlordContactId: entityIdSchema,
  tenantContactId: entityIdSchema,
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  noticeDays: z.number().int().min(0).max(3650).default(30),
  rentAmount: z.number().finite().nonnegative(),
  rentFrequency: z.enum(["monthly", "quarterly", "semiannual", "annual", "custom"]).default("annual"),
  securityDeposit: nullableAmount,
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  terms: z.record(z.string(), z.unknown()).optional(),
  guarantorContactIds: z.array(entityIdSchema).max(10).optional(),
  occupantContactIds: z.array(entityIdSchema).max(30).optional(),
}).strict().refine((value) => value.endsAt > value.startsAt, {
  path: ["endsAt"],
  message: "endsAt must be after startsAt",
});

export const renewLeaseSchema = z.object({
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  rentAmount: z.number().finite().nonnegative().optional(),
  securityDeposit: nullableAmount,
  terms: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((value) => value.endsAt > value.startsAt, {
  path: ["endsAt"],
  message: "endsAt must be after startsAt",
});

export const createSaleSchema = z.object({
  ...assetTarget,
  offerId: entityIdSchema.optional(),
  reservationId: entityIdSchema.optional(),
  buyerContactId: entityIdSchema,
  sellerContactId: entityIdSchema,
  agreedValue: z.number().finite().nonnegative(),
  depositAmount: nullableAmount,
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  agreementAt: nullableTimestamp,
  expectedHandoverAt: nullableTimestamp,
  terms: z.record(z.string(), z.unknown()).optional(),
  milestones: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    nameAr: nullableText(300),
    amount: nullableAmount,
    dueAt: nullableTimestamp,
  }).strict()).max(100).optional(),
}).strict().superRefine(exactlyOneAsset);

export const transactionTransitionSchema = z.object({
  toState: z.string().trim().min(1).max(50),
  reason: nullableText(2000),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const offerTransitionSchema = transactionTransitionSchema.extend({
  toState: offerStateSchema,
}).strict();
export const reservationTransitionSchema = transactionTransitionSchema.extend({
  toState: reservationStateSchema,
  convertedTransactionType: z.enum(["lease", "sale"]).optional(),
  convertedTransactionId: entityIdSchema.optional(),
}).strict();
export const leaseTransitionSchema = transactionTransitionSchema.extend({
  toState: leaseStateSchema,
  effectiveAt: nullableTimestamp,
}).strict();
export const saleTransitionSchema = transactionTransitionSchema.extend({
  toState: saleStateSchema,
  effectiveAt: nullableTimestamp,
}).strict();

export const addTransactionPartySchema = z.object({
  contactId: entityIdSchema,
  partyRole: z.enum([
    "buyer",
    "seller",
    "landlord",
    "tenant",
    "occupant",
    "guarantor",
    "broker",
    "witness",
    "principal",
  ]),
  isSignatory: z.boolean().optional(),
}).strict();

export const createTemplateSchema = z.object({
  templateType: z.enum(["offer", "reservation", "lease", "sale"]),
  name: z.string().trim().min(1).max(200),
  language: z.enum(["en", "ar"]),
  bodyHtml: z.string().min(1).max(500000),
  schemaVersion: z.number().int().min(1).max(100).default(1),
}).strict();

export const generateDocumentSchema = z.object({
  transactionType: z.enum(["offer", "reservation", "lease", "sale"]),
  transactionId: entityIdSchema,
  language: z.enum(["en", "ar"]),
  templateId: entityIdSchema.optional(),
}).strict();
