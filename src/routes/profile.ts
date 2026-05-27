import express from "express";
import multer from "multer";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

async function auth(req: express.Request, res: express.Response) {
  try {
    return await requireAuth(req.headers.cookie ?? undefined);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

export function registerProfileRoutes(app: express.Application) {

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/profile/stats", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;

    const now = new Date().toISOString().slice(0, 7); // YYYY-MM
    const [active, snoozed, sent, monthly] = await Promise.all([
      col("reminders").countDocuments({ user_id: ctx.userId, status: "pending" }),
      col("reminders").countDocuments({ user_id: ctx.userId, status: "snoozed" }),
      col("reminders").countDocuments({
        user_id: ctx.userId,
        status: "sent",
        source_type: { $ne: "manual" },
      }),
      col("reminders").countDocuments({
        user_id: ctx.userId,
        created_at: { $regex: `^${now}` },
      }),
    ]);

    res.json({ active, snoozed, completed: sent, monthly });
  });

  // ── Engineer profile ──────────────────────────────────────────────────────
  app.get("/api/profile/engineer", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const doc = await col("engineer_profiles").findOne({ user_id: ctx.userId });
    res.json(doc ?? {});
  });

  app.put("/api/profile/engineer", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const {
      inspector_number, address, title, expertise,
      mr_number, mg_number, membership_start_date,
      company_name, company_phone, company_email,
    } = req.body as Record<string, string | null>;

    await col("engineer_profiles").updateOne(
      { user_id: ctx.userId },
      {
        $set: {
          user_id: ctx.userId,
          inspector_number: inspector_number ?? null,
          address: address ?? null,
          title: title ?? null,
          expertise: expertise ?? null,
          mr_number: mr_number ?? null,
          mg_number: mg_number ?? null,
          membership_start_date: membership_start_date ?? null,
          company_name: company_name ?? null,
          company_phone: company_phone ?? null,
          company_email: company_email ?? null,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );

    const updated = await col("engineer_profiles").findOne({ user_id: ctx.userId });
    res.json(updated ?? {});
  });

  // ── Update personal info (name + phone) on the users collection ──────────
  app.put("/api/profile", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const { name, phone, company_name } = req.body as { name?: string; phone?: string | null; company_name?: string | null };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name?.trim() ?? null;
    if (phone !== undefined) patch.phone = phone?.trim() || null;
    if (company_name !== undefined) patch.company_name = company_name?.trim() || null;
    if (Object.keys(patch).length === 1) { res.status(400).json({ error: "nothing to update" }); return; }
    await col("users").updateOne({ _id: new ObjectId(ctx.userId) as any }, { $set: patch });
    res.json({ ok: true });
  });

  // ── Avatar upload ─────────────────────────────────────────────────────────
  app.post("/api/profile/avatar", avatarUpload.single("avatar"), async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    if (!req.file) { res.status(400).json({ error: "no_file" }); return; }
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      { $set: { picture_url: dataUrl, updated_at: new Date().toISOString() } },
    );
    res.json({ picture_url: dataUrl });
  });

  // ── Certificates ──────────────────────────────────────────────────────────
  app.get("/api/profile/certificates", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const certs = await col("certificates").find({ user_id: ctx.userId }).sort({ issued_date: -1 }).toArray();
    res.json(certs);
  });

  app.post("/api/profile/certificates", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const { name, type, issuer, issued_date, expiry_date } = req.body as Record<string, string>;
    const now = new Date().toISOString();
    const status = expiry_date && expiry_date < now.slice(0, 10) ? "expired" : "active";
    const result = await col("certificates").insertOne({
      user_id: ctx.userId,
      name: name ?? "",
      type: type ?? "",
      issuer: issuer ?? "",
      issued_date: issued_date ?? null,
      expiry_date: expiry_date ?? null,
      status,
      created_at: now,
    } as any);
    res.json({ _id: result.insertedId });
  });

  app.delete("/api/profile/certificates/:id", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    await col("certificates").deleteOne({ _id: new ObjectId(req.params.id) as any, user_id: ctx.userId });
    res.json({ ok: true });
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get("/api/profile/notifications", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const notifs = await col("notifications")
      .find({ user_id: ctx.userId })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
    res.json(notifs);
  });

  app.put("/api/profile/notifications/:id/read", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    await col("notifications").updateOne(
      { _id: new ObjectId(req.params.id) as any, user_id: ctx.userId },
      { $set: { read: true } },
    );
    res.json({ ok: true });
  });

  // ── Password change ───────────────────────────────────────────────────────
  app.post("/api/auth/change-password", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const { current_password, new_password } = req.body as Record<string, string>;
    if (!current_password || !new_password) {
      res.status(400).json({ error: "current_password and new_password required" });
      return;
    }
    if (new_password.length < 8) {
      res.status(400).json({ error: "new_password must be at least 8 characters" });
      return;
    }
    const { compare, hash } = await import("bcryptjs");
    const oid = new ObjectId(ctx.userId);
    const user = await col("users").findOne({ _id: oid as any }) as any;
    if (!user?.password_hash) {
      res.status(400).json({ error: "no_password_set" });
      return;
    }
    const ok = await compare(current_password, user.password_hash);
    if (!ok) { res.status(400).json({ error: "wrong_current_password" }); return; }
    const newHash = await hash(new_password, 12);
    await col("users").updateOne(
      { _id: oid as any },
      { $set: { password_hash: newHash, updated_at: new Date().toISOString() } },
    );
    res.json({ ok: true });
  });
}
