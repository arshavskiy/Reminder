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

function useResend(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function renderHtml(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\s*(?:\|([^}]*))?\}\}/g, (_, key, fallback) =>
    vars[key] ?? (fallback != null ? fallback.trim() : "")
  );
}

async function sendAuthEmail(options: {to: string; subject: string; html: string; text: string}) {
  const s = getSettings();
  const appName = s.emailFromName ?? "RemindOCR";
  if (!s.emailFrom) {
    console.warn("[emailAuth] EMAIL_FROM not configured — skipping auth email");
    return;
  }

  const from = `"${appName}" <${s.emailFrom}>`;
  if (useResend()) {
    const { Resend } = await import("resend");
    const client = new Resend(process.env.RESEND_API_KEY);
    const result = await client.emails.send({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    if ((result as any).error) throw new Error((result as any).error.message ?? "Resend email failed");
    return;
  }

  if (!s.smtpHost) {
    console.warn("[emailAuth] SMTP/Resend not configured — skipping auth email");
    return;
  }

  await buildTransport().sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

export async function sendVerificationEmail(email: string, token: string, baseUrl: string) {
  const s = getSettings();
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`;
  const appName = s.emailFromName ?? "RemindOCR";
  const html = renderHtml(loadAuthTemplate("verify-email"), { verify_url: verifyUrl, app_name: appName });

  await sendAuthEmail({
    to: email,
    subject: `אימות כתובת אימייל — ${appName}`,
    html,
    text: `אמת את כתובת האימייל שלך: ${verifyUrl}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, baseUrl: string, userName?: string, locale: "en" | "he" | "ru" = "he") {
  const s = getSettings();
  const resetPath = locale === "en" ? "/en/reset-password" : locale === "ru" ? "/ru/reset-password" : "/reset-password";
  const resetUrl = `${baseUrl}${resetPath}?token=${token}`;
  const appName = s.emailFromName ?? "RemindOCR";
  // No provider guard here: sendAuthEmail already skips when neither Resend nor
  // SMTP is configured, and checking smtpHost alone would drop the mail for
  // Resend-only deployments.
  const vars: Record<string, string> = { reset_url: resetUrl, app_name: appName };
  if (userName) vars.name = userName;
  const html = renderHtml(loadAuthTemplate("reset-password"), vars);

  await sendAuthEmail({
    to: email,
    subject: `איפוס סיסמה — ${appName}`,
    html,
    text: `איפוס סיסמה: ${resetUrl}`,
  });
}
