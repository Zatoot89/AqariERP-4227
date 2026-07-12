import type * as schema from "./database/schema";

type AuthenticatedUser = {
  id: string;
  name?: string | null;
  email?: string;
};

type Profile = typeof schema.profiles.$inferSelect;

declare module "hono" {
  interface ContextVariableMap {
    user: AuthenticatedUser | null;
    session: unknown | null;
    profile: Profile;
    agencyId: string;
  }
}

export {};
