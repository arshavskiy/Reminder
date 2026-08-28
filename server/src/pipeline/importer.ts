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
import {deleteFromSpaces, fileExistsInSpaces, getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces";
import {syncDocumentToDrive} from "../storage/gdrive";
import type {DocTemplate, DynamicExtraction} from "../../src/shared/types.js";
import {logger} from "../logger";
import {notifyDocumentUploaded, notifyExtractionFailed} from "../push/adminNotify";
import {generatePdfThumbnailForDocument} from "../documents/pdfThumbnail";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {incrementDocumentUsage, type DocumentUsageKind} from "../quotas/userUsageCounters";
import {
  assertDocumentImportQuota,
  type DocumentImportQuotaCategory,
  quotaCategoryFromTemplate,
} from "../quotas/documentImportQuota";
import {inferInvoiceCashFlow} from "../invoices/cashFlow";

type PushFn = (event: Record<string, unknown>) => void;

export interface PipelineOptions {
  skipAi?: boolean;        // skip all AI extraction
  skipEntities?: boolean;  // skip client/contract/equipment creation
  skipReminders?: boolean; // skip reminder generation
  startDelayMs?: number;   // optional batch pacing before background processing starts
  templateId?: string;     // force a specific doc_template instead of auto-detection
  storageKeyPrefix?: string; // optional S3 prefix for source-specific organization
  gmailProviderId?: string; // provider matched at Gmail import time, stored on the document
  gmailProviderCategory?: string; // that provider's category, recorded as data not as a key path
  gmailImport?: boolean;   // true when imported via Gmail — enables post-OCR inspection validation
  usageKind?: DocumentUsageKind; // lifetime usage counter bucket (survives deletes)
  waitForProcessing?: boolean; // await processing before returning the document id
  queueProcessing?: boolean; // enqueue processing in document_processing_jobs
  reprocessDuplicate?: boolean; // when dedup hits an existing document, enqueue it again with this pipeline
  processingJobContext?: {
    source?: "gmail" | "upload" | "drive" | string;
    gmailImportJobId?: string;
    gmailMessageId?: string;
    gmailFilename?: string;
  };
  quotaCategory?: DocumentImportQuotaCategory;
  skipQuotaCheck?: boolean;
}

type DocumentProcessingJobStatus = "queued" | "running" | "completed" | "failed" | "retry_wait";
type DocumentProcessingJob = {
  _id: ObjectId;
  user_id?: string | null;
  document_id: string;
  file_path: string;
  mime_type: string;
  ext: string;
  pipeline?: PipelineOptions;
  status: DocumentProcessingJobStatus;
  attempts: number;
  max_attempts: number;
  locked_at?: Date | null;
  locked_by?: string | null;
  next_run_at: Date;
  error_code?: string | null;
  error_message?: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date | null;
};

const DOCUMENT_PROCESSING_JOB_STALE_MS = 10 * 60 * 1000;
const DOCUMENT_PROCESSING_WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2)}`;
const ALWAYS_EXCLUDED_CLIENT_EMAILS = ["pechersky.m@gmail.com"];
let documentProcessingWorkerRunning = false;

type ClientEmailExclusionSource = {
  company_email?: unknown;
  personal_email?: unknown;
  email?: unknown;
};

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
  const docsDir = join(getDataDir(), "documents");
  const managedPath = join(docsDir, `${fileHash}${ext}`);

  // Dedup check — scoped to user if provided
  const dedupFilter: Record<string, any> = { file_hash: fileHash };
  if (userId) dedupFilter.user_id = userId;
  const existing = await col<any>("documents").findOne(dedupFilter);
  if (existing) {
    const existingDocumentId = existing._id!.toString();
    logger.info("document_import_duplicate", {
      document_id: existingDocumentId,
      user_id: userId ?? null,
      file_name: fileName,
    });
    if (pipeline?.queueProcessing && pipeline.reprocessDuplicate) {
      mkdirSync(docsDir, { recursive: true });
      if (!existsSync(managedPath)) {
        copyFileSync(originalPath, managedPath);
      }
      const existingFilePath = typeof existing.file_path === "string" && existsSync(existing.file_path)
        ? existing.file_path
        : managedPath;
      await col("documents").updateOne(
        { _id: existing._id } as any,
        {
          $set: {
            file_path: existingFilePath,
            mime_type: existing.mime_type ?? mimeType,
            processing_status: "queued",
            storage_status: "available",
            file_missing: false,
            error_message: null,
            updated_at: new Date(),
          },
          $unset: { drive_sync_error: "" },
        },
      );
      await enqueueDocumentProcessingJob({
        documentId: existingDocumentId,
        filePath: existingFilePath,
        mimeType: existing.mime_type ?? mimeType,
        ext,
        userId,
        pipeline: {
          ...pipeline,
          queueProcessing: false,
          waitForProcessing: false,
          reprocessDuplicate: false,
        },
      });
      startDocumentProcessingJobWorker();
      logger.info("document_import_duplicate_requeued", {
        document_id: existingDocumentId,
        user_id: userId ?? null,
        template_id: pipeline.templateId ?? null,
      });
    }
    return existingDocumentId;
  }

  if (userId && !pipeline?.skipQuotaCheck) {
    const user = await col<any>("users").findOne(
        {_id: new ObjectId(userId)} as any,
        {projection: {role: 1, plan: 1}} as any,
    );
    const category = await resolveImportQuotaCategory(pipeline);
    await assertDocumentImportQuota(
      userId,
      user?.plan ?? user?.role,
      1,
      category,
      pipeline?.gmailImport ? "email" : "manual",
    );
  }

  // Copy to managed documents folder
  mkdirSync(docsDir, { recursive: true });
  if (!existsSync(managedPath)) {
    copyFileSync(originalPath, managedPath);
  }

  // Upload to S3-compatible object storage if configured
  let spacesKey: string | null = null;
  let spacesUrl: string | null = null;
  let downloadUrl: string | null = null;
  const SIGNED_URL_TTL = 7 * 24 * 3600; // 7 days
  // Resolved before the upload because it decides both whether the file goes to
  // cloud storage and what document_kind the row is created with.
  const intendedKind = await intendedDocumentKind(pipeline);
  const cloudStorageAllowed = await userAllowsCloudStorage(userId, intendedKind);
  if (spacesEnabled() && cloudStorageAllowed) {
    try {
      spacesKey = buildStorageKey(userId, pipeline?.storageKeyPrefix, fileHash, ext);
      spacesUrl = await uploadToSpaces(managedPath, spacesKey, mimeType);
      downloadUrl = await getSpacesSignedUrl(spacesKey, SIGNED_URL_TTL, fileName);
      logger.info("document_storage_uploaded", { user_id: userId ?? null, spaces_key: spacesKey });
    } catch (err) {
      logger.error("document_storage_upload_failed", { user_id: userId ?? null, file_name: fileName, error: err });
      spacesKey = null;
      spacesUrl = null;
      downloadUrl = null;
      if (pipeline?.gmailImport) {
        throw new Error(`storage_failed: ${err}`);
      }
    }
  } else if (spacesEnabled() && !cloudStorageAllowed) {
    logger.info("document_storage_skipped_by_setting", {
      user_id: userId ?? null,
      file_name: fileName,
      document_kind: intendedKind,
    });
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
  // Kept separate from document_source ("scanned" | "generated"), which drives
  // capability checks such as whether a document can be re-extracted. This
  // records where the file came in from, purely for provenance and display.
  docRecord.import_source = pipeline?.gmailImport
    ? "gmail"
    : (pipeline?.processingJobContext?.source === "drive" ? "drive" : "upload");
  if (pipeline?.gmailProviderId) docRecord.gmail_provider_id = pipeline.gmailProviderId;
  if (pipeline?.gmailProviderCategory) docRecord.gmail_provider_category = pipeline.gmailProviderCategory;
  docRecord.ai_extracted = !pipeline?.skipAi;

  // Provisional kind from the import intent, so list filters (which hide
  // invoices and certificates) work while the document is still queued.
  // classifyDocumentKind() overwrites this once text extraction runs; until
  // then document_kind would be null and an invoice would surface in the
  // documents list. Derived from the chosen template, never from the file path.
  if (intendedKind) docRecord.document_kind = intendedKind;

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

  if (pipeline?.queueProcessing) {
    await enqueueDocumentProcessingJob({
      documentId,
      filePath: managedPath,
      mimeType,
      ext,
      userId,
      pipeline: {
        ...pipeline,
        queueProcessing: false,
        waitForProcessing: false,
      },
    });
    startDocumentProcessingJobWorker();
    const queueDelayMs = Number(pipeline.startDelayMs ?? 0);
    if (Number.isFinite(queueDelayMs) && queueDelayMs > 0) {
      setTimeout(startDocumentProcessingJobWorker, queueDelayMs + 250);
    }
    return documentId;
  }

  const startProcessing = async () => processDocument(documentId, managedPath, mimeType, ext, push, userId, pipeline).catch(async (err) => {
    logger.error("document_processing_failed", { document_id: documentId, user_id: userId ?? null, error: err });
    await col("documents").updateOne(
      { _id: insertResult.insertedId },
      { $set: retryableDocumentError(String(err), "processing_failed") }
    );
    notifyExtractionFailed({ fileName, error: String(err) });
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: String(err) });
  });

  const startDelayMs = Number(pipeline?.startDelayMs ?? 0);
  if (pipeline?.waitForProcessing) {
    if (Number.isFinite(startDelayMs) && startDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, startDelayMs));
    }
    await startProcessing();
  } else if (Number.isFinite(startDelayMs) && startDelayMs > 0) {
    setTimeout(startProcessing, startDelayMs);
  } else {
    void startProcessing();
  }

  return documentId;
}

/**
 * Object storage key layout — tenant first, so a single prefix scan lists one
 * user's files and per-user IAM scoping stays expressible:
 *
 *   {user_id}/invoices/gmail/{hash}{ext}      invoice imported from Gmail
 *   {user_id}/invoices/uploaded/{hash}{ext}   invoice uploaded by the user
 *   {user_id}/documents/{hash}{ext}           everything else
 *
 * Provider/category deliberately stay out of the key: they are mutable metadata
 * (a vendor gets recategorized) while an S3 key is immutable, so encoding them
 * here made the folder tree drift from the DB. Filter by category in Mongo.
 */
/**
 * The document kind implied by the import request itself, before any text has
 * been read. Only returns a value when the caller chose a template that pins
 * the kind — an untyped upload stays null so classification decides.
 */
/**
 * Whether this user wants documents of this kind kept in object storage.
 *
 * Opting out keeps the file on the server's disk only, which on an ephemeral
 * container means it is lost on redeploy — so the toggles default to on and an
 * unset value is treated as enabled. Only invoices and inspection reports are
 * configurable; everything else always uses cloud storage.
 */
async function userAllowsCloudStorage(userId: string | undefined, kind: string | null): Promise<boolean> {
  if (!userId) return true;
  if (kind !== "invoice" && kind !== "inspection_report") return true;

  const settings = await col<any>("user_settings").findOne(
    { user_id: userId } as any,
    { projection: { s3_store_invoices: 1, s3_store_inspection_reports: 1 } } as any,
  );
  if (!settings) return true;

  const flag = kind === "invoice"
    ? settings.s3_store_invoices
    : settings.s3_store_inspection_reports;
  return flag !== false;
}

async function resolveImportQuotaCategory(pipeline?: PipelineOptions): Promise<DocumentImportQuotaCategory> {
  if (pipeline?.quotaCategory) return pipeline.quotaCategory;
  if (pipeline?.templateId) {
    const template = await loadTemplate(pipeline.templateId).catch(() => null);
    return quotaCategoryFromTemplate(template);
  }
  const kind = await intendedDocumentKind(pipeline);
  if (kind === "invoice") return "invoices";
  if (kind === "inspection_report") return "contracts";
  return "documents";
}

async function intendedDocumentKind(pipeline?: PipelineOptions): Promise<string | null> {
  if (!pipeline?.templateId) return null;
  const template = await loadTemplate(pipeline.templateId).catch(() => null);
  if (!template) return null;
  if (isInvoiceTemplate(template)) return "invoice";
  if (isInspectionTemplate(template)) return "inspection_report";
  return null;
}

export function buildStorageKey(
  userId: string | undefined,
  storageKeyPrefix: string | null | undefined,
  fileHash: string,
  ext: string,
): string {
  const prefix = normalizeStorageKeyPrefix(storageKeyPrefix) ?? "documents";
  if (!userId) return `${prefix}/${fileHash}${ext}`;
  return `${userId}/${prefix}/${fileHash}${ext}`;
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

async function enqueueDocumentProcessingJob(input: {
  documentId: string;
  filePath: string;
  mimeType: string;
  ext: string;
  userId?: string;
  pipeline?: PipelineOptions;
}): Promise<void> {
  const now = new Date();
  const delayMs = Number(input.pipeline?.startDelayMs ?? 0);
  const nextRunAt = Number.isFinite(delayMs) && delayMs > 0
    ? new Date(Date.now() + delayMs)
    : now;
  await col<DocumentProcessingJob>("document_processing_jobs").updateOne(
    { document_id: input.documentId } as any,
    {
      // Only fields NOT present in $set may appear here: MongoDB rejects the
      // whole update with "would create a conflict at '<path>'" if a path is
      // named by both operators, which failed every upload that enqueued a job.
      $setOnInsert: {
        user_id: input.userId ?? null,
        document_id: input.documentId,
        attempts: 0,
        max_attempts: 3,
        created_at: now,
      },
      $set: {
        file_path: input.filePath,
        mime_type: input.mimeType,
        ext: input.ext,
        pipeline: input.pipeline,
        status: "queued",
        locked_at: null,
        locked_by: null,
        error_code: null,
        error_message: null,
        completed_at: null,
        next_run_at: nextRunAt,
        updated_at: now,
      },
    } as any,
    { upsert: true },
  );
}

export function startDocumentProcessingJobWorker(): void {
  if (documentProcessingWorkerRunning) return;
  documentProcessingWorkerRunning = true;
  void processDocumentProcessingJobs().finally(() => {
    documentProcessingWorkerRunning = false;
  });
}

async function processDocumentProcessingJobs(): Promise<void> {
  await recoverStaleDocumentProcessingJobs();
  while (true) {
    const job = await claimNextDocumentProcessingJob();
    if (!job) return;
    await runDocumentProcessingJob(job);
  }
}

async function recoverStaleDocumentProcessingJobs(): Promise<void> {
  await col<DocumentProcessingJob>("document_processing_jobs").updateMany(
    { status: "retry_wait", next_run_at: { $lte: new Date() } } as any,
    { $set: { status: "queued", updated_at: new Date() } } as any,
  );
  const staleBefore = new Date(Date.now() - DOCUMENT_PROCESSING_JOB_STALE_MS);
  const result = await col<DocumentProcessingJob>("document_processing_jobs").updateMany(
    { status: "running", locked_at: { $lt: staleBefore } } as any,
    {
      $set: {
        status: "queued",
        locked_at: null,
        locked_by: null,
        updated_at: new Date(),
      },
    } as any,
  );
  if (result.modifiedCount) {
    logger.warn("document_processing_jobs_requeued_stale", { count: result.modifiedCount });
  }
}

async function claimNextDocumentProcessingJob(): Promise<DocumentProcessingJob | null> {
  const now = new Date();
  return await col<DocumentProcessingJob>("document_processing_jobs").findOneAndUpdate(
    { status: "queued", next_run_at: { $lte: now } } as any,
    {
      $set: {
        status: "running",
        locked_at: now,
        locked_by: DOCUMENT_PROCESSING_WORKER_ID,
        updated_at: now,
      },
      $inc: { attempts: 1 },
    } as any,
    { sort: { created_at: 1 }, returnDocument: "after" },
  ) as DocumentProcessingJob | null;
}

/**
 * Resolves the file for a processing job in the current environment. Prefers
 * the document's own storage record (local candidates, then object storage) and
 * only falls back to the path stored on the job when the document row is gone.
 */
async function resolveJobFilePath(job: DocumentProcessingJob): Promise<string> {
  const doc = await col<any>("documents").findOne(
    { _id: new ObjectId(job.document_id) } as any,
    { projection: { file_path: 1, file_hash: 1, mime_type: 1, spaces_key: 1 } } as any,
  );
  if (doc) return await resolveDocumentFilePath(doc);
  if (job.file_path) return job.file_path;
  throw new Error(`Cannot resolve file for document ${job.document_id}`);
}

async function runDocumentProcessingJob(job: DocumentProcessingJob): Promise<void> {
  try {
    // Resolve the file here rather than trusting job.file_path: that value was
    // recorded when the job was enqueued, possibly by a different machine, and
    // an absolute path is only meaningful in the environment that produced it.
    // resolveDocumentFilePath falls back to object storage, so this works in
    // any environment as long as the document has a spaces_key.
    const filePath = await resolveJobFilePath(job);
    await processDocument(
      job.document_id,
      filePath,
      job.mime_type,
      job.ext,
      undefined,
      job.user_id ?? undefined,
      job.pipeline,
    );
    const retryState = await documentProcessingRetryState(job.document_id);
    if (retryState.status === "error") {
      await updateGmailImportFromDocumentProcessingJob(job);
      const attempts = Number(job.attempts ?? 1);
      const maxAttempts = Number(job.max_attempts ?? 3);
      const retryable = retryState.retryable && attempts < maxAttempts;
      const retryDelayMs = Math.min(60_000 * attempts, 5 * 60_000);
      await col<DocumentProcessingJob>("document_processing_jobs").updateOne(
        { _id: job._id } as any,
        {
          $set: {
            status: retryable ? "retry_wait" : "failed",
            locked_at: null,
            locked_by: null,
            next_run_at: retryable ? new Date(Date.now() + retryDelayMs) : new Date(),
            error_code: retryState.reason,
            error_message: retryState.message,
            updated_at: new Date(),
          },
        } as any,
      );
      if (retryable) setTimeout(startDocumentProcessingJobWorker, retryDelayMs + 250);
      return;
    }
    await updateGmailImportFromDocumentProcessingJob(job);
    await col<DocumentProcessingJob>("document_processing_jobs").updateOne(
      { _id: job._id } as any,
      {
        $set: {
          status: "completed",
          locked_at: null,
          locked_by: null,
          error_code: null,
          error_message: null,
          completed_at: new Date(),
          updated_at: new Date(),
        },
      } as any,
    );
  } catch (err) {
    const message = String(err);
    const reason = retryReasonFromError(message);
    const attempts = Number(job.attempts ?? 1);
    const maxAttempts = Number(job.max_attempts ?? 3);
    const retryable = attempts < maxAttempts;
    const retryDelayMs = Math.min(60_000 * attempts, 5 * 60_000);
    await col("documents").updateOne(
      { _id: new ObjectId(job.document_id) } as any,
      { $set: retryableDocumentError(message, reason) },
    );
    await updateGmailImportFromDocumentProcessingJob(job, message, reason);
    await col<DocumentProcessingJob>("document_processing_jobs").updateOne(
      { _id: job._id } as any,
      {
        $set: {
          status: retryable ? "retry_wait" : "failed",
          locked_at: null,
          locked_by: null,
          next_run_at: retryable ? new Date(Date.now() + retryDelayMs) : new Date(),
          error_code: reason,
          error_message: message,
          updated_at: new Date(),
        },
      } as any,
    );
    if (retryable) setTimeout(startDocumentProcessingJobWorker, retryDelayMs + 250);
  }
}

async function documentProcessingRetryState(documentId: string): Promise<{
  status: "ok" | "error";
  retryable: boolean;
  reason: string | null;
  message: string | null;
}> {
  if (!ObjectId.isValid(documentId)) return { status: "ok", retryable: false, reason: null, message: null };
  const doc = await col("documents").findOne(
    { _id: new ObjectId(documentId) } as any,
    { projection: { processing_status: 1, processing_retryable: 1, retry_reason: 1, error_message: 1 } } as any,
  ) as any;
  if (doc?.processing_status !== "error") return { status: "ok", retryable: false, reason: null, message: null };
  return {
    status: "error",
    retryable: doc.processing_retryable !== false,
    reason: String(doc.retry_reason ?? retryReasonFromError(doc.error_message)),
    message: doc.error_message ?? null,
  };
}

async function updateGmailImportFromDocumentProcessingJob(
  job: DocumentProcessingJob,
  errorMessage?: string,
  errorReason?: string,
): Promise<void> {
  const context = job.pipeline?.processingJobContext;
  const gmailJobId = context?.gmailImportJobId;
  if (!gmailJobId || !ObjectId.isValid(gmailJobId)) return;

  const result = await gmailProcessingResult(job, errorMessage, errorReason);
  const setFields: Record<string, unknown> = {
    "results.$[item].import_status": result.importStatus,
    "results.$[item].retryable": result.retryable,
    "results.$[item].rejection_reason": result.rejectionReason,
    "results.$[item].rejection_label": result.rejectionLabel,
    "results.$[item].error": result.error,
    "results.$[item].ocr_failed": result.ocrFailed,
    updated_at: new Date(),
  };
  const inc: Record<string, number> = {};
  if (result.importStatus === "invoice") inc.classified_invoices = 1;
  if (result.importStatus === "rejected") inc.rejected = 1;
  if (result.ocrFailed) inc.ocr_failed = 1;
  if (result.aiRetryPending) inc.ai_retry_pending = 1;

  await col("gmail_import_jobs").updateOne(
    { _id: new ObjectId(gmailJobId) } as any,
    {
      $set: setFields,
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    } as any,
    { arrayFilters: [{ "item.documentId": job.document_id }] } as any,
  );
}

async function gmailProcessingResult(
  job: DocumentProcessingJob,
  errorMessage?: string,
  errorReason?: string,
): Promise<{
  importStatus: string;
  retryable: boolean;
  rejectionReason: string | null;
  rejectionLabel: string | null;
  error: string | null;
  ocrFailed: boolean;
  aiRetryPending: boolean;
}> {
  if (errorMessage) {
    const reason = errorReason ?? retryReasonFromError(errorMessage);
    return {
      importStatus: reason === "ocr_unreadable" ? "ocr_failed" : "failed",
      retryable: true,
      rejectionReason: reason,
      rejectionLabel: retryableProcessingLabel(reason, errorMessage),
      error: errorMessage,
      ocrFailed: reason === "ocr_unreadable",
      aiRetryPending: reason === "ai_rate_limited" || reason === "ai_extraction_failed",
    };
  }

  const [doc, invoice] = await Promise.all([
    col("documents").findOne(
      { _id: new ObjectId(job.document_id) } as any,
      { projection: { processing_status: 1, error_message: 1, invoice_rejected: 1, invoice_rejection_reason: 1, invoice_rejection_label: 1, retry_reason: 1, retry_label: 1, ocr_retryable: 1 } } as any,
    ) as Promise<any>,
    col("invoices").findOne(
      { document_id: { $in: [job.document_id, new ObjectId(job.document_id)] } } as any,
      { projection: { _id: 1, invoice_rejection_reason: 1, invoice_rejection_label: 1, possible_not_invoice: 1, missing_required_fields: 1 } } as any,
    ) as Promise<any>,
  ]);
  if (doc?.processing_status === "error") {
    const reason = String(doc.retry_reason ?? doc.invoice_rejection_reason ?? retryReasonFromError(doc.error_message));
    return {
      importStatus: reason === "ocr_unreadable" ? "ocr_failed" : "failed",
      retryable: true,
      rejectionReason: reason,
      rejectionLabel: doc.retry_label ?? doc.invoice_rejection_label ?? retryableProcessingLabel(reason, doc.error_message),
      error: doc.error_message ?? null,
      ocrFailed: reason === "ocr_unreadable",
      aiRetryPending: reason === "ai_rate_limited" || reason === "ai_extraction_failed",
    };
  }
  if (doc?.invoice_rejected === true || invoice?.possible_not_invoice === true || Array.isArray(invoice?.missing_required_fields) && invoice.missing_required_fields.length > 0) {
    return {
      importStatus: "rejected",
      retryable: true,
      rejectionReason: invoice?.invoice_rejection_reason ?? doc?.invoice_rejection_reason ?? "rejected",
      rejectionLabel: invoice?.invoice_rejection_label ?? doc?.invoice_rejection_label ?? "המסמך נדחה כחשבונית",
      error: null,
      ocrFailed: Boolean(doc?.ocr_retryable),
      aiRetryPending: false,
    };
  }
  return {
    importStatus: invoice?._id ? "invoice" : "stored",
    retryable: false,
    rejectionReason: null,
    rejectionLabel: null,
    error: null,
    ocrFailed: false,
    aiRetryPending: false,
  };
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

function retryableDocumentError(error: string, reason: string): Record<string, unknown> {
  const label = retryableProcessingLabel(reason, error);
  return {
    processing_status: "error",
    error_message: error,
    processing_retryable: true,
    retry_reason: reason,
    retry_label: label,
    invoice_rejection_reason: reason,
    invoice_rejection_label: label,
    updated_at: new Date(),
  };
}

function retryableProcessingLabel(reason: string, error = ""): string {
  const labels: Record<string, string> = {
    ocr_unreadable: "OCR לא הצליח לקרוא את המסמך",
    ai_rate_limited: "חילוץ AI נכשל בגלל מגבלת בקשות זמנית",
    ai_extraction_failed: "חילוץ AI נכשל",
    storage_failed: "שמירת הקובץ באחסון נכשלה",
    processing_failed: "עיבוד המסמך נכשל",
  };
  if (reason === "ai_extraction_failed" && /429|rate.?limit/i.test(error)) return labels.ai_rate_limited;
  return labels[reason] ?? "המסמך ממתין לניסיון חוזר";
}

function retryReasonFromError(error: unknown, fallback = "processing_failed"): string {
  const text = String(error ?? "");
  if (/429|rate.?limit/i.test(text)) return "ai_rate_limited";
  if (/AI extraction failed|OpenAI|ai_extraction/i.test(text)) return "ai_extraction_failed";
  if (/OCR|ocr|Text extraction|read image|pdftoppm|tesseract/i.test(text)) return "ocr_unreadable";
  if (/storage|S3|upload/i.test(text)) return "storage_failed";
  return fallback;
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
  let textSource: "native" | "ocr" | "file" = "file";
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
        textSource = "ocr";
      } else {
        rawText = pdfResult.text;
        textSource = "native";
      }
    } else if (mimeType.startsWith("image/")) {
      push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 25 });
      rawText = await ocrFile(filePath);
      textSource = "ocr";
    } else if (ext === ".docx") {
      rawText = await parseDocx(filePath);
    } else if (ext === ".xlsx") {
      rawText = parseXlsx(filePath);
    } else {
      rawText = readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    if (pipeline?.gmailImport && forcedTemplate && isInvoiceTemplate(forcedTemplate)) {
      const reason = retryReasonFromError(err, "ocr_unreadable");
      const msg = `Text extraction failed: ${err}`;
      logger.info("gmail_import_invoice_text_extraction_failed_skipped", {
        document_id: documentId,
        user_id: userId ?? null,
        template_id: forcedTemplate.id ?? pipeline.templateId ?? null,
        template_name: forcedTemplate.name,
        error: String(err),
        retry_reason: reason,
      });
      await col("documents").updateOne(docFilter, {
        $set: retryableDocumentError(msg, reason),
      });
      push?.({
        type: "document:done",
        documentId: documentId as any,
        status: "error",
        reason,
        error: msg,
      });
      return;
    }
    const msg = `Text extraction failed: ${err}`;
    await col("documents").updateOne(docFilter, {
      $set: retryableDocumentError(msg, retryReasonFromError(err, "ocr_unreadable")),
    });
    const failedDoc = await col("documents").findOne(docFilter, { projection: { file_name: 1 } } as any) as any;
    notifyExtractionFailed({ fileName: failedDoc?.file_name ?? documentId, error: msg });
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
    return;
  }

  await col("documents").updateOne(docFilter, {
    $set: { raw_text: rawText, text_extraction_source: textSource, page_count: pageCount, processing_status: "processing", updated_at: new Date() },
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
        let extractionText = rawText;
        let run = await extractWithTemplate(extractionText, template, documentId, docRow?.file_name, inspector as any, systemPrompt);
        let normalizedFields = normalizeExtractionFieldsForTemplate(extractionText, template, run.fields, inspector);
        const shouldTryOcrForInvoice = pipeline?.gmailImport
          && isInvoiceTemplate(template)
          && mimeType === "application/pdf"
          && textSource === "native"
          && normalizedFields
          && invoiceMissingRequiredFieldsFromFields(normalizedFields, extractionText).length > 0;
        if (shouldTryOcrForInvoice && normalizedFields) {
          try {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 62 });
            const ocrText = await ocrFile(filePath);
            const ocrRun = await extractWithTemplate(ocrText, template, documentId, docRow?.file_name, inspector as any, systemPrompt);
            const ocrFields = normalizeExtractionFieldsForTemplate(ocrText, template, ocrRun.fields, inspector);
            const nativeMissing = invoiceMissingRequiredFieldsFromFields(normalizedFields, extractionText);
            const ocrMissing = ocrFields ? invoiceMissingRequiredFieldsFromFields(ocrFields, ocrText) : nativeMissing;
            await col("documents").updateOne(docFilter, {
              $set: {
                ocr_text: ocrText,
                ocr_attempted: true,
                ocr_reason: "invoice_required_fields_missing",
                updated_at: new Date(),
              },
            });
            logger.info("gmail_invoice_ocr_second_pass_completed", {
              document_id: documentId,
              user_id: userId ?? null,
              template_id: template.id ?? null,
              native_missing_fields: nativeMissing,
              ocr_missing_fields: ocrMissing,
              ocr_fields_extracted: ocrFields ? Object.keys(ocrFields).length : 0,
            });
            if (ocrFields && ocrMissing.length < nativeMissing.length) {
              extractionText = ocrText;
              run = ocrRun;
              normalizedFields = ocrFields;
              textSource = "ocr";
            }
          } catch (ocrErr) {
            await col("documents").updateOne(docFilter, {
              $set: {
                ocr_attempted: true,
                ocr_retryable: true,
                ocr_error: String(ocrErr),
                retry_reason: "ocr_unreadable",
                retry_label: retryableProcessingLabel("ocr_unreadable", String(ocrErr)),
                updated_at: new Date(),
              },
            });
            logger.warn("gmail_invoice_ocr_second_pass_failed", {
              document_id: documentId,
              user_id: userId ?? null,
              template_id: template.id ?? null,
              error: String(ocrErr),
            });
          }
        }

        await col("extractions").insertOne({
          document_id: documentId,
          backend: run.backend,
          model: run.model,
          result_json: parseJsonObject(run.rawJson, normalizedFields),
          raw_text: extractionText,
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
              text_extraction_source: textSource,
              updated_at: new Date(),
            },
          });

          if (!pipeline?.skipEntities) {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
            await saveTemplateEntities(documentId, template, normalizedFields, userId, pipeline?.skipReminders, extractionText);
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
            const msg = `AI extraction failed: ${run.error}`;
            const reason = retryReasonFromError(msg, "ai_extraction_failed");
            logger.info("gmail_import_invoice_extraction_failed_skipped", {
              document_id: documentId,
              user_id: userId ?? null,
              template_id: template.id ?? null,
              template_name: template.name,
              error: run.error,
              retry_reason: reason,
            });
            await col("documents").updateOne(docFilter, {
              $set: retryableDocumentError(msg, reason),
            });
            push?.({ type: "document:done", documentId: documentId as any, status: "error", reason, error: msg });
            return;
          }
          const msg = `AI extraction failed: ${run.error}`;
          await col("documents").updateOne(docFilter, {
            $set: retryableDocumentError(msg, retryReasonFromError(msg, "ai_extraction_failed")),
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
            $set: retryableDocumentError(msg, retryReasonFromError(msg, "ai_extraction_failed")),
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
    // Awaited so the local cache cleanup below cannot delete the file out from
    // under the Drive upload's read stream. Failures stay non-fatal.
    await syncDocumentToDrive(documentId, userId).catch((err) => {
      logger.error("drive_sync_post_processing_failed", {document_id: documentId, user_id: userId, error: err});
    });
  }
  await releaseLocalDocumentCache(documentId, filePath, userId);
  push?.({ type: "document:done", documentId: documentId as any, status: "done" });
  logger.info("document_processing_completed", { document_id: documentId, user_id: userId ?? null });
}

/**
 * Drops the managed local copy once the document is durably in object storage.
 *
 * The local file under {dataDir}/documents is only needed while importing: the
 * S3 upload, the OCR/PDF binaries and the Drive upload all take a filesystem
 * path. After that it is a cache, and nothing ever evicted it, so the directory
 * grew one copy of every file ever imported — a full duplicate of the bucket.
 *
 * Every later reader goes through resolveDocumentFilePath(), which falls back to
 * object storage, so removing the copy costs at most one download. When object
 * storage is not configured (pure local dev) the file on disk IS the document,
 * so it is kept.
 */
async function releaseLocalDocumentCache(
  documentId: string,
  filePath: string,
  userId?: string,
): Promise<void> {
  if (!spacesEnabled()) return;
  const docsDir = join(getDataDir(), "documents");
  // Only ever remove files we manage: never the caller's original upload, and
  // never a temp file object storage downloaded for this run.
  if (!filePath.startsWith(docsDir)) return;

  const doc = await col<any>("documents").findOne(
    { _id: new ObjectId(documentId) } as any,
    { projection: { spaces_key: 1 } } as any,
  );
  if (!doc?.spaces_key) return; // never uploaded — the local copy is all there is
  if (!await fileExistsInSpaces(doc.spaces_key)) {
    logger.warn("document_local_cache_kept_missing_in_storage", {
      document_id: documentId,
      user_id: userId ?? null,
      spaces_key: doc.spaces_key,
    });
    return;
  }

  try {
    unlinkSync(filePath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      logger.warn("document_local_cache_release_failed", { document_id: documentId, error: err });
    }
  }
}

async function saveExtractionEntities(
  documentId: string,
  result: import("../../src/shared/types.js").ExtractionResult,
  userId?: string,
  skipReminders?: boolean,
  rawText?: string,
) {
  await stripExcludedClientEmailsForUser(result as unknown as Record<string, unknown>, userId);

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

  if (isInvoiceLikeDocument(result.document_type)) {
    await col("document_clients").deleteMany({ document_id: documentId } as any);
    const invoiceSaved = await saveInvoiceRecord(documentId, result as unknown as Record<string, unknown>, {
      userId,
      clientId: null,
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
  fields: DynamicExtraction | null,
  inspector?: ClientEmailExclusionSource | null
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
  stripExcludedClientEmails(normalized, buildExcludedClientEmailSet(inspector));
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

function buildExcludedClientEmailSet(source?: ClientEmailExclusionSource | null): Set<string> {
  const excluded = new Set<string>();
  for (const email of ALWAYS_EXCLUDED_CLIENT_EMAILS) {
    excluded.add(normalizeEmail(email));
  }
  for (const value of [source?.company_email, source?.personal_email, source?.email]) {
    if (typeof value !== "string" || !value.trim()) continue;
    excluded.add(normalizeEmail(value));
  }
  return excluded;
}

function stripExcludedClientEmails(fields: Record<string, unknown>, excludedEmails: Set<string>): void {
  if (!excludedEmails.size) return;
  for (const key of ["client_email", "contact_email", "email"]) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (excludedEmails.has(normalizeEmail(value))) {
      fields[key] = null;
    }
  }
}

async function stripExcludedClientEmailsForUser(fields: Record<string, unknown>, userId?: string): Promise<void> {
  const sources: ClientEmailExclusionSource[] = [];
  if (userId) {
    const [engineerProfile, userRow] = await Promise.all([
      col("engineer_profiles").findOne({ user_id: userId }) as Promise<any>,
      ObjectId.isValid(userId)
        ? col("users").findOne({ _id: new ObjectId(userId) as any }) as Promise<any>
        : Promise.resolve(null),
    ]);
    sources.push(engineerProfile ?? {});
    sources.push({
      email: userRow?.email ?? null,
      personal_email: userRow?.email ?? null,
    });
  }
  const excluded = sources.reduce((set, source) => {
    for (const email of buildExcludedClientEmailSet(source)) set.add(email);
    return set;
  }, buildExcludedClientEmailSet());
  stripExcludedClientEmails(fields, excluded);
}

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
  await stripExcludedClientEmailsForUser(fields, userId);
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

  if (isInvoiceTemplate(template)) {
    await col("document_clients").deleteMany({ document_id: documentId } as any);
    const invoiceSaved = await saveInvoiceRecord(documentId, fields, {
      userId,
      clientId: null,
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
  return extractHotInvoiceFields(rawText, fileName)
    ?? extractGettReceiptFields(rawText, fileName)
    ?? extractIsraelElectricReceiptFields(rawText, fileName)
    ?? extractGitHubReceiptFields(rawText, fileName)
    ?? extractRailwayReceiptFields(rawText, fileName)
    ?? extractVercelReceiptFields(rawText, fileName);
}

function extractIsraelElectricReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!/חברת\s+החשמל\s+לישראל|iec\.co\.il|חח["׳']י/.test(text) && !/iec|electric/.test(nameLower)) return null;
  if (!/קבלה|מספר\s+קבלה|חשבונית/.test(text)) return null;

  const receiptNumber =
    matchFirst(text, /מספר\s+קבלה\s*[-–]?\s*מקור\s+(\d{6,20})/) ??
    matchFirst(text, /מספר\s+קבלה\s*[:：-]?\s*(\d{6,20})/) ??
    matchFirst(text, /\b(3\d{9,14})\b/);
  const contractAccount =
    matchFirst(text, /מספר\s+חשבון\s+חוזה\s+(\d{6,20})/) ??
    matchFirst(text, /חשבון\s+חוזה\s+(\d{6,20})/);
  const companyNumber =
    matchFirst(text, /מספר\s+חברה\s+(\d{6,20})/) ??
    matchFirst(text, /מורשה\s+באיחוד\s+עוסקים\s+מס['׳]?\s*(\d{6,20})/);
  const clientCompany = extractIsraelElectricClientName(text);
  const issueDate =
    parseIsraeliDate(matchFirst(text, /תאריך\s+תשלום\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)) ??
    parseIsraeliDate(matchFirst(text, /כרטיס\s+אשראי\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)) ??
    parseIsraeliDate(matchFirst(text, /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/));
  const amount =
    parseInvoiceAmount(matchFirst(text, /סה["״]?כ\s+לתשלום\s*\(ש["״]?ח\)\s*([\d,.]+)/)) ??
    parseInvoiceAmount(matchFirst(text, /סה["״]?כ\s+לתשלום[^\d]{0,20}([\d,.]+)/)) ??
    parseInvoiceAmount(matchFirst(text, /(?:סכום|סה["״]?כ)\s+([\d,.]+)\s*$/m)) ??
    extractIsraelElectricAmount(text);
  const paymentMethod = /כרטיס\s+אשראי/.test(text) ? "כרטיס אשראי" : null;
  const cardLast4 = matchFirst(text, /מספר\s+כרטיס\s+אשראי\s+(\d{3,4})/) ?? matchFirst(text, /\b(\d{4})\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);

  if (!receiptNumber || !contractAccount || !clientCompany || !issueDate || amount === null) return null;

  return {
    supplier_name: "חברת החשמל לישראל בע\"מ",
    supplier_id: companyNumber ?? "520000472",
    invoice_number: receiptNumber,
    receipt_number: receiptNumber,
    document_subtype: "קבלה",
    client_company: clientCompany,
    client_name: clientCompany,
    customer_number: contractAccount,
    account_number: contractAccount,
    issue_date: issueDate,
    payment_due_date: issueDate,
    amount,
    amount_before_vat: amount,
    vat_amount: 0,
    currency: "ILS",
    payment_status: "paid",
    payment_method: cardLast4 ? `${paymentMethod ?? "כרטיס"} - ${cardLast4}` : paymentMethod,
    items: [{
      description: `תשלום חשבון חוזה ${contractAccount}`,
      amount,
      currency: "ILS",
    }],
    notes: "Israel Electric Company receipt",
  };
}

function extractIsraelElectricClientName(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^לכבוד\s*:?\s*$/.test(lines[i])) continue;
    for (const candidate of lines.slice(i + 1, i + 5)) {
      if (!candidate || /^\d/.test(candidate)) continue;
      if (/תל\s+אביב|נתיב\s+האור|חיפה|להחזרה|מספר|חברת\s+החשמל/.test(candidate)) continue;
      return cleanKnownInvoiceValue(candidate);
    }
  }
  return matchFirst(text, /לכבוד\s*:?\s*([^\n\r]{2,80})/) ??
    extractInvoiceRecipientFromRawText(text);
}

function extractIsraelElectricAmount(text: string): number | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const amountLines = lines.filter((line) => /סה["״]?כ|לתשלום|סכום/.test(line));
  for (const line of amountLines.reverse()) {
    const amounts = decimalAmounts(line).filter((value) => value > 0 && value < 100_000);
    if (amounts.length) return amounts[amounts.length - 1];
  }
  const all = decimalAmounts(text).filter((value) => value > 0 && value < 100_000);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Gett (ג'יטי גטאקסי סיסטמס בע"מ) ride receipts.
 *
 * The PDFs are Hebrew RTL and pdf parsing emits each line reversed, so the
 * patterns below match the reversed forms as they actually appear in raw_text —
 * e.g. `קבלה - מספר: 132306144` arrives as `מקור 132306144: מספר - קבלה`, and
 * the company name as `מ"בע סיסטמס גטאקסי יטי'ג`. Matching the visually correct
 * strings would never fire.
 */
function extractGettReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const nameLower = String(fileName ?? "").toLowerCase();

  // Reversed company name, either Gett company id, or the receipt_<date> filename.
  const isGett =
    /גטאקסי|יטי'ג|gett/i.test(text) ||
    /\b(?:514593573|514486547)\b/.test(text) ||
    /^receipt_\d{8}_\d+\.pdf$/i.test(nameLower);
  if (!isGett) return null;
  if (!/קבלה/.test(text)) return null;

  // `מקור 132306144: מספר - קבלה`  (reversed "קבלה - מספר: 132306144 מקור")
  const receiptNumber =
    matchFirst(text, /מספר\s*[:：]\s*(\d{6,20})/) ??
    matchFirst(text, /(\d{6,20})\s*[:：]\s*מספר/) ??
    matchFirst(nameLower, /receipt_\d{8}_(\d+)/);
  // `83219292': מס נסיעה`
  const rideNumber =
    matchFirst(text, /(\d{6,20})\s*['׳']?\s*[:：]\s*מס/) ??
    matchFirst(text, /נסיעה\s*מס['׳']?\s*[:：]?\s*(\d{6,20})/);
  const companyNumber = matchFirst(text, /\b(514593573|514486547)\b/) ?? null;
  // `22/01/2026: תאריך`
  const issueDate =
    parseIsraeliDate(matchFirst(text, /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[:：]\s*תאריך/)) ??
    parseIsraeliDate(matchFirst(text, /תאריך\s*[:：]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)) ??
    parseIsraeliDate(matchFirst(text, /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/));
  // `122.60כ"סה` — the total is glued to the reversed סה"כ label.
  const amount =
    parseInvoiceAmount(matchFirst(text, /([\d,]+\.\d{2})\s*כ["״']?\s*סה/)) ??
    parseInvoiceAmount(matchFirst(text, /סה["״']?כ\s*[:：]?\s*([\d,]+(?:\.\d{1,2})?)/)) ??
    parseInvoiceAmount(matchFirst(text, /([\d,]+\.\d{2})\s*באמצעות\s*שולם/));
  const cardLast4 = matchFirst(text, /\*(\d{4})/);
  // No leading \b: the total is glued to the brand in reversed output, as in
  // `122.60Mastercard *8021`, so a word boundary would never match.
  const cardBrand = matchFirst(text, /(Mastercard|Visa|American Express|Amex|Isracard)\b/i);
  const clientName = extractGettRecipient(text);

  if (!receiptNumber || issueDate === null || amount === null) return null;

  const paymentMethod = cardBrand
    ? (cardLast4 ? `${cardBrand} - ${cardLast4}` : cardBrand)
    : null;

  return {
    supplier_name: "ג'יטי גטאקסי סיסטמס בע\"מ",
    supplier_id: companyNumber,
    invoice_number: receiptNumber,
    receipt_number: receiptNumber,
    document_subtype: "קבלה",
    client_company: clientName,
    client_name: clientName,
    issue_date: issueDate,
    payment_due_date: issueDate,
    amount,
    amount_before_vat: amount,
    vat_amount: 0,
    currency: "ILS",
    payment_status: "paid",
    payment_method: paymentMethod,
    items: [{
      description: rideNumber ? `נסיעה מס' ${rideNumber}` : "נסיעה",
      amount,
      currency: "ILS",
    }],
    notes: "Gett ride receipt",
  };
}

/** `Pavel :לכבוד` — the recipient trails the reversed לכבוד label. */
function extractGettRecipient(text: string): string | null {
  const direct =
    matchFirst(text, /([^\n:：]{2,60})\s*[:：]\s*לכבוד/) ??
    matchFirst(text, /לכבוד\s*[:：]?\s*([^\n]{2,60})/);
  const cleaned = direct ? cleanKnownInvoiceValue(direct) : null;
  if (cleaned && !/^\d+$/.test(cleaned)) return cleaned;
  return null;
}

function extractHotInvoiceFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lower = text.toLowerCase();
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!(/\bhot\b/i.test(text) || text.includes("הוט") || nameLower.includes("hot"))) return null;
  if (!/פירוט\s+(?:חודשי|חשבון)|תקופת\s+חיוב|תקופת\s+השימושים|שירותי\s+אינטרנט|שירותי\s+טלוויזיה/.test(text)) return null;

  const customerNumber =
    matchFirst(text, /(?:למנוי|מספר\s*(?:לקוח|מנוי|חשבון))\s*:?\s*(?:[^\d\n]{0,80}?[-–]\s*)?(\d{4,12})/i) ??
    matchFirst(text, /\b(\d{5,12})\b/);
  const clientCompany =
    extractHotClientName(text) ??
    extractInvoiceRecipientFromRawText(text) ??
    customerNumber;
  const billingPeriod = extractHotBillingPeriod(text);
  const issueDate =
    billingPeriod?.end ??
    parseMonthYear(matchFirst(text, /חודש\s*החשבון\s*:?\s*(\d{1,2}[./]\d{4})/)) ??
    parseIsraeliDate(matchFirst(text, /תאריך\s*(?:הפקה|חשבונית|חשבון)\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/));
  const dueDate =
    parseIsraeliDate(matchFirst(text, /(?:לתשלום|תשלום|בתאריך)\s*(?:עד|בפועל|בתאריך)?\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)) ??
    parseIsraeliDate(matchFirst(text, /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*(?:יסתיים|לתשלום|תשלום)/)) ??
    issueDate;
  const amount = extractHotTotalAmount(text);
  const invoiceNumber = [
    "HOT",
    customerNumber,
    billingPeriod?.start,
    billingPeriod?.end,
  ].filter(Boolean).join("-");

  if (!customerNumber || !clientCompany || !issueDate || !dueDate || amount === null || !invoiceNumber) return null;

  return {
    supplier_name: "HOT",
    supplier_id: null,
    invoice_number: invoiceNumber,
    document_subtype: "חשבון תקופתי",
    client_company: clientCompany,
    client_name: clientCompany,
    customer_number: customerNumber,
    issue_date: issueDate,
    payment_due_date: dueDate,
    billing_period: billingPeriod ? `${billingPeriod.start} - ${billingPeriod.end}` : null,
    billing_period_start: billingPeriod?.start ?? null,
    billing_period_end: billingPeriod?.end ?? null,
    amount,
    amount_before_vat: extractHotSubtotalAmount(text),
    vat_amount: null,
    currency: "ILS",
    payment_status: /הוראת\s*קבע|כרטיס\s*אשראי|יחויב/.test(text) ? "חיוב אוטומטי" : null,
    items: extractHotItems(text),
    notes: "HOT periodic bill",
  };
}

function extractHotClientName(text: string): string | null {
  const direct =
    matchFirst(text, /(?:לכבוד|למנוי)\s*:?\s*([^\n\r\-–:]{2,80})\s*[-–]\s*\d{4,12}/) ??
    matchFirst(text, /(?:לכבוד|למנוי)\s*:?\s*([^\n\r:]{2,80})/);
  if (!direct) return null;
  return direct
    .replace(/\bHOT\b/ig, "")
    .replace(/פירוט\s+(?:חודשי|חשבון).*/g, "")
    .trim() || null;
}

function extractHotBillingPeriod(text: string): { start: string; end: string } | null {
  const match =
    /(?:תקופת\s+(?:חיוב|השימושים)|תקופת\s+החשבון)\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[-–]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/.exec(text) ??
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[-–]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/.exec(text);
  const start = parseIsraeliDate(match?.[1] ?? null);
  const end = parseIsraeliDate(match?.[2] ?? null);
  return start && end ? { start, end } : null;
}

function extractHotTotalAmount(text: string): number | null {
  const totalsContext = [
    /סה"?כ[^\n]{0,80}(?:לתקופת\s+החשבון\s+הנוכחית|חיובים\s+וזיכויים)[^\n]*(?:\n| )([^\n]{0,120})/i,
    /סכום\s+כולל\s+מע"?מ[^\n]*(?:\n| )([^\n]{0,120})/i,
  ];
  for (const pattern of totalsContext) {
    const context = pattern.exec(text)?.[1] ?? "";
    const values = decimalAmounts(context);
    const positive = values.filter((value) => value > 0);
    if (positive.length) return positive[positive.length - 1];
  }
  const tableValues = decimalAmounts(text);
  const candidates = tableValues.filter((value) => value > 0 && value < 100_000);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function extractHotSubtotalAmount(text: string): number | null {
  const match = /סה"?כ[^\n]{0,80}(?:לתקופת\s+החשבון\s+הנוכחית|חיובים\s+וזיכויים)[^\n]*(?:\n| )([^\n]{0,120})/i.exec(text);
  const values = decimalAmounts(match?.[1] ?? "");
  return values.length >= 2 ? values[values.length - 2] : null;
}

function extractHotItems(text: string): Array<{ description: string; amount?: number; currency: string }> {
  const items: Array<{ description: string; amount?: number; currency: string }> = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/שירותי|חבילת|הטבה|אינטרנט|טלוויזיה|טלפון/i.test(line)) continue;
    const amount = decimalAmounts(line).filter((value) => Math.abs(value) < 100_000).pop();
    items.push({ description: line.slice(0, 160), ...(amount !== undefined ? { amount } : {}), currency: "ILS" });
    if (items.length >= 8) break;
  }
  return items;
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
    extractGitHubTotalAmount(text) ??
    matchFirst(text, /\$[\s]*([\d,]+(?:\.\d{1,2})?)\s*USD/i);
  const taxRaw = matchValueAfterLabel(text, "Tax");
  const paymentMethod = matchValueAfterLabel(text, "Charged to");
  const serviceDescription = extractGitHubServiceDescription(text);
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

function extractGitHubTotalAmount(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^Total$/i.test(line)) {
      const next = lines[index + 1] ?? "";
      const amount = matchFirst(next, /\$?\s*([\d,]+(?:\.\d{1,2})?)\s*USD\*?/i);
      if (amount) return amount;
    }
    const sameLine = matchFirst(line, /^Total\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*USD\*?/i);
    if (sameLine) return sameLine;
  }
  return null;
}

function extractGitHubServiceDescription(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^GitHub\s+/i.test(line) && !/^GitHub,?\s+Inc\.?$/i.test(line)) return cleanKnownInvoiceValue(line);
  }
  return matchFirst(text, /(GitHub\s+[^\n]+?)(?=\s+\$?\d|[\r\n])/i);
}

function extractRailwayReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lower = text.toLowerCase();
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!lower.includes("railway corporation") && !/\brailway\b/.test(nameLower)) return null;
  if (!lower.includes("receipt") && !lower.includes("invoice number") && !/receipt|invoice/.test(nameLower)) return null;

  const invoiceNumber =
    matchValueAfterLabel(text, "Invoice number") ??
    matchFirst(fileName ?? "", /Invoice[-_]?([A-Z0-9-]+)/i);
  const receiptNumber =
    matchValueAfterLabel(text, "Receipt number") ??
    matchFirst(fileName ?? "", /Receipt[-_]?([A-Z0-9-]+)/i);
  const issueDate =
    normalizeInvoiceDate(matchValueAfterLabel(text, "Date paid")) ??
    normalizeInvoiceDate(matchFirst(text, /\b([A-Z][a-z]{2,9}\s+\d{1,2},\s+\d{4})\b/));
  const amountRaw =
    matchFirst(text, /\$([\d,]+(?:\.\d{1,2})?)\s+paid\s+on\b/i) ??
    matchValueAfterLabel(text, "Amount paid") ??
    matchValueAfterLabel(text, "Total");
  const amount = parseInvoiceAmount(amountRaw);
  const subtotal = parseInvoiceAmount(matchValueAfterLabel(text, "Subtotal"));
  const clientCompany = extractRailwayBillTo(text);
  const paymentMethod = matchFirst(text, /((?:Mastercard|Visa|American Express|Amex|Discover)\s*-\s*\d{3,4})/i);
  const billingPeriod = matchFirst(text, /\b([A-Z][a-z]{2}\s+\d{1,2}\s*[-–]\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/);
  const items = extractRailwayItems(text);

  if (!issueDate || amount === null || !(invoiceNumber || receiptNumber)) return null;

  // A Railway receipt reprints the originating invoice number, so keying both
  // documents on it would collapse them into one record. The receipt is
  // identified by its own receipt number; only the invoice keys on the invoice
  // number. isReceipt is decided by the document's own heading, not by the mere
  // presence of a receipt number (invoices carry a payment-history block too).
  const isReceipt = /^\s*receipt\b/im.test(text) || /receipt/i.test(nameLower);
  const identifier = isReceipt ? (receiptNumber ?? invoiceNumber) : (invoiceNumber ?? receiptNumber);

  return {
    supplier_name: "Railway Corporation",
    supplier_id: null,
    invoice_number: identifier,
    receipt_number: receiptNumber ?? null,
    document_subtype: isReceipt ? "קבלה" : "חשבונית",
    client_company: clientCompany,
    client_name: clientCompany,
    issue_date: issueDate,
    payment_due_date: issueDate,
    billing_period: billingPeriod,
    amount,
    amount_before_vat: subtotal ?? amount,
    vat_amount: 0,
    currency: "USD",
    payment_status: "paid",
    payment_method: paymentMethod,
    items,
    notes: "Railway usage receipt",
  };
}

