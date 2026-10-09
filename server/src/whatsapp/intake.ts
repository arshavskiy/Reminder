import {createHash, randomUUID} from "node:crypto";
import {mkdtemp, writeFile, unlink, rmdir} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {getPrimaryDb, runWithPrimaryDb} from "../db/db";
import {downloadWhatsAppMedia, normalizeWhatsAppPhone, sendWhatsAppText, WhatsAppApiError, whatsappConfigStatus} from "./cloudApi";
import {logger} from "../logger";

interface IntakeJob {
  _id: string;
  user_id: string;
  phone: string;
  senderId: string;
  mediaId: string;
  displayName: string | null;
  status: "queued" | "processing" | "completed" | "cancelled" | "failed";
  attempts: number;
  createdAt: Date;
  receivedAt: Date;
  nextRunAt: Date;
  owner?: string;
  leaseUntil?: Date;
  error?: string;
  documentId?: string;
  completedAt?: Date;
}
const inbox = () => getPrimaryDb().collection<IntakeJob>("whatsapp_inbox");

export async function initializeWhatsAppIntake() {
  await Promise.all([
    inbox().createIndex({senderId: 1, status: 1, nextRunAt: 1}),
    inbox().createIndex({senderId: 1, status: 1, leaseUntil: 1}),
    inbox().createIndex({user_id: 1}),
  ]);
}

/** Preserve supported profile phone formatting while matching the sender exactly. */
export function intakePhonePattern(phone: string): RegExp {
  const separator = "[\\s().-]*";
  const digits = (value: string) => value.split("").join(separator);
  const variants = [`(?:\\+|00)?${digits(phone)}`];
  if (phone.startsWith("972")) variants.push(digits(`0${phone.slice(3)}`));
  return new RegExp(`^${separator}(?:${variants.join("|")})${separator}$`);
}

/** Persist before acknowledging Meta. Replayed webhook messages keep the same job. */
export async function enqueueWhatsAppIntake(phone: string, incoming: any): Promise<void> {
  if (!whatsappConfigStatus().enabled || normalizeWhatsAppPhone(phone) !== phone) return;
  const media = incoming.type === "document" ? incoming.document : incoming.type === "image" ? incoming.image : null;
  if (typeof incoming.id !== "string" || !incoming.id || incoming.id.length > 512
    || typeof media?.id !== "string" || !/^\d{1,64}$/.test(media.id)) return;
  const users = await getPrimaryDb().collection("users").find({
    phone: intakePhonePattern(phone), wa_intake_enabled: true, is_active: {$ne: 0},
  }).limit(2).toArray();
  // Never guess which account should receive a private document.
  if (users.length !== 1) return;
  const senderId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const id = createHash("sha256").update(`${senderId}:${incoming.id}`).digest("hex");
  const now = new Date();
  const timestamp = Number(incoming.timestamp) * 1000;
  const receivedAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : now;
  try {
    await inbox().updateOne({_id: id}, {$setOnInsert: {
      _id: id, user_id: String(users[0]._id), phone, senderId, mediaId: media.id,
      displayName: typeof media.filename === "string" ? media.filename.slice(0, 255) : null,
      status: "queued", attempts: 0, createdAt: now, receivedAt, nextRunAt: now,
    }}, {upsert: true});
  } catch (error: any) {
    if (error?.code !== 11000) throw error; // simultaneous replay already persisted
  }
}

export async function processWhatsAppIntakeOnce(): Promise<void> {
  if (!whatsappConfigStatus().enabled) return;
  const jobs = inbox();
  const now = new Date();
  const owner = randomUUID();
  const job = await jobs.findOneAndUpdate({
    senderId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    $or: [{status: "queued", nextRunAt: {$lte: now}}, {status: "processing", leaseUntil: {$lte: now}}],
  }, {$set: {status: "processing", owner, leaseUntil: new Date(Date.now() + 120000)}, $inc: {attempts: 1}},
  {sort: {createdAt: 1}, returnDocument: "after"});
  if (!job) return;
  const claim = {_id: job._id, owner};
  // Keep a long import owned; a crashed process stops renewing and can be recovered.
  const heartbeat = setInterval(() => {
    void jobs.updateOne(claim, {$set: {leaseUntil: new Date(Date.now() + 120000)}})
      .catch(() => logger.error("whatsapp_intake_lease_failed", {jobId: job._id}));
  }, 30000);
  heartbeat.unref();
  let directory: string | undefined;
  let path: string | undefined;
  try {
    const users = await getPrimaryDb().collection("users").find({
      phone: intakePhonePattern(job.phone), wa_intake_enabled: true, is_active: {$ne: 0},
    }).limit(2).toArray();
    if (users.length !== 1 || String(users[0]._id) !== job.user_id) {
      await jobs.updateOne(claim, {$set: {status: "cancelled", error: "intake_account_changed"}});
      return;
    }
    const {buffer, filename} = await downloadWhatsAppMedia(job.mediaId);
    directory = await mkdtemp(join(tmpdir(), "reminder-wa-"));
    path = join(directory, filename);
    await writeFile(path, buffer);
    const documentId = await runWithPrimaryDb(async () => {
      const {importFile} = await import("../pipeline/importer.js");
      return importFile(path!, undefined, job.user_id, job.displayName || filename, {
        queueProcessing: true, processingJobContext: {source: "whatsapp"}, skipQuotaCheck: false,
      });
    });
    await jobs.updateOne(claim, {$set: {status: "completed", documentId, completedAt: new Date()}, $unset: {error: ""}});
    // A confirmation failure must never turn a successful import into a retry.
    if (Date.now() - new Date(job.receivedAt).getTime() < 23 * 3600000) {
      await sendWhatsAppText(job.phone, "קיבלנו את הקובץ והוא ממתין לעיבוד באפליקציה.")
        .catch(() => logger.warn("whatsapp_intake_confirmation_failed", {jobId: job._id}));
    }
  } catch (error) {
    const permanent = error instanceof WhatsAppApiError && ["invalid_media_id", "unsupported_media_type", "media_too_large", "empty_media"].includes(error.code);
    const status = permanent || job.attempts >= 5 ? "failed" : "queued";
    await jobs.updateOne(claim, {$set: {
      status, error: error instanceof WhatsAppApiError ? error.code : "intake_processing_failed",
      nextRunAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts)),
    }});
    logger.warn("whatsapp_intake_processing_failed", {jobId: job._id, status});
  } finally {
    clearInterval(heartbeat);
    if (path) await unlink(path).catch(() => undefined);
    if (directory) await rmdir(directory).catch(() => undefined);
  }
}
