import "./context";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "./auth";
import { authMiddleware, requireTenant } from "./middleware/auth";
import { s3 } from "./lib/s3";
import {
  buildAllowedOrigins,
  resolveAllowedOrigin,
  sanitizeUploadFilename,
} from "./lib/security";
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
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
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
    const agencyId = c.get("agencyId") as string;
    const { filename, contentType, sizeBytes, propertyId } = await c.req.json();

    if (typeof filename !== "string" || !filename.trim()) {
      return c.json({ error: "filename is required" }, 400);
    }
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return c.json({ error: "Unsupported image type" }, 400);
    }
    if (
      sizeBytes !== undefined &&
      (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES)
    ) {
      return c.json({ error: "Image exceeds the 10 MB limit" }, 400);
    }
    if (!process.env.S3_BUCKET) return c.json({ error: "Storage is not configured" }, 503);

    const safeFilename = sanitizeUploadFilename(filename);
    const safePropertyId =
      typeof propertyId === "string" && /^[a-zA-Z0-9_-]+$/.test(propertyId)
        ? propertyId
        : "unassigned";
    const key = `agencies/${agencyId}/properties/${safePropertyId}/${Date.now()}-${safeFilename}`;

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
