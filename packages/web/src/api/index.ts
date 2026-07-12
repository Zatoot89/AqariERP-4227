import { Hono } from "hono";
import { cors } from "hono/cors";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "./auth";
import { authMiddleware, requireAuth } from "./middleware/auth";
import { s3 } from "./lib/s3";
import { leads } from "./routes/leads";
import { properties } from "./routes/properties";
import { tasks } from "./routes/tasks";
import { agents } from "./routes/agents";
import { analytics } from "./routes/analytics";
import { settings } from "./routes/settings";
import { webhooks } from "./routes/webhooks";
import { whatsapp } from "./routes/whatsapp";
import { seed } from "./routes/seed";

const app = new Hono()
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true, exposeHeaders: ["set-auth-token"] }))
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .use("*", authMiddleware)
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .post("/upload/presign", requireAuth, async (c) => {
    const { filename, contentType } = await c.req.json();
    const key = `properties/${Date.now()}-${filename}`.replace(/[^a-zA-Z0-9/_.-]/g, "_");
    const url = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }), { expiresIn: 600 });
    return c.json({ url, key }, 200);
  })
  .route("/leads", leads)
  .route("/properties", properties)
  .route("/tasks", tasks)
  .route("/agents", agents)
  .route("/analytics", analytics)
  .route("/settings", settings)
  .route("/webhooks", webhooks)
  .route("/whatsapp", whatsapp)
  .route("/seed", seed);

export type AppType = typeof app;
export default app;
