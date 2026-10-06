import express from "express";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { HTTPException, requireAuth } from "../auth/middleware";
import { featureFlagsForUser } from "../plans/tierFeatures";
import { logger } from "../logger";
import { sendAuthEmail } from "../auth/emailAuth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function sendInviteEmail(opts: {
  to: string;
  inviterName: string;
  inviteUrl: string;
  locale: "he" | "en" | "ru";
}) {
  const { to, inviterName, inviteUrl, locale } = opts;
  const subjects: Record<string, string> = {
    he: `${inviterName} הזמינ/ה אותך לחשבון RemindOCR`,
    en: `${inviterName} invited you to their RemindOCR account`,
    ru: `${inviterName} приглашает вас в аккаунт RemindOCR`,
  };
  const bodies: Record<string, { html: string; text: string }> = {
    he: {
      html: `<div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f0fdf4;border-radius:14px;">
  <div style="background:linear-gradient(135deg,#065f46,#059669);border-radius:10px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:20px;">הזמנה לחשבון משפחה</h1>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;">
    <p style="font-size:15px;color:#14532d;margin:0 0 16px;">שלום,</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;"><strong>${inviterName}</strong> הזמינ/ה אותך להצטרף לחשבון RemindOCR שלהם כמשתמש/ת משפחה.</p>
    <p style="font-size:14px;color:#374151;margin:0 0 24px;">לחץ/י על הכפתור כדי להצטרף:</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:24px;">הצטרף/י לחשבון</a>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">ההזמנה תקפה ל-7 ימים. אם לא ביקשת הזמנה זו, ניתן להתעלם מהודעה זו.</p>
  </div>
</div>`,
      text: `${inviterName} הזמינ/ה אותך לחשבון RemindOCR: ${inviteUrl}`,
    },
    en: {
      html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f0fdf4;border-radius:14px;">
  <div style="background:linear-gradient(135deg,#065f46,#059669);border-radius:10px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Family Account Invitation</h1>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;">
    <p style="font-size:15px;color:#14532d;margin:0 0 16px;">Hello,</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;"><strong>${inviterName}</strong> has invited you to join their RemindOCR account as a household member.</p>
    <p style="font-size:14px;color:#374151;margin:0 0 24px;">Click the button below to join:</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:24px;">Join Account</a>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">This invitation expires in 7 days. If you didn't expect this, you can ignore it.</p>
  </div>
</div>`,
      text: `${inviterName} has invited you to RemindOCR: ${inviteUrl}`,
    },
    ru: {
      html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f0fdf4;border-radius:14px;">
  <div style="background:linear-gradient(135deg,#065f46,#059669);border-radius:10px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Приглашение в семейный аккаунт</h1>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;">
    <p style="font-size:15px;color:#14532d;margin:0 0 16px;">Здравствуйте,</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;"><strong>${inviterName}</strong> приглашает вас присоединиться к аккаунту RemindOCR как член семьи.</p>
    <p style="font-size:14px;color:#374151;margin:0 0 24px;">Нажмите кнопку ниже, чтобы принять приглашение:</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:24px;">Принять приглашение</a>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">Приглашение действительно 7 дней. Если вы его не ожидали — просто проигнорируйте.</p>
  </div>
</div>`,
      text: `${inviterName} приглашает вас в RemindOCR: ${inviteUrl}`,
    },
  };

  const subject = subjects[locale] ?? subjects.en;
  const body = bodies[locale] ?? bodies.en;

  await sendAuthEmail({ to, subject, html: body.html, text: body.text });
}

