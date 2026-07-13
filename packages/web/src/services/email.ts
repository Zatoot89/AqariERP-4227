import { Resend } from "resend";

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return null;
  }

  const recipients = Array.isArray(to) ? to : [to];
  const base = {
    from: process.env.EMAIL_FROM ?? "Aqari ERP <onboarding@resend.dev>",
    to: recipients,
    subject,
    ...(replyTo ? { replyTo } : {}),
  };
  const message = html
    ? { ...base, html, ...(text ? { text } : {}) }
    : { ...base, text: text ?? "" };

  const { data, error } = await client.emails.send(message);
  if (error) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, error);
    return null;
  }
  return data;
}

export function agentInviteEmail({ name, role, agencyName, invitationUrl, expiresAt }: {
  name: string;
  role: string;
  agencyName: string;
  invitationUrl: string;
  expiresAt: number;
}) {
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeAgencyName = escapeHtml(agencyName);
  const safeUrl = escapeHtml(invitationUrl);
  const expiry = new Date(expiresAt).toUTCString();

  return {
    subject: `You've been invited to ${agencyName} on Aqari ERP`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Welcome ${safeName} to ${safeAgencyName}</h2>
        <p>You've been invited as a <strong>${safeRole}</strong>.</p>
        <p>Use the secure link below to choose your password and activate your account. The link can be used once and expires on <strong>${expiry}</strong>.</p>
        <a href="${safeUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Accept invitation
        </a>
        <p style="color: #666; font-size: 13px; margin-top: 18px;">If you did not expect this invitation, ignore this email.</p>
      </div>
    `,
    text: `Welcome ${name} to ${agencyName}!\n\nYou've been invited as a ${role}. Choose your password using this single-use link before ${expiry}:\n${invitationUrl}`,
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
        <p>Hi ${escapeHtml(name || "there")}, this task was due on <strong>${escapeHtml(dueStr)}</strong> and hasn't been marked done yet:</p>
        <p style="font-size: 16px; font-weight: 600;">${escapeHtml(title)}</p>
        ${leadName ? `<p style="color: #666;">Related to lead: ${escapeHtml(leadName)}</p>` : ""}
        <a href="${escapeHtml(link)}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          View task
        </a>
      </div>
    `,
    text: `Task overdue: ${title}\nDue: ${dueStr}\n${leadName ? `Lead: ${leadName}\n` : ""}${link}`,
  };
}
