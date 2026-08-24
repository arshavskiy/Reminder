import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync} from "fs";
import {createHash} from "crypto";
import {basename, extname, join} from "path";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getDataDir, getSettings} from "../settings";
import {parsePdf} from "./pdfParser";
import {ocrFile} from "./ocrParser";
import {parseDocx} from "./docxParser";
import {parseXlsx} from "./xlsxParser";
import {extractDocument, extractWithTemplate} from "./extractor";
import {extractCertificate} from "./certificateExtractor";
import {extractFromOcr} from "./ocrExtractor";
import {classifyDocumentKind, documentTypeFromTemplate, getOrBuildSystemPrompt, loadTemplate, pickTemplate} from "../templates/seedTemplates";
import {generateContractReminders, generateTaskReminders} from "../reminders/scheduler";
import {deleteFromSpaces, getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces";
import {syncDocumentToDrive} from "../storage/gdrive";
import type {DocTemplate, DynamicExtraction} from "../../src/shared/types.js";
import {logger} from "../logger";
import {notifyDocumentUploaded, notifyExtractionFailed} from "../push/adminNotify";
import {generatePdfThumbnailForDocument} from "../documents/pdfThumbnail";
import {incrementDocumentUsage, type DocumentUsageKind} from "../quotas/userUsageCounters";

type PushFn = (event: Record<string, unknown>) => void;

export interface PipelineOptions {
  skipAi?: boolean;        // skip all AI extraction
  skipEntities?: boolean;  // skip client/contract/equipment creation
  skipReminders?: boolean; // skip reminder generation
  startDelayMs?: number;   // optional batch pacing before background processing starts
  templateId?: string;     // force a specific doc_template instead of auto-detection
  storageKeyPrefix?: string; // optional S3 prefix for source-specific organization
  gmailImport?: boolean;   // true when imported via Gmail — enables post-OCR inspection validation
  usageKind?: DocumentUsageKind; // lifetime usage counter bucket (survives deletes)
}

function parseJsonObject(raw: unknown, fallback: unknown = null): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Provider output can be malformed; keep audit rows queryable as an object.
    }
  }
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) return fallback as Record<string, unknown>;
  return {};
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

function computeHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseIsoDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatIsoDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  result.setHours(0, 0, 0, 0);
  return result;
}

function inspectionIntervalMonths(startValue: string | null | undefined, nextValue: string | null | undefined): number | null {
  if (!startValue || !nextValue) return null;
  const start = parseIsoDateOnly(startValue);
  const next = parseIsoDateOnly(nextValue);
  if (!start || !next || next.getTime() <= start.getTime()) return null;
  const months = (next.getFullYear() - start.getFullYear()) * 12 + next.getMonth() - start.getMonth();
  return Number.isFinite(months) && months > 0 ? months : null;
}

export function forwardPastNextActionDate(value: string | null | undefined, today = new Date(), cycleStartValue?: string | null): string | null {
  if (!value) return null;
  const parsed = parseIsoDateOnly(value);
  if (!parsed) return value;

  const todayOnly = new Date(today);
  todayOnly.setHours(0, 0, 0, 0);

  const forwarded = new Date(parsed);
  const intervalMonths = inspectionIntervalMonths(cycleStartValue, value);
  while (forwarded < todayOnly) {
    if (intervalMonths) {
      const next = addMonths(forwarded, intervalMonths);
      if (next.getTime() <= forwarded.getTime()) break;
      forwarded.setTime(next.getTime());
    } else {
      forwarded.setFullYear(forwarded.getFullYear() + 1);
    }
  }
  return formatIsoDateOnly(forwarded);
}

function normalizeNextActionDateFields(fields: Record<string, unknown>, expiryField?: string | null): void {
  const keys = new Set<string>(["expiry_date"]);
  if (expiryField && expiryField !== "expiry_date") keys.add(expiryField);
  const cycleStart = ["start_date", "inspection_date", "issue_date", "check_date"]
    .map((key) => fields[key])
    .find((value): value is string => typeof value === "string" && Boolean(parseIsoDateOnly(value)));
  const todayNorm = new Date(); todayNorm.setHours(0, 0, 0, 0);
  for (const key of keys) {
    if (typeof fields[key] === "string") {
      const intervalMonths = inspectionIntervalMonths(cycleStart, fields[key]);
      if (intervalMonths) {
        if (typeof fields.inspection_interval_months !== "number") {
          fields.inspection_interval_months = intervalMonths;
        }
        if (typeof fields.date_diff_months !== "number") {
          fields.date_diff_months = intervalMonths;
        }
      }
      // Keep original date when it's already in the past — overdue, not forwarded.
      const parsed = parseIsoDateOnly(String(fields[key]));
      if (parsed && parsed < todayNorm) continue;
      fields[key] = forwardPastNextActionDate(fields[key], new Date(), cycleStart);
    }
  }
}

export async function importFile(originalPath: string, push?: PushFn, userId?: string, displayName?: string, pipeline?: PipelineOptions): Promise<string> {
  const settings = getSettings();

  const ext = extname(originalPath);
  const fileName = displayName ?? basename(originalPath);
  const fileHash = computeHash(originalPath);
  const fileSize = statSync(originalPath).size;
  const mimeType = getMimeType(ext);

  // Dedup check — scoped to user if provided
  const dedupFilter: Record<string, any> = { file_hash: fileHash };
  if (userId) dedupFilter.user_id = userId;
  const existing = await col("documents").findOne(dedupFilter);
  if (existing) {
    logger.info("document_import_duplicate", {
      document_id: existing._id!.toString(),
      user_id: userId ?? null,
      file_name: fileName,
    });
    return existing._id!.toString();
  }

  // Copy to managed documents folder
  const docsDir = join(getDataDir(), "documents");
  mkdirSync(docsDir, { recursive: true });
  const managedPath = join(docsDir, `${fileHash}${ext}`);
  if (!existsSync(managedPath)) {
    copyFileSync(originalPath, managedPath);
  }

  // Upload to S3-compatible object storage if configured
  let spacesKey: string | null = null;
  let spacesUrl: string | null = null;
  let downloadUrl: string | null = null;
  const SIGNED_URL_TTL = 7 * 24 * 3600; // 7 days
  if (spacesEnabled()) {
    try {
      const prefix = normalizeStorageKeyPrefix(pipeline?.storageKeyPrefix);
      spacesKey = prefix
        ? `${prefix}/${userId ? `${userId}/` : ""}${fileHash}${ext}`
        : userId ? `documents/${userId}/${fileHash}${ext}` : `documents/${fileHash}${ext}`;
      spacesUrl = await uploadToSpaces(managedPath, spacesKey, mimeType);
      downloadUrl = await getSpacesSignedUrl(spacesKey, SIGNED_URL_TTL, fileName);
      logger.info("document_storage_uploaded", { user_id: userId ?? null, spaces_key: spacesKey });
    } catch (err) {
      logger.error("document_storage_upload_failed", { user_id: userId ?? null, file_name: fileName, error: err });
      spacesKey = null;
      spacesUrl = null;
      downloadUrl = null;
    }
  }

  const now = new Date();
  const signedUrlExpiresAt = downloadUrl ? new Date(Date.now() + SIGNED_URL_TTL * 1000) : null;
  const docRecord: Record<string, any> = {
    file_name: fileName,
    file_path: managedPath,
    original_path: originalPath,
    file_hash: fileHash,
    mime_type: mimeType,
    file_size_bytes: fileSize,
    import_date: now,
    processing_status: "queued",
    document_source: "scanned",
    created_at: now,
    updated_at: now,
    spaces_key: spacesKey,
    spaces_url: spacesUrl,
    download_url: downloadUrl,
    signed_url_expires_at: signedUrlExpiresAt,
  };
  if (userId) docRecord.user_id = userId;
  docRecord.ai_extracted = !pipeline?.skipAi;

  const insertResult = await col("documents").insertOne(docRecord);
  const documentId = insertResult.insertedId.toString();

  if (userId) {
    const kind: DocumentUsageKind = pipeline?.usageKind
      ?? (pipeline?.gmailImport ? "gmail_document" : "scanned");
    await incrementDocumentUsage(userId, kind, 1).catch((err) => {
      logger.warn("document_usage_increment_failed", { user_id: userId, document_id: documentId, error: String(err) });
    });
  }

  push?.({ type: "document:queued", documentId: documentId as any, fileName });
  logger.info("document_import_queued", {
    document_id: documentId,
    user_id: userId ?? null,
    file_name: fileName,
    mime_type: mimeType,
    file_size_bytes: fileSize,
    ai_enabled: !pipeline?.skipAi,
  });
  notifyDocumentUploaded({ fileName });

  const startProcessing = () => processDocument(documentId, managedPath, mimeType, ext, push, userId, pipeline).catch(async (err) => {
    logger.error("document_processing_failed", { document_id: documentId, user_id: userId ?? null, error: err });
    await col("documents").updateOne(
      { _id: insertResult.insertedId },
      { $set: { processing_status: "error", error_message: String(err), updated_at: new Date() } }
    );
    notifyExtractionFailed({ fileName, error: String(err) });
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: String(err) });
  });

  const startDelayMs = Number(pipeline?.startDelayMs ?? 0);
  if (Number.isFinite(startDelayMs) && startDelayMs > 0) {
    setTimeout(startProcessing, startDelayMs);
  } else {
    startProcessing();
  }

  return documentId;
}

function normalizeStorageKeyPrefix(value: string | null | undefined): string | null {
  const clean = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");
  return clean || null;
}

const INSPECTION_MARKERS = [
  /מספר\s*תסקיר/,
  /בתוקף\s*עד/,
  /ציוד\s*שנבדק/,
  /מספר\s*רישוי/,
  /כושר\s*עמיסה|עומס\s*עבודה\s*בטוח/,
  /תאריך\s*בדיקה/,
  /מכונת\s+הרמה|ציוד\s+הרמה/,
  /פקודת\s+הבטיחות/,
];
const MIN_INSPECTION_MARKERS = 2;

function looksLikeInspectionReport(text: string): boolean {
  let hits = 0;
  for (const re of INSPECTION_MARKERS) {
    if (re.test(text)) hits++;
    if (hits >= MIN_INSPECTION_MARKERS) return true;
  }
  return false;
}

function gmailTemplateSkipReason(
  pipeline: PipelineOptions | undefined,
  template: DocTemplate | null,
  rawText: string,
): "gmail_import_not_inspection_skipped" | null {
  if (!pipeline?.gmailImport || rawText.trim().length === 0) return null;
  if (template && isInspectionTemplate(template) && !looksLikeInspectionReport(rawText)) {
    return "gmail_import_not_inspection_skipped";
  }
  return null;
}

async function gmailInvoiceWasSaved(documentId: string): Promise<boolean> {
  const invoice = await col("invoices").findOne(
    { document_id: documentId } as any,
    { projection: { _id: 1 } } as any,
  );
  return Boolean(invoice);
}

async function deleteSkippedGmailDocument(
  documentId: string,
  docFilter: Record<string, any>,
  filePath: string,
): Promise<void> {
  const skippedDoc = await col("documents").findOne(docFilter) as any;
  if (skippedDoc?.spaces_key) {
    await deleteFromSpaces(skippedDoc.spaces_key).catch(() => {});
  }
  if (skippedDoc?.thumbnail_key) {
    await deleteFromSpaces(skippedDoc.thumbnail_key).catch(() => {});
  }
  try { unlinkSync(filePath); } catch {}
  await Promise.all([
    col("extractions").deleteMany({ document_id: documentId } as any),
    col("tasks").deleteMany({ document_id: documentId } as any),
    col("invoices").deleteMany({ document_id: documentId } as any),
    col("document_clients").deleteMany({ document_id: documentId } as any),
    col("timeline_events").deleteMany({ source_type: "document", source_id: documentId } as any),
    col("reminders").deleteMany({ document_id: documentId } as any),
    col("contracts").deleteMany({ document_id: documentId } as any),
    col("equipment").deleteMany({ document_id: documentId } as any),
    col("documents").deleteOne(docFilter),
  ]);
}

