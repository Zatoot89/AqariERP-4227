import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as schema from "../database/schema";

type Profile = typeof schema.profiles.$inferSelect;

async function findProfile(userId: string): Promise<Profile | undefined> {
  return db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .get();
}

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
 * Loads the authenticated user's active profile and agency membership once for
 * the request. Every agency-owned route should use this middleware instead of
 * `requireAuth` alone and scope all resource queries by `agencyId`.
 */
export const requireTenant = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "Unauthorized" }, 401);

  const profile = await findProfile(user.id);
  if (!profile || profile.active !== 1) {
    return c.json({ message: "Forbidden" }, 403);
  }
  if (!profile.agencyId) {
    return c.json({ message: "Agency membership required" }, 403);
  }

  c.set("profile", profile);
  c.set("agencyId", profile.agencyId);
  return next();
});

/**
 * Restrict a route to specific profile roles (for example `admin` or
 * `manager`). The profile is reused when `requireTenant` has already loaded it,
 * otherwise it is loaded and validated here.
 */
export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "Unauthorized" }, 401);

    const cachedProfile = c.get("profile") as Profile | null | undefined;
    const profile = cachedProfile ?? (await findProfile(user.id));

    if (!profile || profile.active !== 1 || !profile.agencyId) {
      return c.json({ message: "Forbidden" }, 403);
    }
    if (!roles.includes(profile.role)) {
      return c.json({ message: "Forbidden" }, 403);
    }

    c.set("profile", profile);
    c.set("agencyId", profile.agencyId);
    return next();
  });
