import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { nanoid } from "../lib/id";

/**
 * Real WhatsApp Cloud API (Meta) integration.
 * Requires the agency admin to connect their own WhatsApp Business number
 * in Settings (Access Token + Phone Number ID), obtained from
 * https://developers.facebook.com/apps -> WhatsApp -> API Setup.
 */
export const whatsapp = new Hono()
  // Message thread for a lead
  .get("/leads/:id/messages", requireAuth, async (c) => {
    const msgs = await db.select().from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.leadId, c.req.param("id")))
      .orderBy(desc(schema.whatsappMessages.receivedAt));
    return c.json({ messages: msgs.reverse() }, 200);
  })
  // Send an outbound message to a lead over WhatsApp Cloud API
  .post("/leads/:id/send", requireAuth, async (c) => {
    const user = c.get("user")!;
    const leadId = c.req.param("id");
    const { body: text } = await c.req.json();
    if (!text?.trim()) return c.json({ error: "Message body required" }, 400);

    const lead = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    if (!lead) return c.json({ error: "Lead not found" }, 404);
    if (!lead.whatsappId) return c.json({ error: "This lead has no WhatsApp contact" }, 400);

    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const agency = await db.select().from(schema.agencies).where(eq(schema.agencies.id, profile.agencyId)).get();
    if (!agency?.waAccessToken || !agency?.waPhoneNumberId) {
      return c.json({ error: "WhatsApp is not connected for this agency. Connect it in Settings first." }, 400);
    }

    // Call Meta Graph API to send the message
    const res = await fetch(`https://graph.facebook.com/v20.0/${agency.waPhoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agency.waAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: lead.whatsappId,
        type: "text",
        text: { body: text },
      }),
    });
    const result = await res.json();

    if (!res.ok) {
      return c.json({ error: result?.error?.message ?? "Failed to send WhatsApp message" }, 502);
    }

    const waMessageId = result?.messages?.[0]?.id ?? nanoid();

    await db.insert(schema.whatsappMessages).values({
      id: nanoid(),
      agencyId: agency.id,
      leadId,
      waMessageId,
      direction: "outbound",
      body: text,
      waContactId: lead.whatsappId,
    }).onConflictDoNothing();

    await db.insert(schema.activities).values({
      id: nanoid(),
      agencyId: agency.id,
      leadId,
      userId: user.id,
      type: "whatsapp_msg",
      body: text,
      meta: JSON.stringify({ direction: "outbound" }),
    });

    return c.json({ ok: true }, 200);
  })
  // Test the stored credentials by fetching phone number details
  .post("/test-connection", requireAuth, async (c) => {
    const user = c.get("user")!;
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).get();
    if (!profile?.agencyId) return c.json({ error: "No agency" }, 400);
    const agency = await db.select().from(schema.agencies).where(eq(schema.agencies.id, profile.agencyId)).get();
    if (!agency?.waAccessToken || !agency?.waPhoneNumberId) {
      return c.json({ error: "Missing Access Token or Phone Number ID" }, 400);
    }

    const res = await fetch(`https://graph.facebook.com/v20.0/${agency.waPhoneNumberId}?fields=verified_name,display_phone_number`, {
      headers: { Authorization: `Bearer ${agency.waAccessToken}` },
    });
    const result = await res.json();
    if (!res.ok) {
      return c.json({ ok: false, error: result?.error?.message ?? "Connection failed" }, 200);
    }

    await db.update(schema.agencies).set({ waConnectedAt: Date.now() }).where(eq(schema.agencies.id, agency.id));
    return c.json({ ok: true, phoneNumber: result.display_phone_number, verifiedName: result.verified_name }, 200);
  });