export async function processDocument(
  documentId: string,
  filePath: string,
  mimeType: string,
  ext: string,
  push?: PushFn,
  userId?: string,
  pipeline?: PipelineOptions
) {
  const settings = getSettings();
  const docFilter = { _id: new ObjectId(documentId) } as any;

  await col("documents").updateOne(docFilter, {
    $set: { processing_status: "processing", updated_at: new Date() },
  });
  push?.({ type: "document:progress", documentId: documentId as any, stage: "extracting_text", progress: 10 });

  let rawText = "";
  let pageCount: number | null = null;
  const forcedTemplate = pipeline?.templateId
    ? await loadTemplate(pipeline.templateId).catch(() => null)
    : null;

  try {
    if (mimeType === "application/pdf") {
      const pdfResult = await parsePdf(filePath);
      pageCount = pdfResult.pageCount;
      if (pdfResult.needsOcr) {
        push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 25 });
        rawText = await ocrFile(filePath);
      } else {
        rawText = pdfResult.text;
      }
    } else if (mimeType.startsWith("image/")) {
      push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 25 });
      rawText = await ocrFile(filePath);
    } else if (ext === ".docx") {
      rawText = await parseDocx(filePath);
    } else if (ext === ".xlsx") {
      rawText = parseXlsx(filePath);
    } else {
      rawText = readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    if (pipeline?.gmailImport && forcedTemplate && isInvoiceTemplate(forcedTemplate)) {
      logger.info("gmail_import_invoice_text_extraction_failed_skipped", {
        document_id: documentId,
        user_id: userId ?? null,
        template_id: forcedTemplate.id ?? pipeline.templateId ?? null,
        template_name: forcedTemplate.name,
        error: String(err),
      });
      await deleteSkippedGmailDocument(documentId, docFilter, filePath);
      push?.({
        type: "document:done",
        documentId: documentId as any,
        status: "skipped",
        reason: "gmail_import_invoice_text_extraction_failed_skipped",
      });
      return;
    }
    const msg = `Text extraction failed: ${err}`;
    await col("documents").updateOne(docFilter, {
      $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
    });
    const failedDoc = await col("documents").findOne(docFilter, { projection: { file_name: 1 } } as any) as any;
    notifyExtractionFailed({ fileName: failedDoc?.file_name ?? documentId, error: msg });
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
    return;
  }

  await col("documents").updateOne(docFilter, {
    $set: { raw_text: rawText, page_count: pageCount, processing_status: "processing", updated_at: new Date() },
  });

  const gmailSkipReason = gmailTemplateSkipReason(pipeline, forcedTemplate, rawText);
  if (gmailSkipReason) {
    logger.info(gmailSkipReason, {
      document_id: documentId,
      user_id: userId ?? null,
      template_id: forcedTemplate?.id ?? pipeline?.templateId ?? null,
      template_name: forcedTemplate?.name ?? null,
    });
    await deleteSkippedGmailDocument(documentId, docFilter, filePath);
    push?.({ type: "document:done", documentId: documentId as any, status: "skipped", reason: gmailSkipReason });
    return;
  }

  push?.({ type: "document:progress", documentId: documentId as any, stage: "ai_extraction", progress: 50 });

  const aiWillRun = settings.autoExtract && rawText.trim().length > 0 && !pipeline?.skipAi;
  const docRowForKnownInvoice = await col("documents").findOne(docFilter) as any;
  const knownInvoiceFields = extractKnownInvoiceFields(rawText, docRowForKnownInvoice?.file_name);
  if (knownInvoiceFields) {
    logger.info("known_invoice_extracted", {
      document_id: documentId,
      user_id: userId ?? null,
      supplier_name: knownInvoiceFields.supplier_name ?? null,
      document_subtype: knownInvoiceFields.document_subtype ?? null,
    });
    await col("extractions").insertOne({
      document_id: documentId,
      backend: "deterministic",
      model: "known-invoice-parser",
      result_json: knownInvoiceFields,
      raw_text: rawText,
      parsed_ok: 1,
      error: null,
      exec_ms: 0,
      created_at: new Date(),
    } as any);
    await col("documents").updateOne(docFilter, {
      $set: {
        extracted_fields: JSON.stringify(knownInvoiceFields),
        document_type: "invoice",
        document_kind: "invoice",
        updated_at: new Date(),
      },
    });
    if (!pipeline?.skipEntities) {
      push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
      const invoiceSaved = await saveInvoiceRecord(documentId, knownInvoiceFields, {
        userId,
        clientId: null,
        documentType: "חשבונית",
        templateId: pipeline?.templateId,
        templateName: "חשבונית",
        rawText,
      });
      await deleteContractReminderArtifacts(documentId, userId);
      if (pipeline?.gmailImport && !invoiceSaved) {
        logger.info("gmail_import_non_invoice_skipped", {
          document_id: documentId,
          user_id: userId ?? null,
          template_id: forcedTemplate?.id ?? pipeline?.templateId ?? null,
          template_name: forcedTemplate?.name ?? "חשבונית",
        });
        await deleteSkippedGmailDocument(documentId, docFilter, filePath);
        push?.({ type: "document:done", documentId: documentId as any, status: "skipped", reason: "gmail_import_non_invoice_skipped" });
        return;
      }
    }
    await finishDocumentProcessing(documentId, filePath, mimeType, push, userId);
    return;
  }

  // ── Stage A: OCR regex baseline — always runs when there is text ────────────
  // Runs regardless of AI setting. Persists a diagnostic extraction row and a
  // temporary extracted_fields snapshot. Entity creation is only allowed when
  // AI/template extraction will not run, because regex contact fields are weak
  // and can otherwise leave a bad client linked to the document.
  if (rawText.trim().length > 0) {
    const ocr = extractFromOcr(rawText);
    normalizeNextActionDateFields(ocr as unknown as Record<string, unknown>);
    const documentKind = classifyDocumentKind(rawText);
    logger.debug("document_ocr_extracted", {
      document_id: documentId,
      user_id: userId ?? null,
      document_kind: documentKind,
      field_count: Object.keys(ocr).length,
    });

    // Always persist kind + raw OCR fields on the document
    await col("documents").updateOne(docFilter, {
      $set: {
        document_kind: documentKind,
        document_type: ocr.document_type,
        extracted_fields: JSON.stringify(ocr),
        updated_at: new Date(),
      },
    });

    // Always write an extractions row for the OCR pass
    await col("extractions").insertOne({
      document_id: documentId,
      backend: "ocr-regex",
      model: "regex",
      result_json: ocr,
      raw_text: rawText,
      parsed_ok: ocr.expiry_date || ocr.contact_name || ocr.contact_phone ? 1 : 0,
      error: null,
      exec_ms: 0,
      created_at: new Date(),
    } as any);

    // Create client / contract / reminders from OCR data only as a fallback.
    if (!aiWillRun && !pipeline?.skipEntities && (ocr.expiry_date || ocr.contact_name || ocr.contact_phone)) {
      let clientId: string | null = null;
      if (ocr.contact_name || ocr.contact_phone || ocr.contact_email) {
        clientId = await findOrCreateClient({
          displayName: ocr.contact_name ?? ocr.contact_phone ?? "לא ידוע",
          entityType: "person",
          contactPerson: ocr.contact_name,
          email: ocr.contact_email,
          phone: ocr.contact_phone,
          userId,
        });
        await col("document_clients").updateOne(
          { document_id: documentId, client_id: clientId },
          { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
          { upsert: true }
        );
      }

      if (ocr.expiry_date) {
        const upsertResult = await col("contracts").findOneAndUpdate(
          { document_id: documentId },
          {
            $set: {
              ...(userId && { user_id: userId }),
              client_id: clientId,
              contract_type: ocr.document_type,
              start_date: null,
              expiry_date: ocr.expiry_date,
              confidence: "low",
              updated_at: new Date(),
            },
            $setOnInsert: { document_id: documentId, status: "active", created_at: new Date() },
          },
          { upsert: true, returnDocument: "after" }
        );
        const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
        if (!pipeline?.skipReminders) {
          await generateContractReminders(contractId, clientId, documentId, ocr.expiry_date, userId, ocr.contact_email ?? null);
        }
      }

      logger.info("document_ocr_entities_saved", {
        document_id: documentId,
        user_id: userId ?? null,
        has_expiry_date: Boolean(ocr.expiry_date),
        has_contact: Boolean(ocr.contact_name || ocr.contact_phone),
        reminders_queued: Boolean(ocr.expiry_date && !pipeline?.skipReminders),
      });
    } else if (aiWillRun && !pipeline?.skipEntities && (ocr.expiry_date || ocr.contact_name || ocr.contact_phone)) {
      logger.info("document_ocr_entities_skipped", {
        document_id: documentId,
        user_id: userId ?? null,
        reason: "ai_extraction_enabled",
        has_expiry_date: Boolean(ocr.expiry_date),
        has_contact: Boolean(ocr.contact_name || ocr.contact_phone),
      });
    }
  }

  // ── Stage B: AI extraction — enriches OCR baseline when enabled ─────────────
  if (aiWillRun) {
    const docRow = await col("documents").findOne(docFilter) as any;

    // ── Stage 1: classify document kind by keyword scoring ───────────────────
    const documentKind = classifyDocumentKind(rawText);
    logger.info("document_classified", {
      document_id: documentId,
      user_id: userId ?? null,
      file_name: docRow?.file_name ?? null,
      document_kind: documentKind,
      text_chars: rawText.length,
    });

    // Persist the kind immediately so filters (e.g. hide certificates) work
    // even before extraction completes.
    await col("documents").updateOne(docFilter, {
      $set: { document_kind: documentKind, updated_at: new Date() },
    });

    // ── Stage 2: dispatch to the right extractor ─────────────────────────────

    if (documentKind === "certificate") {
      logger.info("document_extractor_selected", {
        document_id: documentId,
        user_id: userId ?? null,
        extractor: "certificate",
      });
      // Certificate extraction is a separate schema — handled by certificateExtractor.
      // The document stays accessible via the profile page; it is hidden from the
      // main documents list by the existing { document_kind: { $ne: "certificate" } } filter.
      const certRun = await extractCertificate(rawText, documentId, docRow?.file_name);
      await col("extractions").insertOne({
        document_id: documentId,
        backend: certRun.backend,
        model: certRun.model,
        result_json: parseJsonObject(certRun.rawJson, certRun.result),
        raw_text: rawText,
        parsed_ok: certRun.result ? 1 : 0,
        error: certRun.error ?? null,
        exec_ms: certRun.execMs,
        created_at: new Date(),
      } as any);

      if (certRun.result) {
        logger.info("certificate_extracted", {
          document_id: documentId,
          user_id: userId ?? null,
          certificate_type: certRun.result.certificate_type ?? null,
          has_issuer: Boolean(certRun.result.issuer),
          has_expiry_date: Boolean(certRun.result.expiry_date),
          confidence: certRun.result.confidence ?? null,
          exec_ms: certRun.execMs,
        });
        await col("documents").updateOne(docFilter, {
          $set: {
            extracted_fields: JSON.stringify(certRun.result),
            document_type: certRun.result.certificate_type ?? "תעודה",
            updated_at: new Date(),
          },
        });
      } else if (certRun.error) {
        const msg = `Certificate extraction failed: ${certRun.error}`;
        await col("documents").updateOne(docFilter, {
          $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
        });
        notifyExtractionFailed({ fileName: docRow?.file_name ?? documentId, error: msg });
        push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
        return;
      }
    } else {
      // For all other kinds, pick the best matching template then extract.
      const template = forcedTemplate ?? await pickTemplate(rawText, userId);
      logger.info("document_extractor_selected", {
        document_id: documentId,
        user_id: userId ?? null,
        extractor: template ? "template" : "generic",
        template_name: template?.name ?? null,
      });

      if (template) {
        let inspector: Record<string, any> | undefined;
        if (userId) {
          const [engineerProfile, userRow] = await Promise.all([
            col("engineer_profiles").findOne({ user_id: userId }) as Promise<any>,
            col("users").findOne({ _id: new ObjectId(userId) as any }) as Promise<any>,
          ]);
          inspector = {
            ...(engineerProfile ?? {}),
            personal_phone: userRow?.phone ?? null,
            personal_email: userRow?.email ?? null,
            personal_name: userRow?.name ?? null,
            personal_company_name: userRow?.company_name ?? null,
          };
        }

        // Use cached prompt when no inspector exclusions are needed.
        const systemPrompt = await getOrBuildSystemPrompt(template, inspector as any);
        const run = await extractWithTemplate(rawText, template, documentId, docRow?.file_name, inspector as any, systemPrompt);
        const normalizedFields = normalizeExtractionFieldsForTemplate(rawText, template, run.fields);

        await col("extractions").insertOne({
          document_id: documentId,
          backend: run.backend,
          model: run.model,
          result_json: parseJsonObject(run.rawJson, normalizedFields),
          raw_text: rawText,
          parsed_ok: normalizedFields ? 1 : 0,
          error: run.error ?? null,
          exec_ms: run.execMs,
          created_at: new Date(),
        } as any);

        if (normalizedFields) {
          const keyCount = Object.keys(normalizedFields).length;
          const expiryVal = template.expiry_field ? (normalizedFields[template.expiry_field] ?? null) : null;
          logger.info("template_extraction_completed", {
            document_id: documentId,
            user_id: userId ?? null,
            template_name: template.name,
            fields_extracted: keyCount,
            has_expiry_date: Boolean(expiryVal),
            confidence: normalizedFields._confidence ?? null,
            exec_ms: run.execMs,
          });
          await col("documents").updateOne(docFilter, {
            $set: {
              extracted_fields: JSON.stringify(normalizedFields),
              template_id: template.id,
              document_type: documentTypeFromTemplate(template),
              document_kind: documentTypeFromTemplate(template),
              updated_at: new Date(),
            },
          });

          if (!pipeline?.skipEntities) {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
            await saveTemplateEntities(documentId, template, normalizedFields, userId, pipeline?.skipReminders, rawText);
            const invoiceWasSaved = pipeline?.gmailImport && isInvoiceTemplate(template)
              ? await gmailInvoiceWasSaved(documentId)
              : true;
            if (pipeline?.gmailImport && isInvoiceTemplate(template) && !invoiceWasSaved) {
              logger.info("gmail_import_non_invoice_skipped", {
                document_id: documentId,
                user_id: userId ?? null,
                template_id: template.id ?? null,
                template_name: template.name,
              });
              await deleteSkippedGmailDocument(documentId, docFilter, filePath);
              push?.({ type: "document:done", documentId: documentId as any, status: "skipped", reason: "gmail_import_non_invoice_skipped" });
              return;
            }
          }
        } else if (run.error) {
          if (pipeline?.gmailImport && isInvoiceTemplate(template)) {
            logger.info("gmail_import_invoice_extraction_failed_skipped", {
              document_id: documentId,
              user_id: userId ?? null,
              template_id: template.id ?? null,
              template_name: template.name,
              error: run.error,
            });
            await deleteSkippedGmailDocument(documentId, docFilter, filePath);
            push?.({ type: "document:done", documentId: documentId as any, status: "skipped", reason: "gmail_import_invoice_extraction_failed_skipped" });
            return;
          }
          const msg = `AI extraction failed: ${run.error}`;
          await col("documents").updateOne(docFilter, {
            $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
          });
          notifyExtractionFailed({ fileName: docRow?.file_name ?? documentId, error: msg });
          push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
          logger.error("template_extraction_empty", {
            document_id: documentId,
            user_id: userId ?? null,
            template_name: template.name,
            error: msg,
          });
          return;
        }
      } else {
        const extraction = await extractDocument(rawText, documentId, docRow?.file_name);
        await col("extractions").insertOne({
          document_id: documentId,
          backend: extraction.backend,
          model: extraction.model,
          result_json: parseJsonObject(extraction.rawJson, extraction.result),
          raw_text: rawText,
          parsed_ok: extraction.result ? 1 : 0,
          error: extraction.error ?? null,
          exec_ms: extraction.execMs,
          created_at: new Date(),
        } as any);

        if (extraction.result) {
          logger.info("generic_extraction_completed", {
            document_id: documentId,
            user_id: userId ?? null,
            document_type: extraction.result.document_type ?? null,
        has_client: Boolean(extraction.result.client_company ?? extraction.result.client_name),
        has_expiry_date: Boolean(extraction.result.expiry_date),
        confidence: extraction.result.confidence ?? null,
        exec_ms: extraction.execMs,
      });
      extraction.result.expiry_date = forwardPastNextActionDate(extraction.result.expiry_date);
      if (!pipeline?.skipEntities) {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
            await saveExtractionEntities(documentId, extraction.result, userId, pipeline?.skipReminders, rawText);
          }
        } else if (extraction.error) {
          const msg = `AI extraction failed: ${extraction.error}`;
          await col("documents").updateOne(docFilter, {
            $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
          });
          notifyExtractionFailed({ fileName: docRow?.file_name ?? documentId, error: msg });
          push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
          return;
        }
      }
    }
  }

  await finishDocumentProcessing(documentId, filePath, mimeType, push, userId);
}

