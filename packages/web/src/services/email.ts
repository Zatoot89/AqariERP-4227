import { Resend } from "resend";

// Lazily constructed — the Resend SDK throws at construction time if there's no
// API key, and we want the whole server (not just email) to still boot and work
// fine before a key is configured in Settings/env.
let resend: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return null;
  }
  const { data, error } = await client.emails.send({
    from: "Aqari CRM <onboarding@resend.dev>",
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
    replyTo,
  });

  if (error) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, error);
    return null;
  }
  return data;
}

export function agentInviteEmail({ name, email, password, role, agencyName, appUrl }: {
  name: string; email: string; password: string; role: string; agencyName: string; appUrl: string;
}) {
  return {
    subject: `You've been invited to ${agencyName} on Aqari CRM`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Welcome ${name} to ${agencyName}</h2>
        <p>You've been added as a <strong>${role}</strong> on Aqari CRM.</p>
        <p>Your login details:</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Email</td><td style="padding: 4px 0; font-weight: 600;">${email}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Password</td><td style="padding: 4px 0; font-weight: 600;">${password}</td></tr>
        </table>
        <p style="color: #666; font-size: 13px;">We recommend changing your password after your first login.</p>
        <a href="${appUrl}/sign-in" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Sign in
        </a>
      </div>
    `,
    text: `Welcome ${name} to ${agencyName}!\n\nYou've been added as a ${role} on Aqari CRM.\n\nEmail: ${email}\nPassword: ${password}\n\nSign in: ${appUrl}/sign-in`,
  };
}

export function taskReminderEmail({ name, title, dueAt, leadName, appUrl, leadId }: {
  name: string; title: string; dueAt: number; leadName?: string; appUrl: string; leadId?: string;
}) {
  const dueStr = new Date(dueAt).toLocaleString();
  const link = leadId ? `${appUrl}/leads/${leadId}` : `${appUrl}/tasks`;
  return {
    subject: `Overdue: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Task overdue</h2>
        <p>Hi ${name || "there"}, this task was due on <strong>${dueStr}</strong> and hasn't been marked done yet:</p>
        <p style="font-size: 16px; font-weight: 600;">${title}</p>
        ${leadName ? `<p style="color: #666;">Related to lead: ${leadName}</p>` : ""}
        <a href="${link}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          View task
        </a>
      </div>
    `,
    text: `Task overdue: ${title}\nDue: ${dueStr}\n${leadName ? `Lead: ${leadName}\n` : ""}${link}`,
  };
}
