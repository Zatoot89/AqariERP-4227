import { z } from "zod";
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
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const financeListQuerySchema = z.object({
  status: z.string().trim().max(50).optional(),
  contactId: entityIdSchema.optional(),
  sourceType: z.enum(["lease", "sale", "reservation", "manual"]).optional(),
  sourceId: entityIdSchema.optional(),
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
}).strict();

const scheduleItem = z.object({
  label: z.string().trim().min(1).max(300),
  labelAr: nullableText(300),
  dueAt: z.number().int().nonnegative(),
  amount: z.number().finite().positive(),
  notes: nullableText(2000),
}).strict();

export const createScheduleSchema = z.object({
  sourceType: z.enum(["lease", "sale", "reservation", "manual"]),
  sourceId: entityIdSchema.optional(),
  payerContactId: entityIdSchema,
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  currency: currency.default("USD"),
  description: nullableText(2000),
  items: z.array(scheduleItem).min(1).max(240),
}).strict().superRefine((value, ctx) => {
  if (value.sourceType !== "manual" && !value.sourceId) {
    ctx.addIssue({ code: "custom", path: ["sourceId"], message: "sourceId is required" });
  }
});

export const generateScheduleSchema = z.object({
  sourceType: z.enum(["lease", "sale"]),
  sourceId: entityIdSchema,
  firstDueAt: z.number().int().nonnegative().optional(),
  installmentCount: z.number().int().min(1).max(240).optional(),
}).strict();

export const scheduleTransitionSchema = z.object({
  toState: z.enum(["active", "completed", "cancelled"]),
  reason: nullableText(2000),
}).strict();

const invoiceLine = z.object({
  description: z.string().trim().min(1).max(500),
  descriptionAr: nullableText(500),
  quantity: z.number().finite().positive().default(1),
  unitPrice: z.number().finite().nonnegative(),
  taxRate: z.number().finite().min(0).max(100).default(0),
}).strict();

export const createInvoiceSchema = z.object({
  contactId: entityIdSchema,
  sourceType: z.enum(["lease", "sale", "reservation", "manual"]).default("manual"),
  sourceId: entityIdSchema.optional(),
  scheduleId: entityIdSchema.optional(),
  scheduleItemId: entityIdSchema.optional(),
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  issueDate: z.number().int().nonnegative(),
  dueAt: z.number().int().nonnegative(),
  discountAmount: z.number().finite().nonnegative().default(0),
  currency: currency.default("USD"),
  notes: nullableText(3000),
  lines: z.array(invoiceLine).min(1).max(200),
}).strict().refine((value) => value.dueAt >= value.issueDate, {
  path: ["dueAt"],
  message: "dueAt must not be before issueDate",
});

export const invoiceTransitionSchema = z.object({
  toState: z.enum(["issued", "overdue", "void"]),
  reason: nullableText(2000),
}).strict();

export const createReceiptSchema = z.object({
  contactId: entityIdSchema,
  paymentDate: z.number().int().nonnegative(),
  amount: z.number().finite().positive(),
  currency: currency.default("USD"),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "cheque", "online", "other"]),
  externalReference: nullableText(300),
  chequeNumber: nullableText(100),
  bankName: nullableText(200),
  notes: nullableText(3000),
  allocations: z.array(z.object({
    invoiceId: entityIdSchema,
    amount: z.number().finite().positive(),
  }).strict()).max(100).optional(),
}).strict();

export const allocateReceiptSchema = z.object({
  invoiceId: entityIdSchema,
  amount: z.number().finite().positive(),
}).strict();

export const reverseAllocationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const voidReceiptSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const createExpenseSchema = z.object({
  category: z.string().trim().min(1).max(100),
  vendorContactId: entityIdSchema.optional(),
  propertyId: entityIdSchema.optional(),
  unitId: entityIdSchema.optional(),
  sourceType: z.string().trim().min(1).max(50).default("manual"),
  sourceId: entityIdSchema.optional(),
  description: z.string().trim().min(1).max(2000),
  incurredAt: z.number().int().nonnegative(),
  dueAt: nullableTimestamp,
  subtotal: z.number().finite().nonnegative(),
  taxAmount: z.number().finite().nonnegative().default(0),
  currency: currency.default("USD"),
  notes: nullableText(3000),
}).strict();

export const expenseTransitionSchema = z.object({
  toState: z.enum(["submitted", "approved", "rejected", "paid", "cancelled", "void"]),
  reason: nullableText(2000),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "cheque", "online", "other"]).optional(),
  paymentReference: nullableText(300),
  effectiveAt: nullableTimestamp,
}).strict();

const commissionSplit = z.object({
  recipientType: z.enum(["profile", "contact"]),
  recipientProfileId: entityIdSchema.optional(),
  recipientContactId: entityIdSchema.optional(),
  splitType: z.enum(["fixed", "percentage"]),
  splitValue: z.number().finite().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if ((value.recipientProfileId == null) === (value.recipientContactId == null)) {
    ctx.addIssue({ code: "custom", path: ["recipientProfileId"], message: "Provide exactly one recipient" });
  }
  if (value.recipientType === "profile" && !value.recipientProfileId) {
    ctx.addIssue({ code: "custom", path: ["recipientProfileId"], message: "Profile recipient required" });
  }
  if (value.recipientType === "contact" && !value.recipientContactId) {
    ctx.addIssue({ code: "custom", path: ["recipientContactId"], message: "Contact recipient required" });
  }
});

export const createCommissionSchema = z.object({
  transactionType: z.enum(["lease", "sale"]),
  transactionId: entityIdSchema,
  basisType: z.enum(["fixed", "percentage"]),
  basisValue: z.number().finite().nonnegative(),
  currency: currency.default("USD"),
  notes: nullableText(3000),
  splits: z.array(commissionSplit).min(1).max(50),
}).strict();

export const commissionTransitionSchema = z.object({
  toState: z.enum(["pending_approval", "approved", "rejected", "cancelled"]),
  reason: nullableText(2000),
  approvedAmount: nullableAmount,
}).strict();

export const createCommissionPayoutSchema = z.object({
  splitId: entityIdSchema,
  amount: z.number().finite().positive(),
  paymentDate: z.number().int().nonnegative(),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "cheque", "online", "other"]),
  paymentReference: nullableText(300),
}).strict();

export const voidCommissionPayoutSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const financeReportQuerySchema = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  currency: currency.optional(),
}).strict();