async function finishDocumentProcessing(
  documentId: string,
  filePath: string,
  mimeType: string,
  push?: PushFn,
  userId?: string,
): Promise<void> {
  await col("documents").updateOne(
    { _id: new ObjectId(documentId) } as any,
    { $set: { processing_status: "done", updated_at: new Date() } },
  );
  if (mimeType === "application/pdf") {
    await generatePdfThumbnailForDocument(documentId, { filePath }).catch((err) => {
      logger.warn("document_thumbnail_generation_failed", { document_id: documentId, user_id: userId ?? null, error: err });
    });
  }
  if (userId) {
    syncDocumentToDrive(documentId, userId).catch((err) => {
      logger.error("drive_sync_post_processing_failed", {document_id: documentId, user_id: userId, error: err});
    });
  }
  push?.({ type: "document:done", documentId: documentId as any, status: "done" });
  logger.info("document_processing_completed", { document_id: documentId, user_id: userId ?? null });
}

async function saveExtractionEntities(
  documentId: string,
  result: import("../../src/shared/types.js").ExtractionResult,
  userId?: string,
  skipReminders?: boolean,
  rawText?: string,
) {
  if (result.document_type || result.document_number) {
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
      {
        $set: {
          ...(result.document_type && { document_type: result.document_type }),
          ...(result.document_number && { document_number: result.document_number }),
          updated_at: new Date(),
        },
      }
    );
  }

  let clientId: string | null = null;
  const displayName = result.client_company ?? result.client_name;
  const entityType: "company" | "person" = result.client_company ? "company" : "person";

  if (displayName) {
    const contactNote =
      result.client_company && result.client_name
        ? `איש קשר: ${result.client_name}`
        : null;

    clientId = await findOrCreateClient({
      displayName,
      entityType,
      idNumber: result.client_id ?? null,
      contactPerson: result.client_name ?? null,
      email: result.client_email ?? null,
      phone: result.client_phone ?? null,
      notes: contactNote,
      userId,
    });

    await backfillClientEmail(clientId, result as unknown as Record<string, unknown>, documentId);

    await col("document_clients").deleteMany({
      document_id: documentId,
      client_id: { $ne: clientId },
    });
    await col("document_clients").updateOne(
      { document_id: documentId, client_id: clientId },
      { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
      { upsert: true }
    );

    await col("timeline_events").insertOne({
      client_id: clientId,
      event_type: "document_added",
      title: result.document_type ? `${result.document_type} יובא` : "מסמך חדש יובא",
      description: result.summary_hebrew ?? null,
      event_date: new Date(),
      source_id: documentId,
      source_type: "document",
      created_at: new Date(),
    } as any);
  }

  if (isInvoiceLikeDocument(result.document_type)) {
    const invoiceSaved = await saveInvoiceRecord(documentId, result as unknown as Record<string, unknown>, {
      userId,
      clientId,
      documentType: result.document_type ?? "invoice",
      rawText,
    });
    await deleteContractReminderArtifacts(documentId, userId);
    if (invoiceSaved) {
      logger.info("invoice_entity_saved", {
        document_id: documentId,
        user_id: userId ?? null,
        source: "generic-extraction",
        document_type: result.document_type ?? null,
      });
    }
    return;
  }

  const resultFields = result as any;
  const inspectionInterval = Number(resultFields.inspection_interval_months ?? resultFields.date_diff_months) ||
    inspectionIntervalMonths(result.start_date, result.expiry_date);
  if (inspectionInterval) {
    resultFields.inspection_interval_months = inspectionInterval;
    resultFields.date_diff_months = inspectionInterval;
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
      { $set: { extracted_fields: JSON.stringify(resultFields), updated_at: new Date() } }
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const originalExpiry = result.expiry_date ? String(result.expiry_date).slice(0, 10) : null;
  const isOriginalOverdue = originalExpiry ? originalExpiry < today : false;
  // Overdue contracts: keep original expiry date, no forwarding, no reminders.
  const expiryDate = isOriginalOverdue
    ? originalExpiry
    : forwardPastNextActionDate(result.expiry_date, new Date(), result.start_date);
  if (expiryDate || result.start_date || result.contract_number || result.document_number) {
    const contractFields: Record<string, unknown> = {
      ...(userId && { user_id: userId }),
      client_id: clientId,
      contract_number: result.contract_number ?? result.document_number ?? null,
      contract_type: result.contract_type ?? result.document_type ?? null,
      start_date: result.start_date ?? null,
      expiry_date: expiryDate,
      ...(inspectionInterval && { inspection_interval_months: inspectionInterval }),
      amount: result.amount ?? null,
      currency: result.currency ?? "ILS",
      counterparty:
        (result.parties ?? [])
          .filter((p) => p !== (result.client_company ?? result.client_name))
          .join(", ") || null,
      summary: result.summary_hebrew ?? null,
      confidence: result.confidence ?? "medium",
      updated_at: new Date(),
    };
    if (isOriginalOverdue) contractFields.status = "expired";
    const upsertResult = await col("contracts").findOneAndUpdate(
      { document_id: documentId },
      {
        $set: contractFields,
        $setOnInsert: { document_id: documentId, ...(!isOriginalOverdue && { status: "active" }), created_at: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
    if (expiryDate && !skipReminders && !isOriginalOverdue) {
      await generateContractReminders(contractId, clientId, documentId, expiryDate, userId, result.client_email ?? null);
    }
  }

  for (const task of result.tasks ?? []) {
    const taskRes = await col("tasks").insertOne({
      ...(userId && { user_id: userId }),
      document_id: documentId,
      client_id: clientId,
      description: task.description,
      due_date: task.due_date ?? null,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
    if (task.due_date && !skipReminders) {
      await generateTaskReminders(
        taskRes.insertedId.toString(),
        clientId,
        documentId,
        task.due_date,
        task.description,
        userId
      );
    }
  }
}

export async function saveTemplateEntitiesForDoc(
  documentId: string,
  template: DocTemplate,
  fields: DynamicExtraction,
  userId?: string,
  skipReminders?: boolean
) {
  return saveTemplateEntities(documentId, template, fields, userId, skipReminders);
}

/**
 * Post-processing pipeline applied to every LLM extraction result before saving.
 * Runs in this order:
 *
 * 1. removeAddressExtractionFields — drops client_address / po_box / client_zipcode
 *    (address extraction is unreliable; these fields are not used downstream).
 *
 * 2. normalizeClientCompany — cleans client_company:
 *    - Inserts spaces between Hebrew letters and digit runs (e.g. "חברה123" → "חברה 123").
 *    - Strips a stray single leading Hebrew letter+dot (e.g. "מ הנסון בע"מ" → "הנסון בע"מ"),
 *      which occurs when OCR captures "מ." or "מר" fused to the company name.
 *    - If the value starts with 3-4 digits followed by Hebrew text and the reversed form
 *      ("Text 1234") appears verbatim in the raw PDF, swaps them to match the source.
 *
 * 3. report_number (template opt-in) — if the template declares a `report_number` field
 *    and the LLM left it empty, falls back to regex on raw text:
 *    - Looks for lines starting with "מספר תסקיר" (excluding "מספר תסקיר קודם").
 *    - Splits on tabs / 2+ spaces / " | " to take only the first token.
 *
 * 4. contact_person (template opt-in) — if the template declares `contact_person` and
 *    the LLM left it empty, falls back to regex:
 *    - Matches "איש קשר: <value>" (label before value) or "<value>: איש קשר" (RTL layout).
 *    - Strips phone numbers, "נייד/טלפון/פקס" prefixes/suffixes, and trailing punctuation.
 *    - Rejects the result if it contains no Hebrew characters.
 *
 * 5. contact_email — always attempted if LLM left it empty:
 *    - First scans lines containing "מייל / דוא"ל / email" for an email pattern.
 *    - Falls back to scanning lines before the first "section boundary" keyword
 *      (תיאור / ציוד / מקום הבדיקה / מספר רישוי / סעיף 3 / 3.) or the first 20 lines.
 *    - Skips lines that look like inspector footer lines (חתימ / בודק / מהנדס …).
 *
 * 6. license_number (template opt-in) — if the template declares `license_number` and
 *    the LLM value is not 4-8 digits, runs two fallback passes:
 *    a. After "מקום הבדיקה": scans the next 3 lines for a bare 4-8 digit number.
 *    b. Line scan: matches "מספר רישוי: <digits>" or "<digits> מספר רישוי" anywhere.
 *
 * 7. Equipment backfill — if _equipment rows were extracted but flat fields are empty,
 *    copies from the first equipment row:
 *    - checked_equipment  ← first row name
 *    - equipment_description ← "מכונת הרמה" for lifting machines (heuristic),
 *      or header-extracted description, or first row name
 *    - serial_number, manufacturer, model ← first row values
 *    - load_capacity ← first row load_capacity_work joined with " / "
 */
export function normalizeExtractionFieldsForTemplate(
  rawText: string,
  template: DocTemplate,
  fields: DynamicExtraction | null
): DynamicExtraction | null {
  if (!fields) return null;

  const normalized: DynamicExtraction = { ...fields };
  removeAddressExtractionFields(normalized);
  normalizeClientCompany(rawText, normalized);
  normalizeNextActionDateFields(normalized, template.expiry_field);
  const supportsReportNumber = template.fields.some((field) => field.key === "report_number");
  if (supportsReportNumber) {
    const reportNumber = extractCurrentReportNumber(rawText);
    if (reportNumber) normalized.report_number = reportNumber;
  }
  const supportsContactPerson = template.fields.some((field) => field.key === "contact_person");
  if (supportsContactPerson && !hasMeaningfulValue(normalized.contact_person)) {
    const contactPerson = extractContactPerson(rawText);
    if (contactPerson) normalized.contact_person = contactPerson;
  }
  if (typeof normalized.contact_email === "string" && normalized.contact_email.trim()) {
    normalized.contact_email = normalizeEmail(normalized.contact_email);
  }
  if (!hasMeaningfulValue(normalized.contact_email)) {
    const contactEmail = extractContactEmail(rawText);
    if (contactEmail) normalized.contact_email = contactEmail;
  }
  if (typeof normalized.client_email === "string" && normalized.client_email.trim()) {
    normalized.client_email = normalizeEmail(normalized.client_email);
  }
  if (
    hasMeaningfulValue(normalized.contact_email) &&
    (!hasMeaningfulValue(normalized.client_email) || normalized.client_email !== normalized.contact_email)
  ) {
    normalized.client_email = normalized.contact_email;
  }
  const supportsLicenseNumber = template.fields.some((field) => field.key === "license_number");
  // Equipment that structurally never carries a license plate.
  const neverLicensedPattern = /עגורן\s*שער|עגרן\s*שער|ג['׳]ק\s*גירים|אביזר(?:י)?\s*הרמה|קורת\s*הרמה/i;

  const headerEquipmentDescription = extractEquipmentDescriptionFromHeader(rawText);
  const headerCheckedEquipment = extractCheckedEquipmentFromHeader(rawText);
  if (headerCheckedEquipment && shouldUseHeaderCheckedEquipment(normalized.checked_equipment, headerCheckedEquipment)) {
    normalized.checked_equipment = headerCheckedEquipment;
  }

  const checkedEquipmentText = typeof normalized.checked_equipment === "string" ? normalized.checked_equipment : "";
  const equipmentDescriptionText = typeof normalized.equipment_description === "string" ? normalized.equipment_description : "";
  const isNeverLicensed = neverLicensedPattern.test(checkedEquipmentText) ||
    neverLicensedPattern.test(equipmentDescriptionText);
  if (isNeverLicensed) {
    delete normalized.license_number;
  } else if (supportsLicenseNumber) {
    const explicitLicenseNumber = extractLicenseNumber(rawText);
    if (
      hasMeaningfulValue(normalized.license_number) &&
      hasMeaningfulValue(normalized.model) &&
      String(normalized.license_number).trim() === String(normalized.model).trim()
    ) {
      delete normalized.license_number;
    }
    if (typeof normalized.license_number === "string" && isPostalCode(normalized.license_number, rawText)) {
      delete normalized.license_number;
    }
    if (
      explicitLicenseNumber &&
      typeof normalized.license_number === "string" &&
      /^\d{4,5}$/.test(normalized.license_number.trim()) &&
      /^\d{7,8}$/.test(explicitLicenseNumber) &&
      normalized.license_number.trim() !== explicitLicenseNumber
    ) {
      normalized.license_number = explicitLicenseNumber;
    }
    if (!isLikelyLicenseNumber(normalized.license_number)) {
      delete normalized.license_number;
      if (explicitLicenseNumber) normalized.license_number = explicitLicenseNumber;
    }
  }

  // When flat equipment fields are empty but _equipment rows were extracted,
  // backfill from the first row so the document card shows something useful.
  const equipmentRows = Array.isArray(normalized._equipment) ? normalized._equipment as any[] : [];
  if (equipmentRows.length > 0) {
    const first = equipmentRows[0];
    if (!hasMeaningfulValue(normalized.checked_equipment) && hasMeaningfulValue(first?.name)) {
      normalized.checked_equipment = first.name;
    }
    if (shouldUseDefaultLiftingMachineDescription(rawText, template, normalized)) {
      normalized.equipment_description = "מכונת הרמה";
    }
    if (headerEquipmentDescription && shouldUseHeaderEquipmentDescription(normalized.equipment_description, first?.name ?? normalized.checked_equipment)) {
      normalized.equipment_description = headerEquipmentDescription;
    }
    if (!hasMeaningfulValue(normalized.equipment_description) && hasMeaningfulValue(first?.name)) {
      normalized.equipment_description = first.name;
    }
    if (!hasMeaningfulValue(normalized.serial_number) && hasMeaningfulValue(first?.serial_number)) {
      normalized.serial_number = first.serial_number;
    }
    if (!hasMeaningfulValue(normalized.manufacturer) && hasMeaningfulValue(first?.manufacturer)) {
      normalized.manufacturer = first.manufacturer;
    }
    if (!hasMeaningfulValue(normalized.model) && hasMeaningfulValue(first?.model)) {
      normalized.model = first.model;
    }
    if (!hasMeaningfulValue(normalized.load_capacity)) {
      const work = first?.load_capacity_work;
      const val = Array.isArray(work) && work.length > 0 ? (work as string[]).join(" / ") : null;
      if (val) normalized.load_capacity = val;
    }
  } else {
    if (shouldUseDefaultLiftingMachineDescription(rawText, template, normalized)) {
      normalized.equipment_description = "מכונת הרמה";
    }
    if (headerEquipmentDescription && shouldUseHeaderEquipmentDescription(normalized.equipment_description, normalized.checked_equipment)) {
      normalized.equipment_description = headerEquipmentDescription;
    }
  }

  return normalized;
}

function extractCurrentReportNumber(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/מספר\s+תסקיר\s+קודם/i.test(line)) continue;

    const match = line.match(/^מספר\s+תסקיר(?!\s+קודם)\s*[:：-]?\s*(.+)$/i) ??
      line.match(/^(.+?)\s*[:：]\s*מספר\s+תסקיר(?!\s+קודם)/i);
    if (!match) continue;

    const value = normalizeReportNumberValue(match[1], rawText)
      .split(/\t|\s{2,}|\s+\|\s+/)[0]
      .trim()
      .replace(/[|]$/, "");

    if (value) return value;
  }

  return null;
}

function extractContactPerson(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (const line of lines) {
    if (!line) continue;

    const afterLabel = line.match(/(?:^|\s)איש\s+קשר\s*[:：-]?\s*([^|:：]+)/);
    const afterLabelValue = cleanContactPersonValue(afterLabel?.[1]);
    if (afterLabelValue) return afterLabelValue;

    const beforeLabel = line.match(/([^|:：]+)\s*[:：]\s*איש\s+קשר(?:\s|$)/);
    const beforeLabelValue = cleanContactPersonValue(beforeLabel?.[1]);
    if (beforeLabelValue) return beforeLabelValue;
  }

  return null;
}

function cleanContactPersonValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b\d{2,3}[-\s]?\d{6,7}\b/g, " ")
    .replace(/\b\d{7,10}\b/g, " ")
    .trim()
    .replace(/^(?:נייד|טלפון|פקס)\s*/g, "")
    .replace(/\s+(?:נייד|טלפון|פקס)\s*$/g, "")
    .replace(/[|:：-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /[א-ת]/.test(cleaned) ? cleaned : null;
}

function extractContactEmail(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  const labeledLines = lines.filter((line) => /מייל|דוא"?ל|דואר\s+אלקטרוני|email/i.test(line));
  for (const line of labeledLines) {
    const email = firstEmailInText(line);
    if (email && !isLikelyInspectorFooterLine(line)) return normalizeEmail(email);
  }

  const clientBlockEnd = lines.findIndex((line) => /(?:תיאור|ציוד|מקום\s+הבדיקה|מספר\s+רישוי|סעיף\s*3|3\.)/.test(line));
  const searchLines = clientBlockEnd > 0 ? lines.slice(0, clientBlockEnd) : lines.slice(0, Math.min(lines.length, 35));
  for (const line of searchLines) {
    const email = firstEmailInText(line);
    if (email && !isLikelyInspectorFooterLine(line)) return normalizeEmail(email);
  }

  return null;
}

function firstEmailInText(value: string): string | null {
  const compact = value
    .replace(/\s*@\s*/g, "@")
    .replace(/(?<=\b[A-Z0-9._%+-])\s+(?=[A-Z0-9._%+-]*@)/gi, "")
    .replace(/(?<=@[\w.-]*)\s+(?=[A-Z0-9.-]+\.[A-Z]{2,})/gi, "");
  const normal = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (normal) return normal[0];
  const reversed = compact.match(/[A-Z0-9.-]+\.[A-Z0-9-]{2,}@[A-Z0-9._%+-]+/i);
  return reversed?.[0] ?? null;
}

const KNOWN_TLDS = new Set(["com", "net", "org", "il", "co", "io", "me", "info", "biz", "edu", "gov"]);

function reverseDotSegments(s: string): string {
  return s.split(".").reverse().join(".");
}

function isReversedEmail(local: string, domain: string): boolean {
  // A reversed email's local part, when dot-segments are reversed, ends with a known TLD.
  // e.g. "com.gmail" reversed segments = "gmail.com" -> ends with "com" ✓
  // e.g. "li.oc" reversed segments = "co.il" -> ends with "il" ✓
  const reversedLocal = local.split(".").reverse().join(".");
  const reversedLocalTld = reversedLocal.split(".").pop()?.toLowerCase() ?? "";
  const domainLast = domain.split(".").pop()?.toLowerCase() ?? "";
  return KNOWN_TLDS.has(reversedLocalTld) && !KNOWN_TLDS.has(domainLast);
}

export function normalizeEmail(value: string): string {
  const cleaned = value.trim().replace(/[.,;:]+$/g, "").toLowerCase();
  const atIdx = cleaned.indexOf("@");
  if (atIdx === -1) return cleaned;
  const beforeAt = cleaned.slice(0, atIdx);
  const afterAt = cleaned.slice(atIdx + 1);

  // RTL-reversed email: "com.gmail@mezeg.car" -> swap sides and reverse dot segments of each
  // before="com.gmail" after="mezeg.car" -> local=reverseDots("mezeg.car")="car.mezeg" domain=reverseDots("com.gmail")="gmail.com"
  if (isReversedEmail(beforeAt, afterAt)) {
    return `${reverseDotSegments(afterAt)}@${reverseDotSegments(beforeAt)}`;
  }

  // Domain in local part, no dots in domain: "com.gmail@username" -> "username@gmail.com"
  if (beforeAt.includes(".") && !afterAt.includes(".")) {
    return `${afterAt}@${reverseDotSegments(beforeAt)}`;
  }

  // Local part has digits prepended from RTL number glue
  const rtlLocal = beforeAt.match(/^(\d{2,})([a-z][a-z0-9._%+-]*)$/i);
  const local = rtlLocal ? `${rtlLocal[2]}${rtlLocal[1]}` : beforeAt;
  return `${local}@${afterAt}`;
}

function isLikelyInspectorFooterLine(line: string): boolean {
  return /חתימ|בודק|מהנדס|הנדסה|בטיחות|פקודת\s+הבטיחות|תסקיר\s+זה|footer/i.test(line);
}

function extractLicenseNumber(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Value on same line as label (both directions); value is digits or "פנימי NNN"
    const afterLabel = line.match(/(?:^|\s)מספר\s+רישוי\s*[:：-]?\s*(פנימי\s*\d{3,5}|\d+)/i);
    const beforeLabel = line.match(/(פנימי\s*\d{3,5}|\d+)\s*[:：-]?\s*מספר\s+רישוי/i);
    // Also match reversed RTL rendering: "145פנימי" on same line as label
    const afterLabelRev = line.match(/(?:^|\s)מספר\s+רישוי\s*[:：-]?\s*(\d{3,5}\s*פנימי)/i);
    const beforeLabelRev = line.match(/(\d{3,5}\s*פנימי)\s*[:：-]?\s*מספר\s+רישוי/i);
    const inline = cleanInlineFieldValue(afterLabel?.[1] ?? beforeLabel?.[1] ?? afterLabelRev?.[1] ?? beforeLabelRev?.[1]);
    if (inline && isLikelyLicenseNumber(inline) && !isPostalCodeContext(lines, i, inline)) {
      return normalizePenimiLicense(inline);
    }

    // Label-only line — value on the next line (common in RTL table PDFs)
    if (/^[:：-]?\s*מספר\s+רישוי\s*[:：-]?$/i.test(line)) {
      const nearby = [[-2, lines[i - 2]?.trim()], [-1, lines[i - 1]?.trim()], [1, lines[i + 1]?.trim()], [2, lines[i + 2]?.trim()], [3, lines[i + 3]?.trim()], [4, lines[i + 4]?.trim()], [5, lines[i + 5]?.trim()]] as const;
      const plateCandidate = nearby.find(([offset, candidate]) =>
        candidate && (offset > 0 || /^\d{7,8}$/.test(candidate)) && /^\d{7,8}$/.test(candidate) && !isPostalCodeContext(lines, i + offset, candidate)
      );
      if (plateCandidate?.[1]) return normalizePenimiLicense(plateCandidate[1]);
      for (const [offset, candidate] of nearby) {
        const previousLinePlate = offset < 0 && /^\d{7,8}$/.test(candidate ?? "");
        if (candidate && (previousLinePlate || offset > 0) && isLikelyLicenseNumber(candidate) && !isPostalCodeContext(lines, i + offset, candidate)) {
          return normalizePenimiLicense(candidate);
        }
      }
    }

  }

  const locationSectionValue = extractLicenseNumberAfterInspectionLocation(rawText);
  if (locationSectionValue) return locationSectionValue;

  // Last resort: document mentions "מספר רישוי" but value was separated from label
  // by many lines (RTL table PDF column ordering). Collect all standalone 4-8 digit
  // lines, skip ones that look like load-table values (appear on lines adjacent to
  // decimal radius values like "2.6", "4.8" etc.) or unrelated labels, then return
  // the first remaining candidate.
  if (/מספר\s+רישוי/i.test(rawText)) {
    const labelIndex = lines.findIndex((line) => /מספר\s+רישוי/i.test(line));
    if (labelIndex < 0) return null;
    const skipLinePattern = /מיקוד|ישוב|מייל|דוא|טלפון|פקס|תאריך|ת\.ד|כתובת/i;
    // Lines near equipment-table headers (serial numbers, load values, etc.)
    const equipTablePattern = /סידורי|דגם|יצר|עומס|כמות|רדיוס/i;
    // Lines that are part of a load/radius table (decimal number, or adjacent to one)
    const isLoadTableLine = (idx: number): boolean => {
      for (let d = -1; d <= 1; d++) {
        const l = lines[idx + d]?.trim() ?? "";
        if (/^\d+\.\d+/.test(l)) return true;
      }
      return false;
    };
    // Returns true if any of the 3 lines around idx contain equipment-table keywords
    const isEquipTableLine = (idx: number): boolean => {
      for (let d = -2; d <= 2; d++) {
        if (equipTablePattern.test(lines[idx + d] ?? "")) return true;
      }
      return false;
    };
    for (let i = labelIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (skipLinePattern.test(lines[i])) continue;
      if (isPostalCodeContext(lines, i, line)) continue;
      if (isLikelyLicenseNumber(line) && /פנימי/i.test(line)) return normalizePenimiLicense(line);
      if (isLoadTableLine(i)) continue;
      if (isEquipTableLine(i)) continue;
      if (/^\d{4,6}$/.test(line) && isLikelyLicenseNumber(line)) return line;
    }
  }

  return null;
}

function extractLicenseNumberAfterInspectionLocation(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    if (!/מקום\s+הבדיקה/.test(lines[i])) continue;
    for (const candidateLine of lines.slice(i + 1, i + 4)) {
      if (isLikelyLicenseNumber(candidateLine)) return normalizePenimiLicense(candidateLine);
    }
  }
  return null;
}

function cleanInlineFieldValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .split(/\t|\s{2,}|\s+\|\s+/)[0]
    .trim()
    .replace(/[|]$/, "");
  return cleaned || null;
}

function isLikelyLicenseNumber(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!/^\d{4,8}$/.test(v) && !/^פנימי\s*\d{3,5}$/i.test(v) && !/^\d{3,5}\s*פנימי$/i.test(v)) return false;
  // Round thousands (1000, 2000, 3000 …) are load-capacity values, never license numbers
  if (/^\d+$/.test(v) && Number(v) % 1000 === 0) return false;
  return true;
}

function isPostalCode(value: string, rawText: string): boolean {
  const v = value.trim();
  if (!/^\d{5,7}$/.test(v)) return false;
  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes(v) && isPostalCodeContext(lines, i, v)) return true;
  }
  return false;
}

