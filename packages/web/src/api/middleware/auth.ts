import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as schema from "../database/schema";

export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  return next();
});

export const requireAuth = createMiddleware(async (c, next) => {
  if (!c.get("user")) return c.json({ message: "Unauthorized" }, 401);
  return next();
});

/**
 * Restrict a route to specific profile roles (e.g. "admin", "manager").
 * Must run after requireAuth. Looks up the caller's profile role fresh
 * on every request (roles can change, e.g. via demotion).
 */
export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "Unauthorized" }, 401);
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile || !roles.includes(profile.role)) {
      return c.json({ message: "Forbidden" }, 403);
    }
    c.set("profile", profile);
    return next();
  });
