import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { buildAllowedOrigins } from "./lib/security";

const trustedOrigins = [
  ...buildAllowedOrigins({
    configured: process.env.ALLOWED_ORIGINS,
    websiteUrl: process.env.WEBSITE_URL,
    nodeEnv: process.env.NODE_ENV,
  }),
];

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  plugins: [bearer(), expo()],
});