function isPostalCodeContext(lines: string[], index: number, value: string): boolean {
  const v = value.trim();
  if (!/^\d{5,7}$/.test(v)) return false;

  for (let delta = -1; delta <= 1; delta++) {
    const line = lines[index + delta]?.trim() ?? "";
    if (/(?:מיקוד|מקוד)/i.test(line)) return true;
  }

  return false;
}

// Normalize reversed "145פנימי" → "פנימי 145" for consistent storage
function normalizePenimiLicense(v: string): string {
  const rev = v.trim().match(/^(\d{3,5})\s*פנימי$/i);
  if (rev) return `פנימי ${rev[1]}`;
  return v.trim();
}

function hasMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function removeAddressExtractionFields(fields: DynamicExtraction): void {
  delete fields.client_address;
  delete fields.po_box;
  delete fields.client_zipcode;
}

function normalizeClientCompany(rawText: string, fields: DynamicExtraction): void {
  if (typeof fields.client_company !== "string") return;
  const original = fields.client_company;
  const current = normalizeClientName(fields.client_company, rawText);
  const rawClientCompany = extractClientCompanyFromHeader(rawText);
  fields.client_company = rawClientCompany && shouldUseRawClientCompany(original, current)
    ? rawClientCompany
    : current;
}

function extractClientCompanyFromHeader(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\\/g, "").replace(/\s+/g, " ").trim();
    if (!line) continue;

    const afterLabel = line.match(/(?:פרטי\s+הלקוח\s*\/\s*תופש|תופש\s*\/\s*פרטי\s+הלקוח)\s*[:：]\s*(.+)$/i);
    const beforeLabel = line.match(/^(.+?)\s*[:：]\s*(?:פרטי\s+הלקוח\s*\/\s*תופש|תופש\s*\/\s*פרטי\s+הלקוח)/i);
    const value = afterLabel?.[1] ?? beforeLabel?.[1];
    if (!value) continue;

    const cleaned = cleanHeaderValue(
      value
        .replace(/^\d+\.\s*/, "")
        .split(/איש\s+קשר|נייד|טלפון|פקס|סוג\s+בדיקה|כתובת/i)[0]
    );
    if (!cleaned || !/[א-ת]/.test(cleaned)) continue;

    return normalizeClientName(cleaned);
  }
  return null;
}

