import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { requireRole, requireTenant } from "../middleware/auth";
import { nanoid } from "../lib/id";

type Profile = typeof schema.profiles.$inferSelect;
type Lead = typeof schema.leads.$inferSelect;

async function findAccessibleLead(
  agencyId: string,
  profile: Profile,
  userId: string,
  leadId: string,
): Promise<Lead | undefined> {
  const lead = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.agencyId, agencyId)))
    .get();
  if (!lead) return undefined;
  if (profile.role === "agent" && lead.assignedTo !== userId) return undefined;
  return lead;
}

function graphUrl(path: string): string {
  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
  return `https://graph.facebook.com/${version}/${path}`;
}

export const whatsapp = new Hono()
  .get("/leads/:id/messages", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = c.req.param("id");
    const lead = await findAccessibleLead(agencyId, profile, user.id, leadId);
    if (!lead) return c.json({ error: "Not found" }, 404);

    const messages = await db
      .select()
      .from(schema.whatsappMessages)
      .where(
        and(
          eq(schema.whatsappMessages.leadId, leadId),
          eq(schema.whatsappMessages.agencyId, agencyId),
        ),
      )
      .orderBy(desc(schema.whatsappMessages.receivedAt));
    return c.json({ messages: messages.reverse() }, 200);
  })
  .post("/leads/:id/send", requireTenant, async (c) => {
    const user = c.get("user")!;
    const profile = c.get("profile") as Profile;
    const agencyId = c.get("agencyId") as string;
    const leadId = c.req.param("id");
    const { body: text } = await c.req.json();
    if (typeof text !== "string" || !text.trim()) {
      return c.json({ error: "Message body required" }, 400);
    }

    const lead = await findAccessibleLead(agencyId, profile, user.id, leadId);
    if (!lead) return c.json({ error: "Not found" }, 404);
    if (!lead.whatsappId) {
      return c.json({ error: "This lead has no WhatsApp contact" }, 400);
    }

    const agency = await db
      .select()
      .from(schema.agencies)
      .where(eq(schema.agencies.id, agencyId))
      .get();
    if (!agency?.waAccessToken || !agency.waPhoneNumberId) {
      return c.json(
        { error: "WhatsApp is not connected for this agency. Connect it in Settings first." },
        400,
      );
    }

    const response = await fetch(graphUrl(`${agency.waPhoneNumberId}/messages`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agency.waAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: lead.whatsappId,
        type: "text",
        text: { body: text.trim() },
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      return c.json({ error: result?.error?.message ?? "Failed to send WhatsApp message" }, 502);
    }

    const waMessageId = result?.messages?.[0]?.id ?? nanoid();
    await db
      .insert(schema.whatsappMessages)
      .values({
        id: nanoid(),
        agencyId,
        leadId,
        waMessageId,
        direction: "outbound",
        body: text.trim(),
        waContactId: lead.whatsappId,
      })
      .onConflictDoNothing();

    await db.insert(schema.activities).values({
      id: nanoid(),
      agencyId,
      leadId,
      userId: user.id,
      type: "whatsapp_msg",
      body: text.trim(),
      meta: JSON.stringify({ direction: "outbound" }),
    });

    return c.json({ ok: true }, 200);
  })
  .post(
    "/test-connection",
    requireTenant,
    requireRole("admin", "manager"),
    async (c) => {
      const agencyId = c.get("agencyId") as string;
      const agency = await db
        .select()
        .from(schema.agencies)
        .where(eq(schema.agencies.id, agencyId))
        .get();
      if (!agency?.waAccessToken || !agency.waPhoneNumberId) {
        return c.json({ error: "Missing Access Token or Phone Number ID" }, 400);
      }

      const response = await fetch(
        graphUrl(`${agency.waPhoneNumberId}?fields=verified_name,display_phone_number`),
        { headers: { Authorization: `Bearer ${agency.waAccessToken}` } },
      );
      const result = await response.json();
      if (!response.ok) {
        return c.json(
          { ok: false, error: result?.error?.message ?? "Connection failed" },
          200,
        );
      }

      await db
        .update(schema.agencies)
        .set({ waConnectedAt: Date.now() })
        .where(eq(schema.agencies.id, agencyId));
      return c.json(
        {
          ok: true,
          phoneNumber: result.display_phone_number,
          verifiedName: result.verified_name,
        },
        200,
      );
    },
  );
