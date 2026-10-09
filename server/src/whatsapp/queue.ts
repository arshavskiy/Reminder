import {ObjectId} from "mongodb";
import {randomUUID} from "node:crypto";
import {getPrimaryDb} from "../db/db";
import {logger} from "../logger";
import {sendWhatsAppTemplate, WhatsAppApiError, whatsappConfigStatus} from "./cloudApi";
import {isProcessPaused} from "../ops/processControl";
import {initializeWhatsAppIntake, processWhatsAppIntakeOnce} from "./intake";

export const whatsappCollections = () => {
  const db = getPrimaryDb();
  return {contacts: db.collection("whatsapp_contacts"), campaigns: db.collection("whatsapp_campaigns"), messages: db.collection("whatsapp_messages"), control: db.collection("whatsapp_control")};
};

export async function initializeWhatsAppQueue() {
  const {contacts, campaigns, messages, control} = whatsappCollections();
  await Promise.all([
    initializeWhatsAppIntake(),
    contacts.createIndex({phone: 1}, {unique: true}),
    campaigns.createIndex({requestId: 1}, {unique: true}),
    messages.createIndex({campaignId: 1, phone: 1}, {unique: true}),
    messages.createIndex({status: 1, nextRunAt: 1}),
    messages.createIndex({providerId: 1}, {sparse: true}),
    control.createIndex({key: 1}, {unique: true}),
  ]);
  await control.updateOne({key: "sender"}, {$setOnInsert: {key: "sender", nextRunAt: new Date(0)}}, {upsert: true});
}

/** Claim once across replicas. Ambiguous POST outcomes are never blindly retried. */
export async function processWhatsAppQueueOnce() {
  if (!whatsappConfigStatus().enabled) return;
  const {contacts, campaigns, messages, control} = whatsappCollections();
  const now = new Date();
  const owner = randomUUID();
  const lock = await control.findOneAndUpdate({key: "sender", nextRunAt: {$lte: now}},
    {$set: {owner, nextRunAt: new Date(Date.now() + 60000)}}, {returnDocument: "after"});
  if (!lock) return;
  try {
    await messages.updateMany({status: "sending", claimedAt: {$lt: new Date(Date.now() - 120000)}},
      {$set: {status: "unknown", error: "worker_interrupted_check_meta_before_resending"}});
    const campaignIds = await campaigns.find({status: "queued"}, {projection: {_id: 1}}).limit(100).toArray();
    const job = await messages.findOneAndUpdate({campaignId: {$in: campaignIds.map(row => row._id)}, status: "queued", nextRunAt: {$lte: now}},
      {$set: {status: "sending", rank: 1, claimedAt: now}, $inc: {attempts: 1}}, {sort: {createdAt: 1}, returnDocument: "after"});
    if (!job) {
      for (const campaign of campaignIds) {
        const remaining = await messages.countDocuments({campaignId: campaign._id, status: {$in: ["queued", "sending"]}});
        if (!remaining) await campaigns.updateOne({_id: campaign._id, status: "queued"}, {$set: {status: "finished", finishedAt: new Date()}});
      }
      return;
    }
    const contact = await contacts.findOne({phone: job.phone, optedIn: true});
    const campaign = await campaigns.findOne({_id: job.campaignId, status: "queued"});
    if (!contact || !campaign || campaign.phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID) {
      await messages.updateOne({_id: job._id, status: "sending"}, {$set: {status: "cancelled", error: "consent_revoked_campaign_cancelled_or_sender_changed"}});
      return;
    }
    try {
      const providerId = await sendWhatsAppTemplate({phone: job.phone, template: campaign.template, parameters: job.parameters,
        callback: job._id.toString()});
      // A webhook can arrive before this HTTP response; don't overwrite its status.
      await messages.updateOne({_id: job._id}, {$set: {providerId, acceptedAt: new Date()}});
      await messages.updateOne({_id: job._id, status: "sending"}, {$set: {status: "accepted", rank: 2}, $unset: {error: ""}});
    } catch (error) {
      const apiError = error instanceof WhatsAppApiError ? error : new WhatsAppApiError("send_outcome_unknown", false, true);
      const retry = apiError.retryable && job.attempts < 5;
      const status = retry ? "queued" : apiError.uncertain ? "unknown" : "failed";
      await messages.updateOne({_id: job._id, status: "sending"}, {$set: {status, error: apiError.code,
        rank: status === "failed" ? 4 : status === "queued" ? 0 : 1,
        nextRunAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts))}});
    }
    const remaining = await messages.countDocuments({campaignId: job.campaignId, status: {$in: ["queued", "sending"]}});
    if (!remaining) await campaigns.updateOne({_id: job.campaignId, status: "queued"}, {$set: {status: "finished", finishedAt: new Date()}});
  } finally {
    await control.updateOne({_id: lock._id, owner}, {$set: {nextRunAt: new Date(Date.now() + 1000)}});
  }
}

export function startWhatsAppWorker(): () => Promise<void> {
  let pending: Promise<void> | null = null;
  let intakePending: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (!intakePending) {
      intakePending = isProcessPaused("whatsapp")
        .then(paused => paused ? undefined : processWhatsAppIntakeOnce())
        .catch(() => logger.error("whatsapp_intake_worker_failed", {}))
        .finally(() => { intakePending = null; });
    }
    if (pending) return;
    // isProcessPaused caches for a few seconds, so this ticking once a second
    // does not mean a Mongo read per second.
    pending = isProcessPaused("whatsapp")
      .then((paused) => (paused ? undefined : processWhatsAppQueueOnce()))
      .catch(() => logger.error("whatsapp_worker_failed", {}))
      .finally(() => { pending = null; });
  }, 1000);
  timer.unref();
  return async () => { clearInterval(timer); await Promise.all([pending, intakePending]); };
}

export function whatsappObjectId(value: unknown): ObjectId | null {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}
