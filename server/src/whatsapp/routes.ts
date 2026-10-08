import express from "express";
import {createHash, timingSafeEqual} from "node:crypto";
import {writeFileSync, unlinkSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {ObjectId} from "mongodb";
import {requireAuth, requireRole, HTTPException} from "../auth/middleware";
import {runWithPrimaryDb, col} from "../db/db";
import {inspectorLeadsCollection} from "../routes/admin";
import {whatsappCollections, whatsappObjectId} from "./queue";
import {deliveryRank, downloadWhatsAppMedia, isWhatsAppStop, listWhatsAppTemplates, normalizeWhatsAppPhone, sendWhatsAppText, verifyWhatsAppSignature, whatsappConfigStatus} from "./cloudApi";
import {logger} from "../logger";

export async function handleWhatsAppWebhook(payload: any) {
  if (payload?.object !== "whatsapp_business_account") return;
  const {contacts, messages} = whatsappCollections();
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    if (entry.id !== process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) continue;
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value;
      if (value?.metadata?.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const event of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!["sent", "delivered", "read", "failed"].includes(event.status) || typeof event.id !== "string") continue;
        const callback = whatsappObjectId(event.biz_opaque_callback_data);
        const identity = callback ? {_id: callback, phone: normalizeWhatsAppPhone(event.recipient_id)} : {providerId: event.id};
        await messages.updateOne({...identity, rank: {$lt: deliveryRank[event.status]}}, {$set: {
          status: event.status, rank: deliveryRank[event.status], providerId: event.id, deliveryUpdatedAt: new Date(),
          ...(event.status === "failed" ? {error: `meta_${Number(event.errors?.[0]?.code) || "delivery_failed"}`} : {}),
        }});
      }
      for (const incoming of Array.isArray(value.messages) ? value.messages : []) {
        const phone = normalizeWhatsAppPhone(incoming.from);
        if (!phone) continue;
        const body = incoming.text?.body ?? incoming.button?.text ?? incoming.interactive?.button_reply?.title;
        if (isWhatsAppStop(body)) {
          await contacts.updateOne({phone}, {$set: {phone, optedIn: false, source: "whatsapp_stop", updatedAt: new Date()}}, {upsert: true});
          await messages.updateMany({phone, status: "queued"}, {$set: {status: "cancelled", error: "recipient_opted_out"}});
        } else {
          // An inbound reply does not establish marketing consent.
          await contacts.updateOne({phone}, {$max: {lastInboundAt: new Date(Number(incoming.timestamp) * 1000 || Date.now())}});
        }
        // Document/image intake — find the user by phone, run pipeline
        const mediaType: string | undefined = incoming.type;
        if (mediaType === "document" || mediaType === "image") {
          void handleWhatsAppMediaIntake(phone, incoming).catch(err =>
            logger.error("wa_intake_error", {phone, error: String(err)}));
        }
      }
    }
  }
}

async function handleWhatsAppMediaIntake(phone: string, incoming: any): Promise<void> {
  // Find user account with this phone and wa_intake_enabled
  const user = await col("users").findOne({phone, wa_intake_enabled: true} as any) as any;
  if (!user) return; // no matching account or intake not enabled

  const mediaId: string | undefined = incoming.document?.id ?? incoming.image?.id;
  const caption: string | undefined = incoming.document?.caption ?? incoming.image?.caption;
  const originalFilename: string | undefined = incoming.document?.filename;
  if (!mediaId) return;

  let tmpPath: string | undefined;
  try {
    const {buffer, filename} = await downloadWhatsAppMedia(mediaId);
    const displayName = originalFilename ?? caption ?? filename;
    const dir = join(tmpdir(), "wa_intake");
    mkdirSync(dir, {recursive: true});
    tmpPath = join(dir, filename);
    writeFileSync(tmpPath, buffer);

    const {importFile} = await import("../pipeline/importer.js") as any;
    await importFile(tmpPath, undefined, String(user._id), displayName, {
      queueProcessing: true,
      processingJobContext: {source: "whatsapp"},
      skipQuotaCheck: false,
    });

    await sendWhatsAppText(phone, "✅ קיבלנו את הקובץ ועיבוד בתהליך. תקבל תזכורות לאחר הניתוח.");
  } catch (err: any) {
    logger.error("wa_intake_pipeline_error", {phone, userId: String(user._id), error: String(err)});
    try {
      await sendWhatsAppText(phone, "⚠️ לא הצלחנו לעבד את הקובץ. אנא נסה שוב או העלה דרך האפליקציה.");
    } catch { /* best effort */ }
  } finally {
    if (tmpPath) try { unlinkSync(tmpPath); } catch { /* ok */ }
  }
}

