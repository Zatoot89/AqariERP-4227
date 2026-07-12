import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "../lib/id";

export const webhooks = new Hono()
  // WhatsApp verification challenge
  .get("/whatsapp", async (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    const verifyToken = process.env.WA_VERIFY_TOKEN ?? "aqari_webhook_token";
    if (mode === "subscribe" && token === verifyToken) {
      return c.text(challenge ?? "", 200);
    }
    return c.json({ error: "Forbidden" }, 403);
  })
  // WhatsApp inbound message
  .post("/whatsapp", async (c) => {
    try {
      const body = await c.req.json();
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;
      if (!messages || messages.length === 0) return c.json({ ok: true }, 200);

      const msg = messages[0];
      const waContactId = msg.from;
      const waContactName = value?.contacts?.[0]?.profile?.name ?? waContactId;
      const msgBody = msg.text?.body ?? msg.caption ?? "[media]";
      const waMessageId = msg.id;

      // Match the agency by the WhatsApp phone_number_id the message was sent to
      // (each agency connects its own WhatsApp Business number in Settings).
      const incomingPhoneNumberId = value?.metadata?.phone_number_id;
      let agency = incomingPhoneNumberId
        ? await db.select().from(schema.agencies).where(eq(schema.agencies.waPhoneNumberId, incomingPhoneNumberId)).get()
        : undefined;
      // Fallback for the demo/seeded agency when no agency has connected a real number yet.
      if (!agency) agency = (await db.select().from(schema.agencies).limit(1))[0];
      if (!agency) return c.json({ ok: true }, 200);

      // Find or create lead
      const existingLeads = await db.select().from(schema.leads)
        .where(eq(schema.leads.whatsappId, waContactId));
      let lead = existingLeads[0];

      if (!lead) {
        const leadId = nanoid();
        [lead] = await db.insert(schema.leads).values({
          id: leadId,
          agencyId: agency.id,
          name: waContactName,
          phone: waContactId,
          source: "whatsapp",
          stage: "new",
          whatsappId: waContactId,
        }).returning();
        await db.insert(schema.activities).values({
          id: nanoid(),
          agencyId: agency.id,
          leadId,
          type: "whatsapp_msg",
          body: `New WhatsApp lead: ${waContactName}`,
        });
      }

      // Store message
      await db.insert(schema.whatsappMessages).values({
        id: nanoid(),
        agencyId: agency.id,
        leadId: lead.id,
        waMessageId,
        direction: "inbound",
        body: msgBody,
        waContactId,
        waContactName,
      }).onConflictDoNothing();

      await db.insert(schema.activities).values({
        id: nanoid(),
        agencyId: agency.id,
        leadId: lead.id,
        type: "whatsapp_msg",
        body: msgBody,
      });

      return c.json({ ok: true }, 200);
    } catch (e) {
      console.error("WhatsApp webhook error:", e);
      return c.json({ ok: true }, 200); // Always return 200 to WA
    }
  });
