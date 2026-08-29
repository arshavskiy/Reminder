import express from "express";
import {ObjectId} from "mongodb";
import {extname} from "path";
import {col, enterAdminDbTarget, getDbTargetStatus, parseAdminDbTarget, runWithPrimaryDb} from "../db/db";
import {requireAuth, requireRole} from "../auth/middleware";
import type {UserPlan, UserRole} from "../../src/shared/types.js";
import {getSettings} from "../settings.js";
import {sendPushToAdmins} from "../push/pushService.js";
import {DEFAULT_FEATURES, normalizeFeatures} from "../features.js";
import {DEFAULT_NEW_USER_PLAN, ensureUserSettingsWithEntitlements} from "../plans/planEntitlements";
import {parsePlanId, updateUserTier} from "../plans/updateUserTier";
import {createMagicLinkToken} from "../auth/session";
import {hashPassword} from "../auth/emailAuth";
import {logger} from "../logger";

const VALID_ROLES: UserRole[] = ["admin", "pro", "user"];
const VALID_PLANS: UserPlan[] = ["free", "basic", "business"];
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function normalizeUsername(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value || null;
}

function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username) && !username.includes("@");
}

function normalizeEmail(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value || null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const DEFAULT_REPORT_CONFIG = {
  all_fields: [
    "tracking_date",
    "tracking_checked",
    "client",
    "contact_person",
    "tracking_phone",
    "tracking_license_number",
    "tracking_relevant",
    "tracking_notes",
  ],
  client_fields: [
    "contract_number",
    "contract_type",
    "client",
    "contact_person",
    "contact_phone",
    "contact_email",
    "client_address",
    "start_date",
    "expiry_date",
    "status",
    "source_document",
    "equipment",
    "reminders",
  ],
};

function normalizeReportConfig(raw: unknown) {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const cleanArray = (input: unknown) =>
    Array.isArray(input)
      ? [...new Set(input.filter((field): field is string => typeof field === "string" && field.trim() !== "").map((field) => field.trim()))]
      : undefined;
  return {
    all_fields: cleanArray(value.all_fields) ?? DEFAULT_REPORT_CONFIG.all_fields,
    client_fields: cleanArray(value.client_fields) ?? DEFAULT_REPORT_CONFIG.client_fields,
  };
}

function flatUser(doc: any) {
  if (!doc) return doc;
  const {
    _id,
    password_hash,
    verification_token,
    reset_token,
    gmail_refresh_token,
    ...rest
  } = doc;
  return { id: _id?.toString(), ...rest, plan: doc.plan ?? planFromRole(doc.role) };
}

function planFromRole(role: string | null | undefined): UserPlan {
  if (role === "admin") return "business";
  if (role === "pro") return "basic";
  return "free";
}

/** Magic links hit the API `/auth/magic` handler, so use the server origin. */
function adminMagicLinkBase(req: express.Request): string | null {
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, "");
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  if (isProd) return null;
  const proto = req.protocol;
  const host = req.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
}

