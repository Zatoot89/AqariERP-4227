import { z } from "zod";
import { roleSchema } from "./schemas";

export const createInvitationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    role: roleSchema,
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    token: z.string().trim().min(32).max(256),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(128)
      .regex(/[A-Z]/, "Password must include an uppercase letter")
      .regex(/[a-z]/, "Password must include a lowercase letter")
      .regex(/[0-9]/, "Password must include a number"),
  })
  .strict();
