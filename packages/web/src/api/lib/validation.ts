import type { Context } from "hono";
import { z } from "zod";

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; response: Response };

function issuesFrom(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function validationResponse(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      error: "Validation failed",
      issues: issuesFrom(error),
    },
    400,
  );
}

function parseValue<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
  value: unknown,
): ParseResult<z.output<Schema>> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { success: false, response: validationResponse(c, parsed.error) };
  }
  return { success: true, data: parsed.data };
}

export async function parseJson<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<ParseResult<z.output<Schema>>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    return {
      success: false,
      response: c.json({ error: "Request body must be valid JSON" }, 400),
    };
  }
  return parseValue(c, schema, value);
}

export function parseQuery<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): ParseResult<z.output<Schema>> {
  return parseValue(c, schema, c.req.query());
}

export function parseParam<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
  name = "id",
): ParseResult<z.output<Schema>> {
  return parseValue(c, schema, c.req.param(name));
}