export function registerAdminRoutes(app: express.Application) {
  // Admin data can target local or production Mongo while auth stays on primary.
  app.use("/api/admin", (req, res, next) => {
    const fromHeader = req.headers["x-admin-db-target"];
    const fromQuery = req.query.admin_db_target;
    const target = parseAdminDbTarget(fromHeader ?? fromQuery);
    if (target === "production") {
      const status = getDbTargetStatus();
      if (!status.production.connected) {
        res.status(503).json({
          error: "production_db_unavailable",
          hint: "Set MONGODB_LOCAL_URI + MONGODB_URI (or MONGODB_PRODUCTION_URI) and restart the server",
        });
        return;
      }
    }
    enterAdminDbTarget(target);
    next();
  });

  // All /api/admin/* routes require admin role (always verified against primary DB)
  async function adminAuth(req: express.Request, res: express.Response) {
    return runWithPrimaryDb(async () => {
      try {
        const auth = await requireAuth(req.headers.cookie ?? undefined);
        requireRole(auth, "admin");
        return auth;
      } catch (err: any) {
        res.status(err.status ?? 403).json({ error: err.message });
        return null;
      }
    });
  }

  // GET /api/admin/users — list all users
  app.get("/api/admin/users", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const users = await col("users")
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    res.json(users.map(flatUser));
  });

  // POST /api/admin/users/magic-link — create/reuse user and optionally issue a magic link
  app.post("/api/admin/users/magic-link", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;

    const body = req.body as {
      email?: string | null;
      username?: string | null;
      password?: string | null;
      name?: string | null;
      role?: string;
      plan?: string;
      is_active?: boolean | number;
      email_verified?: boolean | number;
      company_name?: string | null;
      phone?: string | null;
      picture_url?: string | null;
      issue_link?: boolean;
    };

    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username);
    if (!email && !username) {
      res.status(400).json({ error: "email_or_username_required" });
      return;
    }
    if (email && !isValidEmail(email)) {
      res.status(400).json({ error: "valid_email_required" });
      return;
    }
    if (username && !isValidUsername(username)) {
      res.status(400).json({
        error: "invalid_username",
        hint: "Username must be 2–32 chars: letters, digits, . _ - (no @)",
      });
      return;
    }

    const role = (body.role ?? "user") as UserRole;
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }

    const plan = (body.plan ?? DEFAULT_NEW_USER_PLAN) as UserPlan;
    if (!VALID_PLANS.includes(plan)) {
      res.status(400).json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` });
      return;
    }

    const name = body.name != null ? String(body.name).trim() || null : null;
    const companyName = body.company_name != null ? String(body.company_name).trim() || null : null;
    const phone = body.phone != null ? String(body.phone).trim() || null : null;
    const pictureUrl = body.picture_url != null ? String(body.picture_url).trim() || null : null;
    const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0);
    const emailVerified = body.email_verified === undefined
      ? (email ? 1 : 0)
      : (body.email_verified ? 1 : 0);
    const issueLink = body.issue_link !== false;
    const password = body.password != null ? String(body.password) : "";

    if (password && password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }

    if (issueLink && !isActive) {
      res.status(400).json({ error: "cannot_issue_magic_link_for_inactive_user" });
      return;
    }

    const identityQuery = email && username
      ? { $or: [{ email }, { username }] }
      : email
        ? { email }
        : { username };

    const existing = await col("users").findOne(identityQuery as any) as any;
    if (existing) {
      if (email && existing.email && existing.email !== email) {
        const clash = await col("users").findOne({ email }) as any;
        if (clash && String(clash._id) !== String(existing._id)) {
          res.status(409).json({ error: "email_already_in_use" });
          return;
        }
      }
      if (username && existing.username && existing.username !== username) {
        const clash = await col("users").findOne({ username }) as any;
        if (clash && String(clash._id) !== String(existing._id)) {
          res.status(409).json({ error: "username_already_in_use" });
          return;
        }
      }
      if (email && !existing.email) {
        const clash = await col("users").findOne({ email }) as any;
        if (clash && String(clash._id) !== String(existing._id)) {
          res.status(409).json({ error: "email_already_in_use" });
          return;
        }
      }
      if (username && !existing.username) {
        const clash = await col("users").findOne({ username }) as any;
        if (clash && String(clash._id) !== String(existing._id)) {
          res.status(409).json({ error: "username_already_in_use" });
          return;
        }
      }
    }

    const isNewUser = !existing;
    const now = new Date();

    if (existing && String(existing._id) === auth.userId) {
      if (role !== "admin") {
        res.status(400).json({ error: "Cannot change your own role" });
        return;
      }
    }

    const profileSet: Record<string, any> = {
      name: name ?? existing?.name ?? null,
      role,
      plan,
      is_active: isActive,
      email_verified: emailVerified,
      updated_at: now,
    };
    if (body.email !== undefined) profileSet.email = email;
    if (body.username !== undefined) profileSet.username = username;
    if (body.company_name !== undefined) profileSet.company_name = companyName;
    if (body.phone !== undefined) profileSet.phone = phone;
    if (body.picture_url !== undefined) profileSet.picture_url = pictureUrl;
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await hashPassword(password);
      profileSet.password_hash = passwordHash;
    }

    let createdNew = isNewUser;
    let userIdForLookup: string | null = existing ? String(existing._id) : null;

    if (existing) {
      await col("users").updateOne({ _id: existing._id }, { $set: profileSet });
    } else {
      try {
        const insert = await col("users").insertOne({
          email,
          username,
          name,
          picture_url: pictureUrl,
          password_hash: passwordHash,
          email_verified: emailVerified,
          role,
          plan,
          is_active: isActive,
          company_name: companyName,
          phone,
          created_at: now,
          last_login_at: null,
        } as any);
        userIdForLookup = insert.insertedId.toString();
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        createdNew = false;
        const raced = await col("users").findOne(identityQuery as any) as any;
        if (!raced) {
          res.status(409).json({ error: "identity_conflict" });
          return;
        }
        await col("users").updateOne({ _id: raced._id }, { $set: profileSet });
        userIdForLookup = String(raced._id);
      }
    }

    const user = userIdForLookup
      ? await col("users").findOne({ _id: new ObjectId(userIdForLookup) }) as any
      : await col("users").findOne(identityQuery as any) as any;
    if (!user) {
      res.status(500).json({ error: "user_not_found_after_upsert" });
      return;
    }

    const userId = String(user._id);
    await ensureUserSettingsWithEntitlements(userId, { ...user, role, plan });

    let magicLink: string | null = null;
    let expiresInMinutes: number | null = null;
    if (issueLink) {
      const token = await createMagicLinkToken(userId);
      const base = adminMagicLinkBase(req);
      if (!base) {
        res.status(500).json({ error: "SERVER_URL_required_for_magic_links" });
        return;
      }
      magicLink = `${base}/auth/magic?token=${token}`;
      expiresInMinutes = 15;
      logger.info("admin_magic_link_created", {
        admin_id: auth.userId,
        user_id: userId,
        email: user.email ?? null,
        username: user.username ?? null,
        role,
        plan,
        is_new_user: createdNew,
      });
    } else {
      logger.info("admin_user_upserted", {
        admin_id: auth.userId,
        user_id: userId,
        email: user.email ?? null,
        username: user.username ?? null,
        role,
        plan,
        is_new_user: createdNew,
      });
    }

    const fresh = await col("users").findOne({ _id: user._id }) as any;
    res.status(createdNew ? 201 : 200).json({
      ok: true,
      isNewUser: createdNew,
      expiresInMinutes,
      magicLink,
      user: flatUser(fresh ?? user),
    });
  });

  // ── Web Push subscription (admin notifications) ───────────────────────────
  // GET /api/admin/push/vapid-key
  app.get("/api/admin/push/vapid-key", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
  });

  // POST /api/admin/push/subscribe
  app.post("/api/admin/push/subscribe", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;
    const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }
    await col("push_subscriptions").updateOne(
      { user_id: auth.userId, endpoint },
      { $set: { user_id: auth.userId, endpoint, keys, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  });

  // POST /api/admin/push/unsubscribe
  app.post("/api/admin/push/unsubscribe", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;
    const { endpoint } = req.body as { endpoint?: string };
    await col("push_subscriptions").deleteOne({ user_id: auth.userId, endpoint });
    res.json({ ok: true });
  });

  // POST /api/admin/push/test — send a test notification to the caller's admins
  app.post("/api/admin/push/test", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    await sendPushToAdmins({
      title: "בדיקת התראה",
      body: "התראות אדמין פעילות ✓",
      data: { url: "/admin" },
    });
    res.json({ ok: true });
  });

  // PUT /api/admin/users/:id — update profile / role / plan / flags
  app.put("/api/admin/users/:id", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;

    const body = req.body as {
      email?: string | null;
      username?: string | null;
      password?: string | null;
      name?: string | null;
      phone?: string | null;
      company_name?: string | null;
      picture_url?: string | null;
      role?: string;
      plan?: string;
      is_active?: boolean | number;
      email_verified?: boolean | number;
    };

    const updates: Record<string, any> = { updated_at: new Date() };

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (email && !isValidEmail(email)) {
        res.status(400).json({ error: "valid_email_required" });
        return;
      }
      updates.email = email;
    }

    if (body.username !== undefined) {
      const username = normalizeUsername(body.username);
      if (username && !isValidUsername(username)) {
        res.status(400).json({
          error: "invalid_username",
          hint: "Username must be 2–32 chars: letters, digits, . _ - (no @)",
        });
        return;
      }
      updates.username = username;
    }

    if (body.password != null && String(body.password).length > 0) {
      if (String(body.password).length < 8) {
        res.status(400).json({ error: "password_too_short" });
        return;
      }
      updates.password_hash = await hashPassword(String(body.password));
    }

    if (body.name !== undefined) {
      updates.name = body.name != null ? String(body.name).trim() || null : null;
    }
    if (body.phone !== undefined) {
      updates.phone = body.phone != null ? String(body.phone).trim() || null : null;
    }
    if (body.company_name !== undefined) {
      updates.company_name = body.company_name != null ? String(body.company_name).trim() || null : null;
    }
    if (body.picture_url !== undefined) {
      updates.picture_url = body.picture_url != null ? String(body.picture_url).trim() || null : null;
    }

    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role as UserRole)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
        return;
      }
      updates.role = body.role;
    }

    if (body.plan !== undefined) {
      if (!VALID_PLANS.includes(body.plan as UserPlan)) {
        res.status(400).json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` });
        return;
      }
      updates.plan = body.plan;
    }

    if (body.is_active !== undefined) {
      updates.is_active = body.is_active ? 1 : 0;
    }

    if (body.email_verified !== undefined) {
      updates.email_verified = body.email_verified ? 1 : 0;
    }

    let filter: Record<string, any>;
    try {
      filter = { _id: new ObjectId(req.params.id) };
    } catch {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    // Prevent admin from demoting / deactivating themselves on the primary DB
    if (req.params.id === auth.userId) {
      if (updates.role && updates.role !== "admin") {
        res.status(400).json({ error: "Cannot change your own role" });
        return;
      }
      if (updates.is_active === 0) {
        res.status(400).json({ error: "Cannot deactivate your own account" });
        return;
      }
    }

    const existing = await col("users").findOne(filter) as any;
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const nextEmail = updates.email !== undefined ? updates.email : (existing.email ?? null);
    const nextUsername = updates.username !== undefined ? updates.username : (existing.username ?? null);
    if (!nextEmail && !nextUsername) {
      res.status(400).json({ error: "email_or_username_required" });
      return;
    }

    if (updates.email) {
      const clash = await col("users").findOne({
        email: updates.email,
        _id: { $ne: filter._id },
      } as any);
      if (clash) {
        res.status(409).json({ error: "email_already_in_use" });
        return;
      }
    }

    if (updates.username) {
      const clash = await col("users").findOne({
        username: updates.username,
        _id: { $ne: filter._id },
      } as any);
      if (clash) {
        res.status(409).json({ error: "username_already_in_use" });
        return;
      }
    }

    await col("users").updateOne(filter, { $set: updates });
    const updated = await col("users").findOne(filter);
    if (updated && (body.plan !== undefined || body.role !== undefined)) {
      await ensureUserSettingsWithEntitlements(String(updated._id), updated as any);
    }
    res.json(flatUser(updated));
  });

  // POST /api/admin/users/:id/tier — manual subscription correction after payment/support.
  app.post("/api/admin/users/:id/tier", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;

    const plan = parsePlanId((req.body as {plan?: string; tier?: string}).plan ?? (req.body as {tier?: string}).tier);
    if (!plan) {
      res.status(400).json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` });
      return;
    }

    const result = await updateUserTier(
      {userId: req.params.id},
      plan,
      {source: "admin", admin_user_id: auth.userId},
    );
    if (!result) {
      res.status(404).json({error: "User not found"});
      return;
    }
    res.json({ok: true, ...result});
  });


  // ── Monitoring: Documents & Extraction ────────────────────────────────────
  // GET /api/admin/monitor/documents
  app.get("/api/admin/monitor/documents", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [byUserStatus, failed, stuck, storage] = await Promise.all([
      // Per-user, per-status counts
      col("documents").aggregate([
        {
          $group: {
            _id: { user_id: "$user_id", status: "$processing_status" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.user_id": 1 } },
      ]).toArray(),

      // Failed extractions with error messages
      col("documents").find(
        { processing_status: "error" },
        { projection: { _id: 1, user_id: 1, file_name: 1, error_message: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // Stuck in queued (older than 10 minutes)
      col("documents").find(
        {
          processing_status: "queued",
          created_at: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        { projection: { _id: 1, user_id: 1, file_name: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // S3 storage per user
      col("documents").aggregate([
        { $match: { file_size_bytes: { $exists: true, $gt: 0 } } },
        {
          $group: {
            _id: "$user_id",
            total_bytes: { $sum: "$file_size_bytes" },
            doc_count: { $sum: 1 },
          },
        },
        { $sort: { total_bytes: -1 } },
      ]).toArray(),
    ]);

    // Build per-user status matrix from byUserStatus
    const userStatusMap: Record<string, Record<string, number>> = {};
    for (const row of byUserStatus) {
      const uid = row._id.user_id ?? "unknown";
      if (!userStatusMap[uid]) userStatusMap[uid] = {};
      userStatusMap[uid][row._id.status ?? "unknown"] = row.count;
    }

    res.json({
      byUserStatus: userStatusMap,
      failed: failed.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name,
        error: d.error_message,
        created_at: d.created_at,
      })),
      stuck: stuck.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name,
        created_at: d.created_at,
      })),
      storage: storage.map((s: any) => ({
        user_id: s._id,
        total_bytes: s.total_bytes,
        doc_count: s.doc_count,
      })),
    });
  });

  // GET /api/admin/documents/:id — fetch any document regardless of owner
  app.get("/api/admin/documents/:id", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = await col("documents").findOne(filter);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    const { _id, ...rest } = doc as any;
    res.json({ id: _id.toString(), ...rest });
  });

  // GET /api/admin/documents/:id/download — signed URL for any document
  app.get("/api/admin/documents/:id/download", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = (await col("documents").findOne(filter)) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    if (!doc.spaces_key) { res.status(404).json({ error: "No S3 file" }); return; }
    try {
      const { getSpacesSignedUrl } = await import("../storage/spaces.js");
      const SIGNED_URL_TTL = 7 * 24 * 3600;
      const expiresAt: Date | null = doc.signed_url_expires_at ? new Date(doc.signed_url_expires_at) : null;
      const needsRefresh = !doc.download_url || !expiresAt || expiresAt.getTime() - Date.now() < 3600_000;
      let url: string = doc.download_url ?? "";
       if (needsRefresh) {
        url = await getSpacesSignedUrl(doc.spaces_key, SIGNED_URL_TTL, doc.file_name ?? undefined);
        const { ObjectId } = await import("mongodb");
        await col("documents").updateOne({ _id: new ObjectId(req.params.id) }, {
          $set: { download_url: url, signed_url_expires_at: new Date(Date.now() + SIGNED_URL_TTL * 1000), updated_at: new Date() },
        });
      }
      res.json({ url, source: "s3" });
    } catch {
      res.status(500).json({ error: "Failed to generate signed URL" });
    }
  });

  // GET /api/admin/monitor/extractions?user_id=&page=&limit=
  app.get("/api/admin/monitor/extractions", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const userId = req.query.user_id as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? "50", 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { processing_status: "done" };
    if (userId) filter.user_id = userId;

    const [docs, total] = await Promise.all([
      col("documents").find(filter, {
        projection: {
          _id: 1, user_id: 1, file_name: 1, document_type: 1,
          extracted_fields: 1, processing_status: 1, created_at: 1,
        },
      }).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      col("documents").countDocuments(filter),
    ]);

    res.json({
      total,
      page,
      limit,
      docs: docs.map((d: any) => {
        let fields: Record<string, any> = {};
        try { fields = d.extracted_fields ? JSON.parse(d.extracted_fields) : {}; } catch { fields = {}; }
        return {
          id: d._id?.toString(),
          user_id: d.user_id,
          filename: d.file_name,
          document_type: d.document_type ?? fields.document_type ?? null,
          created_at: d.created_at,
          fields,
        };
      }),
    });
  });

  // ── Monitoring: Reminders ─────────────────────────────────────────────────
  // GET /api/admin/monitor/reminders
  app.get("/api/admin/monitor/reminders", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [pendingReminders, statusCounts, failedSends, failedEscalations] = await Promise.all([
      // All pending reminders across all users
      col("reminders").find(
        { status: "pending" },
        { projection: { _id: 1, user_id: 1, client_id: 1, trigger_date: 1, title: 1, body: 1, source_type: 1, contract_type: 1, note: 1 } },
      ).sort({ trigger_date: 1 }).limit(100).toArray(),

      // Status counts per user
      col("reminders").aggregate([
        {
          $group: {
            _id: { user_id: "$user_id", status: "$status" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.user_id": 1 } },
      ]).toArray(),

      // Failed sends from email_log (scheduler writes log_type "send")
      col("email_log").find(
        { success: 0, log_type: { $in: ["send", "reminder"] } },
        { projection: { _id: 1, user_id: 1, recipient: 1, to_address: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),

      // Failed escalations
      col("email_log").find(
        { success: 0, log_type: "escalation" },
        { projection: { _id: 1, user_id: 1, recipient: 1, to_address: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),
    ]);

    // Build per-user status matrix
    const userStatusMap: Record<string, Record<string, number>> = {};
    for (const row of statusCounts) {
      const uid = row._id.user_id ?? "unknown";
      if (!userStatusMap[uid]) userStatusMap[uid] = {};
      userStatusMap[uid][row._id.status ?? "unknown"] = row.count;
    }

    res.json({
      pending: pendingReminders.map((r: any) => ({
        id: r._id?.toString(),
        user_id: r.user_id,
        client_id: r.client_id?.toString?.() ?? r.client_id,
        trigger_date: r.trigger_date,
        // Reminders store `title` + `source_type` (legacy rows may have note/doc_type).
        title: r.title ?? r.note ?? null,
        note: r.title ?? r.note ?? r.body ?? null,
        source_type: r.source_type ?? r.doc_type ?? null,
        doc_type: r.source_type ?? r.doc_type ?? null,
      })),
      byUserStatus: userStatusMap,
      failedSends: failedSends.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient ?? l.to_address ?? null,
        error: l.error,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
      })),
      failedEscalations: failedEscalations.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient ?? l.to_address ?? null,
        error: l.error,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
      })),
    });
  });

  // ── Monitoring: Scheduler ─────────────────────────────────────────────────
  // GET /api/admin/monitor/scheduler
  app.get("/api/admin/monitor/scheduler", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [healthRows, lastRunStats, monthlySettings] = await Promise.all([
      // Health records for each named cron job
      col("scheduler_health").find({}).toArray(),

      // Stats from the most recent batch: emails sent/failed in last 1 hour window
      col("email_log").aggregate([
        { $match: { sent_at: { $gte: new Date(Date.now() - 3600 * 1000) } } },
        { $group: { _id: "$success", count: { $sum: 1 } } },
      ]).toArray(),

      // Monthly report schedule per user
      col("user_settings").find(
        {},
        {
          projection: {
            _id: 0, user_id: 1,
            monthly_report_enabled: 1, monthly_report_day: 1,
            monthly_report_hour: 1, monthly_report_last_sent: 1,
            monthly_report_last_error: 1,
          },
        },
      ).toArray(),
    ]);

    const sentLastHour = lastRunStats.find((r: any) => r._id === 1)?.count ?? 0;
    const failedLastHour = lastRunStats.find((r: any) => r._id === 0)?.count ?? 0;

    const { getSettings } = await import("../settings.js");
    const intervalMs = getSettings().reminderCheckIntervalMs;

    const tickHealth = healthRows.find((r: any) => r.name === "tick") as any;
    const lastRunTime = tickHealth?.last_run_at ?? null;
    const nextRunTime = lastRunTime ? new Date(new Date(lastRunTime).getTime() + intervalMs) : null;

    res.json({
      lastRunTime,
      nextRunTime,
      intervalSeconds: Math.round(intervalMs / 1000),
      sentLastHour,
      failedLastHour,
      jobs: healthRows.map((r: any) => ({
        name: r.name,
        last_run_at: r.last_run_at ?? null,
        last_success_at: r.last_success_at ?? null,
        last_error: r.last_error ?? null,
        consecutive_failures: r.consecutive_failures ?? 0,
      })),
      monthlySchedule: monthlySettings.map((s: any) => ({
        user_id: s.user_id,
        enabled: !!s.monthly_report_enabled,
        day: s.monthly_report_day ?? null,
        hour: s.monthly_report_hour ?? null,
        last_sent: s.monthly_report_last_sent ?? null,
        last_error: s.monthly_report_last_error ?? null,
      })),
    });
  });

  // ── Monitoring: Monthly Reports ────────────────────────────────────────────
  // GET /api/admin/monitor/monthly-reports
  app.get("/api/admin/monitor/monthly-reports", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [userSettings, failedReports] = await Promise.all([
      col("user_settings").find(
        {},
        {
          projection: {
            _id: 0,
            user_id: 1,
            monthly_report_enabled: 1,
            monthly_report_day: 1,
            monthly_report_hour: 1,
            monthly_report_formats: 1,
            monthly_report_recipients: 1,
            monthly_report_last_sent: 1,
            monthly_report_last_error: 1,
          },
        },
      ).toArray(),

      // Failed monthly report sends
      col("email_log").find(
        { success: 0, log_type: "monthly_report" },
        { projection: { _id: 1, user_id: 1, recipient: 1, error: 1, sent_at: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),
    ]);

    res.json({
      schedules: userSettings.map((s: any) => ({
        user_id: s.user_id,
        enabled: !!s.monthly_report_enabled,
        day: s.monthly_report_day ?? null,
        hour: s.monthly_report_hour ?? null,
        formats: s.monthly_report_formats ?? [],
        recipients: s.monthly_report_recipients ?? [],
        last_sent: s.monthly_report_last_sent ?? null,
        last_error: s.monthly_report_last_error ?? null,
      })),
      failedDeliveries: failedReports.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        recipient: l.recipient,
        error: l.error,
        sent_at: l.sent_at,
      })),
    });
  });

  // ── Extraction Quality ────────────────────────────────────────────────────
  // GET /api/admin/monitor/extraction-quality
  app.get("/api/admin/monitor/extraction-quality", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const [allRuns, recentFailures, slowRuns] = await Promise.all([
      col("extractions").aggregate([
        {
          $group: {
            _id: "$backend",
            runs: { $sum: 1 },
            parsed_ok: { $sum: { $cond: ["$parsed_ok", 1, 0] } },
            avg_exec_ms: { $avg: "$exec_ms" },
          },
        },
        { $sort: { runs: -1 } },
      ]).toArray(),

      col("extractions").find(
        { parsed_ok: false },
        { projection: { _id: 1, document_id: 1, user_id: 1, backend: 1, model: 1, error: 1, exec_ms: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("extractions").find(
        { exec_ms: { $gt: 30000 } },
        { projection: { _id: 1, document_id: 1, backend: 1, model: 1, exec_ms: 1, created_at: 1 } },
      ).sort({ exec_ms: -1 }).limit(20).toArray(),
    ]);

    const totalRuns = allRuns.reduce((s: number, r: any) => s + r.runs, 0);
    const totalOk = allRuns.reduce((s: number, r: any) => s + r.parsed_ok, 0);
    const totalExecMs = allRuns.reduce((s: number, r: any) => s + (r.avg_exec_ms ?? 0) * r.runs, 0);

    const byBackend: Record<string, any> = {};
    for (const r of allRuns as any[]) {
      byBackend[r._id ?? "unknown"] = {
        runs: r.runs,
        parsed_ok: r.parsed_ok,
        success_rate: r.runs > 0 ? Math.round((r.parsed_ok / r.runs) * 100) : 0,
        avg_exec_ms: Math.round(r.avg_exec_ms ?? 0),
      };
    }

    res.json({
      summary: {
        total_runs: totalRuns,
        parsed_ok: totalOk,
        parse_success_rate: totalRuns > 0 ? Math.round((totalOk / totalRuns) * 100) : 0,
        avg_exec_ms: totalRuns > 0 ? Math.round(totalExecMs / totalRuns) : 0,
        by_backend: byBackend,
      },
      recent_failures: recentFailures.map((r: any) => ({
        id: r._id?.toString(),
        document_id: r.document_id?.toString?.() ?? r.document_id,
        user_id: r.user_id,
        backend: r.backend,
        model: r.model,
        error: r.error,
        exec_ms: r.exec_ms,
        created_at: r.created_at,
      })),
      slow_runs: slowRuns.map((r: any) => ({
        id: r._id?.toString(),
        document_id: r.document_id?.toString?.() ?? r.document_id,
        backend: r.backend,
        model: r.model,
        exec_ms: r.exec_ms,
        created_at: r.created_at,
      })),
    });
  });

  // ── Pipeline Gaps ─────────────────────────────────────────────────────────
  // GET /api/admin/monitor/pipeline-gaps
  app.get("/api/admin/monitor/pipeline-gaps", async (req, res) => {
    if (!await adminAuth(req, res)) return;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [noS3, stuckProcessing, skippedReminders, scannedWithoutReminder, documentsForEmailAudit] = await Promise.all([
      col("documents").find(
        { processing_status: "done", $or: [{ spaces_key: { $exists: false } }, { spaces_key: null }] },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("documents").find(
        { processing_status: "processing", created_at: { $lt: tenMinutesAgo } },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      col("email_log").find(
        { log_type: "skipped" },
        { projection: { _id: 1, user_id: 1, reminder_id: 1, created_at: 1, sent_at: 1, subject: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),

      col("documents").aggregate([
        { $match: { processing_status: "done" } },
        { $addFields: { document_id_string: { $toString: "$_id" } } },
        {
          $lookup: {
            from: "reminders",
            localField: "document_id_string",
            foreignField: "document_id",
            as: "reminders",
          },
        },
        { $match: { reminders: { $size: 0 } } },
        { $sort: { created_at: -1 } },
        { $limit: 100 },
        {
          $project: {
            _id: 1,
            user_id: 1,
            file_name: 1,
            original_filename: 1,
            document_type: 1,
            document_kind: 1,
            extracted_fields: 1,
            created_at: 1,
          },
        },
      ]).toArray(),

      col("documents").find(
        { processing_status: "done", extracted_fields: { $exists: true, $ne: null } },
        { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, document_type: 1, document_kind: 1, extracted_fields: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(250).toArray(),
    ]);

    function parseExtractedFields(extractedFields: unknown): Record<string, any> {
      try {
        if (typeof extractedFields === "string") return JSON.parse(extractedFields);
        if (extractedFields && typeof extractedFields === "object") return extractedFields as Record<string, any>;
      } catch {
        return {};
      }
      return {};
    }

    function readReminderDate(extractedFields: unknown): string | null {
      const fields = parseExtractedFields(extractedFields);
      return fields.expiry_date ?? fields.next_action_date ?? null;
    }

    function readExtractedEmail(extractedFields: unknown): string | null {
      const fields = parseExtractedFields(extractedFields);
      const value = fields.client_email ?? fields.contact_email ?? fields.email;
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    const missingEmails = documentsForEmailAudit
      .map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        document_type: d.document_type ?? d.document_kind ?? null,
        reminder_date: readReminderDate(d.extracted_fields),
        extracted_email: readExtractedEmail(d.extracted_fields),
        created_at: d.created_at,
      }))
      .filter((d: any) => d.reminder_date && !d.extracted_email)
      .slice(0, 100);

    res.json({
      no_s3: noS3.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        created_at: d.created_at,
      })),
      stuck_processing: stuckProcessing.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        created_at: d.created_at,
      })),
      skipped_reminders: skippedReminders.map((l: any) => ({
        id: l._id?.toString(),
        user_id: l.user_id,
        reminder_id: l.reminder_id?.toString?.() ?? l.reminder_id,
        note: l.subject,
        created_at: l.sent_at ?? l.created_at,
      })),
      missing_emails: missingEmails,
      scanned_without_reminder: scannedWithoutReminder.map((d: any) => ({
        id: d._id?.toString(),
        user_id: d.user_id,
        filename: d.file_name ?? d.original_filename,
        document_type: d.document_type ?? d.document_kind ?? null,
        reminder_date: readReminderDate(d.extracted_fields),
        created_at: d.created_at,
      })),
    });
  });

  // ── Reprocess document ────────────────────────────────────────────────────
  // POST /api/admin/documents/:id/reprocess
  app.post("/api/admin/documents/:id/reprocess", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    let filter: Record<string, any>;
    try { filter = { _id: new ObjectId(req.params.id) }; } catch {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const doc = await col("documents").findOne(filter) as any;
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    await col("documents").updateOne(filter, {
      $set: { processing_status: "queued", error_message: null, updated_at: new Date() },
      $unset: { extracted_fields: "" },
    });

    try {
      const importer = await import("../pipeline/importer.js");
      const processFn = (importer as any).processDocument;
      const reprocessFn = (importer as any).reprocessDocument ?? (importer as any).importDocument;
      const filePath = doc.file_path ?? doc.original_path;
      const mimeType = doc.mime_type ?? "application/octet-stream";
      const ext = extname(String(filePath ?? doc.file_name ?? "")).toLowerCase();

      if (typeof processFn === "function" && filePath && ext) {
        processFn(req.params.id, String(filePath), mimeType, ext, undefined, doc.user_id, { skipAi: false }).catch(() => {});
      } else if (typeof reprocessFn === "function") {
        reprocessFn(req.params.id, doc.user_id, { skipAi: false }).catch(() => {});
      }
    } catch {
      // importer may export different name — try alternative
      try {
        const importer = await import("../pipeline/importer.js");
        const fn = (importer as any).reprocessDocument ?? (importer as any).importDocument;
        if (fn) fn(req.params.id, doc.user_id, { skipAi: false }).catch(() => {});
      } catch { /* will process on next queue check */ }
    }

    res.json({ ok: true });
  });

  // ── Retry escalation ──────────────────────────────────────────────────────
  // POST /api/admin/reminders/:id/retry-escalation
  app.post("/api/admin/reminders/:id/retry-escalation", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const settings = getSettings();
    if (!settings.escalationEmail) {
      res.status(400).json({ error: "escalationEmail not configured" }); return;
    }

    let reminder: any;
    try {
      const filter = { _id: new ObjectId(req.params.id) };
      reminder = await col("reminders").findOne(filter);
    } catch {
      // try string id
      reminder = await col("reminders").findOne({ id: req.params.id });
    }
    if (!reminder) { res.status(404).json({ error: "Reminder not found" }); return; }

    try {
      const { sendReminderEmail } = await import("../reminders/emailSender.js");
      const remId = reminder._id?.toString() ?? req.params.id;
      const subject = `[Escalation Retry] ${reminder.title ?? reminder.note ?? "Reminder"}`;
      const body = `Admin-triggered retry escalation for reminder ${remId}`;

      const result = await (sendReminderEmail as any)(
        { ...reminder, id: remId, client_name: null, document_name: null, title: subject, body },
        [settings.escalationEmail]
      );

      await col<Record<string, any>>("email_log").insertOne({
        reminder_id: remId,
        log_type: "escalation",
        to_address: settings.escalationEmail,
        subject,
        sent_at: new Date(),
        success: result.success ? 1 : 0,
        error: result.error ?? null,
        user_id: reminder.user_id ?? null,
        recipient: settings.escalationEmail,
      });

      res.json({ ok: result.success, error: result.error ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Contract advances ─────────────────────────────────────────────────────
  // GET /api/admin/monitor/contract-advances
  app.get("/api/admin/monitor/contract-advances", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const rows = await col("contract_advances").find({}).sort({ advanced_at: -1 }).limit(100).toArray();
    res.json(rows.map((r: any) => ({
      id: r._id?.toString(),
      user_id: r.user_id,
      contract_id: r.contract_id,
      client_id: r.client_id,
      previous_expiry: r.previous_expiry,
      new_expiry: r.new_expiry,
      interval_months: r.interval_months,
      advanced_at: r.advanced_at,
    })));
  });

  // ── Admin settings ────────────────────────────────────────────────────────
  // GET /api/admin/settings  (replaces the stub)
  app.get("/api/admin/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const s = getSettings();

    // Fetch db name from connection
    let dbName = "";
    try {
      const { getDb } = await import("../db/db.js");
      dbName = (getDb() as any).databaseName ?? "";
    } catch { /* non-critical */ }

    const dbTargets = getDbTargetStatus();

    res.json({
      appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      dbName,
      dbTargets,
      reminderEnabled: s.reminderEnabled,
      autoExtract: s.autoExtract,
      reminderCheckIntervalMs: s.reminderCheckIntervalMs,
      escalationEmail: s.escalationEmail || null,
      escalationThresholdDays: s.escalationThresholdDays,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpFrom: s.emailFrom,
      aiBackend: s.aiBackend,
      openAiModel: s.openAiModel,
      openAiKeyPresent: !!s.openAiKey,
      s3BucketPresent: !!s.doSpacesBucket,
      userDocumentLimit: s.userDocumentLimit,
    });
  });

  // GET /api/admin/db-targets — which Mongo links are available for override
  app.get("/api/admin/db-targets", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    res.json(getDbTargetStatus());
  });

  // ── Download monthly report for a user (admin) ───────────────────────────
  // GET /api/admin/monthly-reports/download/:userId
  app.get("/api/admin/monthly-reports/download/:userId", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const { userId } = req.params;
    try {
      const { generateMonthlyTrackingReport, generateMonthlyContractReports, reportPeriodKey } =
        await import("../reports/monthlyReports.js");
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const rawMonth = req.query.month;
      const month = rawMonth == null || rawMonth === "" ? undefined : Number(rawMonth);
      const format = String(req.query.format ?? "docx");
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const fields = req.query.fields
        ? String(req.query.fields).split(",").map((f) => f.trim()).filter(Boolean)
        : undefined;

      if (format !== "docx" && format !== "xlsx" && format !== "csv") {
        res.status(400).json({ error: "format must be docx, xlsx or csv" }); return;
      }

      const report = clientId
        ? await generateMonthlyContractReports(userId, year, month, fields, clientId)
        : await generateMonthlyTrackingReport(userId, year, month, fields);

      const periodKey = reportPeriodKey(year, month);
      const filename = `report-${userId.slice(-6)}-${periodKey}.${format}`;
      const content = format === "docx" ? report.docx : format === "xlsx" ? report.xlsx : report.csv;
      res.setHeader("Content-Type",
        format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", content.length);
      res.end(content);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Report generation failed" });
    }
  });

  // ── Trigger monthly report for one user ───────────────────────────────────
  // POST /api/admin/monthly-reports/trigger/:userId
  app.post("/api/admin/monthly-reports/trigger/:userId", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const { userId } = req.params;

    try {
      const body = req.body as {
        year?: number;
        month?: number;
        formats?: string[];
        recipients?: string[];
        fields?: string[];
        clientId?: string;
        deliveryMode?: "combined" | "client";
      };
      const { sendMonthlyReportToRecipients, sendMonthlyReportsPerClient } = await import("../reports/monthlyReports.js");
      const now = new Date();
      const year = Number(body.year ?? now.getFullYear());
      // month: null means "whole year"; undefined/missing also means whole year for admin trigger
      const month = (body.month != null && body.month !== 0) ? Number(body.month) : undefined;

      // Resolve recipients: body override → settings → app user email (never clients on combined)
      const { resolveAccountReportRecipients, uniqueEmails } = await import("../reports/monthlyReportRecipients.js");
      let recipients: string[] = body.recipients?.length ? uniqueEmails(body.recipients) : [];
      if (!recipients.length) {
        const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
        const user = await col("users").findOne({ _id: new ObjectId(userId) }) as any;
        recipients = resolveAccountReportRecipients({
          configuredRecipients: userSettings?.monthly_report_recipients,
          accountEmail: user?.email ?? null,
        });
      }

      // Resolve formats: body > user settings > default
      let formats: string[] = [];
      if (body.formats?.length) {
        formats = body.formats.filter((f) => f === "docx" || f === "xlsx" || f === "csv");
      }
      if (!formats.length) {
        const userSettings = await col("user_settings").findOne({ user_id: userId }) as any;
        try { formats = JSON.parse(userSettings?.monthly_report_formats ?? '["docx"]'); } catch { formats = ["docx"]; }
      }
      if (!formats.length) formats = ["docx"];

      const deliveryMode = body.deliveryMode ?? (body.clientId ? "client" : "combined");
      const result = deliveryMode === "client"
        ? await sendMonthlyReportsPerClient({
            userId, year, month, recipients, formats,
            rawFields: body.fields,
            clientId: body.clientId,
            includeClientRecipient: true,
          })
        : await sendMonthlyReportToRecipients({
            userId, year, month, recipients, formats,
            rawFields: body.fields,
            clientId: body.clientId,
            includeClientRecipient: false,
          });

      await col<Record<string, any>>("email_log").insertOne({
        user_id: userId,
        log_type: "monthly_report",
        sent_at: new Date(),
        success: result.success ? 1 : 0,
        error: result.error ?? null,
        recipient: recipients.join(", ") || null,
        subject: `Monthly Report — Admin Triggered ${year}${month ? `-${String(month).padStart(2, "0")}` : ""}`,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: read/write user settings ──────────────────────────────────────
  // GET /api/admin/users/:id/settings
  app.get("/api/admin/users/:id/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const row = await col("user_settings").findOne({ user_id: req.params.id }) as any;
      res.json(row ? (() => { const { _id, ...r } = row; return r; })() : {});
    } catch (err: any) {
      console.error("admin user settings error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load user settings" });
    }
  });

  // PUT /api/admin/users/:id/settings
  app.put("/api/admin/users/:id/settings", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const body = req.body as {
      theme?: string;
      email_from_name?: string | null;
      reminder_advance_days?: string;
      ocr_language?: string;
      pipeline_ocr?: boolean;
      pipeline_ai?: boolean;
      pipeline_s3?: boolean;
      pipeline_entities?: boolean;
      monthly_report_enabled?: boolean;
      monthly_report_recipients?: string;
      monthly_report_day?: number;
      monthly_report_hour?: number;
      monthly_report_formats?: string;
      report_config?: unknown;
      calendar_next_tests_only?: boolean;
      default_email_template_id?: number | string | null;
      features?: Record<string, boolean> | string | null;
      features_json?: string | null;
    };
    const patch: Record<string, any> = { updated_at: new Date() };
    if (body.theme !== undefined) patch.theme = body.theme === "dark" ? "dark" : "light";
    if (body.email_from_name !== undefined) patch.email_from_name = body.email_from_name ?? null;
    if (body.reminder_advance_days !== undefined) patch.reminder_advance_days = String(body.reminder_advance_days ?? "[90,60,30]");
    if (body.ocr_language !== undefined) patch.ocr_language = String(body.ocr_language ?? "heb+eng");
    if (body.pipeline_ocr !== undefined) patch.pipeline_ocr = Boolean(body.pipeline_ocr);
    if (body.pipeline_ai !== undefined) patch.pipeline_ai = Boolean(body.pipeline_ai);
    if (body.pipeline_s3 !== undefined) patch.pipeline_s3 = Boolean(body.pipeline_s3);
    if (body.pipeline_entities !== undefined) patch.pipeline_entities = Boolean(body.pipeline_entities);
    if (body.monthly_report_enabled !== undefined) patch.monthly_report_enabled = Boolean(body.monthly_report_enabled);
    if (body.monthly_report_recipients !== undefined) patch.monthly_report_recipients = String(body.monthly_report_recipients ?? "");
    if (body.monthly_report_day !== undefined) patch.monthly_report_day = Math.min(28, Math.max(1, Number(body.monthly_report_day)));
    if (body.monthly_report_hour !== undefined) patch.monthly_report_hour = Math.min(23, Math.max(0, Number(body.monthly_report_hour)));
    if (body.monthly_report_formats !== undefined) patch.monthly_report_formats = body.monthly_report_formats;
    if (body.report_config !== undefined) patch.report_config = normalizeReportConfig(body.report_config);
    if (body.calendar_next_tests_only !== undefined) patch.calendar_next_tests_only = Boolean(body.calendar_next_tests_only);
    if (body.default_email_template_id !== undefined) patch.default_email_template_id = body.default_email_template_id ?? null;
    const rawFeatures = body.features !== undefined ? body.features : body.features_json;
    if (rawFeatures !== undefined) {
      try {
        patch.features = normalizeFeatures(rawFeatures);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid features" });
        return;
      }
    }
    const setOnInsert: Record<string, any> = { user_id: req.params.id };
    if (patch.features === undefined) setOnInsert.features = DEFAULT_FEATURES;
    if (patch.report_config === undefined) setOnInsert.report_config = DEFAULT_REPORT_CONFIG;
    const update: Record<string, any> = {
      $set: patch,
      $setOnInsert: setOnInsert,
    };
    if (rawFeatures !== undefined) update.$unset = { features_json: "" };
    await col("user_settings").updateOne(
      { user_id: req.params.id },
      update,
      { upsert: true },
    );
    res.json({ ok: true });
  });

  // ── User detail breakdown ─────────────────────────────────────────────────
  // GET /api/admin/users/:id/detail
  app.get("/api/admin/users/:id/detail", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
    const userId = req.params.id;

    const [documents, emailLogs, reminderCounts, extractions, schedulerErrors, clientCount, contractCount, equipmentCount, documentCount, emailCount, extractionCount, activeSessions] = await Promise.all([
      // All documents for this user (with extracted_fields + template id for field coverage)
      col("documents").find(
        { user_id: userId },
        { projection: { _id: 1, file_name: 1, processing_status: 1, error_message: 1, spaces_key: 1, file_size_bytes: 1, created_at: 1, document_type: 1, extracted_fields: 1, template_id: 1 } },
      ).sort({ created_at: -1 }).limit(200).toArray(),

      // Email log entries for this user (exclude skipped — those are non-sends)
      col("email_log").find(
        { user_id: userId, log_type: { $ne: "skipped" } },
        { projection: { _id: 1, log_type: 1, success: 1, recipient: 1, to_address: 1, subject: 1, error: 1, sent_at: 1, reminder_id: 1 } },
      ).sort({ sent_at: -1 }).limit(100).toArray(),

      // Reminder status counts
      col("reminders").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),

      // Recent extraction runs for this user
      col("extractions").find(
        { user_id: userId },
        { projection: { _id: 1, document_id: 1, backend: 1, model: 1, parsed_ok: 1, exec_ms: 1, error: 1, created_at: 1 } },
      ).sort({ created_at: -1 }).limit(50).toArray(),

      // Scheduler errors involving this user (exclude skipped non-sends)
      col("email_log").find(
        { user_id: userId, success: 0, log_type: { $ne: "skipped" } },
        { projection: { _id: 1, log_type: 1, error: 1, sent_at: 1, recipient: 1 } },
      ).sort({ sent_at: -1 }).limit(50).toArray(),

      // Entity counts
      col("clients").countDocuments({ user_id: userId }),
      col("contracts").countDocuments({ user_id: userId }),
      col("equipment").countDocuments({ user_id: userId }),
      col("documents").countDocuments({ user_id: userId }),
      col("email_log").countDocuments({ user_id: userId, log_type: { $ne: "skipped" } }),
      col("extractions").countDocuments({ user_id: userId }),

      // Active sessions
      col("sessions").countDocuments({ user_id: userId, expires_at: { $gt: new Date() } }),
    ]);

    // Per-user invoice / queue / storage state. Queried separately so the
    // existing block above stays readable; all are scoped to this user.
    const [
      invoiceTotals,
      invoiceSubtypes,
      invoiceCashFlow,
      recentInvoices,
      queueByStatus,
      queueOrphans,
      driveCoverage,
      importSources,
      gmailJobs,
    ] = await Promise.all([
      col("invoices").aggregate([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            with_amount: { $sum: { $cond: [{ $gt: ["$amount", 0] }, 1, 0] } },
            total_amount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ]).toArray(),

      col("invoices").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$document_subtype", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 15 },
      ]).toArray(),

      col("invoices").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$cash_flow", n: { $sum: 1 } } },
      ]).toArray(),

      col("invoices").find(
        { user_id: userId } as any,
        { projection: { supplier_name: 1, invoice_number: 1, amount: 1, currency: 1, issue_date: 1, document_subtype: 1, cash_flow: 1, created_at: 1 } } as any,
      ).sort({ created_at: -1 }).limit(25).toArray(),

      col("document_processing_jobs").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]).toArray(),

      // Documents of this user waiting with no job row to run them.
      col("documents").aggregate([
        { $match: { user_id: userId, processing_status: { $in: ["queued", "processing"] } } },
        { $addFields: { id_string: { $toString: "$_id" } } },
        {
          $lookup: {
            from: "document_processing_jobs",
            localField: "id_string",
            foreignField: "document_id",
            as: "jobs",
          },
        },
        { $match: { jobs: { $size: 0 } } },
        { $count: "n" },
      ]).toArray(),

      col("documents").aggregate([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            synced: { $sum: { $cond: [{ $ifNull: ["$drive_file_id", false] }, 1, 0] } },
            with_key: { $sum: { $cond: [{ $ifNull: ["$spaces_key", false] }, 1, 0] } },
            legacy_keys: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: { $ifNull: ["$spaces_key", ""] }, regex: "^gmail/invoices/|^documents/" } },
                  1, 0,
                ],
              },
            },
          },
        },
      ]).toArray(),

      col("documents").aggregate([
        { $match: { user_id: userId } },
        { $group: { _id: "$import_source", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]).toArray(),

      col("gmail_import_jobs").find(
        { user_id: userId } as any,
        { projection: { status: 1, total_messages: 1, processed_messages: 1, imported: 1, stored: 1, classified_invoices: 1, rejected: 1, errors: 1, created_at: 1, completed_at: 1 } } as any,
      ).sort({ created_at: -1 }).limit(10).toArray(),
    ]);

    const invoiceSummary = (invoiceTotals[0] as any) ?? { total: 0, with_amount: 0, total_amount: 0 };
    const driveSummary = (driveCoverage[0] as any) ?? { total: 0, synced: 0, with_key: 0, legacy_keys: 0 };

    const reminderStatusMap: Record<string, number> = {};
    for (const r of reminderCounts) reminderStatusMap[r._id ?? "unknown"] = r.count;

    // Fetch templates for field coverage analysis
    const templateIds = [...new Set(documents.map((d: any) => d.template_id).filter(Boolean))];
    const templateLookupIds = [...new Set(templateIds.flatMap((id: any) => {
      const ids: any[] = [id, String(id)];
      const numericId = Number(id);
      if (Number.isFinite(numericId)) ids.push(numericId);
      return ids;
    }))];
    const templates = templateLookupIds.length
      ? await col("doc_templates").find({ id: { $in: templateLookupIds } }).toArray()
      : [];
    const templateMap: Record<string, any> = {};
    for (const t of templates) templateMap[String((t as any).id)] = t;

    function normalizeTemplateFields(raw: any): Array<{ key: string }> {
      if (typeof raw === "string") {
        try {
          return normalizeTemplateFields(JSON.parse(raw));
        } catch {
          return [];
        }
      }
      if (!Array.isArray(raw)) return [];
      return raw
        .map((field) => typeof field === "string" ? { key: field } : field)
        .filter((field) => field && typeof field.key === "string");
    }

    function computeFieldCoverage(doc: any) {
      const tplId = doc.template_id;
      if (!tplId || !templateMap[String(tplId)]) return null;
      const tpl = templateMap[String(tplId)];
      const fields = normalizeTemplateFields(tpl.fields);
      let extracted: Record<string, any> = {};
      try {
        const raw = doc.extracted_fields;
        if (!raw) extracted = {};
        else if (typeof raw === "string") extracted = JSON.parse(raw);
        else extracted = raw;
      } catch { extracted = {}; }
      const present: string[] = [];
      const missing: string[] = [];
      const nulled: string[] = [];
      for (const f of fields) {
        const val = extracted[f.key];
        if (!(f.key in extracted)) missing.push(f.key);
        else if (val === null || val === "" || (Array.isArray(val) && val.length === 0)) nulled.push(f.key);
        else present.push(f.key);
      }
      return {
        template_name: tpl.name,
        total_fields: fields.length,
        present,
        missing,
        nulled,
        coverage_pct: fields.length
          ? Math.round((present.length / fields.length) * 100)
          : null,
      };
    }

    res.json({
      documents: documents.map((d: any) => ({
        id: d._id?.toString(),
        filename: d.file_name,
        status: d.processing_status,
        error: d.error_message ?? null,
        has_s3: !!d.spaces_key,
        size_bytes: d.file_size_bytes ?? 0,
        document_type: d.document_type ?? null,
        created_at: d.created_at,
        field_coverage: computeFieldCoverage(d),
      })),
      emailLogs: emailLogs.map((l: any) => ({
        id: l._id?.toString(),
        log_type: l.log_type,
        success: l.success,
        recipient: l.recipient ?? l.to_address ?? null,
        subject: l.subject ?? null,
        error: l.error ?? null,
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? null,
      })),
      reminderStatus: reminderStatusMap,
      extractions: extractions.map((e: any) => ({
        id: e._id?.toString(),
        document_id: e.document_id,
        backend: e.backend,
        model: e.model,
        parsed_ok: e.parsed_ok,
        exec_ms: e.exec_ms,
        error: e.error ?? null,
        created_at: e.created_at,
      })),
      failedEmails: schedulerErrors.map((e: any) => ({
        id: e._id?.toString(),
        log_type: e.log_type,
        error: e.error,
        sent_at: e.sent_at,
        recipient: e.recipient,
      })),
      counts: {
        clients: clientCount,
        contracts: contractCount,
        equipment: equipmentCount,
        documents: documentCount,
        emails: emailCount,
        extractions: extractionCount,
        invoices: invoiceSummary.total,
        total_storage_bytes: documents.reduce((sum: number, d: any) => sum + (d.file_size_bytes ?? 0), 0),
      },
      invoices: {
        total: invoiceSummary.total,
        with_amount: invoiceSummary.with_amount,
        total_amount: Math.round((invoiceSummary.total_amount ?? 0) * 100) / 100,
        by_subtype: invoiceSubtypes.map((r: any) => ({ subtype: r._id ?? "(none)", count: r.n })),
        by_cash_flow: Object.fromEntries(invoiceCashFlow.map((r: any) => [String(r._id ?? "unset"), r.n])),
        recent: recentInvoices.map((i: any) => ({
          id: i._id?.toString(),
          supplier_name: i.supplier_name ?? null,
          invoice_number: i.invoice_number ?? null,
          amount: i.amount ?? null,
          currency: i.currency ?? null,
          issue_date: i.issue_date ?? null,
          document_subtype: i.document_subtype ?? null,
          cash_flow: i.cash_flow ?? null,
        })),
      },
      import_queue: {
        by_status: Object.fromEntries(queueByStatus.map((r: any) => [String(r._id ?? "unknown"), r.n])),
        stuck_without_job: (queueOrphans[0] as any)?.n ?? 0,
        gmail_jobs: gmailJobs.map((j: any) => ({
          id: j._id?.toString(),
          status: j.status,
          total_messages: j.total_messages ?? 0,
          processed_messages: j.processed_messages ?? 0,
          imported: j.imported ?? 0,
          stored: j.stored ?? 0,
          classified_invoices: j.classified_invoices ?? 0,
          rejected: j.rejected ?? 0,
          errors: j.errors ?? 0,
          created_at: j.created_at,
          completed_at: j.completed_at ?? null,
        })),
      },
      storage: {
        documents_total: driveSummary.total,
        with_spaces_key: driveSummary.with_key,
        without_spaces_key: driveSummary.total - driveSummary.with_key,
        legacy_layout_keys: driveSummary.legacy_keys,
        drive_synced: driveSummary.synced,
        drive_not_synced: driveSummary.total - driveSummary.synced,
        import_sources: Object.fromEntries(
          importSources.map((r: any) => [String(r._id ?? "(unset)"), r.n]),
        ),
      },
      active_sessions: activeSessions,
    });
    } catch (err: any) {
      console.error("user detail error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load user detail" });
    }
  });

  // ── Bad email audit ──────────────────────────────────────────────────────
  // GET /api/admin/monitor/bad-emails
  app.get("/api/admin/monitor/bad-emails", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      function classifyEmail(email: string): string[] {
        const issues: string[] = [];
        if (!email || !email.trim()) return ["empty"];
        const e = email.trim();
        if (/\.{2,}/.test(e)) issues.push("consecutive_dots");
        if (/[.,;:]+$/.test(e)) issues.push("trailing_punctuation");
        if (!EMAIL_RE.test(e)) issues.push("invalid_format");
        const domain = e.split("@")[1] ?? "";
        if (domain && !/\./.test(domain)) issues.push("missing_tld");
        if (/\s/.test(e)) issues.push("contains_spaces");
        if (/[א-ת]/.test(e)) issues.push("hebrew_chars");
        const tld = domain.split(".").pop() ?? "";
        if (tld.length === 1) issues.push("short_tld");
        return issues;
      }

      const [clients, reminders, bouncedLogs, documentsWithEmail] = await Promise.all([
        col("clients").find(
          { email: { $exists: true, $nin: [null, ""] } },
          { projection: { _id: 1, user_id: 1, display_name: 1, email: 1, phone: 1 } },
        ).toArray(),
        col("reminders").find(
          { email_to: { $exists: true, $nin: [null, ""] } },
          { projection: { _id: 1, user_id: 1, email_to: 1, source_id: 1, status: 1, trigger_date: 1 } },
        ).toArray(),
        col("email_log").find(
          { $or: [{ bounced: true }, { log_type: "bounce" }, { error: { $regex: /bounce|invalid.*recipient|rejected/i } }] },
          { projection: { _id: 1, to_address: 1, error: 1, sent_at: 1, reminder_id: 1, user_id: 1 } },
        ).sort({ sent_at: -1 }).limit(500).toArray(),
        col("documents").find(
          { "extracted_fields": { $exists: true } },
          { projection: { _id: 1, user_id: 1, file_name: 1, original_filename: 1, extracted_fields: 1 } },
        ).limit(2000).toArray(),
      ]);

      const badClients: any[] = [];
      for (const c of clients as any[]) {
        const email = String(c.email ?? "").trim();
        const issues = classifyEmail(email);
        if (issues.length > 0) {
          badClients.push({
            id: c._id?.toString(),
            user_id: c.user_id,
            display_name: c.display_name,
            email,
            phone: c.phone ?? null,
            issues,
          });
        }
      }

      const badReminders: any[] = [];
      for (const r of reminders as any[]) {
        const emails = Array.isArray(r.email_to) ? r.email_to : [r.email_to];
        for (const email of emails) {
          const e = String(email ?? "").trim();
          const issues = classifyEmail(e);
          if (issues.length > 0) {
            badReminders.push({
              id: r._id?.toString(),
              user_id: r.user_id,
              email: e,
              status: r.status,
              trigger_date: r.trigger_date,
              source_id: r.source_id?.toString?.() ?? r.source_id,
              issues,
            });
          }
        }
      }

      const badDocEmails: any[] = [];
      for (const d of documentsWithEmail as any[]) {
        let fields: Record<string, any> = {};
        try {
          fields = typeof d.extracted_fields === "string" ? JSON.parse(d.extracted_fields) : (d.extracted_fields ?? {});
        } catch { continue; }
        const email = String(fields.client_email ?? fields.contact_email ?? fields.email ?? "").trim();
        if (!email) continue;
        const issues = classifyEmail(email);
        if (issues.length > 0) {
          badDocEmails.push({
            id: d._id?.toString(),
            user_id: d.user_id,
            filename: d.file_name ?? d.original_filename,
            email,
            issues,
          });
        }
      }

      const bouncedAddresses = bouncedLogs.map((l: any) => ({
        email: l.to_address,
        error: l.error ?? "bounced",
        sent_at: l.sent_at,
        reminder_id: l.reminder_id?.toString?.() ?? null,
        user_id: l.user_id,
      }));

      res.json({
        bad_clients: badClients,
        bad_reminders: badReminders,
        bad_doc_emails: badDocEmails,
        bounced: bouncedAddresses,
        summary: {
          total_bad_clients: badClients.length,
          total_bad_reminders: badReminders.length,
          total_bad_doc_emails: badDocEmails.length,
          total_bounced: bouncedAddresses.length,
        },
      });
    } catch (err: any) {
      console.error("bad-emails monitor error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── System health ────────────────────────────────────────────────────────
  // GET /api/admin/monitor/system-health
  // ── Import queue monitor ────────────────────────────────────────────────
  // Surfaces the document_processing_jobs pipeline: what is waiting, what is
  // wedged, and whether the worker is actually consuming. Read-only.
  app.get("/api/admin/monitor/import-queue", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const now = Date.now();
      const staleLockCutoff = new Date(now - 10 * 60 * 1000);
      const claimableCutoff = new Date(now);

      const [
        jobsByStatus,
        documentsByStatus,
        claimable,
        staleRunning,
        orphanedDocs,
        jobsWithoutDocument,
        failureReasons,
        recentFailures,
        oldestQueued,
        lastCompleted,
      ] = await Promise.all([
        col("document_processing_jobs").aggregate([
          { $group: { _id: "$status", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        col("documents").aggregate([
          { $group: { _id: "$processing_status", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        // Ready to be picked up right now. If this stays high while nothing
        // completes, the worker is not running.
        col("document_processing_jobs").countDocuments({
          status: "queued",
          next_run_at: { $lte: claimableCutoff },
        } as any),

        // Claimed but never released — a worker died mid-job.
        col("document_processing_jobs").countDocuments({
          status: "running",
          locked_at: { $lt: staleLockCutoff },
        } as any),

        // Documents waiting forever because no job row exists for them. This is
        // what the failed-upload path produced.
        col("documents").aggregate([
          { $match: { processing_status: { $in: ["queued", "processing"] } } },
          { $addFields: { id_string: { $toString: "$_id" } } },
          {
            $lookup: {
              from: "document_processing_jobs",
              localField: "id_string",
              foreignField: "document_id",
              as: "jobs",
            },
          },
          { $match: { jobs: { $size: 0 } } },
          { $count: "n" },
        ]).toArray(),

        col("document_processing_jobs").aggregate([
          { $addFields: { doc_oid: { $toObjectId: "$document_id" } } },
          {
            $lookup: {
              from: "documents",
              localField: "doc_oid",
              foreignField: "_id",
              as: "doc",
            },
          },
          { $match: { doc: { $size: 0 } } },
          { $count: "n" },
        ]).toArray().catch(() => []),

        col("document_processing_jobs").aggregate([
          { $match: { error_code: { $nin: [null, ""] } } },
          { $group: { _id: "$error_code", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        col("document_processing_jobs").find(
          { status: { $in: ["failed", "retry_wait"] } } as any,
          { projection: { document_id: 1, user_id: 1, status: 1, attempts: 1, max_attempts: 1, error_code: 1, error_message: 1, next_run_at: 1, updated_at: 1 } } as any,
        ).sort({ updated_at: -1 }).limit(50).toArray(),

        col("document_processing_jobs").find(
          { status: "queued" } as any,
          { projection: { document_id: 1, created_at: 1, next_run_at: 1, attempts: 1 } } as any,
        ).sort({ created_at: 1 }).limit(1).toArray(),

        col("document_processing_jobs").find(
          { status: "completed" } as any,
          { projection: { document_id: 1, completed_at: 1 } } as any,
        ).sort({ completed_at: -1 }).limit(1).toArray(),
      ]);

      const statusMap = Object.fromEntries(jobsByStatus.map((r: any) => [String(r._id ?? "unknown"), r.n]));
      const completedAt = (lastCompleted[0] as any)?.completed_at ?? null;
      const minutesSinceCompletion = completedAt
        ? Math.round((now - new Date(completedAt).getTime()) / 60000)
        : null;

      // The worker is only suspect when there is work it could take but has
      // not finished anything recently.
      const workerStalled = claimable > 0
        && minutesSinceCompletion !== null
        && minutesSinceCompletion > 15;

      res.json({
        jobs: {
          by_status: statusMap,
          total: Object.values(statusMap).reduce((sum: number, n: any) => sum + Number(n), 0),
          claimable_now: claimable,
          stale_running: staleRunning,
        },
        documents: {
          by_status: Object.fromEntries(documentsByStatus.map((r: any) => [String(r._id ?? "unknown"), r.n])),
          stuck_without_job: (orphanedDocs[0] as any)?.n ?? 0,
        },
        integrity: {
          jobs_without_document: (jobsWithoutDocument[0] as any)?.n ?? 0,
        },
        worker: {
          last_completed_at: completedAt,
          minutes_since_last_completion: minutesSinceCompletion,
          stalled: workerStalled,
        },
        oldest_queued: oldestQueued[0] ?? null,
        failure_reasons: failureReasons.map((r: any) => ({ reason: String(r._id), count: r.n })),
        recent_failures: recentFailures,
      });
    } catch (err: any) {
      console.error("import-queue monitor error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── Invoice pipeline monitor ────────────────────────────────────────────
  // How well invoice-template documents convert into invoice rows, and where
  // the ones that do not are being lost. Read-only.
  app.get("/api/admin/monitor/invoices", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const [
        totals,
        byCategory,
        byCashFlow,
        byValidation,
        knownExtractors,
        rejectionReasons,
        processedNotSaved,
        missingFields,
      ] = await Promise.all([
        col("invoices").aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              with_amount: { $sum: { $cond: [{ $gt: ["$amount", 0] }, 1, 0] } },
              possible_not_invoice: { $sum: { $cond: [{ $eq: ["$possible_not_invoice", true] }, 1, 0] } },
            },
          },
        ]).toArray(),

        // document_subtype is the stored value; the category shown in the UI is
        // derived from it at read time, so report the raw subtype here.
        col("invoices").aggregate([
          { $group: { _id: "$document_subtype", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
          { $limit: 25 },
        ]).toArray(),

        col("invoices").aggregate([
          { $group: { _id: "$cash_flow", n: { $sum: 1 } } },
        ]).toArray(),

        col("invoices").aggregate([
          { $group: { _id: "$invoice_validation_status", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        // Documents whose fields came from a deterministic vendor extractor
        // rather than the AI path.
        col("documents").aggregate([
          { $match: { gmail_provider_id: { $nin: [null, ""] } } },
          { $group: { _id: "$gmail_provider_id", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
          { $limit: 30 },
        ]).toArray(),

        col("documents").aggregate([
          { $match: { invoice_rejected: true } },
          { $group: { _id: "$invoice_rejection_reason", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        // Finished under an invoice storage prefix but never produced a row.
        col("documents").aggregate([
          {
            $match: {
              processing_status: "done",
              spaces_key: { $regex: "/invoices/" },
              invoice_saved: { $ne: true },
            },
          },
          { $group: { _id: "$document_kind", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),

        col("documents").aggregate([
          { $match: { missing_required_fields: { $exists: true, $ne: [] } } },
          { $unwind: "$missing_required_fields" },
          { $group: { _id: "$missing_required_fields", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),
      ]);

      const summary = (totals[0] as any) ?? { total: 0, with_amount: 0, possible_not_invoice: 0 };
      const notSaved = processedNotSaved.reduce((sum: number, r: any) => sum + r.n, 0);
      const processedTotal = summary.total + notSaved;

      res.json({
        totals: {
          invoices: summary.total,
          with_amount: summary.with_amount,
          possible_not_invoice: summary.possible_not_invoice,
          processed_invoice_documents: processedTotal,
          save_rate: processedTotal ? Number((summary.total / processedTotal).toFixed(3)) : null,
        },
        by_subtype: byCategory.map((r: any) => ({ subtype: r._id ?? "(none)", count: r.n })),
        by_cash_flow: Object.fromEntries(byCashFlow.map((r: any) => [String(r._id ?? "unset"), r.n])),
        by_validation_status: byValidation.map((r: any) => ({ status: r._id ?? "(none)", count: r.n })),
        known_extractor_providers: knownExtractors.map((r: any) => ({ provider: r._id, count: r.n })),
        rejection_reasons: rejectionReasons.map((r: any) => ({ reason: r._id ?? "(none)", count: r.n })),
        processed_not_saved: processedNotSaved.map((r: any) => ({ document_kind: r._id ?? "(none)", count: r.n })),
        missing_required_fields: missingFields.map((r: any) => ({ field: r._id, count: r.n })),
      });
    } catch (err: any) {
      console.error("invoice monitor error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── Storage + Drive monitor ─────────────────────────────────────────────
  // Object-storage key-layout health and Google Drive export state. Read-only.
  app.get("/api/admin/monitor/storage-drive", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { spacesEnabled } = await import("../storage/spaces.js");

      const [
        keyCoverage,
        legacyKeys,
        staleUrls,
        driveJobs,
        driveCoverage,
        driveFailures,
        importSources,
      ] = await Promise.all([
        col("documents").aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              with_key: { $sum: { $cond: [{ $ifNull: ["$spaces_key", false] }, 1, 0] } },
              missing_flagged: { $sum: { $cond: [{ $eq: ["$file_missing", true] }, 1, 0] } },
            },
          },
        ]).toArray(),

        // Objects still on the pre-migration layout, which is not tenant-first.
        col("documents").countDocuments({
          spaces_key: { $regex: "^gmail/invoices/|^documents/" },
        } as any),

        // Cached signed URLs pointing at a key that no longer exists.
        col("documents").countDocuments({
          $or: [
            { download_url: { $regex: "gmail/invoices/" } },
            { spaces_url: { $regex: "gmail/invoices/" } },
          ],
        } as any),

        col("drive_export_jobs").aggregate([
          { $group: { _id: "$status", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray().catch(() => []),

        col("documents").aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              synced: { $sum: { $cond: [{ $ifNull: ["$drive_file_id", false] }, 1, 0] } },
            },
          },
        ]).toArray(),

        col("drive_export_jobs").find(
          { status: { $in: ["failed", "completed"] } } as any,
          { projection: { user_id: 1, status: 1, uploaded: 1, failed: 1, skipped: 1, processed: 1, updated_at: 1 } } as any,
        ).sort({ updated_at: -1 }).limit(20).toArray().catch(() => []),

        col("documents").aggregate([
          { $group: { _id: "$import_source", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ]).toArray(),
      ]);

      const coverage = (keyCoverage[0] as any) ?? { total: 0, with_key: 0, missing_flagged: 0 };
      const drive = (driveCoverage[0] as any) ?? { total: 0, synced: 0 };

      res.json({
        object_storage: {
          configured: spacesEnabled(),
          documents_total: coverage.total,
          with_spaces_key: coverage.with_key,
          without_spaces_key: coverage.total - coverage.with_key,
          flagged_file_missing: coverage.missing_flagged,
          legacy_layout_keys: legacyKeys,
          stale_cached_urls: staleUrls,
        },
        drive: {
          documents_total: drive.total,
          synced: drive.synced,
          not_synced: drive.total - drive.synced,
          jobs_by_status: Object.fromEntries(driveJobs.map((r: any) => [String(r._id ?? "unknown"), r.n])),
          recent_jobs: driveFailures,
        },
        import_sources: Object.fromEntries(
          importSources.map((r: any) => [String(r._id ?? "(unset)"), r.n]),
        ),
      });
    } catch (err: any) {
      console.error("storage-drive monitor error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/monitor/system-health", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const db = col("users").dbName ? col("users") : null;
      const dbInstance = (await import("../db/db.js")).getDb();

      const collectionNames = [
        "users", "sessions", "documents", "clients", "contracts",
        "reminders", "equipment", "email_log", "extractions",
        "print_templates", "print_template_drafts", "email_templates",
        "doc_templates", "timeline_events", "tasks",
        "invoices", "document_processing_jobs", "gmail_imports",
        "gmail_import_jobs", "drive_export_jobs",
      ];

      const countPromises = collectionNames.map(async (name) => {
        try {
          const count = await dbInstance.collection(name).estimatedDocumentCount();
          return { collection: name, count };
        } catch {
          return { collection: name, count: -1 };
        }
      });

      const [dbStats, collectionCounts, activeSessions] = await Promise.all([
        dbInstance.stats().catch(() => null),
        Promise.all(countPromises),
        col("sessions").countDocuments({ expires_at: { $gt: new Date() } }),
      ]);

      const uptime = process.uptime();
      const mem = process.memoryUsage();

      res.json({
        server: {
          uptime_seconds: Math.floor(uptime),
          uptime_human: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
          node_version: process.version,
          platform: process.platform,
          memory: {
            rss_mb: Math.round(mem.rss / 1048576),
            heap_used_mb: Math.round(mem.heapUsed / 1048576),
            heap_total_mb: Math.round(mem.heapTotal / 1048576),
            external_mb: Math.round(mem.external / 1048576),
          },
          pid: process.pid,
        },
        database: {
          name: dbInstance.databaseName,
          size_mb: dbStats ? Math.round((dbStats as any).dataSize / 1048576) : null,
          storage_mb: dbStats ? Math.round((dbStats as any).storageSize / 1048576) : null,
          collections: collectionCounts.sort((a, b) => b.count - a.count),
        },
        active_sessions: activeSessions,
      });
    } catch (err: any) {
      console.error("system-health error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── S3 Storage Browser ──────────────────────────────────────────────────
  // GET /api/admin/storage/browse?user_id=&prefix=
  app.get("/api/admin/storage/browse", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { listSpacesFiles, spacesEnabled, getSpacesSignedUrl } = await import("../storage/spaces.js");
      if (!spacesEnabled()) {
        res.status(400).json({ error: "Object storage not configured" });
        return;
      }

      const userId = req.query.user_id as string | undefined;
      const explicitPrefix = req.query.prefix as string | undefined;

      // Keys are tenant-first ({user_id}/documents/…, {user_id}/invoices/…),
      // but objects written before the migration still live under the legacy
      // documents/{user_id}/ prefix. Browsing a user has to cover both, or the
      // listing silently omits nearly everything.
      let files: Awaited<ReturnType<typeof listSpacesFiles>>["files"] = [];
      let truncated = false;
      let prefix: string;

      if (explicitPrefix) {
        prefix = explicitPrefix;
        const result = await listSpacesFiles(prefix, 500);
        files = result.files;
        truncated = result.truncated;
      } else if (userId) {
        prefix = `${userId}/`;
        const [current, legacy] = await Promise.all([
          listSpacesFiles(`${userId}/`, 500),
          listSpacesFiles(`documents/${userId}/`, 500),
        ]);
        const seen = new Set<string>();
        files = [...current.files, ...legacy.files].filter((f) => {
          if (seen.has(f.key)) return false;
          seen.add(f.key);
          return true;
        });
        truncated = current.truncated || legacy.truncated;
      } else {
        prefix = "";
        const result = await listSpacesFiles("", 500);
        files = result.files;
        truncated = result.truncated;
      }

      // Cross-reference with the DB. Thumbnails are generated derivatives kept
      // beside their source PDF and tracked in thumbnail_key, not spaces_key,
      // so matching only on spaces_key reported every thumbnail as an orphan.
      const keys = files.map((f) => f.key);
      const docs = keys.length
        ? await col("documents")
            .find({ $or: [{ spaces_key: { $in: keys } }, { thumbnail_key: { $in: keys } }] } as any)
            .project({ _id: 1, file_name: 1, spaces_key: 1, thumbnail_key: 1, user_id: 1, processing_status: 1, created_at: 1 })
            .toArray()
        : [];

      const docByKey: Record<string, any> = {};
      const thumbOwnerByKey: Record<string, any> = {};
      for (const d of docs) {
        if (d.spaces_key) docByKey[d.spaces_key as string] = d;
        if (d.thumbnail_key) thumbOwnerByKey[d.thumbnail_key as string] = d;
      }

      const enriched = files.map((f) => {
        const isThumbnail = f.key.endsWith(".thumb.png");
        const doc = docByKey[f.key];
        const thumbOwner = thumbOwnerByKey[f.key];
        // A thumbnail counts as linked when its owning document references it,
        // or when the source object it was derived from is present.
        const derivedFrom = isThumbnail && !thumbOwner
          ? docByKey[f.key.replace(/\.thumb\.png$/, ".pdf")]
          : null;
        const owner = doc ?? thumbOwner ?? derivedFrom;
        const legacy = /^gmail\/invoices\//.test(f.key) || /^documents\//.test(f.key);
        return {
          key: f.key,
          size: f.size,
          last_modified: f.last_modified,
          doc_id: owner?._id?.toString() ?? null,
          file_name: doc?.file_name ?? (owner?.file_name ? `${owner.file_name} (thumbnail)` : (f.key.split("/").pop() ?? f.key)),
          user_id: owner?.user_id ?? null,
          status: doc?.processing_status ?? null,
          kind: isThumbnail ? "thumbnail" : "document",
          in_db: !!owner,
          layout: legacy ? "legacy" : "tenant",
          area: storageAreaFromKey(f.key),
        };
      });

      res.json({
        files: enriched,
        truncated,
        prefix,
        layout_counts: {
          tenant: enriched.filter((f) => f.layout === "tenant").length,
          legacy: enriched.filter((f) => f.layout === "legacy").length,
        },
        kind_counts: {
          document: enriched.filter((f) => f.kind === "document").length,
          thumbnail: enriched.filter((f) => f.kind === "thumbnail").length,
        },
      });
    } catch (err: any) {
      console.error("storage-browse error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // GET /api/admin/storage/download?key= — signed download URL for any S3 key
  app.get("/api/admin/storage/download", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { getSpacesSignedUrl, spacesEnabled } = await import("../storage/spaces.js");
      if (!spacesEnabled()) {
        res.status(400).json({ error: "Object storage not configured" });
        return;
      }
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: "key is required" });
        return;
      }
      const fileName = key.split("/").pop() ?? "file";
      const url = await getSpacesSignedUrl(key, 300, fileName, true);
      res.redirect(url);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // DELETE /api/admin/storage/delete?key= — delete an S3 file (orphans only)
  app.delete("/api/admin/storage/delete", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { deleteFromSpaces, spacesEnabled } = await import("../storage/spaces.js");
      if (!spacesEnabled()) {
        res.status(400).json({ error: "Object storage not configured" });
        return;
      }
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: "key is required" });
        return;
      }
      const dbDoc = await col("documents").findOne({ spaces_key: key });
      if (dbDoc) {
        res.status(400).json({ error: "File is linked to a document record — delete the document first" });
        return;
      }
      await deleteFromSpaces(key);
      res.json({ ok: true, deleted: key });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // GET /api/admin/storage/folders — top-level prefixes with object counts.
  // Always safe: lists only, and marks which prefixes are referenced in Mongo.
  app.get("/api/admin/storage/folders", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { listAllSpacesFiles, spacesEnabled } = await import("../storage/spaces.js");
      if (!spacesEnabled()) {
        res.status(400).json({ error: "Object storage not configured" });
        return;
      }

      const { files, truncated } = await listAllSpacesFiles("", 50_000);
      const keys = files.map((f) => f.key);

      // A key is "referenced" when a document row still points at it, either as
      // the stored object or as its generated thumbnail.
      const referenced = new Set<string>();
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const docs = await col("documents")
          .find({ $or: [{ spaces_key: { $in: chunk } }, { thumbnail_key: { $in: chunk } }] } as any)
          .project({ spaces_key: 1, thumbnail_key: 1 })
          .toArray() as any[];
        for (const d of docs) {
          if (d.spaces_key) referenced.add(String(d.spaces_key));
          if (d.thumbnail_key) referenced.add(String(d.thumbnail_key));
        }
      }

      const groups: Record<string, { objects: number; bytes: number; referenced: number }> = {};
      for (const f of files) {
        const prefix = f.key.includes("/") ? `${f.key.split("/")[0]}/` : "(root)";
        groups[prefix] ??= { objects: 0, bytes: 0, referenced: 0 };
        groups[prefix].objects += 1;
        groups[prefix].bytes += f.size ?? 0;
        if (referenced.has(f.key)) groups[prefix].referenced += 1;
      }

      const users = await col("users").find({} as any).project({ _id: 1, email: 1 }).toArray() as any[];
      const emailById = new Map(users.map((u) => [String(u._id), u.email]));

      const folders = Object.entries(groups).map(([prefix, g]) => {
        const id = prefix.replace(/\/$/, "");
        return {
          prefix,
          objects: g.objects,
          bytes: g.bytes,
          referenced: g.referenced,
          unreferenced: g.objects - g.referenced,
          owner_email: emailById.get(id) ?? null,
          looks_like_user_id: /^[0-9a-f]{24}$/.test(id),
        };
      }).sort((a, b) => b.objects - a.objects);

      res.json({ folders, truncated, total_objects: files.length });
    } catch (err: any) {
      console.error("storage-folders error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // DELETE /api/admin/storage/folder?prefix=&confirm=
  // Deletes every object under a top-level prefix. Refuses when any object is
  // still referenced by a document, and requires the prefix echoed back in
  // `confirm` so a mistyped or auto-submitted request cannot destroy data.
  app.delete("/api/admin/storage/folder", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    try {
      const { listAllSpacesFiles, deleteManyFromSpaces, spacesEnabled } = await import("../storage/spaces.js");
      if (!spacesEnabled()) {
        res.status(400).json({ error: "Object storage not configured" });
        return;
      }

      const prefix = String(req.query.prefix ?? "");
      const confirm = String(req.query.confirm ?? "");
      const force = req.query.force === "true";

      if (!prefix) {
        res.status(400).json({ error: "prefix is required" });
        return;
      }
      // Only whole top-level folders: an arbitrary prefix such as "6a1" would
      // match across unrelated folders.
      if (!/^[A-Za-z0-9._-]+\/$/.test(prefix)) {
        res.status(400).json({ error: "prefix must be a single top-level folder ending in '/', e.g. documents/" });
        return;
      }
      if (confirm !== prefix) {
        res.status(400).json({ error: "confirm must exactly match the prefix" });
        return;
      }

      const { files, truncated } = await listAllSpacesFiles(prefix, 50_000);
      if (!files.length) {
        res.json({ ok: true, prefix, deleted: 0, note: "prefix is already empty" });
        return;
      }
      if (truncated) {
        res.status(409).json({ error: "Folder is larger than the 50000 object safety limit — delete it with a script instead" });
        return;
      }

      const keys = files.map((f) => f.key);
      const linked: string[] = [];
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const docs = await col("documents")
          .find({ $or: [{ spaces_key: { $in: chunk } }, { thumbnail_key: { $in: chunk } }] } as any)
          .project({ spaces_key: 1, thumbnail_key: 1 })
          .toArray() as any[];
        for (const d of docs) {
          if (d.spaces_key && chunk.includes(String(d.spaces_key))) linked.push(String(d.spaces_key));
          if (d.thumbnail_key && chunk.includes(String(d.thumbnail_key))) linked.push(String(d.thumbnail_key));
        }
      }

      // Deleting a referenced object breaks a document the user can still see,
      // so it takes an explicit override rather than being the default.
      if (linked.length && !force) {
        res.status(409).json({
          error: "Folder contains objects still linked to documents",
          linked_count: linked.length,
          total_objects: files.length,
          sample_linked: linked.slice(0, 10),
        });
        return;
      }

      const result = await deleteManyFromSpaces(keys);
      console.warn("admin_storage_folder_deleted", {
        prefix,
        objects: files.length,
        deleted: result.deleted,
        linked_overridden: force ? linked.length : 0,
        errors: result.errors.length,
      });

      res.json({
        ok: true,
        prefix,
        total_objects: files.length,
        deleted: result.deleted,
        linked_overridden: force ? linked.length : 0,
        errors: result.errors.slice(0, 20),
        error_count: result.errors.length,
      });
    } catch (err: any) {
      console.error("storage-folder-delete error:", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });
}

/**
 * Human-readable area for a storage key, across both layouts:
 *   {user_id}/invoices/gmail/…   -> invoices/gmail   (current)
 *   gmail/invoices/telecom/hot/… -> invoices/gmail   (legacy)
 *   {user_id}/documents/…        -> documents
 */
function storageAreaFromKey(key: string): string {
  if (/^gmail\/invoices\//.test(key)) return "invoices/gmail";
  if (/^documents\//.test(key)) return "documents";
  const parts = key.split("/");
  if (parts.length >= 3 && parts[1] === "invoices") return `invoices/${parts[2]}`;
  if (parts.length >= 2 && parts[1]) return parts[1];
  return "other";
}
