import type { Context } from "hono";
import { z, type ZodType } from "zod";

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

function invalid<T>(c: Context, message: string, error: z.ZodError<T>): ParseResult<never> {
  return {
    success: false,
    response: c.json(
      {
        error: message,
        issues: issuesFrom(error),
      },
      400,
    ),
  };
}

export async function parseJson<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      success: false,
      response: c.json(
        {
          error: "Invalid JSON body",
          issues: [{ path: "", code: "invalid_json", message: "Request body must be valid JSON" }],
        },
        400,
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) return invalid(c, "Validation failed", result.error);
  return { success: true, data: result.data };
}

export function parseQuery<T>(
  c: Context,
  schema: ZodType<T>,
): ParseResult<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) return invalid(c, "Invalid query parameters", result.error);
  return { success: true, data: result.data };
}

export function parseParam<T>(
  c: Context,
  schema: ZodType<T>,
  name = "id",
): ParseResult<T> {
  const result = schema.safeParse(c.req.param(name));
  if (!result.success) return invalid(c, `Invalid ${name}`, result.error);
  return { success: true, data: result.data };
}