function extractRailwayBillTo(text: string): string | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /^Bill to$/i.test(line));
  if (index < 0) return null;
  const candidates = lines.slice(index + 1, index + 4)
    .filter((line) => !/@/.test(line))
    .filter((line) => !/^Invoice|Receipt|Date|Railway/i.test(line));
  return candidates[0] ? cleanKnownInvoiceValue(candidates[0]) : null;
}

function extractRailwayItems(text: string): Array<{ description: string; amount?: number; currency: string }> {
  const items: Array<{ description: string; amount?: number; currency: string }> = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^(Agent Usage|Disk|Network|vCPU|Memory|Object Storage|Hobby plan)\b/i.test(line)) continue;
    const nextLine = lines[index + 1] ?? "";
    const amount = decimalAmounts(line).filter((value) => Math.abs(value) < 100_000).pop();
    const description = nextLine && /^[A-Z][a-z]{2}\s+\d{1,2}/.test(nextLine)
      ? `${line} ${nextLine}`
      : line;
    items.push({ description: description.slice(0, 160), ...(amount !== undefined ? { amount } : {}), currency: "USD" });
    if (items.length >= 12) break;
  }
  return items;
}

function extractVercelReceiptFields(rawText: string, fileName?: string | null): Record<string, unknown> | null {
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lower = text.toLowerCase();
  const nameLower = String(fileName ?? "").toLowerCase();
  if (!lower.includes("vercel") || !(lower.includes("invoice") || lower.includes("receipt") || /invoice|receipt/.test(nameLower))) {
    return null;
  }

  // Anchored to the document's own heading: an invoice also prints a payment
  // history containing "Receipt number", so a bare substring test misreads it.
  const isReceipt = /^\s*receipt\b/im.test(text) || nameLower.includes("receipt");
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

  // As with Railway, a Vercel receipt reprints the invoice number it settles;
  // keying both on it would merge the two documents into one record.
  const identifier = isReceipt ? (receiptNumber ?? invoiceNumber) : (invoiceNumber ?? receiptNumber);

  return {
    supplier_name: "Vercel Inc.",
    supplier_id: null,
    invoice_number: identifier,
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
  const iso = parseIsoInvoiceDate(value);
  if (iso) return iso;
  const israeli = parseIsraeliDate(value);
  if (israeli) return israeli;
  const cleaned = value.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*[A-Z]{2,4}\b/i, "").trim();
  const english = parseEnglishMonthDate(cleaned);
  if (english) return english;
  const parsed = Date.parse(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseIsoInvoiceDate(value: string): string | null {
  const match = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseEnglishMonthDate(value: string): string | null {
  const months: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const match = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/.exec(value);
  if (!match) return null;
  const month = months[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseIsraeliDate(value: string | null): string | null {
  if (!value) return null;
  const match = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseMonthYear(value: string | null): string | null {
  if (!value) return null;
  const match = /(\d{1,2})[./](\d{4})/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

function decimalAmounts(value: string): number[] {
  return [...value.matchAll(/-?\d{1,6}(?:[,.]\d{2})/g)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter(Number.isFinite);
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
  const normalizedPaymentDueDate = paymentDueDate ?? issueDate;
  const missingRequired = invoiceMissingRequiredFields({
    supplierName,
    invoiceNumber,
    clientName,
    issueDate,
    paymentDueDate: normalizedPaymentDueDate,
    amount,
    documentSubtype: firstInvoiceString(fields, ["document_subtype", "invoice_type", "receipt_type"]),
    paymentStatus: firstInvoiceString(fields, ["payment_status", "status"]),
  });
  if (missingRequired.length > 0) {
    const rejectionReason = invoiceRejectionReason(missingRequired);
    const rejectionLabel = invoiceRejectionLabel(rejectionReason, missingRequired);
    await col("invoices").deleteOne({ document_id: documentId } as any);
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
      {
        $set: {
          invoice_saved: false,
          invoice_rejected: true,
          invoice_rejection_reason: rejectionReason,
          invoice_rejection_code: rejectionReason,
          invoice_rejection_label: rejectionLabel,
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
    payment_due_date: normalizedPaymentDueDate,
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

  const sourceDoc = await col<any>("documents").findOne(
    { _id: new ObjectId(documentId) } as any,
    { projection: { spaces_key: 1, drive_file_id: 1, drive_web_link: 1 } } as any,
  );
  if (sourceDoc?.spaces_key) invoiceFields.spaces_key = sourceDoc.spaces_key;
  if (sourceDoc?.drive_file_id) {
    invoiceFields.drive_file_id = sourceDoc.drive_file_id;
    invoiceFields.drive_web_link = sourceDoc.drive_web_link ?? null;
  }

  await col("invoices").updateOne(
    { document_id: documentId } as any,
    {
      $set: invoiceFields,
      $setOnInsert: {
        document_id: documentId,
        created_at: now,
        status: "new",
        cash_flow: inferInvoiceCashFlow({
          document_subtype: invoiceFields.document_subtype,
          notes: invoiceFields.notes,
          fields,
        }),
      },
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
        invoice_rejection_code: null,
        invoice_rejection_label: null,
        invoice_missing_fields: [],
        reminder_status: "not_applicable",
        updated_at: now,
      },
    },
  );
  return true;
}

function invoiceRejectionLabel(reason: string, missingFields: string[] = []): string {
  const labels: Record<string, string> = {
    missing_invoice_number_and_amount: "חסר מספר חשבונית וסכום - כנראה לא חשבונית",
    missing_required_fields: "חסרים שדות חובה לחשבונית",
    missing_amount: "חסר סכום חשבונית",
    missing_supplier: "חסר ספק",
    missing_date: "חסר תאריך חשבונית או תאריך לתשלום",
    ocr_unreadable: "OCR לא הצליח לקרוא את המסמך",
    storage_failed: "שמירת הקובץ באחסון נכשלה",
    ai_rate_limited: "חילוץ AI נכשל בגלל מגבלת בקשות זמנית",
    ai_extraction_failed: "חילוץ AI נכשל",
    not_invoice: "המסמך לא זוהה כחשבונית",
    rejected: "החשבונית נדחתה",
  };
  const base = labels[reason] ?? "המסמך נדחה כחשבונית";
  return missingFields.length ? `${base}: ${missingFields.join(", ")}` : base;
}

function invoiceRejectionReason(missing: string[]): string {
  if (missing.includes("invoice_number") && missing.includes("amount")) return "not_invoice";
  if (missing.includes("amount")) return "missing_amount";
  if (missing.includes("supplier_name")) return "missing_supplier";
  if (missing.includes("issue_date") || missing.includes("payment_due_date")) return "missing_date";
  return "missing_required_fields";
}

function invoiceMissingRequiredFieldsFromFields(fields: Record<string, unknown>, rawText?: string): string[] {
  const supplierName = firstInvoiceString(fields, ["supplier_name", "vendor_name", "counterparty", "issuer_name", "company_name"]);
  const invoiceNumber = firstInvoiceString(fields, ["invoice_number", "receipt_number", "document_number", "reference_number"]);
  const clientName = firstInvoiceString(fields, ["client_company", "client_name", "customer_name", "bill_to"])
    ?? extractInvoiceRecipientFromRawText(rawText);
  const issueDate = firstInvoiceString(fields, ["issue_date", "invoice_date", "receipt_date", "date"]);
  const paymentDueDate = firstInvoiceString(fields, ["payment_due_date", "due_date", "expiry_date"]) ?? issueDate;
  const amount = parseInvoiceAmount(
    fields.amount ?? fields.total_amount ?? fields.amount_due ?? fields.total_to_pay ?? fields.total,
  );
  return invoiceMissingRequiredFields({
    supplierName,
    invoiceNumber,
    clientName,
    issueDate,
    paymentDueDate,
    amount,
    documentSubtype: firstInvoiceString(fields, ["document_subtype", "invoice_type", "receipt_type"]),
    paymentStatus: firstInvoiceString(fields, ["payment_status", "status"]),
  });
}

function invoiceMissingRequiredFields(values: {
  supplierName: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDueDate: string | null;
  amount: number | null;
  documentSubtype?: string | null;
  paymentStatus?: string | null;
}): string[] {
  const subtype = String(values.documentSubtype ?? "").toLowerCase();
  const paymentStatus = String(values.paymentStatus ?? "").toLowerCase();
  const isReceiptLike = /receipt|קבלה/.test(subtype) || /paid|שולם/.test(paymentStatus);
  const missing: string[] = [];
  if (!values.supplierName) missing.push("supplier_name");
  if (!values.invoiceNumber) missing.push("invoice_number");
  if (!values.clientName && !isReceiptLike) missing.push("client_company");
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
