import { eq, and, lt, isNull } from "drizzle-orm";
import { db } from "../api/database";
import * as schema from "../api/database/schema";
import { sendEmail, taskReminderEmail } from "./email";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const CHECK_INTERVAL_MS = positiveInteger(
  process.env.TASK_REMINDER_INTERVAL_MS,
  5 * 60 * 1000,
);
const INITIAL_DELAY_MS = positiveInteger(
  process.env.TASK_REMINDER_INITIAL_DELAY_MS,
  15_000,
);

async function checkOverdueTasks() {
  try {
    const now = Date.now();
    const overdue = await db.select().from(schema.tasks).where(
      and(
        eq(schema.tasks.done, 0),
        lt(schema.tasks.dueAt, now),
        isNull(schema.tasks.remindedAt),
      ),
    );

    for (const task of overdue) {
      if (!task.dueAt || !task.assignedTo) continue;

      const assignee = await db.select().from(schema.user)
        .where(eq(schema.user.id, task.assignedTo)).get();
      if (!assignee?.email) continue;

      const lead = task.leadId
        ? await db.select().from(schema.leads).where(eq(schema.leads.id, task.leadId)).get()
        : undefined;
      const appUrl = process.env.WEBSITE_URL ?? "";

      const sent = await sendEmail({
        to: assignee.email,
        ...taskReminderEmail({
          name: assignee.name ?? "",
          title: task.title,
          dueAt: task.dueAt,
          leadName: lead?.name,
          leadId: lead?.id,
          appUrl,
        }),
      });

      if (sent) {
        await db.update(schema.tasks).set({ remindedAt: now })
          .where(eq(schema.tasks.id, task.id));
      }
    }
  } catch (error) {
    console.error("[task-reminders] check failed:", error);
  }
}

export function startTaskReminderLoop() {
  if (process.env.TASK_REMINDERS_ENABLED === "false") {
    console.info("[task-reminders] disabled by configuration");
    return;
  }

  setTimeout(checkOverdueTasks, INITIAL_DELAY_MS);
  setInterval(checkOverdueTasks, CHECK_INTERVAL_MS);
}