export function registerWhatsAppWebhook(app: express.Application) {
  app.get("/api/webhooks/whatsapp", (req, res) => {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    const supplied = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (expected && typeof supplied === "string" && Buffer.byteLength(supplied) === Buffer.byteLength(expected)
      && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      && req.query["hub.mode"] === "subscribe" && typeof challenge === "string") {
      res.type("text/plain").send(challenge);
    } else res.sendStatus(403);
  });
  app.post("/api/webhooks/whatsapp", express.raw({type: "application/json", limit: "1mb"}), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !verifyWhatsAppSignature(req.body, req.headers["x-hub-signature-256"], process.env.WHATSAPP_APP_SECRET || "")) {
      res.sendStatus(401); return;
    }
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString("utf8")); } catch { res.sendStatus(400); return; }
    try { await handleWhatsAppWebhook(payload); res.sendStatus(200); }
    catch { res.sendStatus(503); } // Meta retries transient persistence failures.
  });
}

export function expandWhatsAppParameters(values: string[], lead: {name?: string; company?: string; phone: string}): string[] {
  return values.map(value => value.replace(/\{\{(name|company|phone)\}\}/g,
    (_match, key: "name" | "company" | "phone") => lead[key]?.trim() || (key === "name" ? "שלום" : "—")));
}

async function prepareCampaign(body: any) {
  if (!body || !Array.isArray(body.leadIds) || !body.leadIds.length || body.leadIds.length > 1000) throw new HTTPException(400, "Select 1–1000 leads");
  const ids = [...new Set<string>(body.leadIds)].map(whatsappObjectId);
  if (ids.some(id => !id)) throw new HTTPException(400, "Invalid lead id");
  if (!Array.isArray(body.parameters) || body.parameters.length > 20 || body.parameters.some((value: unknown) => typeof value !== "string" || !value.trim() || value.length > 1000)) {
    throw new HTTPException(400, "Invalid template parameters");
  }
  const templates = await listWhatsAppTemplates();
  const template = templates.find(item => item.name === body.templateName && item.language === body.language);
  if (!template || template.parameters !== body.parameters.length) throw new HTTPException(400, "Choose an approved template with matching parameters");
  const leads = await (await inspectorLeadsCollection()).find({_id: {$in: ids as ObjectId[]}}).toArray();
  const {contacts} = whatsappCollections();
  const recipients = new Map<string, {phone: string; name: string; parameters: string[]}>();
  let skipped = ids.length - leads.length;
  for (const lead of leads) {
    const phone = normalizeWhatsAppPhone(lead.whatsapp || lead.phone);
    if (!phone || lead.contactStatus === "NOT_RELEVANT") { skipped++; continue; }
    const consent = await contacts.findOne({phone, optedIn: true});
    if (!consent || recipients.has(phone)) { skipped++; continue; }
    const parameters = expandWhatsAppParameters(body.parameters, {name: lead.name, company: lead.company, phone});
    if (parameters.some(value => value.length > 1024)) throw new HTTPException(400, "Expanded parameter is too long");
    recipients.set(phone, {phone, name: String(lead.name || phone), parameters});
  }
  const result = {template, recipients: [...recipients.values()].sort((a, b) => a.phone.localeCompare(b.phone)), skipped};
  const previewHash = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  return {...result, previewHash};
}

