import express from "express";
import multer from "multer";
import {ObjectId} from "mongodb";
import {extname, join} from "path";
import {mkdirSync, readFileSync, writeFileSync} from "fs";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";
import {getDataDir} from "../settings";
import {parsePdf} from "../pipeline/pdfParser";
import {enrichTextWithPlumberTables} from "../pipeline/pdfPlumberParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import {ocrFile} from "../pipeline/ocrParser";
import {extractCertificate} from "../pipeline/certificateExtractor";
import {effectivePlanId} from "../plans/tierFeatures";
import {getDocumentImportQuota, type DocumentImportQuotaCategory} from "../quotas/documentImportQuota";
import {getImportUsageCounters} from "../quotas/importUsageCounters";
import {getReminderQuota} from "../quotas/reminderQuota";
import {INSPECTION_PRINT_TEMPLATE_PRESETS} from "../shared/printTemplateLayout.js";
import {serializeUser} from "../shared/types";

const INSPECTION_TYPE_KEYS = new Set(INSPECTION_PRINT_TEMPLATE_PRESETS.map((p) => p.key));

/** Drops unknown keys and non-string/blank values from the per-type inspector-number map before it reaches the database. */
function sanitizeInspectorNumbersByType(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!INSPECTION_TYPE_KEYS.has(key)) continue;
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) out[key] = trimmed;
  }
  return Object.keys(out).length ? out : null;
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function auth(req: express.Request, res: express.Response) {
  try {
    return await requireAuth(req.headers.cookie ?? undefined);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

function normalizeSubscriptionPlan(plan: string | null | undefined): "expired" | "trial" | "digital" | "basic" | "business" {
    const value = String(plan ?? "").trim().toLowerCase();
    if (value === "admin" || value === "business") return "business";
    if (value === "pro" || value === "basic") return "basic";
    if (value === "digital") return "digital";
    if (value === "trial") return "trial";
    return "expired";
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

    app.get("/api/profile/subscription", async (req, res) => {
        const ctx = await auth(req, res);
        if (!ctx) return;

        const userPlan = effectivePlanId(ctx.user);
        const normalizedPlan = normalizeSubscriptionPlan(userPlan);
        const categories: DocumentImportQuotaCategory[] = [
            "invoices",
            "contracts",
            "documents",
            "manualDocuments",
            "emailDocuments",
        ];
        const [quotas, counters, reminderQuota] = await Promise.all([
            Promise.all(
                categories.map(async (category) => {
                    const quota = await getDocumentImportQuota(ctx.userId, userPlan, category);
                    return [category, {
                        category: quota.category,
                        scope: quota.scope,
                        limit: quota.limit,
                        used: quota.used,
                        remaining: quota.remaining,
                        periodStart: quota.periodStart?.toISOString() ?? null,
                        periodEnd: quota.periodEnd?.toISOString() ?? null,
                    }] as const;
                }),
            ).then((entries) => Object.fromEntries(entries)),
            getImportUsageCounters(ctx.userId),
            getReminderQuota(ctx.userId, userPlan),
        ]) as [
            Record<DocumentImportQuotaCategory, {
                category: DocumentImportQuotaCategory;
                scope: string;
                limit: number | null;
                used: number;
                remaining: number | null;
                periodStart: string | null;
                periodEnd: string | null;
            }>,
            Awaited<ReturnType<typeof getImportUsageCounters>>,
            Awaited<ReturnType<typeof getReminderQuota>>,
        ];

        res.json({
            plan: normalizedPlan,
            quotas: {
                ...quotas,
                reminders: {
                    category: "reminders" as const,
                    scope: reminderQuota.scope,
                    limit: reminderQuota.limit,
                    used: reminderQuota.used,
                    remaining: reminderQuota.remaining,
                    periodStart: null,
                    periodEnd: null,
                },
            },
            counters,
        });
    });

  // ── User ──────────────────────────────────────────────────────────────────
  // The user IS the engineer/company — one document, one route. GET /api/auth/me
  // already returns it, so this is the write half.
  //
  // Only keys actually present in the body are written, so a caller editing one
  // part of the profile can't blank the fields it didn't send.
  const EDITABLE_USER_FIELDS = [
    "name", "phone", "address", "city",
    "inspector_number", "inspector_id_start", "title", "expertise",
    "membership_start_date",
    "company_name", "company_registration", "company_subtitle",
    "company_phone", "company_email", "company_logo_url",
    "signature_url",
  ] as const;

  app.put("/api/user", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const body = req.body as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_USER_FIELDS) {
      if (!(field in body)) continue;
      const value = body[field];
      patch[field] = typeof value === "string" ? value.trim() || null : value ?? null;
    }
    // Some inspectors hold a separate ministry certificate per inspection type
    // (e.g. a different number for air-receiver vs lifting-machine reports)
    // rather than one number covering every type — resolveInspectorNumber in
    // reminders.ts falls back to inspector_number when a type has no override.
    if ("inspector_numbers_by_type" in body) {
      patch.inspector_numbers_by_type = sanitizeInspectorNumbersByType(body.inspector_numbers_by_type);
    }
    if (!Object.keys(patch).length) { res.status(400).json({ error: "nothing to update" }); return; }
    patch.updated_at = new Date().toISOString();

    await col("users").updateOne({ _id: new ObjectId(ctx.userId) as any }, { $set: patch });
    let updated = await col("users").findOne({ _id: new ObjectId(ctx.userId) as any }) as any;
    // Completing the core identity fields is the onboarding completion event.
    // Keep it in this write flow so a separate request cannot trap the user in
    // the onboarding modal after their details were already saved.
    if (updated?.name?.trim() && updated?.phone?.trim() && updated?.company_name?.trim() && !updated.onboarding_completed) {
      await col("users").updateOne({ _id: new ObjectId(ctx.userId) as any }, { $set: {onboarding_completed: true} });
      updated = {...updated, onboarding_completed: true};
    }
    res.json(serializeUser(updated) ?? {});
  });

  // ── Company logo upload ────────────────────────────────────────────────────
  app.post("/api/profile/company-logo", avatarUpload.single("logo"), async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    if (!req.file) { res.status(400).json({ error: "no_file" }); return; }

    const {
      publicBucketEnabled,
      uploadBufferToPublicSpaces,
      spacesEnabled,
      uploadBufferToSpaces,
    } = await import("../storage/spaces.js");

    let logoUrl: string;
    const ext = extname(req.file.originalname).toLowerCase() || ".png";
    const key = `images/${ctx.userId}/logo_${Date.now()}${ext}`;

    if (publicBucketEnabled()) {
      logoUrl = await uploadBufferToPublicSpaces(req.file.buffer, key, req.file.mimetype);
    } else if (spacesEnabled()) {
      logoUrl = await uploadBufferToSpaces(req.file.buffer, key, req.file.mimetype);
    } else {
      res.status(500).json({ error: "object_storage_not_configured" });
      return;
    }

    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      { $set: { company_logo_url: logoUrl, company_logo_storage_key: key, updated_at: new Date().toISOString() } },
    );
    res.json({ company_logo_url: logoUrl });
  });

  // ── Signature upload ───────────────────────────────────────────────────────
  // The inspector signature stamped onto generated inspection documents. Kept on
  // the user rather than per print template: a user has one signature, and the
  // renderer falls back to it when a template's signature section carries no
  // imageSrc of its own, so the layout editor can still override it per template.
  app.post("/api/profile/signature", avatarUpload.single("signature"), async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    if (!req.file) { res.status(400).json({ error: "no_file" }); return; }
    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "only_images_allowed" });
      return;
    }

    const {
      publicBucketEnabled,
      uploadBufferToPublicSpaces,
      spacesEnabled,
      uploadBufferToSpaces,
    } = await import("../storage/spaces.js");

    let signatureUrl: string;
    const ext = extname(req.file.originalname).toLowerCase() || ".png";
    const key = `images/${ctx.userId}/signature_${Date.now()}${ext}`;

    if (publicBucketEnabled()) {
      signatureUrl = await uploadBufferToPublicSpaces(req.file.buffer, key, req.file.mimetype);
    } else if (spacesEnabled()) {
      signatureUrl = await uploadBufferToSpaces(req.file.buffer, key, req.file.mimetype);
    } else {
      res.status(500).json({ error: "object_storage_not_configured" });
      return;
    }

    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      { $set: { signature_url: signatureUrl, signature_storage_key: key, updated_at: new Date().toISOString() } },
    );
    res.json({ signature_url: signatureUrl });
  });

  // Remove the stored signature. The object is left in place — templates that
  // pinned this URL as their own imageSrc keep rendering.
  app.delete("/api/profile/signature", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      { $set: { signature_url: null, signature_storage_key: null, updated_at: new Date().toISOString() } },
    );
    res.json({ signature_url: null });
  });

  // ── Avatar upload ─────────────────────────────────────────────────────────
  app.post("/api/profile/avatar", avatarUpload.single("avatar"), async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    if (!req.file) { res.status(400).json({ error: "no_file" }); return; }

    const {
      publicBucketEnabled,
      uploadBufferToPublicSpaces,
      spacesEnabled,
      uploadBufferToSpaces,
    } = await import("../storage/spaces.js");

    const ext = avatarExtension(req.file.originalname, req.file.mimetype);
    const key = `users/${ctx.userId}/avatar/avatar_${Date.now()}${ext}`;
    let pictureUrl: string;

    if (publicBucketEnabled()) {
      pictureUrl = await uploadBufferToPublicSpaces(req.file.buffer, key, req.file.mimetype);
    } else if (spacesEnabled()) {
      pictureUrl = await uploadBufferToSpaces(req.file.buffer, key, req.file.mimetype);
    } else {
      res.status(500).json({ error: "object_storage_not_configured" });
      return;
    }

    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      {
        $set: {
          picture_url: pictureUrl,
          picture_storage_key: key,
          updated_at: new Date().toISOString(),
        },
      },
    );
    res.json({ picture_url: pictureUrl });
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

  // ── Certificate upload — dedicated profile pipeline ─────────────────────────
  // Uploads a file, runs OCR/text extraction, then a specialized certificate
  // extractor that fills the engineer_profiles record (only-empty fields) and
  // creates a certificate row. The document is tagged document_kind="certificate"
  // so it stays out of the main documents list.
  app.post("/api/profile/certificate-upload", certUpload.array("files"), async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const files = req.files as Express.Multer.File[];
    if (!files || !files.length) {
      res.status(400).json({ error: "no_files" });
      return;
    }

    const uploadDir = join(getDataDir(), "uploads");
    mkdirSync(uploadDir, { recursive: true });

    const created: Array<{ documentId: string; certificateId: string | null; result: any }> = [];
    const updatedProfileFields = new Set<string>();

    for (const file of files) {
      const ext = (extname(file.originalname) || "").toLowerCase();
      const destPath = join(uploadDir, `${Date.now()}_cert${ext}`);
      writeFileSync(destPath, file.buffer);

      // Decode UTF-8 filename
      let displayName = file.originalname;
      try {
        const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
        if (!decoded.includes("�")) displayName = decoded;
      } catch { /* keep original */ }

      // 1. Create the document record tagged as a certificate
      const docInsert = await col("documents").insertOne({
        user_id: ctx.userId,
        file_name: displayName,
        file_path: destPath,
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        document_kind: "certificate",
        processing_status: "processing",
        import_date: new Date().toISOString().slice(0, 10),
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      const documentId = docInsert.insertedId.toString();

      // 2. Extract raw text
      let rawText = "";
      try {
        if (file.mimetype === "application/pdf") {
          const r = await parsePdf(destPath);
          rawText = r.needsOcr ? await ocrFile(destPath) : r.text;
          rawText = enrichTextWithPlumberTables(destPath, rawText);
        } else if (file.mimetype.startsWith("image/")) {
          rawText = await ocrFile(destPath);
        } else if (ext === ".docx") {
          rawText = await parseDocx(destPath);
        } else if (ext === ".xlsx") {
          rawText = parseXlsx(destPath);
        } else {
          rawText = readFileSync(destPath, "utf-8");
        }
      } catch (err) {
        await col("documents").updateOne(
          { _id: docInsert.insertedId } as any,
          { $set: { processing_status: "error", error_message: `Text extraction failed: ${err}`, updated_at: new Date() } }
        );
        created.push({ documentId, certificateId: null, result: { error: String(err) } });
        continue;
      }

      await col("documents").updateOne(
        { _id: docInsert.insertedId } as any,
        { $set: { raw_text: rawText, updated_at: new Date() } }
      );

      // 3. Run the certificate-specific AI extractor
      const run = await extractCertificate(rawText, documentId, displayName);
      const result = run.result;

      // 4. Persist extracted_fields snapshot on the document
      await col("documents").updateOne(
        { _id: docInsert.insertedId } as any,
        {
          $set: {
            extracted_fields: result ? JSON.stringify(result) : null,
            processing_status: run.error ? "error" : "done",
            error_message: run.error ?? null,
            updated_at: new Date(),
          },
        }
      );

      // 5. Create the certificate row
      let certificateId: string | null = null;
      if (result) {
        const status =
          result.expiry_date && result.expiry_date < new Date().toISOString().slice(0, 10)
            ? "expired"
            : "active";
        const certInsert = await col("certificates").insertOne({
          user_id: ctx.userId,
          document_id: documentId,
          name: result.certificate_name ?? displayName,
          type: result.certificate_type ?? "",
          issuer: result.issuer ?? "",
          issued_date: result.issued_date ?? null,
          expiry_date: result.expiry_date ?? null,
          status,
          created_at: new Date().toISOString(),
        } as any);
        certificateId = certInsert.insertedId.toString();

        // 6. Fill the user's engineer/company fields — only-empty (don't overwrite existing data)
        const userRow = (await col("users").findOne({ _id: new ObjectId(ctx.userId) as any })) as any;
        const userPatch: Record<string, unknown> = {};
        const profileFields: Array<keyof typeof result & string> = [
          "inspector_number", "title", "expertise",
          "membership_start_date",
          "company_name", "company_phone", "company_email",
        ];
        for (const k of profileFields) {
          const newVal = result[k];
          if (newVal != null && newVal !== "" && (!userRow || userRow[k] == null || userRow[k] === "")) {
            userPatch[k] = newVal;
            updatedProfileFields.add(k);
          }
        }
        if (result.full_name && !userRow?.name) userPatch.name = result.full_name;
        if (result.phone && !userRow?.phone) userPatch.phone = result.phone;
        if ((result as any).address && !userRow?.address) {
          userPatch.address = (result as any).address;
          updatedProfileFields.add("address");
        }
        if (Object.keys(userPatch).length) {
          userPatch.updated_at = new Date().toISOString();
          await col("users").updateOne(
            { _id: new ObjectId(ctx.userId) as any },
            { $set: userPatch }
          );
        }
      }

      created.push({ documentId, certificateId, result });
    }

    res.json({
      uploaded: created.length,
      created,
      profile_fields_updated: Array.from(updatedProfileFields),
    });
  });

  app.delete("/api/profile/certificates/:id", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    await col("certificates").deleteOne({ _id: new ObjectId(req.params.id) as any, user_id: ctx.userId });
    res.json({ ok: true });
  });

  // ── Spending alerts ───────────────────────────────────────────────────────
  app.get("/api/user/spending-alerts", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const user = await col("users").findOne({ _id: new ObjectId(ctx.userId) as any }) as any;
    res.json({ alerts: Array.isArray(user?.spending_alerts) ? user.spending_alerts : [] });
  });

  app.put("/api/user/spending-alerts", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    const raw = req.body?.alerts;
    if (!Array.isArray(raw)) { res.status(400).json({ error: "alerts must be array" }); return; }
    const alerts = raw
      .filter((a: any) => typeof a?.category === "string" && a.category.trim() && typeof a?.threshold === "number" && a.threshold > 0)
      .map((a: any) => ({
        category: String(a.category).trim(),
        threshold: Number(a.threshold),
        currency: typeof a.currency === "string" && a.currency.trim() ? String(a.currency).trim().toUpperCase() : "ILS",
      }));
    await col("users").updateOne(
      { _id: new ObjectId(ctx.userId) as any },
      { $set: { spending_alerts: alerts, updated_at: new Date().toISOString() } },
    );
    res.json({ alerts });
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

  app.post("/api/profile/onboarding-complete", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;
    // Only marks complete when the core fields are actually filled — a
    // skip/dismiss must not silence the "finish setup" reminder for someone
    // who never entered their details.
    // ctx.userId, not realUserId — every other route here writes the acted-as
    // document, so reading the admin's own row would check the wrong profile.
    const user = await col("users").findOne({ _id: new ObjectId(ctx.userId) as any }) as any;
    const complete = Boolean(user?.name?.trim() && user?.phone?.trim() && user?.company_name?.trim());
    if (complete) {
      await col("users").updateOne(
        { _id: new ObjectId(ctx.userId) as any },
        { $set: { onboarding_completed: true } },
      );
    }
    res.json({ ok: true, onboarding_completed: complete });
  });

  // ── Close account & delete all user data (irreversible) ───────────────────
  app.post("/api/profile/account/delete", async (req, res) => {
    const ctx = await auth(req, res);
    if (!ctx) return;

    if (ctx.actingAs) {
      res.status(403).json({ error: "cannot_delete_while_impersonating" });
      return;
    }

    const body = (req.body ?? {}) as { confirm?: string; email?: string };
    const {ACCOUNT_DELETE_CONFIRM_PHRASE, deleteAccountData} = await import("../account/deleteAccountData.js");
    if (String(body.confirm ?? "").trim() !== ACCOUNT_DELETE_CONFIRM_PHRASE) {
      res.status(400).json({ error: "confirm_required", expected: ACCOUNT_DELETE_CONFIRM_PHRASE });
      return;
    }

    const accountEmail = String((ctx.user as any).email ?? "").trim().toLowerCase();
    if (accountEmail) {
      const provided = String(body.email ?? "").trim().toLowerCase();
      if (provided !== accountEmail) {
        res.status(400).json({ error: "email_mismatch" });
        return;
      }
    }

    try {
      const result = await deleteAccountData(ctx.realUserId);
      const {clearSessionCookie} = await import("../auth/session.js");
      res.setHeader("Set-Cookie", clearSessionCookie());
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "delete_failed";
      if (message === "user_not_found") {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: "delete_failed" });
    }
  });
}

export function avatarExtension(originalName: string | undefined, mimetype: string | undefined): string {
  const ext = extname(originalName ?? "").toLowerCase();
  if (ext && [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) return ext;
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/gif") return ".gif";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/svg+xml") return ".svg";
  return ".jpg";
}
