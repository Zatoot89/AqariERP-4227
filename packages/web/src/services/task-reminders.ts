import { eq, and, lt, isNull } from "drizzle-orm";
import { db } from "../api/database";
import * as schema from "../api/database/schema";
import { sendEmail, taskReminderEmail } from "./email";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/**
 * Pragmatic MVP reminder system: no real job queue/cron infra in this sandbox,
 * so this runs as a loop inside the same long-lived Bun process. It finds tasks
 * that are overdue and haven't been reminded about yet, emails the assignee once,
 * and stamps `remindedAt` so it never double-sends.
 *
 * Limitation: only fires while this server process is running. For a real
 * production deployment, replace with a proper scheduled job (cron, queue, etc).
 */
async function checkOverdueTasks() {
  try {
    const now = Date.now();
    const overdue = await db.select().from(schema.tasks).where(
      and(
        eq(schema.tasks.done, 0),
        lt(schema.tasks.dueAt, now),
        isNull(schema.tasks.remindedAt),
      )
    );

    for (const task of overdue) {
      if (!task.dueAt || !task.assignedTo) continue;

      const assignee = await db.select().from(schema.user).where(eq(schema.user.id, task.assignedTo)).get();
      if (!assignee?.email) continue;

      const lead = task.leadId ? await db.select().from(schema.leads).where(eq(schema.leads.id, task.leadId)).get() : undefined;
      const appUrl = process.env.WEBSITE_URL ?? "";

      await sendEmail({
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

      await db.update(schema.tasks).set({ remindedAt: now }).where(eq(schema.tasks.id, task.id));
    }
  } catch (err) {
    console.error("[task-reminders] check failed:", err);
  }
}

export function startTaskReminderLoop() {
  // Run once shortly after boot, then on the interval.
  setTimeout(checkOverdueTasks, 15_000);
  setInterval(checkOverdueTasks, CHECK_INTERVAL_MS);
}