function shouldUseRawClientCompany(original: string, current: string): boolean {
  if (!current) return true;
  if (/^מגרש\s+/.test(original.trim())) return true;
  if (/^מגרש\s+/.test(current)) return true;
  return false;
}

function normalizeClientName(value: string, rawText?: string): string {
  const spaced = value
    .replace(/\\/g, "")
    .replace(/([א-ת])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([א-ת])/g, "$1 $2")
    .replace(/\s*[:：]?\s*(?:תופש|פרטי\s+הלקוח|איש\s+קשר).*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:：,.;-]+/, "")
    .replace(/\s+מ["״]\s*ע["״]?\s*מ$/i, " בע\"מ")
    .replace(/\s+מ["״]$/, " בע\"מ")
    .trim();
  // Strip a stray single Hebrew letter prefix (e.g. "מ הנסון" → "הנסון") that
  // results from OCR splitting "מ." or "מר" off a company/person name.
  const stripped = spaced
    .replace(/^מ["״]\s*(?=[א-ת])/, "")
    .replace(/^[א-ת]\.?\s+(?=[א-ת])/, "");
  return preferHebrewNameWithNumericSuffix(stripInspectionSitePrefix(stripLeadingLegalSuffixFragment(stripped, rawText)), rawText);
}

function stripLeadingLegalSuffixFragment(value: string, rawText?: string): string {
  if (!rawText) return value;
  const normalizedRawText = rawText.replace(/\\/g, "");
  const match = value.match(/^מ([א-ת].*)$/);
  if (!match?.[1]) return value;
  const remainder = match[1].trim();
  if (!remainder) return value;
  return normalizedRawText.includes(`מ"${remainder}`) || normalizedRawText.includes(`מ״${remainder}`) ? remainder : value;
}

function preferHebrewNameWithNumericSuffix(value: string, rawText?: string): string {
  const match = value.match(/^(\d{3,4})\s+(.+[\u0590-\u05FF].*)$/);
  if (!match) return value;

  const candidate = `${match[2].trim()} ${match[1]}`;
  if (!rawText) return candidate;

  const normalizedText = rawText.replace(/\s+/g, " ");
  return normalizedText.includes(candidate) ? candidate : value;
}

export function extractCheckedEquipmentFromHeader(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim());
  for (const line of lines) {
    const inspectionLocationValue = extractCheckedEquipmentFromInspectionLocationLine(line);
    if (inspectionLocationValue) return inspectionLocationValue;
  }
  for (let i = 0; i < lines.length; i++) {
    if (/תיאור\s+מכונת\s+הרמה/i.test(lines[i])) {
      const afterColon = lines[i].match(/תיאור\s+מכונת\s+הרמה\s*[.:：]?\s*\d*[.\s:：]*([^\d\s].*)/i);
      if (afterColon?.[1]) {
        const value = cleanHeaderValue(afterColon[1].split(/מספר\s*רישוי/)[0]);
        if (value && value.length > 1 && /[א-ת]/.test(value)) return value;
      }
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (!lines[j]) continue;
        const known = /פרטי\s+הלקוח|מקום\s+הבדיקה|יש\s+לשמור|הערות|ליקוי/i;
        if (known.test(lines[j])) break;
        const detailValue = extractCheckedEquipmentFromDetailLine(lines[j]);
        if (detailValue) return detailValue;
      }
    }
  }
  return null;
}

function extractCheckedEquipmentFromInspectionLocationLine(line: string): string | null {
  if (!/מקום\s+הבדיקה/.test(line)) return null;
  const rawSuffix = line.split(/מקום\s+הבדיקה/i)[1] ?? "";
  const candidate = normalizeInspectionLocationEquipment(rawSuffix);
  return isLikelyCheckedEquipment(candidate) ? candidate : null;
}

function extractCheckedEquipmentFromDetailLine(line: string): string | null {
  const cleaned = cleanHeaderValue(
    line
      .replace(/^בהפעלה\s*[,.:：-]?\s*/i, "")
      .replace(/^ציוד\s+שנבדק\s*[:：-]?\s*/i, "")
  );
  if (!cleaned) return null;
  return isLikelyCheckedEquipment(cleaned) ? cleaned : null;
}

