import "./context";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import {
  buildAllowedOrigins,
  resolveAllowedOrigin,
} from "./lib/security";
import { authMiddleware } from "./middleware/auth";
import { agents } from "./routes/agents";
import { analytics } from "./routes/analytics";
import { attachments } from "./routes/attachments";
import { audit } from "./routes/audit";
import { contacts } from "./routes/contacts";
import { developments } from "./routes/developments";
import { inventory } from "./routes/inventory";
import { invitations } from "./routes/invitations";
import { leads } from "./routes/leads";
import { properties } from "./routes/properties";
import { seed } from "./routes/seed";
import { settings } from "./routes/settings";
import { tasks } from "./routes/tasks";
import { transactions } from "./routes/transactions";
import { webhooks } from "./routes/webhooks";
import { whatsapp } from "./routes/whatsapp";

const allowedOrigins = buildAllowedOrigins({
  configured: process.env.ALLOWED_ORIGINS,
  websiteUrl: process.env.WEBSITE_URL,
  nodeEnv: process.env.NODE_ENV,
});

const app = new Hono()
  .use(
    cors({
      origin: (origin) => resolveAllowedOrigin(origin, allowedOrigins),
      credentials: true,
      exposeHeaders: ["set-auth-token"],
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .use("*", async (c, next) => {
    await next();
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  })
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .use("*", authMiddleware)
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/attachments", attachments)
  .route("/audit", audit)
  .route("/contacts", contacts)
  .route("/developments", developments)
  .route("/inventory", inventory)
  .route("/transactions", transactions)
  .route("/leads", leads)
  .route("/properties", properties)
  .route("/tasks", tasks)
  .route("/agents", agents)
  .route("/analytics", analytics)
  .route("/invitations", invitations)
  .route("/settings", settings)
  .route("/webhooks", webhooks)
  .route("/whatsapp", whatsapp);

if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_SEED === "true") {
  app.use("/seed/*", async (c, next) => {
    const seedSecret = process.env.DEMO_SEED_SECRET;
    if (!seedSecret || c.req.header("x-demo-seed-secret") !== seedSecret) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  });
  app.route("/seed", seed);
}

export type AppType = typeof app;
export default app;