export function registerAccountInviteRoutes(app: express.Application) {
  // POST /api/account/invite — send a household invite to an email address
  app.post("/api/account/invite", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try {
      auth = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const flags = featureFlagsForUser(auth.user);
    const maxUsers = flags.maxUsers;
    if (maxUsers !== null && maxUsers < 2) {
      res.status(403).json({ error: "plan_no_extra_users", message: "Adding household members requires Digital or higher plan." });
      return;
    }

    const { email, locale } = req.body as { email?: string; locale?: string };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }
    const resolvedLocale: "he" | "en" | "ru" =
      locale === "en" ? "en" : locale === "ru" ? "ru" : "he";

    // Check how many linked users already exist
    const existingLinked = await col("users").countDocuments({ linked_to_user_id: auth.userId });
    if (maxUsers !== null && existingLinked >= maxUsers - 1) {
      res.status(409).json({ error: "seat_limit_reached", message: "Maximum household members already reached." });
      return;
    }

    // Check if invitee is already linked
    const alreadyLinked = await col("users").findOne({ email, linked_to_user_id: auth.userId }) as any;
    if (alreadyLinked) {
      res.status(409).json({ error: "already_member", message: "This email is already a member of your household." });
      return;
    }

    // Create or refresh invite token
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await col("account_invites").updateOne(
      { inviter_user_id: auth.userId, invitee_email: email.toLowerCase().trim() },
      {
        $set: { token, expires_at: expiresAt, locale: resolvedLocale },
        $setOnInsert: {
          inviter_user_id: auth.userId,
          invitee_email: email.toLowerCase().trim(),
          created_at: new Date(),
        },
      },
      { upsert: true },
    );

    const baseUrl = process.env.APP_URL ?? "https://app.remindocr.com";
    const inviteUrl = `${baseUrl}/join?token=${token}`;
    const inviterName = auth.user.name ?? auth.user.email ?? "Someone";

    try {
      await sendInviteEmail({ to: email, inviterName, inviteUrl, locale: resolvedLocale });
      logger.info("account_invite_sent", { inviter: auth.userId, invitee: email });
      res.json({ ok: true, inviteUrl });
    } catch (err) {
      logger.error("account_invite_email_failed", { error: String(err) });
      res.status(500).json({ error: "email_send_failed", inviteUrl });
    }
  });

  // GET /api/account/invite/status — list current household members + pending invites
  app.get("/api/account/invite/status", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try {
      auth = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const members = await col("users")
      .find({ linked_to_user_id: auth.userId }, { projection: { email: 1, name: 1, created_at: 1 } })
      .toArray() as any[];

    const pendingInvites = await col("account_invites")
      .find({ inviter_user_id: auth.userId, expires_at: { $gt: new Date() } }, { projection: { invitee_email: 1, expires_at: 1, created_at: 1 } })
      .toArray() as any[];

    res.json({
      members: members.map((m) => ({ id: String(m._id), email: m.email, name: m.name })),
      pendingInvites: pendingInvites.map((i) => ({ email: i.invitee_email, expiresAt: i.expires_at })),
      maxUsers: featureFlagsForUser(auth.user).maxUsers,
    });
  });

  // POST /api/account/accept-invite — accept a household invite (called after login)
  app.post("/api/account/accept-invite", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try {
      auth = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const { token } = req.body as { token?: string };
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "invalid_token" });
      return;
    }

    const invite = await col("account_invites").findOne({
      token,
      expires_at: { $gt: new Date() },
    }) as any;

    if (!invite) {
      res.status(404).json({ error: "invite_not_found_or_expired" });
      return;
    }

    // Don't let a user link to themselves
    if (invite.inviter_user_id === auth.userId) {
      res.status(400).json({ error: "cannot_invite_self" });
      return;
    }

    // Already linked check
    const alreadyLinked = await col("users").findOne({ _id: new ObjectId(auth.userId), linked_to_user_id: { $exists: true } }) as any;
    if (alreadyLinked?.linked_to_user_id) {
      res.status(409).json({ error: "already_linked", message: "Your account is already linked to a household." });
      return;
    }

    // Link the current user to the inviter
    await col("users").updateOne(
      { _id: new ObjectId(auth.userId) },
      { $set: { linked_to_user_id: invite.inviter_user_id } },
    );

    // Remove the consumed invite
    await col("account_invites").deleteOne({ token });

    logger.info("account_invite_accepted", { inviter: invite.inviter_user_id, invitee: auth.userId });
    res.json({ ok: true, linkedToUserId: invite.inviter_user_id });
  });

  // DELETE /api/account/invite/member/:memberId — remove a linked member
  app.delete("/api/account/invite/member/:memberId", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try {
      auth = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const memberId = req.params.memberId;
    const result = await col("users").updateOne(
      { _id: new ObjectId(memberId), linked_to_user_id: auth.userId },
      { $unset: { linked_to_user_id: "" } },
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ error: "member_not_found" });
      return;
    }

    logger.info("account_member_removed", { owner: auth.userId, removed: memberId });
    res.json({ ok: true });
  });
}
