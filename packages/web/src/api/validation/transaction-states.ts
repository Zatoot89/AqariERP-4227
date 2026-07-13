import { z } from "zod";

export const offerStateSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "countered",
  "accepted",
  "rejected",
  "expired",
  "withdrawn",
]);

export const reservationStateSchema = z.enum([
  "draft",
  "active",
  "converted",
  "released",
  "expired",
  "cancelled",
]);

export const leaseStateSchema = z.enum([
  "draft",
  "pending_approval",
  "active",
  "renewal_due",
  "renewed",
  "rejected",
  "terminated",
  "expired",
  "completed",
  "cancelled",
]);

export const saleStateSchema = z.enum([
  "draft",
  "pending_approval",
  "active",
  "completed",
  "rejected",
  "terminated",
  "cancelled",
]);
