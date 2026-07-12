import "./context";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq } from "drizzle-orm";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "./auth";
import { db } from "./database";
import * as schema from "./database/schema";
import { authMiddleware, requireTenant } from "./middleware/auth";
import { s3 } from "./lib/s3";
import {
  buildAllowedOrigins,
  resolveAllowedOrigin,
  sanitizeUploadFilename,
} from "./lib/security";
import { parseJson } from "./lib/validation";
import { uploadRequestSchema } from "./validation/schemas";
import { leads } from "./routes/leads";
import { properties } from "./routes/properties";
import { tasks } from "./routes/tasks";
import { agents } from "./routes/agents";
import { analytics } from "./routes/analytics";
import { settings } from "./routes/settings";
import { webhooks } from "./routes/webhooks";
import { whatsapp } from "./routes/whatsapp";
import { seed } from "./routes/seed";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  })
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .use("*", authMiddleware)
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .post("/upload/presign", requireTenant, async (c) => {
    const bodyResult = await parseJson(c, uploadRequestSchema);
    if (!bodyResult.success) return bodyResult.response;

    const user = c.get("user")!;
    const agencyId = c.get("agencyId") as string;
    const { filename, contentType, sizeBytes, propertyId, purpose } = bodyResult.data;
    if (!process.env.S3_BUCKET) return c.json({ error: "Storage is not configured" }, 503);

    const safeFilename = sanitizeUploadFilename(filename);
    let keyPrefix: string;
    if (purpose === "agency-logo") {
      keyPrefix = `agencies/${agencyId}/branding`;
    } else if (propertyId) {
      const property = await db.select({ id: schema.properties.id }).from(schema.properties)
        .where(and(
          eq(schema.properties.id, propertyId),
          eq(schema.properties.agencyId, agencyId),
        )).get();
      if (!property) return c.json({ error: "Property not found" }, 404);
      keyPrefix = `agencies/${agencyId}/properties/${propertyId}`;
    } else {
      keyPrefix = `agencies/${agencyId}/properties/drafts/${user.id}`;
    }

    const key = `${keyPrefix}/${Date.now()}-${safeFilename}`;
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
        ...(sizeBytes ? { ContentLength: sizeBytes } : {}),
      }),
      { expiresIn: 600 },
    );
    return c.json({ url, key, maxSizeBytes: MAX_IMAGE_BYTES }, 200);
  })
  .route("/leads", leads)
  .route("/properties", properties)
  .route("/tasks", tasks)
  .route("/agents", agents)
  .route("/analytics", analytics)
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