function normalizeInspectionLocationEquipment(value: string): string | null {
  const cleaned = cleanHeaderValue(value);
  if (!cleaned) return null;
  const repairedJack = cleaned.replace(/^ק\s*(.+?)'ג$/i, "ג'ק $1").replace(/\s+/g, " ").trim();
  return repairedJack || null;
}

function isLikelyCheckedEquipment(value: string | null): value is string {
  if (!value || !/[א-ת]/.test(value)) return false;
  if (/מקום\s+הבדיקה|יש\s+לשמור|הערות|ליקוי|בדיקה\s+פונקציונלית|וויזואלית/i.test(value)) return false;
  return /(עגורן\s*שער|עגרן\s*שער|אביזרי\s*הרמה|מלגזה|מנוף|במת?\s*הרמה|עגורן|מגבה|מהפכי?|ג['׳]?ק|גירים)/i.test(value);
}

function shouldUseHeaderCheckedEquipment(current: unknown, candidate: string): boolean {
  if (!hasMeaningfulValue(current)) return true;
  const currentText = String(current).trim();
  if (currentText === candidate) return false;
  if (candidate.includes(currentText) && candidate.length > currentText.length) return true;
  return /^(מלגזה|מנוף|עגורן|עגורן שער|מגבה|במת הרמה|אביזרי הרמה)$/i.test(currentText);
}

function extractEquipmentDescriptionFromHeader(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const inlineValue = line.match(/(?:^|\s)תיאור\s*[:：-]\s*([^|:：]+)$/);
    if (inlineValue?.[1]) {
      const value = cleanEquipmentDescriptionValue(inlineValue[1]);
      if (value) return value;
    }

    const labelAndValue = line.match(/(?:^|\s)תיאור\s+([^:：|]+)\s*[:：]?$/);
    if (labelAndValue?.[1]) {
      const value = cleanEquipmentDescriptionValue(labelAndValue[1]);
      if (value && value !== "תיאור" && !isBadEquipmentDescriptionValue(value)) return value;
    }
  }

  return null;
}

function stripInspectionSitePrefix(value: string): string {
  return value.replace(/^מגרש\s+(?=[א-ת])/, "").trim();
}

function normalizeReportNumberValue(value: string, rawText?: string): string {
  const cleaned = value.trim();
  const parts = cleaned.split("/").map((part) => part.trim());
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    let inspector = parts.find((part) => part.length >= 6);
    let report = parts.find((part) => part !== inspector);
    if (!inspector && rawText) {
      const shortInspector = parts.find((part) => part.length === 5);
      if (shortInspector && rawText.includes(`${shortInspector}0`)) {
        inspector = `${shortInspector}0`;
        report = parts.find((part) => part !== shortInspector);
      }
    }
    if (inspector && report) return `${inspector}/${report}`;
  }
  return cleaned;
}

function cleanHeaderValue(value: string): string | null {
  const cleaned = value
    .replace(/^[\s.،,;:：-]+|[\s.،,;:：-]+$/g, "")
    .trim();
  return cleaned || null;
}

function cleanEquipmentDescriptionValue(value: string): string | null {
  const cleaned = cleanHeaderValue(value)
    ?.replace(/^\d+\s*[.:：-]\s*/, "")
    .replace(/\s*[.:：-]\s*\d+$/g, "")
    .trim();
  return cleaned || null;
}

function shouldUseHeaderEquipmentDescription(current: unknown, firstEquipmentName: unknown): boolean {
  if (!hasMeaningfulValue(current)) return true;
  const currentText = String(current).trim();
  if (/^תיאור\s+/.test(currentText)) return true;
  if (isBadEquipmentDescriptionValue(currentText)) return true;
  const cleanedCurrent = cleanEquipmentDescriptionValue(currentText);
  if (cleanedCurrent && cleanedCurrent !== currentText) return true;
  if (!hasMeaningfulValue(firstEquipmentName)) return false;
  return currentText === String(firstEquipmentName).trim();
}

function isBadEquipmentDescriptionValue(value: string): boolean {
  return /ליקו[יי]?ם|הערות|ממצאים|המלצות/i.test(value);
}

function shouldUseDefaultLiftingMachineDescription(
  rawText: string,
  template: DocTemplate,
  fields: DynamicExtraction
): boolean {
  const checkedEquipment = fields.checked_equipment;
  const description = fields.equipment_description;
  if (!hasMeaningfulValue(checkedEquipment) || !hasMeaningfulValue(description)) return false;
  if (String(checkedEquipment).trim() !== String(description).trim()) return false;

  const templateLooksLikeInspection = template.document_kind === "inspection_report" ||
    template.match_keywords.some((keyword) => /תסקיר|בדיקה|מכונת הרמה|ציוד הרמה/.test(keyword));
  if (!templateLooksLikeInspection) return false;

  return /מכונת\s+הרמה|ציוד\s+הרמה|תסקיר\s+בדיקה/.test(rawText);
}

async function saveTemplateEntities(
  documentId: string,
  template: DocTemplate,
  fields: DynamicExtraction,
  userId?: string,
  skipReminders?: boolean,
  rawText?: string,
) {
  const f = fields;

  const getStr = (k: string): string | null => {
    const v = f[k];
    if (v === undefined || v === null || v === "") return null;
    return String(v);
  };
  const getNum = (k: string): number | null => {
    const v = f[k];
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  const clientCompany = getStr("client_company");
  const contactPerson = getStr("contact_person") ?? getStr("client_name");
  const displayName = clientCompany ?? contactPerson;
  const entityType: "company" | "person" = clientCompany ? "company" : "person";

  let clientId: string | null = null;
  if (displayName) {
    const contactNote =
      clientCompany && contactPerson ? `איש קשר: ${contactPerson}` : null;

    clientId = await findOrCreateClient({
      displayName,
      entityType,
      idNumber: getStr("client_id"),
      contactPerson,
      email: getStr("client_email") ?? getStr("contact_email") ?? getStr("email"),
      phone: getStr("contact_phone"),
      notes: contactNote,
      userId,
    });

    await backfillClientEmail(clientId, fields, documentId);

    await col("document_clients").deleteMany({
      document_id: documentId,
      client_id: { $ne: clientId },
    });
    await col("document_clients").updateOne(
      { document_id: documentId, client_id: clientId },
      { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
      { upsert: true }
    );

    await col("timeline_events").insertOne({
      client_id: clientId,
      event_type: "document_added",
      title: `${template.name} יובא`,
      description: null,
      event_date: new Date(),
      source_id: documentId,
      source_type: "document",
      created_at: new Date(),
    } as any);
  }

  if (isInvoiceTemplate(template)) {
    const invoiceSaved = await saveInvoiceRecord(documentId, fields, {
      userId,
      clientId,
      documentType: template.name,
      templateId: template.id,
      templateName: template.name,
      rawText,
    });
    await deleteContractReminderArtifacts(documentId, userId);
    if (invoiceSaved) {
      logger.info("invoice_entity_saved", {
        document_id: documentId,
        user_id: userId ?? null,
        template_id: template.id ?? null,
        template_name: template.name,
      });
    }
    return;
  }

  const docNumber =
    getStr("contract_number") ?? getStr("report_number") ?? getStr("invoice_number");
  const startDate =
    getStr("start_date") ?? getStr("inspection_date") ?? getStr("issue_date");
  const rawExpiryDate = template.expiry_field ? getStr(template.expiry_field) : null;
  const inspectionInterval = getNum("inspection_interval_months") ?? getNum("date_diff_months") ?? inspectionIntervalMonths(startDate, rawExpiryDate);
  const today2 = new Date().toISOString().slice(0, 10);
  const originalExpiry2 = rawExpiryDate ? String(rawExpiryDate).slice(0, 10) : null;
  const isOriginalOverdue2 = originalExpiry2 ? originalExpiry2 < today2 : false;
  // Overdue contracts: keep original expiry, no forwarding, no reminders.
  const expiryDate = isOriginalOverdue2
    ? originalExpiry2
    : forwardPastNextActionDate(rawExpiryDate, new Date(), startDate);

  if (docNumber || startDate || expiryDate) {
    const contractFields: Record<string, unknown> = {
      ...(userId && { user_id: userId }),
      client_id: clientId,
      contract_number: docNumber,
      contract_type: template.name,
      start_date: startDate,
      expiry_date: expiryDate,
      ...(inspectionInterval && { inspection_interval_months: inspectionInterval }),
      amount: getNum("amount"),
      currency: getStr("currency") ?? "ILS",
      summary: getStr("findings") ?? getStr("notes") ?? getStr("summary_hebrew"),
      confidence: (getStr("_confidence") as "high" | "medium" | "low") ?? "medium",
      updated_at: new Date(),
    };
    if (isOriginalOverdue2) contractFields.status = "expired";
    const upsertResult = await col("contracts").findOneAndUpdate(
      { document_id: documentId },
      {
        $set: contractFields,
        $setOnInsert: { document_id: documentId, ...(!isOriginalOverdue2 && { status: "active" }), created_at: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
    if (expiryDate && !skipReminders && !isOriginalOverdue2) {
      await generateContractReminders(contractId, clientId, documentId, expiryDate, userId);
    }
  }

  // Save equipment items extracted from inspection reports
  const equipmentList = Array.isArray(f["_equipment"]) ? f["_equipment"] as any[] : [];
  for (const eq of equipmentList) {
    if (!eq || typeof eq !== "object") continue;
    const name: string = (eq.name ?? eq.description ?? "").trim();
    if (!name) continue;

    // Match by serial_number if present (most reliable), otherwise by name
    const matchFilter: Record<string, any> = eq.serial_number
      ? { serial_number: String(eq.serial_number).trim() }
      : { name };

    const now = new Date();
    await col("equipment").updateOne(
      matchFilter,
      {
        $set: {
          name,
          category: eq.category ?? "other",
          ...(eq.manufacturer != null && { manufacturer: String(eq.manufacturer) }),
          ...(eq.model != null && { model: String(eq.model) }),
          ...(eq.serial_number != null && { serial_number: String(eq.serial_number).trim() }),
          ...(eq.load_capacity_work?.length && { capacity: (eq.load_capacity_work as string[]).join(" / ") }),
          ...(eq.load_capacity_test?.length && { load_capacity_test: (eq.load_capacity_test as string[]).join(" / ") }),
          ...(eq.load_radius?.length && { load_radius: (eq.load_radius as string[]).join(" / ") }),
          document_id: documentId,
          ...(clientId != null && { client_id: clientId }),
          ...(userId && { user_id: userId }),
          updated_at: now,
        },
        $setOnInsert: {
          description: null,
          notes: null,
          is_active: 1,
          created_at: now,
        },
      },
      { upsert: true }
    );

    logger.debug("equipment_upserted_from_document", {
      user_id: userId ?? null,
      name,
      has_serial_number: Boolean(eq.serial_number),
      manufacturer: eq.manufacturer ?? null,
      model: eq.model ?? null,
    });
  }
}

function isInvoiceTemplate(template: DocTemplate): boolean {
  return template.document_kind === "invoice" || isInvoiceLikeDocument(template.name);
}

function isInspectionTemplate(template: DocTemplate): boolean {
  return template.document_kind === "inspection_report" || /תסקיר|בדיקה/.test(template.name);
}

function isInvoiceLikeDocument(value: unknown): boolean {
  const text = String(value ?? "").toLowerCase();
  return /invoice|receipt|bill|חשבונית|קבלה|דרישת\s*תשלום|חיוב/.test(text);
}

export function extractKnownInvoiceFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  return extractGitHubReceiptFields(rawText, fileName) ?? extractVercelReceiptFields(rawText, fileName);
}

function extractGitHubReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lower = text.toLowerCase();
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!lower.includes("github") || !(lower.includes("receipt") || nameLower.includes("receipt"))) return null;

  const dateRaw =
    matchValueAfterLabel(text, "Date") ??
    matchFirst(text, /\b([A-Z][a-z]{2,9}\s+\d{1,2},\s+\d{4})\b/) ??
    matchFirst(text, /\b(\d{4}-\d{2}-\d{2})\b/);
  const issueDate = normalizeInvoiceDate(dateRaw);
  const transactionId = matchValueAfterLabel(text, "Transaction ID");
  const accountBilled = matchValueAfterLabel(text, "Account billed");
  const amountRaw =
    matchValueAfterLabel(text, "Total") ??
    matchValueAfterLabel(text, "Amount") ??
    matchFirst(text, /(?:Total|Amount)\s*([\d,]+(?:\.\d{1,2})?)\s*USD/i) ??
    matchFirst(text, /\$[\s]*([\d,]+(?:\.\d{1,2})?)\s*USD/i);
  const taxRaw = matchValueAfterLabel(text, "Tax");
  const paymentMethod = matchValueAfterLabel(text, "Charged to");
  const serviceDescription = matchFirst(text, /(GitHub\s+[^\n]+?)(?=\s+\$?\d|[\r\n])/i);
  const amount = parseInvoiceAmount(amountRaw);
  const invoiceNumber =
    transactionId ??
    matchFirst(fileName ?? "", /receipt[-_](\d{4}-\d{2}-\d{2})/i) ??
    matchFirst(fileName ?? "", /github[-_\w]*receipt[-_]?([^.]+)/i);

  if (!issueDate || amount === null || !invoiceNumber) return null;

  return {
    supplier_name: "GitHub, Inc.",
    supplier_id: null,
    invoice_number: invoiceNumber,
    document_subtype: "קבלה",
    client_company: accountBilled ?? null,
    client_name: accountBilled ?? null,
    customer_number: accountBilled ? accountBilled.replace(/\s*\([^)]*\)\s*$/, "") : null,
    issue_date: issueDate,
    payment_due_date: issueDate,
    billing_period: matchFirst(text, /\b([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/),
    amount,
    amount_before_vat: amount,
    vat_amount: parseInvoiceAmount(taxRaw) ?? 0,
    currency: "USD",
    payment_status: "paid",
    payment_method: paymentMethod,
    items: serviceDescription
      ? [{ description: serviceDescription, amount, currency: "USD" }]
      : [],
    notes: "GitHub subscription receipt",
  };
}

function extractVercelReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lower = text.toLowerCase();
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!lower.includes("vercel") || !(lower.includes("invoice") || lower.includes("receipt") || /invoice|receipt/.test(nameLower))) {
    return null;
  }

  const isReceipt = lower.includes("receipt") || nameLower.includes("receipt");
  const issueDate =
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date paid")) ??
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date of issue")) ??
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date due")) ??
    normalizeInvoiceDate(matchFirst(text, /\b([A-Z][a-z]{2,9}\s+\d{1,2},\s+\d{4})\b/));
  const dueDate =
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date due")) ??
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date paid")) ??
    issueDate;
  const invoiceNumber =
    formatVercelDocumentNumber(matchValueAfterLabel(text, "Invoice number")) ??
    matchFirst(fileName ?? "", /Invoice[-_]?([A-Z0-9-]+)/i);
  const receiptNumber =
    formatVercelDocumentNumber(matchValueAfterLabel(text, "Receipt number")) ??
    matchFirst(fileName ?? "", /Receipt[-_]?([A-Z0-9-]+)/i);
  const amountRaw =
    matchValueAfterLabel(text, "Amount paid") ??
    matchValueAfterLabel(text, "Amount due") ??
    matchValueAfterLabel(text, "Total") ??
    matchFirst(text, /\b([\d,]+(?:\.\d{1,2})?)\s+USD\s+(?:due|paid)\b/i);
  const amount = parseInvoiceAmount(amountRaw);
  const subtotal = parseInvoiceAmount(matchValueAfterLabel(text, "Subtotal"));
  const clientCompany = extractVercelBillTo(text);
  const paymentMethod = extractVercelPaymentMethod(text);
  const itemDescription = matchFirst(text, /\n(?!Subtotal|Total|Amount)([^\n]*?(?:Domain purchase|subscription|seat|usage)[^\n]*?)(?=\d[\d.,]*\d[\d.,]*|\n|$)/i);

  if (!issueDate || amount === null || !(invoiceNumber || receiptNumber) || !clientCompany) return null;

  return {
    supplier_name: "Vercel Inc.",
    supplier_id: null,
    invoice_number: invoiceNumber ?? receiptNumber,
    receipt_number: receiptNumber ?? null,
    document_subtype: isReceipt ? "קבלה" : "חשבונית",
    client_company: clientCompany,
    client_name: clientCompany,
    service_address: extractVercelBillToAddress(text),
    issue_date: issueDate,
    payment_due_date: dueDate,
    amount,
    amount_before_vat: subtotal,
    vat_amount: null,
    currency: "USD",
    payment_status: isReceipt ? "paid" : null,
    payment_method: paymentMethod,
    items: itemDescription
      ? [{ description: itemDescription, amount, currency: "USD" }]
      : [],
    notes: isReceipt ? "Vercel receipt" : "Vercel invoice",
  };
}

function formatVercelDocumentNumber(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/[^A-Za-z0-9-]/g, "");
  const invoiceMatch = /^([A-Z0-9]{8})(\d{4})$/i.exec(clean);
  if (invoiceMatch) return `${invoiceMatch[1]}-${invoiceMatch[2]}`;
  const receiptMatch = /^(\d{4})(\d{4})$/.exec(clean);
  if (receiptMatch) return `${receiptMatch[1]}-${receiptMatch[2]}`;
  return clean || null;
}

function extractVercelBillTo(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /^Bill to$/i.test(line));
  if (index < 0) return null;
  const value = lines[index + 1];
  return value ? cleanKnownInvoiceValue(value) : null;
}