export function registerWhatsAppRoutes(app: express.Application) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    try {
      await runWithPrimaryDb(async () => requireRole(await requireAuth(req.headers.cookie), "admin"));
      next();
    } catch (error) {
      res.status(error instanceof HTTPException ? error.status : 403).json({error: "Admin access required"});
    }
  });
  const route = (handler: (req: express.Request, res: express.Response) => Promise<void>): express.RequestHandler =>
    (req, res) => { void handler(req, res).catch(error => res.status(error instanceof HTTPException ? error.status : 502)
      .json({error: error instanceof HTTPException ? error.message : "WhatsApp operation failed; check configuration or try again"})); };

  router.get("/status", route(async (_req, res) => {
    const {contacts, campaigns} = whatsappCollections();
    res.json({...whatsappConfigStatus(), contacts: await contacts.find({}, {projection: {phone: 1, optedIn: 1, source: 1, updatedAt: 1, lastInboundAt: 1}}).limit(2000).toArray(),
      campaigns: await campaigns.find({}, {projection: {requestId: 0}}).sort({createdAt: -1}).limit(30).toArray()});
  }));
  router.get("/templates", route(async (_req, res) => { res.json(await listWhatsAppTemplates()); }));
  router.put("/consent", route(async (req, res) => {
    const phone = normalizeWhatsAppPhone(req.body?.phone);
    const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";
    if (!phone || typeof req.body?.optedIn !== "boolean" || !source || source.length > 500) throw new HTTPException(400, "Provide a valid phone, consent choice and evidence/source");
    const auth = await runWithPrimaryDb(() => requireAuth(req.headers.cookie));
    const {contacts, messages} = whatsappCollections();
    await contacts.updateOne({phone}, {$set: {phone, optedIn: req.body.optedIn, source, updatedAt: new Date(), recordedBy: auth.realUserId}}, {upsert: true});
    if (!req.body.optedIn) await messages.updateMany({phone, status: "queued"}, {$set: {status: "cancelled", error: "consent_revoked"}});
    res.json({ok: true});
  }));
  router.post("/preview", route(async (req, res) => { res.json(await prepareCampaign(req.body)); }));
  router.post("/campaigns", route(async (req, res) => {
    if (!whatsappConfigStatus().enabled) throw new HTTPException(409, "WhatsApp sending is disabled");
    if (typeof req.body?.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(req.body.requestId)) throw new HTTPException(400, "A request UUID is required");
    const {campaigns, messages} = whatsappCollections();
    const requestHash = createHash("sha256").update(JSON.stringify({ids: req.body.leadIds, template: req.body.templateName, language: req.body.language, parameters: req.body.parameters})).digest("hex");
    const existing = await campaigns.findOne({requestId: req.body.requestId});
    if (existing) {
      if (existing.requestHash !== requestHash) throw new HTTPException(409, "Request UUID already used for another campaign");
      res.json(existing); return;
    }
    const preview = await prepareCampaign(req.body);
    if (req.body.previewHash !== preview.previewHash) throw new HTTPException(409, "Recipients or template changed. Preview the campaign again.");
    if (!preview.recipients.length) throw new HTTPException(400, "No eligible recipients with recorded consent");
    const auth = await runWithPrimaryDb(() => requireAuth(req.headers.cookie));
    const campaign = {_id: new ObjectId(), requestId: req.body.requestId, requestHash, template: preview.template,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID, createdBy: auth.realUserId, createdAt: new Date(),
      recipientCount: preview.recipients.length, status: "preparing"};
    await campaigns.insertOne(campaign);
    try {
      await messages.insertMany(preview.recipients.map(recipient => ({...recipient, campaignId: campaign._id,
        status: "queued", rank: 0, attempts: 0, nextRunAt: new Date(), createdAt: new Date()})));
      await campaigns.updateOne({_id: campaign._id}, {$set: {status: "queued"}});
    } catch (error) {
      await campaigns.updateOne({_id: campaign._id}, {$set: {status: "cancelled"}});
      throw error;
    }
    res.status(201).json({...campaign, status: "queued"});
  }));
  router.get("/campaigns/:id", route(async (req, res) => {
    const id = whatsappObjectId(req.params.id);
    if (!id) throw new HTTPException(400, "Invalid campaign id");
    const {campaigns, messages} = whatsappCollections();
    const campaign = await campaigns.findOne({_id: id});
    if (!campaign) throw new HTTPException(404, "Campaign not found");
    res.json({campaign, messages: await messages.find({campaignId: id}).sort({createdAt: 1}).limit(1000).toArray()});
  }));
  router.post("/campaigns/:id/cancel", route(async (req, res) => {
    const id = whatsappObjectId(req.params.id);
    if (!id) throw new HTTPException(400, "Invalid campaign id");
    const {campaigns, messages} = whatsappCollections();
    await campaigns.updateOne({_id: id, status: {$in: ["preparing", "queued"]}}, {$set: {status: "cancelled"}});
    await messages.updateMany({campaignId: id, status: "queued"}, {$set: {status: "cancelled"}});
    res.json({ok: true});
  }));
  app.use("/api/admin/whatsapp", router);
}
