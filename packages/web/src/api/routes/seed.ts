import { Hono } from "hono";
import { auth } from "../auth";
import { db } from "../database";
import * as schema from "../database/schema";
import { nanoid } from "../lib/id";

export const seed = new Hono().post("/", async (c) => {
  try {
    const existing = await db.select().from(schema.agencies).limit(1);
    if (existing.length > 0) {
      return c.json({ message: "Already seeded — delete agency row to re-seed" }, 200);
    }

    const agencyId = nanoid();
    const demoPassword = process.env.DEMO_USER_PASSWORD ?? `AqariDemo-${nanoid(20)}!`;

    await db.insert(schema.agencies).values({
      id: agencyId,
      name: "Al Mazaya Real Estate",
      nameAr: "المزايا للعقارات",
      plan: "growth",
      country: "AE",
      locale: "ar",
    });

    const demoUsers = [
      { name: "Omar Al-Mansouri", nameAr: "عمر المنصوري", email: "omar@demo.aqari", role: "admin" as const },
      { name: "Sarah Johnson", nameAr: null, email: "sarah@demo.aqari", role: "manager" as const },
      { name: "Khalid Al-Rashidi", nameAr: "خالد الراشدي", email: "khalid@demo.aqari", role: "agent" as const },
      { name: "Nadia Hassan", nameAr: "نادية حسن", email: "nadia@demo.aqari", role: "agent" as const },
      { name: "James Mitchell", nameAr: null, email: "james@demo.aqari", role: "agent" as const },
    ];

    const agentIds: string[] = [];
    for (const demoUser of demoUsers) {
      const result = await auth.api.signUpEmail({
        body: { name: demoUser.name, email: demoUser.email, password: demoPassword },
      });
      const userId = result.user.id;
      agentIds.push(userId);
      await db.insert(schema.profiles).values({
        id: userId,
        agencyId,
        nameAr: demoUser.nameAr,
        role: demoUser.role,
        active: 1,
      }).onConflictDoNothing();
    }

    const adminId = agentIds[0]!;
    const agent1Id = agentIds[2]!;
    const agent2Id = agentIds[3]!;
    const agent3Id = agentIds[4]!;

    const propertyData = [
      { title: "Modern 2BR Apartment — Baghdad Al-Jadida", titleAr: "شقة ٢ غرف حديثة — بغداد الجديدة", type: "apartment", status: "available", price: 95000, currency: "USD", bedrooms: 2, bathrooms: 2, areaSqm: 120, location: "Baghdad Al-Jadida", locationAr: "بغداد الجديدة", city: "Baghdad", country: "IQ" },
      { title: "Luxury Villa — Palm Jumeirah, Dubai", titleAr: "فيلا فاخرة — نخلة جميرا دبي", type: "villa", status: "available", price: 7500000, currency: "AED", bedrooms: 5, bathrooms: 6, areaSqm: 650, location: "Palm Jumeirah", locationAr: "نخلة جميرا", city: "Dubai", country: "AE" },
      { title: "Prime Office Space — DIFC", titleAr: "مكتب متميز — مركز دبي المالي", type: "office", status: "reserved", price: 280000, currency: "USD", areaSqm: 200, location: "DIFC", locationAr: "مركز دبي المالي العالمي", city: "Dubai", country: "AE" },
      { title: "3BR Apartment — Al Olaya, Riyadh", titleAr: "شقة ٣ غرف — العليا، الرياض", type: "apartment", status: "available", price: 180000, currency: "SAR", bedrooms: 3, bathrooms: 3, areaSqm: 180, location: "Al Olaya", locationAr: "العليا", city: "Riyadh", country: "SA" },
      { title: "Waterfront Studio — Dubai Marina", titleAr: "استوديو على الواجهة البحرية — دبي مارينا", type: "apartment", status: "available", price: 380000, currency: "AED", bedrooms: 0, bathrooms: 1, areaSqm: 55, location: "Dubai Marina", locationAr: "دبي مارينا", city: "Dubai", country: "AE" },
      { title: "Commercial Land — Erbil", titleAr: "أرض تجارية — أربيل", type: "land", status: "available", price: 450000, currency: "USD", areaSqm: 2000, location: "Erbil City Center", locationAr: "مركز مدينة أربيل", city: "Erbil", country: "IQ" },
      { title: "4BR Villa — Al-Mansour, Baghdad", titleAr: "فيلا ٤ غرف — المنصور، بغداد", type: "villa", status: "sold", price: 220000, currency: "USD", bedrooms: 4, bathrooms: 3, areaSqm: 350, location: "Al-Mansour", locationAr: "المنصور", city: "Baghdad", country: "IQ" },
      { title: "Commercial Unit — Al-Karrada", titleAr: "وحدة تجارية — الكرادة", type: "commercial", status: "rented", price: 2500, currency: "USD", areaSqm: 90, location: "Al-Karrada", locationAr: "الكرادة", city: "Baghdad", country: "IQ" },
    ];

    const propertyIds: string[] = [];
    for (const property of propertyData) {
      const propertyId = nanoid();
      propertyIds.push(propertyId);
      await db.insert(schema.properties).values({
        id: propertyId,
        agencyId,
        listedBy: agent1Id,
        ...property,
      });
    }

    const now = Date.now();
    const day = 86_400_000;
    const leadData = [
      { name: "Ahmad Al-Rashidi", nameAr: "أحمد الراشدي", phone: "+9647701234567", source: "whatsapp", stage: "viewing", propertyType: "apartment", budgetMin: 80000, budgetMax: 120000, currency: "USD", preferredArea: "Baghdad Al-Jadida", assignedTo: agent1Id, whatsappId: "9647701234567", createdAt: now - 5 * day },
      { name: "Sara Al-Mansouri", nameAr: "سارة المنصوري", phone: "+971501234567", source: "manual", stage: "offer", propertyType: "villa", budgetMin: 500000, budgetMax: 800000, currency: "AED", preferredArea: "Palm Jumeirah", assignedTo: agent2Id, createdAt: now - 8 * day },
      { name: "Mohammed Al-Otaibi", nameAr: "محمد العتيبي", phone: "+966501234567", source: "bayut", stage: "contacted", propertyType: "apartment", budgetMin: 150000, budgetMax: 250000, currency: "SAR", preferredArea: "Al Olaya", assignedTo: agent3Id, createdAt: now - 3 * day },
      { name: "Fatima Hassan", nameAr: "فاطمة حسن", phone: "+9647901234567", source: "whatsapp", stage: "new", propertyType: "apartment", budgetMin: 50000, budgetMax: 90000, currency: "USD", preferredArea: "Al-Mansour", assignedTo: agent1Id, whatsappId: "9647901234567", createdAt: now - day },
      { name: "James Mitchell", phone: "+971521234567", source: "propertyfinder", stage: "closed", propertyType: "office", budgetMin: 200000, budgetMax: 350000, currency: "USD", preferredArea: "DIFC", assignedTo: agent3Id, createdAt: now - 20 * day },
      { name: "Nour Al-Din", nameAr: "نور الدين", phone: "+9647801234567", source: "manual", stage: "lost", propertyType: "villa", budgetMin: 200000, budgetMax: 300000, currency: "USD", preferredArea: "Al-Karrada", assignedTo: agent2Id, createdAt: now - 15 * day },
      { name: "Layla Al-Khalidi", nameAr: "ليلى الخالدي", phone: "+966551234567", source: "aqarmap", stage: "new", propertyType: "apartment", budgetMin: 100000, budgetMax: 180000, currency: "SAR", preferredArea: "Riyadh", assignedTo: agent1Id, createdAt: now - 2 * day },
      { name: "Omar Abdullah", nameAr: "عمر عبدالله", phone: "+971561234567", source: "referral", stage: "viewing", propertyType: "apartment", budgetMin: 300000, budgetMax: 450000, currency: "AED", preferredArea: "Dubai Marina", assignedTo: agent2Id, createdAt: now - 4 * day },
      { name: "Rania Kamal", nameAr: "رانيا كمال", phone: "+9647651234567", source: "website", stage: "contacted", propertyType: "commercial", budgetMin: 180000, budgetMax: 280000, currency: "USD", preferredArea: "Al-Karrada", assignedTo: agent3Id, createdAt: now - 6 * day },
      { name: "Hassan Al-Sayed", nameAr: "حسن السيد", phone: "+9647781234567", source: "whatsapp", stage: "new", propertyType: "apartment", budgetMin: 60000, budgetMax: 100000, currency: "USD", preferredArea: "Erbil", assignedTo: agent1Id, whatsappId: "9647781234567", createdAt: now - day },
      { name: "Aisha Khalil", nameAr: "عائشة خليل", phone: "+966591234567", source: "bayut", stage: "offer", propertyType: "villa", budgetMin: 800000, budgetMax: 1200000, currency: "SAR", preferredArea: "Al Nakheel", assignedTo: agent2Id, createdAt: now - 10 * day },
      { name: "Daniel Brown", phone: "+971541234567", source: "dubizzle", stage: "closed", propertyType: "apartment", budgetMin: 350000, budgetMax: 500000, currency: "AED", preferredArea: "JBR", assignedTo: agent3Id, createdAt: now - 25 * day },
      { name: "Yasmin Al-Saadi", nameAr: "ياسمين السعدي", phone: "+9647881234567", source: "manual", stage: "contacted", propertyType: "apartment", budgetMin: 70000, budgetMax: 110000, currency: "USD", preferredArea: "Al-Zayouna", assignedTo: agent1Id, createdAt: now - 7 * day },
      { name: "Ali Karimi", nameAr: "علي كريمي", phone: "+9647991234567", source: "referral", stage: "viewing", propertyType: "land", budgetMin: 300000, budgetMax: 500000, currency: "USD", preferredArea: "Erbil", assignedTo: agent2Id, createdAt: now - 9 * day },
      { name: "Sophie Laurent", phone: "+971581234567", source: "propertyfinder", stage: "new", propertyType: "apartment", budgetMin: 1200000, budgetMax: 2000000, currency: "AED", preferredArea: "Downtown Dubai", assignedTo: agent3Id, createdAt: now - day },
    ];

    const leadIds: string[] = [];
    for (const lead of leadData) {
      const leadId = nanoid();
      leadIds.push(leadId);
      await db.insert(schema.leads).values({
        id: leadId,
        agencyId,
        name: lead.name,
        nameAr: "nameAr" in lead ? lead.nameAr : null,
        phone: lead.phone,
        source: lead.source,
        stage: lead.stage,
        propertyType: lead.propertyType,
        budgetMin: lead.budgetMin,
        budgetMax: lead.budgetMax,
        currency: lead.currency,
        preferredArea: lead.preferredArea,
        assignedTo: lead.assignedTo,
        whatsappId: "whatsappId" in lead ? lead.whatsappId : null,
        createdAt: lead.createdAt,
        updatedAt: lead.createdAt,
      });
    }

    const activityTemplates = [
      { type: "stage_change", body: "Lead created", meta: { stage: "new" } },
      { type: "note", body: "Client is interested in 2-bed apartment, prefers upper floors" },
      { type: "stage_change", body: "Stage changed to contacted", meta: { stage: "contacted" } },
      { type: "note", body: "Spoke on phone. Set up viewing for Thursday." },
      { type: "stage_change", body: "Stage changed to viewing", meta: { stage: "viewing" } },
    ];

    for (let index = 0; index < Math.min(leadIds.length, 8); index += 1) {
      const count = (index % 3) + 2;
      for (const activity of activityTemplates.slice(0, count)) {
        await db.insert(schema.activities).values({
          id: nanoid(),
          agencyId,
          leadId: leadIds[index]!,
          userId: agentIds[index % agentIds.length]!,
          type: activity.type,
          body: activity.body,
          meta: "meta" in activity ? JSON.stringify(activity.meta) : null,
          createdAt: now - Math.floor(Math.random() * 7) * day,
        });
      }
    }

    const leadPropertyLinks = [
      { leadId: leadIds[0]!, propertyId: propertyIds[0]!, status: "shown" },
      { leadId: leadIds[1]!, propertyId: propertyIds[1]!, status: "interested" },
      { leadId: leadIds[4]!, propertyId: propertyIds[2]!, status: "interested" },
      { leadId: leadIds[7]!, propertyId: propertyIds[4]!, status: "shown" },
    ];
    for (const link of leadPropertyLinks) {
      await db.insert(schema.leadProperties).values({
        id: nanoid(),
        agencyId,
        ...link,
      });
    }

    const taskData = [
      { title: "Call Ahmad about apartment viewing", titleAr: "اتصل بأحمد بشأن معاينة الشقة", type: "call", leadId: leadIds[0]!, assignedTo: agent1Id, dueAt: now + day, done: 0 },
      { title: "Schedule villa viewing — Palm Jumeirah", titleAr: "جدولة معاينة فيلا نخلة جميرا", type: "viewing", leadId: leadIds[1]!, assignedTo: agent2Id, dueAt: now + 2 * day, done: 0 },
      { title: "Send offer documents to James", type: "document", leadId: leadIds[4]!, assignedTo: agent3Id, dueAt: now - 2 * day, done: 1 },
      { title: "Follow up with Mohammed — Riyadh apt", titleAr: "متابعة محمد — شقة الرياض", type: "follow_up", leadId: leadIds[2]!, assignedTo: agent3Id, dueAt: now + 3 * day, done: 0 },
      { title: "Call Layla back", titleAr: "رد على اتصال ليلى", type: "call", leadId: leadIds[6]!, assignedTo: agent1Id, dueAt: now, done: 0 },
      { title: "Prepare Dubai Marina listing presentation", type: "document", leadId: leadIds[7]!, assignedTo: agent2Id, dueAt: now + 4 * day, done: 0 },
      { title: "Overdue: Follow up with Rania", titleAr: "متابعة متأخرة: رانيا", type: "follow_up", leadId: leadIds[8]!, assignedTo: agent3Id, dueAt: now - 3 * day, done: 0 },
      { title: "Confirm viewing with Ali — Erbil land", titleAr: "تأكيد معاينة علي — أرض أربيل", type: "viewing", leadId: leadIds[13]!, assignedTo: agent2Id, dueAt: now + day, done: 0 },
      { title: "Send contract to Sara", titleAr: "إرسال العقد إلى سارة", type: "document", leadId: leadIds[1]!, assignedTo: agent2Id, dueAt: now + 5 * day, done: 0 },
      { title: "Weekly team check-in", type: "other", assignedTo: adminId, dueAt: now + 7 * day, done: 0 },
    ];

    for (const task of taskData) {
      await db.insert(schema.tasks).values({
        id: nanoid(),
        agencyId,
        title: task.title,
        titleAr: "titleAr" in task ? task.titleAr : null,
        type: task.type,
        leadId: "leadId" in task ? task.leadId : null,
        assignedTo: task.assignedTo,
        createdBy: adminId,
        dueAt: task.dueAt,
        done: task.done,
      });
    }

    return c.json({
      ok: true,
      message: "Demo data seeded successfully",
      summary: {
        agency: "Al Mazaya Real Estate",
        agents: demoUsers.length,
        leads: leadData.length,
        properties: propertyData.length,
        tasks: taskData.length,
      },
      login: { email: "omar@demo.aqari", password: demoPassword },
    }, 200);
  } catch (error: unknown) {
    console.error("Seed error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to seed demo data" },
      500,
    );
  }
});
