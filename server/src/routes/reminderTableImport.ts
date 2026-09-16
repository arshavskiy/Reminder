import express from "express";
import multer from "multer";
import {ObjectId} from "mongodb";
import {requireAuth, HTTPException} from "../auth/middleware";
import {col} from "../db/db";
import {parseReminderTable, importHash} from "../imports/reminderTable";
import {reminderItemFields, reminderItemSignature} from "../imports/reminderItem";
import {assertReminderQuota, ReminderQuotaError, reminderQuotaErrorPayload} from "../quotas/reminderQuota";
import {incrementReminderUsage} from "../quotas/userUsageCounters";
import {pickEmailTemplate} from "../templates/seedEmailTemplates";
import {logger} from "../logger";

const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 5 * 1024 * 1024, files: 1, fields: 2}}).single("file");
const idFor = (user: string, kind: string, key: string) => new ObjectId(importHash(JSON.stringify([user, kind, key])).slice(0, 24));

export function registerReminderTableImportRoutes(app: express.Application) {
  app.post("/api/reminders/table-import/:action", async (req, res) => {
    let created = 0;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      if (!["preview", "confirm"].includes(req.params.action)) throw new HTTPException(404, "Unknown import action");
      await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
      if (!req.file) throw new HTTPException(400, "Select a CSV or Excel file / יש לבחור קובץ");
      const preview = parseReminderTable(req.file.buffer, req.file.originalname);
      const userId = ctx.userId;
      const effectiveUser = ctx.actingAs ?? ctx.user;
      let remaining = 0;
      for (const row of preview.rows) {
        const itemId = idFor(userId, "table-item", row.key);
        const previous = await col<{table_import_signature?: string}>("reminder_items").findOne({_id: itemId, user_id: userId} as any);
        const signature = reminderItemSignature(row);
        if (previous && previous.table_import_signature !== signature) preview.errors.push(`${row.sheet}, row ${row.row}: This ID was already imported with different values / מזהה קיים עם נתונים שונים`);
        for (const days of row.offsets) {
          if (!await col("reminders").findOne({_id: idFor(userId, "table-reminder", `${row.key}:${days}`), user_id: userId} as any)) remaining++;
        }
      }
      if (req.params.action === "preview") { res.json({...preview, newReminderCount: remaining}); return; }
      if (preview.errors.length) { res.status(400).json({...preview, error: "Fix the table errors before importing / יש לתקן את השגיאות"}); return; }
      // Confirm always reparses the original upload; no client-supplied preview rows are trusted.
      await assertReminderQuota(userId, effectiveUser.plan ?? effectiveUser.role, remaining);
      const settings = await col<{user_id: string; default_email_template_id?: string}>("user_settings").findOne({user_id: userId});
      const templateCache = new Map<string, string | null>();
      async function templateForCategory(category: string | null): Promise<string | null> {
        const key = category ?? "";
        if (templateCache.has(key)) return templateCache.get(key)!;
        const categoryBound = category
          ? await col("email_templates").findOne({reminder_category: category} as any, {sort: {is_default: -1, _id: 1}} as any)
          : null;
        let id: string | null;
        if (categoryBound) {
          id = String((categoryBound as any)._id);
        } else if (settings?.default_email_template_id) {
          id = settings.default_email_template_id;
        } else {
          const fallback = await pickEmailTemplate(null);
          id = fallback?.id != null ? String(fallback.id) : null;
        }
        templateCache.set(key, id);
        return id;
      }
      const now = new Date();
      for (const row of preview.rows) {
        const f = row.fields;
        let clientId: ObjectId | null = null;
        if (f.clientName) {
          clientId = idFor(userId, "table-client", f.clientId || f.email?.toLowerCase() || f.clientName);
          await col("clients").updateOne({_id: clientId, user_id: userId} as any, {$setOnInsert: {
            user_id: userId, display_name: f.clientName, entity_type: f.clientType || "company",
            contact_person: f.contact || null, email: f.email || null, phone: f.phone || null,
            address: f.address || null, city: f.city || null, notes: null, tags: "[]",
            table_import_key: f.clientId || null, created_at: now, updated_at: now,
          }}, {upsert: true});
        }
        const itemId = idFor(userId, "table-item", row.key);
        await col("reminder_items").updateOne({_id: itemId, user_id: userId} as any, {$setOnInsert: {
          ...reminderItemFields(row),
          user_id: userId, client_id: clientId?.toHexString() ?? null,
          table_import_key: row.key, table_import_signature: reminderItemSignature(row),
          created_at: now, updated_at: now,
        }}, {upsert: true});
        const template = await templateForCategory(f.category || null);
        for (let i = 0; i < row.offsets.length; i++) {
          const result = await col("reminders").updateOne({_id: idFor(userId, "table-reminder", `${row.key}:${row.offsets[i]}`), user_id: userId} as any, {$setOnInsert: {
            user_id: userId, source_type: "table_import", source_id: itemId.toHexString(),
            client_id: clientId?.toHexString() ?? null, document_id: null,
            // A spreadsheet cannot carry the file itself, so the Document column is a
            // reference only — the same filename-reference mode manual reminders have.
            document_reference: f.document || null,
            trigger_date: row.dates[i], advance_days: row.offsets[i], title: row.name,
            body: f.description || null, email_to: JSON.stringify(row.recipients), email_template_id: template,
            status: "pending", snoozed_until: null, client_company: f.clientName || null,
            client_name: f.clientName || null, contact_person: f.contact || null,
            client_email: f.email || null, client_phone: f.phone || null,
            reminder_category: f.category || null, expiry_date: row.expiry, start_date: row.start,
            reference_number: f.documentNumber || null,
            import_metadata: f, created_at: now, updated_at: now,
          }}, {upsert: true});
          if (result.upsertedCount) { created++; await incrementReminderUsage(userId, 1); }
        }
      }
      res.json({items: preview.rows.length, createdReminders: created, skippedReminders: preview.reminderCount - created});
    } catch (error) {
      if (error instanceof ReminderQuotaError) { res.status(403).json(reminderQuotaErrorPayload(error)); return; }
      const status = error instanceof HTTPException ? error.status : error instanceof multer.MulterError ? 400 : 400;
      logger.warn("table_import_failed", {created_reminders: created, error: String(error)});
      res.status(status).json({error: (error as Error).message, createdReminders: created, retrySafe: true});
    }
  });
}