function extractVercelBillToAddress(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /^Bill to$/i.test(line));
  if (index < 0) return null;
  const address: string[] = [];
  for (const line of lines.slice(index + 2)) {
    if (/@/.test(line)) continue;
    if (/^\d+(?:\.\d{1,2})?\s+(?:USD\s+)?(?:due|paid)\b/i.test(line)) break;
    if (/^VAT-?Code/i.test(line)) break;
    address.push(line);
  }
  return address.join(", ") || null;
}

function extractVercelPaymentMethod(text: string): string | null {
  return matchFirst(text, /\b((?:Mastercard|Visa|American Express|Amex|Discover|PayPal)\s*[-–]\s*\d{2,4})\b/i)
    ?? matchValueAfterLabel(text, "Payment method");
}

function matchValueAfterLabel(text: string, label: string): string | null {
  const escaped = escapeRegex(label);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const inline = new RegExp(`^${escaped}\\s*[:：-]?\\s*(.+)$`, "i").exec(line);
    if (inline?.[1] && inline[1].trim().toLowerCase() !== label.toLowerCase()) {
      return cleanKnownInvoiceValue(inline[1]);
    }
    if (new RegExp(`^${escaped}$`, "i").test(line)) {
      const next = lines[i + 1];
      if (next) return cleanKnownInvoiceValue(next);
    }
  }
  const loose = new RegExp(`${escaped}\\s+([^\\n]+)`, "i").exec(text);
  return loose?.[1] ? cleanKnownInvoiceValue(loose[1]) : null;
}

function matchFirst(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1] ? cleanKnownInvoiceValue(match[1]) : null;
}

function cleanKnownInvoiceValue(value: string): string | null {
  const cleaned = value
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[:：-]\s*/, "")
    .replace(/\s*[*•]\s*$/, "")
    .trim();
  return cleaned || null;
}

function normalizeInvoiceDate(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*[A-Z]{2,4}\b/i, "").trim();
  const parsed = Date.parse(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function firstInvoiceString(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    return String(value).trim() || null;
  }
  return null;
}

function parseInvoiceAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/[₪$€£,\s]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function deleteContractReminderArtifacts(documentId: string, userId?: string): Promise<void> {
  const contractFilter: Record<string, unknown> = { document_id: documentId };
  if (userId) contractFilter.user_id = userId;
  const contracts = await col("contracts").find(contractFilter as any).project({ _id: 1 }).toArray();
  const contractIds = contracts.map((contract: any) => contract._id?.toString()).filter(Boolean);
  if (contractIds.length > 0) {
    const reminderFilter: Record<string, unknown> = {
      source_type: "contract_expiry",
      source_id: { $in: contractIds },
    };
    if (userId) reminderFilter.user_id = userId;
    await col("reminders").deleteMany(reminderFilter as any);
  }
  const directReminderFilter: Record<string, unknown> = { document_id: documentId };
  if (userId) directReminderFilter.user_id = userId;
  await Promise.all([
    col("contracts").deleteMany(contractFilter as any),
    col("reminders").deleteMany(directReminderFilter as any),
    col("tasks").deleteMany(directReminderFilter as any),
  ]);
}

async function saveInvoiceRecord(
  documentId: string,
  fields: Record<string, unknown>,
  options: {
    userId?: string;
    clientId?: string | null;
    documentType?: string | null;
    templateId?: string | number;
    templateName?: string | null;
    rawText?: string;
  },
): Promise<boolean> {
  const now = new Date();
  const supplierName = firstInvoiceString(fields, ["supplier_name", "vendor_name", "counterparty", "issuer_name", "company_name"]);
  const invoiceNumber = firstInvoiceString(fields, ["invoice_number", "receipt_number", "document_number", "reference_number"]);
  const clientName = firstInvoiceString(fields, ["client_company", "client_name", "customer_name", "bill_to"])
    ?? extractInvoiceRecipientFromRawText(options.rawText);
  const issueDate = firstInvoiceString(fields, ["issue_date", "invoice_date", "receipt_date", "date"]);
  const paymentDueDate = firstInvoiceString(fields, ["payment_due_date", "due_date", "expiry_date"]);
  const amount = parseInvoiceAmount(
    fields.amount ?? fields.total_amount ?? fields.amount_due ?? fields.total_to_pay ?? fields.total,
  );
  const missingRequired = invoiceMissingRequiredFields({
    supplierName,
    invoiceNumber,
    clientName,
    issueDate,
    paymentDueDate,
    amount,
  });
  if (missingRequired.length > 0) {
    const rejectionReason = isProbablyContractOrNonInvoice(missingRequired)
      ? "missing_invoice_number_and_amount"
      : "missing_required_fields";
    await col("invoices").deleteOne({ document_id: documentId } as any);
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
      {
        $set: {
          invoice_saved: false,
          invoice_rejected: true,
          invoice_rejection_reason: rejectionReason,
          invoice_missing_fields: missingRequired,
          reminder_status: "not_applicable",
          updated_at: now,
        },
      },
    );
    logger.info("invoice_entity_skipped_missing_fields", {
      document_id: documentId,
      user_id: options.userId ?? null,
      missing_fields: missingRequired,
    });
    return false;
  }
  const invoiceFields: Record<string, unknown> = {
    ...(options.userId && { user_id: options.userId }),
    client_id: options.clientId ?? null,
    template_id: options.templateId ?? null,
    template_name: options.templateName ?? null,
    supplier_name: supplierName,
    supplier_id: firstInvoiceString(fields, ["supplier_id", "vendor_id", "business_id", "vat_id"]),
    invoice_number: invoiceNumber,
    document_subtype: firstInvoiceString(fields, ["document_subtype", "invoice_type", "receipt_type"]) ?? options.documentType ?? null,
    customer_number: firstInvoiceString(fields, ["customer_number", "account_customer_number"]),
    account_number: firstInvoiceString(fields, ["account_number", "contract_number"]),
    service_address: firstInvoiceString(fields, ["service_address", "site_address", "address"]),
    issue_date: issueDate,
    billing_period: firstInvoiceString(fields, ["billing_period", "period"]),
    billing_period_start: firstInvoiceString(fields, ["billing_period_start", "period_start"]),
    billing_period_end: firstInvoiceString(fields, ["billing_period_end", "period_end"]),
    payment_due_date: paymentDueDate,
    amount,
    amount_before_vat: parseInvoiceAmount(fields.amount_before_vat ?? fields.subtotal),
    vat_amount: parseInvoiceAmount(fields.vat_amount ?? fields.vat),
    currency: normalizeInvoiceCurrency(firstInvoiceString(fields, ["currency"])),
    payment_status: firstInvoiceString(fields, ["payment_status", "status"]),
    payment_method: firstInvoiceString(fields, ["payment_method"]),
    meter_number: firstInvoiceString(fields, ["meter_number"]),
    previous_reading: firstInvoiceString(fields, ["previous_reading"]),
    current_reading: firstInvoiceString(fields, ["current_reading"]),
    usage_quantity: firstInvoiceString(fields, ["usage_quantity", "consumption", "kwh"]),
    tariff_plan: firstInvoiceString(fields, ["tariff_plan"]),
    items: Array.isArray(fields.items) ? fields.items : [],
    notes: firstInvoiceString(fields, ["notes", "summary_hebrew", "summary"]),
    fields,
    updated_at: now,
  };
  if (clientName) {
    invoiceFields.client_company = clientName;
    invoiceFields.fields = {
      ...fields,
      client_company: fields.client_company ?? clientName,
      client_name: fields.client_name ?? clientName,
    };
  }

  await col("invoices").updateOne(
    { document_id: documentId } as any,
    {
      $set: invoiceFields,
      $setOnInsert: { document_id: documentId, created_at: now, status: "new" },
    } as any,
    { upsert: true },
  );

  await col("documents").updateOne(
    { _id: new ObjectId(documentId) } as any,
    {
      $set: {
        invoice_saved: true,
        invoice_rejected: false,
        invoice_rejection_reason: null,
        invoice_missing_fields: [],
        reminder_status: "not_applicable",
        updated_at: now,
      },
    },
  );
  return true;
}

function invoiceMissingRequiredFields(values: {
  supplierName: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDueDate: string | null;
  amount: number | null;
}): string[] {
  const missing: string[] = [];
  if (!values.supplierName) missing.push("supplier_name");
  if (!values.invoiceNumber) missing.push("invoice_number");
  if (!values.clientName) missing.push("client_company");
  if (!values.issueDate) missing.push("issue_date");
  if (!values.paymentDueDate) missing.push("payment_due_date");
  if (values.amount === null) missing.push("amount");
  return missing;
}

function isProbablyContractOrNonInvoice(missing: string[]): boolean {
  return missing.includes("invoice_number") && missing.includes("amount");
}

