import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { nanoid } from "../lib/id";

function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_UNSIGNED_WHATSAPP_WEBHOOKS === "true"
    );
  }
  if (!signature?.startsWith("sha256=")) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const receivedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function messageText(message: any): string {
  return (
    message.text?.body ??
    message.image?.caption ??
    message.video?.caption ??
    message.document?.caption ??
    `[${message.type ?? "media"}]`
  );
}

export const webhooks = new Hono()
  .get("/whatsapp", async (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    const verifyToken = process.env.WA_VERIFY_TOKEN;

    if (!verifyToken) return c.json({ error: "Webhook verification is not configured" }, 503);
    if (mode === "subscribe" && token === verifyToken) {
      return c.text(challenge ?? "", 200);
    }
    return c.json({ error: "Forbidden" }, 403);
  })
  .post("/whatsapp", async (c) => {
    const rawBody = await c.req.raw.text();
    const signature = c.req.header("x-hub-signature-256");
    if (!verifyWebhookSignature(rawBody, signature)) {
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    try {
      for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value;
          const incomingPhoneNumberId = value?.metadata?.phone_number_id;
          if (!incomingPhoneNumberId) continue;

          const agency = await db
            .select()
            .from(schema.agencies)
            .where(eq(schema.agencies.waPhoneNumberId, incomingPhoneNumberId))
            .get();
          if (!agency) continue;

          for (const message of value?.messages ?? []) {
            const waMessageId = message?.id;
            const waContactId = message?.from;
            if (!waMessageId || !waContactId) continue;

            const alreadyProcessed = await db
              .select({ id: schema.whatsappMessages.id })
              .from(schema.whatsappMessages)
              .where(eq(schema.whatsappMessages.waMessageId, waMessageId))
              .get();
            if (alreadyProcessed) continue;

            const contact = (value?.contacts ?? []).find(
              (item: any) => item?.wa_id === waContactId,
            );
            const waContactName = contact?.profile?.name ?? waContactId;

            let lead = await db
              .select()
              .from(schema.leads)
              .where(
                and(
                  eq(schema.leads.agencyId, agency.id),
                  eq(schema.leads.whatsappId, waContactId),
                ),
              )
              .get();

            if (!lead) {
              const leadId = nanoid();
              [lead] = await db
                .insert(schema.leads)
                .values({
                  id: leadId,
                  agencyId: agency.id,
                  name: waContactName,
                  phone: waContactId,
                  source: "whatsapp",
                  stage: "new",
                  whatsappId: waContactId,
                })
                .returning();

              await db.insert(schema.activities).values({
                id: nanoid(),
                agencyId: agency.id,
                leadId,
                type: "stage_change",
                body: "Lead created from WhatsApp",
                meta: JSON.stringify({ stage: "new", source: "whatsapp" }),
              });
            }

            const body = messageText(message);
            const inserted = await db
              .insert(schema.whatsappMessages)
              .values({
                id: nanoid(),
                agencyId: agency.id,
                leadId: lead.id,
                waMessageId,
                direction: "inbound",
                body,
                waContactId,
                waContactName,
              })
              .onConflictDoNothing()
              .returning({ id: schema.whatsappMessages.id });

            if (inserted.length === 0) continue;

            await db.insert(schema.activities).values({
              id: nanoid(),
              agencyId: agency.id,
              leadId: lead.id,
              type: "whatsapp_msg",
              body,
              meta: JSON.stringify({ direction: "inbound", waMessageId }),
            });
          }
        }
      }

      return c.json({ ok: true }, 200);
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      return c.json({ ok: true }, 200);
    }
  });
