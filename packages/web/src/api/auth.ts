import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { buildAllowedOrigins } from "./lib/security";

const production = process.env.NODE_ENV === "production";
const trustedOrigins = [
  ...buildAllowedOrigins({
    configured: process.env.ALLOWED_ORIGINS,
    websiteUrl: process.env.WEBSITE_URL,
    nodeEnv: process.env.NODE_ENV,
  }),
];

export const auth = betterAuth({
  appName: "Aqari ERP",
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  advanced: {
    useSecureCookies: production,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
    },
  },
  plugins: [bearer(), expo()],
});
