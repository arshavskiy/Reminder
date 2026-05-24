import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { getSettings } from "../settings";
import { loadAuthTemplate } from "../email-templates/loader";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return crypto.getRandomValues(new Uint8Array(32)).reduce(
    (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
    ""
  );
}

function buildTransport() {
  const s = getSettings();
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: s.smtpUser ? { user: s.smtpUser, pass: (s.smtpPass ?? "").replace(/\s+/g, "") } : undefined,
    tls: { rejectUnauthorized: s.smtpRejectUnauthorized !== false },
  });
}

function renderHtml(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function sendVerificationEmail(email: string, token: string, baseUrl: string) {
  const s = getSettings();
  if (!s.smtpHost || !s.emailFrom) {
    console.warn("[emailAuth] SMTP not configured — skipping verification email");
    return;
  }

  const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`;
  const appName = s.emailFromName ?? " ReminderOCR ";
  const html = renderHtml(loadAuthTemplate("verify-email"), { verify_url: verifyUrl, app_name: appName });

  await buildTransport().sendMail({
    from: `"${appName}" <${s.emailFrom}>`,
    to: email,
    subject: `אימות כתובת אימייל — ${appName}`,
    html,
    text: `אמת את כתובת האימייל שלך: ${verifyUrl}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, baseUrl: string) {
  const s = getSettings();
  if (!s.smtpHost || !s.emailFrom) {
    console.warn("[emailAuth] SMTP not configured — skipping password reset email");
    return;
  }

  const resetUrl = `${baseUrl}/#/reset-password?token=${token}`;
  const appName = s.emailFromName ?? " ReminderOCR ";
  const html = renderHtml(loadAuthTemplate("reset-password"), { reset_url: resetUrl, app_name: appName });

  await buildTransport().sendMail({
    from: `"${appName}" <${s.emailFrom}>`,
    to: email,
    subject: `איפוס סיסמה — ${appName}`,
    html,
    text: `איפוס סיסמה: ${resetUrl}`,
  });
}
