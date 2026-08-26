import express from "express";
import multer from "multer";
import {ObjectId} from "mongodb";
import {extname, join} from "path";
import {mkdirSync, readFileSync, writeFileSync} from "fs";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";
import {getDataDir} from "../settings";
import {parsePdf} from "../pipeline/pdfParser";
import {parseDocx} from "../pipeline/docxParser";
import {parseXlsx} from "../pipeline/xlsxParser";
import {ocrFile} from "../pipeline/ocrParser";
import {extractCertificate} from "../pipeline/certificateExtractor";
import {getDocumentImportQuota, type DocumentImportQuotaCategory} from "../quotas/documentImportQuota";
import {getImportUsageCounters} from "../quotas/importUsageCounters";
import {getReminderQuota} from "../quotas/reminderQuota";

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

function normalizeSubscriptionPlan(plan: string | null | undefined): "free" | "basic" | "business" {
    const value = String(plan ?? "").trim().toLowerCase();
    if (value === "admin" || value === "business") return "business";
    if (value === "pro" || value === "basic") return "basic";
    return "free";
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

        const userPlan = ctx.user.plan ?? ctx.user.role ?? "user";
        const normalizedPlan = normalizeSubscriptionPlan(userPlan);
        const categories: DocumentImportQuotaCategory[] = ["invoices", "contracts", "documents"];
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
      inspector_number, address, city, title, expertise,
      mr_number, mg_number, membership_start_date,
      company_name, company_registration, company_subtitle, company_phone, company_email,
      company_logo_url, inspector_id_start,
    } = req.body as Record<string, string | null>;

    await col("engineer_profiles").updateOne(
      { user_id: ctx.userId },
      {
        $set: {
          user_id: ctx.userId,
          inspector_number: inspector_number ?? null,
          address: address ?? null,
          city: city ?? null,
          title: title ?? null,
          expertise: expertise ?? null,
          mr_number: mr_number ?? null,
          mg_number: mg_number ?? null,
          membership_start_date: membership_start_date ?? null,
          company_name: company_name ?? null,
          company_registration: company_registration ?? null,
          company_subtitle: company_subtitle ?? null,
          company_logo_url: company_logo_url ?? null,
          company_phone: company_phone ?? null,
          company_email: company_email ?? null,
          inspector_id_start: inspector_id_start ?? null,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );

    const updated = await col("engineer_profiles").findOne({ user_id: ctx.userId });
    res.json(updated ?? {});
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

    await col("engineer_profiles").updateOne(
      { user_id: ctx.userId },
      { $set: { company_logo_url: logoUrl, updated_at: new Date().toISOString() } },
      { upsert: true },
    );
    res.json({ company_logo_url: logoUrl });
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
          res.status(500).json({error: "object_storage_not_configured"});
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
      res.json({picture_url: pictureUrl});
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

        // 6. Fill engineer_profiles — only-empty (don't overwrite user data)
        const profile = (await col("engineer_profiles").findOne({ user_id: ctx.userId })) as any;
        const profilePatch: Record<string, unknown> = {};
        const profileFields: Array<keyof typeof result & string> = [
          "inspector_number", "title", "expertise",
          "mr_number", "mg_number", "membership_start_date",
          "company_name", "company_phone", "company_email", "address",
        ];
        for (const k of profileFields) {
          const newVal = result[k];
          if (newVal != null && newVal !== "" && (!profile || profile[k] == null || profile[k] === "")) {
            profilePatch[k] = newVal;
            updatedProfileFields.add(k);
          }
        }
        if (Object.keys(profilePatch).length) {
          profilePatch.updated_at = new Date().toISOString();
          await col("engineer_profiles").updateOne(
            { user_id: ctx.userId },
            { $set: { user_id: ctx.userId, ...profilePatch } },
            { upsert: true }
          );
        }

        // 7. Fill users (personal) — only-empty
        const userRow = (await col("users").findOne({ _id: new ObjectId(ctx.userId) as any })) as any;
        const userPatch: Record<string, unknown> = {};
        if (result.full_name && !userRow?.name) userPatch.name = result.full_name;
        if (result.phone && !userRow?.phone) userPatch.phone = result.phone;
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
    await col("users").updateOne(
      { _id: new ObjectId(ctx.realUserId) },
      { $set: { onboarding_completed: true } },
    );
    res.json({ ok: true });
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