function extractInvoiceRecipientFromRawText(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const match = rawText.match(/(?:^|\n|\r)\s*לכבוד\s*:?\s*([^\n\r\t|:]{2,100})/m);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const compact = raw
    .replace(/\s{2,}/g, " ")
    .replace(/[,:;|\-]+$/g, "")
    .trim();
  const company = compact.match(/^(.+?בע["״']?מ)\b/);
  if (company?.[1]) return company[1].trim();
  return compact
    .replace(/\s+(?:לתשלום|תשלום|סה["״]?כ|עד|מספר|חשבון)\b.*$/, "")
    .trim() || null;
}

function normalizeInvoiceCurrency(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || /₪|ש"?ח|שקל|NIS|ILS/.test(text)) return "ILS";
  if (/\$|USD|DOLLAR/.test(text)) return "USD";
  if (/€|EUR/.test(text)) return "EUR";
  if (/£|GBP/.test(text)) return "GBP";
  return /^[A-Z]{3}$/.test(text) ? text : "ILS";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalise a company/person name for fuzzy dedup:
// lower-case, collapse whitespace, strip common legal suffixes and punctuation.
export function normalizeClientIdentityKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\/g, "")
    .replace(/[״“”׳‘’`'"]/g, "\"")
    .replace(/\b(?:ltd|inc|llc)\.?\b/gi, " ")
    .replace(/חברה\s+בע\s*"?\s*מ/g, " ")
    .replace(/בע\s*"?\s*מ/g, " ")
    .replace(/ב\s*ע\s*מ/g, " ")
    .replace(/בעמ/g, " ")
    // OCR sometimes turns בע"מ into מ"ע / מ״ע / מ׳׳ע.
    .replace(/(?:^|\s)מ\s*"?\s*ע\s*"?\s*מ?(?=\s|$)/g, " ")
    .replace(/^מגרש\s+(?=[א-ת])/, "")
    .replace(/[^\p{L}\p{N}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function legalSuffixPenalty(name: string): number {
  const normalized = name
    .toLowerCase()
    .replace(/[״“”׳‘’`'"]/g, "\"");
  if (/(?:^|\s)מ\s*"?\s*ע(?=\s|$)/.test(normalized)) return 20;
  if (/בע\s*"?\s*מ|ב\s*ע\s*מ|בעמ/.test(normalized)) return 5;
  return 0;
}

function chooseCanonicalClient(candidates: any[]): any | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const aName = String(a.display_name ?? "");
    const bName = String(b.display_name ?? "");
    const aScore =
      legalSuffixPenalty(aName) -
      (a.email ? 3 : 0) -
      (a.id_number ? 3 : 0) -
      (a.phone ? 1 : 0);
    const bScore =
      legalSuffixPenalty(bName) -
      (b.email ? 3 : 0) -
      (b.id_number ? 3 : 0) -
      (b.phone ? 1 : 0);
    if (aScore !== bScore) return aScore - bScore;
    return aName.length - bName.length;
  })[0] ?? null;
}

export function normalizePhoneIdentityKey(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("00972")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("972")) digits = `0${digits.slice(3)}`;
  return digits.length >= 7 ? digits : null;
}

export function shouldPromoteClientDisplayName(
  existing: { display_name?: unknown; entity_type?: unknown },
  incomingDisplayName: string,
  incomingEntityType: "company" | "person",
  contactPerson?: string | null,
  matchStrategy?: string | null
): boolean {
  if (incomingEntityType !== "company") return false;
  if (!["phone", "email", "id_number"].includes(matchStrategy ?? "")) return false;

  const existingRawName = String(existing.display_name ?? "").trim();
  const existingName = normalizeClientName(existingRawName);
  const incomingName = normalizeClientName(incomingDisplayName);
  if (!existingName || !incomingName) return false;
  if (existingName === incomingName) return existingRawName !== incomingName;

  const existingKey = normalizeClientIdentityKey(existingName);
  const incomingKey = normalizeClientIdentityKey(incomingName);
  if (existingKey === incomingKey) return false;

  if (matchStrategy === "phone") return true;

  const contact = contactPerson?.trim();
  if (existing.entity_type !== "company") return true;
  if (contact && existingName.includes(contact)) return true;
  if (/\d/.test(existingName) && !/\d/.test(incomingName)) return true;
  if (legalSuffixPenalty(existingName) > legalSuffixPenalty(incomingName)) return true;

  return false;
}

export function shouldPreferNamedClientOverPhoneMatch(
  phoneMatched: { display_name?: unknown; entity_type?: unknown },
  namedMatched: { display_name?: unknown; entity_type?: unknown },
  incomingDisplayName: string,
  contactPerson?: string | null,
  matchStrategy?: string | null
): boolean {
  if (matchStrategy !== "phone") return false;
  const incomingKey = normalizeClientIdentityKey(incomingDisplayName);
  const namedKey = normalizeClientIdentityKey(String(namedMatched.display_name ?? ""));
  if (!incomingKey || incomingKey !== namedKey) return false;
  return shouldPromoteClientDisplayName(phoneMatched, incomingDisplayName, "company", contactPerson, "phone");
}

interface ClientInput {
  displayName: string;
  entityType: "company" | "person";
  idNumber?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  userId?: string;
}

/**
/**
 * If the document has no email but the matched client does, copy the client's
 * email into extracted_fields so downstream contract/reminder creation can use it.
 */
async function backfillClientEmail(
  clientId: string | null,
  fields: Record<string, unknown>,
  documentId: string,
): Promise<void> {
  if (!clientId) return;
  const hasEmail = !!(fields.client_email || fields.contact_email || fields.email);
  if (hasEmail) return;
  try {
    const client = await col("clients").findOne({ _id: new ObjectId(clientId) } as any) as any;
    if (!client?.email) return;
    fields.client_email = client.email;
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
      { $set: { extracted_fields: JSON.stringify(fields), updated_at: new Date() } },
    );
    logger.info("backfilled_client_email_to_document", { document_id: documentId, client_id: clientId, email: client.email as string });
  } catch (err) {
    logger.warn("backfill_client_email_failed", { document_id: documentId, client_id: clientId, error: String(err) });
  }
}

/**
 * Find an existing client by id_number, phone, email, or normalised name — in that
 * priority order — then merge any new fields into it.  If no match is found,
 * insert a new client.  Returns the client's _id as a string.
 */
async function findOrCreateClient(input: ClientInput): Promise<string> {
  const { displayName, entityType, idNumber, contactPerson, email, phone, notes, userId } = input;
  const normalizedDisplayName = normalizeClientName(displayName);
  const normalizedPhone = normalizePhoneIdentityKey(phone);
  const normalizedNameKey = normalizeClientIdentityKey(normalizedDisplayName);
  const normalizedEmail = email?.trim() ? normalizeEmail(email) : null;
  const userScope = userId ? { user_id: userId } : {};
  const logMeta = {
    user_id: userId ?? null,
    display_name: normalizedDisplayName,
    entity_type: entityType,
    id_number: idNumber ?? null,
    email: normalizedEmail,
    phone: phone ?? null,
    phone_key: normalizedPhone,
    name_key: normalizedNameKey,
  };

  logger.info("client_find_or_create_started", logMeta);

  let existing: any = null;
  let matchStrategy: string | null = null;

  // 1. Strongest signal: government-issued id / company registration number
  if (idNumber) {
    existing = await col("clients").findOne({ ...userScope, id_number: idNumber }) as any;
    if (existing) {
      matchStrategy = "id_number";
      logger.info("client_matched", { ...logMeta, strategy: matchStrategy, client_id: existing._id?.toString() });
    }
  }

  // 2. Phone (normalised on both sides: 050-1234567, 050 1234567, +972501234567).
  // Phone is treated as the hard dedupe anchor because OCR often corrupts the
  // company name while keeping the phone number stable.
  // Also checks the `mobile` field to prevent duplicates when the same number
  // appears in either phone or mobile.
  if (!existing && phone) {
    if (normalizedPhone) {
      const all = await col("clients").find({
        ...userScope,
        $or: [
          { phone: { $exists: true, $ne: null } },
          { mobile: { $exists: true, $ne: null } },
        ],
      }).toArray() as any[];
      const matches = all.filter((c: any) =>
        normalizePhoneIdentityKey(c.phone) === normalizedPhone ||
        normalizePhoneIdentityKey(c.mobile) === normalizedPhone,
      );
      existing = chooseCanonicalClient(matches);
      if (existing) {
        matchStrategy = "phone";
        logger.info("client_matched", {
          ...logMeta,
          strategy: matchStrategy,
          client_id: existing._id?.toString(),
          match_count: matches.length,
          matched_display_name: existing.display_name ?? null,
        });
      }
    }
  }

  if (existing && entityType === "company" && normalizedNameKey.length >= 3) {
    const all = await col("clients").find(userScope).toArray() as any[];
    const nameMatches = all.filter((c: any) => normalizeClientIdentityKey(c.display_name ?? "") === normalizedNameKey);
    const namedExisting = chooseCanonicalClient(nameMatches);
    if (
      namedExisting &&
      String(namedExisting._id) !== String(existing._id) &&
      shouldPreferNamedClientOverPhoneMatch(existing, namedExisting, normalizedDisplayName, contactPerson, matchStrategy)
    ) {
      logger.info("client_match_promoted_to_named_company", {
        ...logMeta,
        phone_client_id: existing._id?.toString(),
        phone_display_name: existing.display_name ?? null,
        named_client_id: namedExisting._id?.toString(),
        named_display_name: namedExisting.display_name ?? null,
      });
      existing = namedExisting;
      matchStrategy = "normalized_name";
    }
  }

  // 2b. Email
  if (!existing && normalizedEmail) {
    existing = await col("clients").findOne({
      ...userScope,
      email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") },
    }) as any;
    if (!existing && email && email.trim().toLowerCase() !== normalizedEmail) {
      existing = await col("clients").findOne({
        ...userScope,
        email: { $regex: new RegExp(`^${escapeRegex(email.trim())}$`, "i") },
      }) as any;
    }
    if (existing) {
      matchStrategy = "email";
      logger.info("client_matched", { ...logMeta, strategy: matchStrategy, client_id: existing._id?.toString(), matched_display_name: existing.display_name ?? null });
    }
  }

  // 3. Normalised name match (strips בע"מ / punctuation / OCR legal suffixes).
  // This intentionally runs before exact-name matching so a previously-created
  // bad OCR variant does not keep attracting new contracts.
  if (!existing) {
    if (normalizedNameKey.length >= 3) {
      const all = await col("clients").find(userScope).toArray() as any[];
      const matches = all.filter((c: any) => normalizeClientIdentityKey(c.display_name ?? "") === normalizedNameKey);
      existing = chooseCanonicalClient(matches);
      if (existing) {
        matchStrategy = "normalized_name";
        logger.info("client_matched", {
          ...logMeta,
          strategy: matchStrategy,
          client_id: existing._id?.toString(),
          match_count: matches.length,
          matched_display_name: existing.display_name ?? null,
        });
      }
    }
  }

  // 4. Exact name fallback for names that do not produce a useful normalized key.
  if (!existing) {
    existing = await col("clients").findOne({
      ...userScope,
      display_name: { $regex: new RegExp(`^${escapeRegex(normalizedDisplayName)}$`, "i") },
    }) as any;
    if (existing) {
      matchStrategy = "exact_name";
      logger.info("client_matched", { ...logMeta, strategy: matchStrategy, client_id: existing._id?.toString(), matched_display_name: existing.display_name ?? null });
    }
  }

  if (existing) {
    const clientId = existing._id.toString();
    const shouldPromoteName = shouldPromoteClientDisplayName(
      existing,
      normalizedDisplayName,
      entityType,
      contactPerson,
      matchStrategy
    );
    const mergedNotes =
      notes && !(existing.notes ?? "").includes(notes)
        ? [existing.notes, notes].filter(Boolean).join("\n")
        : existing.notes;

    await col("clients").updateOne(
      { _id: existing._id },
      {
        $set: {
          ...(shouldPromoteName && { display_name: normalizedDisplayName, entity_type: entityType }),
          ...(normalizedEmail && existing.email !== normalizedEmail && { email: normalizedEmail }),
          ...(phone && !existing.phone && { phone }),
          ...(contactPerson && !existing.contact_person && { contact_person: contactPerson }),
          ...(idNumber && !existing.id_number && { id_number: idNumber }),
          ...(mergedNotes !== existing.notes && { notes: mergedNotes }),
          updated_at: new Date(),
        },
      }
    );
    logger.info("client_reused_from_document", {
      ...logMeta,
      client_id: clientId,
      matched_display_name: existing.display_name ?? null,
      promoted_display_name: shouldPromoteName ? normalizedDisplayName : null,
    });
    return clientId;
  }

  // No match — create new
  const r = await col("clients").insertOne({
    ...userScope,
    display_name: normalizedDisplayName,
    entity_type: entityType,
    contact_person: contactPerson ?? null,
    id_number: idNumber ?? null,
    email: normalizedEmail,
    phone: phone ?? null,
    notes: notes ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  } as any);
  logger.info("client_created_from_document", {
    ...logMeta,
    client_id: r.insertedId.toString(),
  });
  return r.insertedId.toString();
}
