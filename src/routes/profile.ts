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
    const { name, phone } = req.body as { name?: string; phone?: string | null };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name?.trim() ?? null;
    if (phone !== undefined) patch.phone = phone?.trim() || null;
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

  // Parse certificate fields from OCR raw text using regex patterns
  function parseCertFromText(text: string): Partial<{ name: string; type: string; issuer: string; issued_date: string; expiry_date: string }> {
    const t = text;

    // ISO or Hebrew date patterns: 2024-03-15 / 15/03/2024 / 15.03.2024
    function findDate(patterns: RegExp[]): string | null {
      for (const re of patterns) {
        const m = t.match(re);
        if (m) {
          // Normalise dd/mm/yyyy or dd.mm.yyyy → yyyy-mm-dd
          const raw = m[1] ?? m[0];
          const slash = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
          if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
          const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (iso) return raw;
        }
      }
      return null;
    }

    const issued_date = findDate([
      /(?:תאריך הנפקה|הונפק(?:ה)?|תאריך)[:\s]+(\d{1,2}[./]\d{1,2}[./]\d{4})/,
      /(?:issued|issue date)[:\s]+(\d{4}-\d{2}-\d{2})/i,
      /(\d{1,2}[./]\d{1,2}[./]\d{4})/,
    ]);

    const expiry_date = findDate([
      /(?:תוקף עד|בתוקף עד|תאריך פקיעה|פג תוקף|תפוגה)[:\s]+(\d{1,2}[./]\d{1,2}[./]\d{4})/,
      /(?:expiry|expiration|valid until|valid to)[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/i,
    ]);

    // Issuer: look for known authority keywords
    const issuerMatch = t.match(
      /(?:מונפק על ידי|גוף מנפיק|הונפק ע"י|issued by)[:\s]+([^\n]{3,60})/i
    ) ?? t.match(/(?:מכון התקנים|רשות העבודה|משרד העבודה|Ministry of Labor|Standards Institute)([^\n]{0,40})/i);
    const issuer = issuerMatch ? issuerMatch[1]?.trim() : undefined;

    // Certificate name: first non-empty line or after "תעודת"
    const nameMatch = t.match(/(?:תעודת?\s+)([֐-׿\w\s]{3,60})/) ??
                      t.match(/^(.{5,80})$/m);
    const name = nameMatch ? nameMatch[1]?.trim() : undefined;

    // Type heuristic
    let type = "כללי";
    if (/בטיחות/.test(t)) type = "בטיחות";
    else if (/הרמ[הות]/.test(t)) type = "הרמה";
    else if (/חשמל/.test(t)) type = "חשמל";
    else if (/כיבוי אש/.test(t)) type = "כיבוי אש";
    else if (/ריתוך/.test(t)) type = "ריתוך";

    return {
      ...(name && { name }),
      type,
      ...(issuer && { issuer }),
      ...(issued_date && { issued_date }),
      ...(expiry_date && { expiry_date }),
    };
  }

  // POST /api/profile/certificates/from-document — extract cert fields from an already-processed document
  app.post("/api/profile/certificates/from-document", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const { document_id } = req.body as { document_id: string };
    if (!document_id) { res.status(400).json({ error: "document_id required" }); return; }

    const doc = await col("documents").findOne({ _id: new ObjectId(document_id) as any, user_id: ctx.userId }) as any;
    if (!doc) { res.status(404).json({ error: "document not found" }); return; }

    const rawText: string = doc.raw_text ?? "";
    const fields = parseCertFromText(rawText);

    const now = new Date().toISOString();
    const status = fields.expiry_date && fields.expiry_date < now.slice(0, 10) ? "expired" : "active";

    const result = await col("certificates").insertOne({
      user_id: ctx.userId,
      document_id,
      name: fields.name ?? doc.file_name ?? "",
      type: fields.type ?? "כללי",
      issuer: fields.issuer ?? "",
      issued_date: fields.issued_date ?? null,
      expiry_date: fields.expiry_date ?? null,
      status,
      created_at: now,
    } as any);

    res.json({ _id: result.insertedId, ...fields, status });
  });

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
