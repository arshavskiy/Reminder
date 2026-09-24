import express from "express";
import multer from "multer";
import {createHash} from "crypto";
import {extname} from "path";
import {Collection, ObjectId} from "mongodb";
import {col, runWithPrimaryDb} from "../db/db";
import {requireAuth, requireRole} from "../auth/middleware";
import {logger} from "../logger";
import {inspectorLeadsCollection} from "./admin";
import {runUnsubscribeScan} from "../outreach/unsubscribeScan";
import {
  buildCampaignMessage,
  CAMPAIGN_BATCH_SIZE,
  chunk,
  isValidCampaignEmail,
  parseLeadSheet,
} from "../outreach/campaigns";

type RecipientStatus = "pending" | "sent" | "failed";

interface CampaignRecipient {
  email: string;
  leadId: string | null;
  status: RecipientStatus;
  resendId?: string | null;
  sentAt?: Date | null;
  error?: string | null;
}

interface EmailCampaign {
  _id: ObjectId;
  key: string;
  name: string;
  subject: string;
  html: string;
  status: "draft" | "sending" | "sent" | "paused" | "failed";
  recipients: CampaignRecipient[];
  audience?: CampaignAudience | null;
  counts: {total: number; sent: number; failed: number};
  error?: string | null;
  created_at: Date;
  updated_at: Date;
  started_at?: Date | null;
  completed_at?: Date | null;
}

/** Narrowing applied on top of every audience except hand-picked leads. */
interface AudienceRefine {
  statuses?: string[];
  neverEmailed?: boolean;
}

type CampaignAudience = AudienceRefine & (
  | {type: "leads"; ids: string[]}
  | {type: "emails"; emails: string[]}
  | {type: "import"; batchId: string}
  | {type: "filter"; source?: string | null; status?: string | null; q?: string | null}
  | {type: "all"}
);

const LEAD_STATUSES = new Set(["NEW", "CONTACTED", "DEMO", "TRIAL", "CUSTOMER", "NOT_RELEVANT"]);

function refineConditions(audience: CampaignAudience): Record<string, any>[] {
  if (audience.type === "leads" || audience.type === "emails") return [];
  const and: Record<string, any>[] = [];
  if (audience.statuses?.length) {
    const statusOr: Record<string, any>[] = [{contactStatus: {$in: audience.statuses}}];
    // Leads without a status are shown as NEW.
    if (audience.statuses.includes("NEW")) statusOr.push({contactStatus: {$in: [null, ""]}});
    and.push({$or: statusOr});
  }
  if (audience.neverEmailed) and.push({$or: [{emailCampaigns: {$exists: false}}, {emailCampaigns: {$size: 0}}]});
  return and;
}

const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 10 * 1024 * 1024}});
const runningCampaigns = new Set<string>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function campaignKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${slug || "campaign"}-${Date.now().toString(36)}`;
}

function presentCampaign(doc: EmailCampaign, withRecipients = false) {
  const {recipients, ...rest} = doc;
  return {
    ...rest,
    id: doc._id.toString(),
    _id: undefined,
    recipients: withRecipients ? recipients : undefined,
    failedRecipients: recipients.filter((r) => r.status === "failed").slice(0, 50),
    running: runningCampaigns.has(doc._id.toString()),
  };
}

function audienceFilter(audience: CampaignAudience): Record<string, any> {
  const base: Record<string, any> = {email: {$type: "string", $regex: /@/}, unsubscribed: {$ne: true}};
  const refine = refineConditions(audience);
  if (audience.type === "leads") return {...base, _id: {$in: audience.ids.map((id) => new ObjectId(id))}};
  if (audience.type === "emails") return {email: {$in: audience.emails}, unsubscribed: {$ne: true}};
  if (audience.type === "import") return {$and: [{...base, importBatches: audience.batchId}, ...refine]};
  if (audience.type === "filter") {
    const and: Record<string, any>[] = [base, ...refine];
    if (audience.source) and.push({source: audience.source});
    if (audience.status) and.push({contactStatus: audience.status});
    if (audience.q?.trim()) {
      const rx = new RegExp(escapeRegex(audience.q.trim()), "i");
      and.push({$or: [{name: rx}, {company: rx}, {email: rx}, {phone: rx}, {website: rx}, {certificationType: rx}, {professionType: rx}]});
    }
    return {$and: and};
  }
  return refine.length ? {$and: [base, ...refine]} : base;
}

function parseEmailList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map((item) => String(item ?? "")).join("\n") : String(value ?? "");
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= 200) break;
  }
  return emails;
}

function parseAudience(value: any): CampaignAudience | null {
  const refine: AudienceRefine = {
    statuses: Array.isArray(value?.statuses) ? value.statuses.filter((s: unknown) => LEAD_STATUSES.has(String(s))) : [],
    neverEmailed: value?.neverEmailed === true,
  };
  if (value?.type === "leads" && Array.isArray(value.ids)) {
    const ids = value.ids.filter((id: unknown) => typeof id === "string" && ObjectId.isValid(id)).slice(0, 5000);
    return ids.length ? {type: "leads", ids} : null;
  }
  if (value?.type === "emails") {
    const emails = parseEmailList(value.emails);
    return emails.length ? {type: "emails", emails} : null;
  }
  if (value?.type === "import" && typeof value.batchId === "string" && value.batchId) return {...refine, type: "import", batchId: value.batchId};
  if (value?.type === "filter") return {...refine, type: "filter", source: value.source ?? null, status: value.status ?? null, q: value.q ?? null};
  if (value?.type === "all") return {...refine, type: "all"};
  return null;
}

/** Leads matching the audience, minus invalid addresses and anyone this campaign already reached. */
async function resolveRecipients(leads: Collection, audience: CampaignAudience, campaign: EmailCampaign) {
  if (audience.type === "emails") return resolveTypedEmails(leads, audience.emails, campaign);
  const rows = await leads
    .find(audienceFilter(audience), {projection: {email: 1, emailCampaigns: 1}})
    .toArray();
  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];
  let alreadySent = 0;
  let invalid = 0;
  for (const lead of rows as any[]) {
    const email = String(lead.email).trim().toLowerCase();
    if (!isValidCampaignEmail(email)) { invalid += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    if ((lead.emailCampaigns ?? []).some((c: any) => c.campaign === campaign.key)) { alreadySent += 1; continue; }
    recipients.push({email, leadId: lead._id.toString(), status: "pending"});
  }
  return {recipients, alreadySent, invalid};
}

/** Addresses typed by the admin. Known leads are linked; unknown addresses are still sent. */
async function resolveTypedEmails(leads: Collection, emails: string[], campaign: EmailCampaign) {
  const found = await leads.find(
    {email: {$in: emails}},
    {projection: {email: 1, emailCampaigns: 1, unsubscribed: 1}},
  ).toArray();
  const byEmail = new Map((found as any[]).map((lead) => [String(lead.email).trim().toLowerCase(), lead]));
  const recipients: CampaignRecipient[] = [];
  let alreadySent = 0;
  let invalid = 0;
  let unsubscribed = 0;
  for (const email of emails) {
    if (!isValidCampaignEmail(email)) { invalid += 1; continue; }
    const lead = byEmail.get(email);
    if (lead?.unsubscribed === true) { unsubscribed += 1; continue; }
    if ((lead?.emailCampaigns ?? []).some((c: any) => c.campaign === campaign.key)) { alreadySent += 1; continue; }
    recipients.push({email, leadId: lead?._id ? String(lead._id) : null, status: "pending"});
  }
  return {recipients, alreadySent, invalid, unsubscribed};
}

async function runCampaign(campaigns: Collection<EmailCampaign>, leads: Collection, campaignId: ObjectId) {
  const id = campaignId.toString();
  if (runningCampaigns.has(id)) return;
  runningCampaigns.add(id);
  try {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    const {Resend} = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    while (true) {
      const campaign = await campaigns.findOne({_id: campaignId});
      if (!campaign || campaign.status !== "sending") return;
      const pending = campaign.recipients.filter((r) => r.status === "pending").slice(0, CAMPAIGN_BATCH_SIZE);
      if (!pending.length) {
        await campaigns.updateOne({_id: campaignId}, {$set: {status: "sent", completed_at: new Date(), updated_at: new Date()}});
        logger.info("email_campaign_completed", {campaign_id: id, sent: campaign.counts.sent, failed: campaign.counts.failed});
        return;
      }

      const message = buildCampaignMessage(campaign);
      const idempotencyKey = `campaign-${id}-${createHash("sha1").update(pending.map((r) => r.email).join(",")).digest("hex")}`;
      const {data, error} = await resend.batch.send(pending.map((r) => ({...message, to: [r.email]})), {idempotencyKey});
      const sentAt = new Date();
      if (error) {
        await campaigns.bulkWrite(pending.map((r) => ({updateOne: {
          filter: {_id: campaignId, "recipients.email": r.email},
          update: {$set: {"recipients.$.status": "failed", "recipients.$.error": `${error.name}: ${error.message}`}},
        }})));
        await campaigns.updateOne({_id: campaignId}, {
          $set: {status: "failed", error: `${error.name}: ${error.message}`, updated_at: new Date()},
          $inc: {"counts.failed": pending.length},
        });
        logger.error("email_campaign_batch_failed", {campaign_id: id, error: error.message});
        return;
      }

      const ids = (data as any)?.data ?? [];
      await campaigns.bulkWrite(pending.map((r, i) => ({updateOne: {
        filter: {_id: campaignId, "recipients.email": r.email},
        update: {$set: {"recipients.$.status": "sent", "recipients.$.resendId": ids[i]?.id ?? null, "recipients.$.sentAt": sentAt}},
      }})));
      await campaigns.updateOne({_id: campaignId}, {$inc: {"counts.sent": pending.length}, $set: {updated_at: new Date()}});
      // Pair each recipient with its Resend id before filtering, so indexes stay aligned.
      const leadOps = pending.map((r, i) => ({r, resendId: ids[i]?.id ?? null}))
        .filter(({r}) => r.leadId && ObjectId.isValid(r.leadId))
        .map(({r, resendId}) => ({updateOne: {
        filter: {_id: new ObjectId(r.leadId!)},
        update: [
          {$set: {
            emailCampaigns: {$concatArrays: [{$ifNull: ["$emailCampaigns", []]}, [{campaign: campaign.key, subject: message.subject, sentAt, resendId}]]},
            lastEmailedAt: sentAt,
            lastEmailCampaign: campaign.key,
            updated_at: sentAt,
            contactStatus: {$cond: [{$in: [{$ifNull: ["$contactStatus", "NEW"]}, ["NEW"]]}, "CONTACTED", "$contactStatus"]},
          }},
        ],
      }}));
      if (leadOps.length) await leads.bulkWrite(leadOps as any, {ordered: false});
      // Resend allows a couple of batch calls per second; stay well under it.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err: any) {
    logger.error("email_campaign_failed", {campaign_id: id, error: err?.message});
    await campaigns.updateOne({_id: campaignId}, {$set: {status: "failed", error: err?.message ?? String(err), updated_at: new Date()}});
  } finally {
    runningCampaigns.delete(id);
  }
}

export function registerAdminCampaignRoutes(app: express.Application) {
  async function adminAuth(req: express.Request, res: express.Response) {
    return runWithPrimaryDb(async () => {
      try {
        const auth = await requireAuth(req.headers.cookie ?? undefined);
        requireRole(auth, "admin");
        return auth;
      } catch (err: any) {
        res.status(err.status ?? 403).json({error: err.message});
        return null;
      }
    });
  }

  const campaignsCol = () => col<EmailCampaign>("email_campaigns");

  async function loadCampaign(req: express.Request, res: express.Response): Promise<EmailCampaign | null> {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({error: "invalid_campaign_id"});
      return null;
    }
    const campaign = await campaignsCol().findOne({_id: new ObjectId(req.params.id)});
    if (!campaign) res.status(404).json({error: "campaign_not_found"});
    return campaign;
  }

  // POST /api/admin/campaigns/import-leads — CSV/XLSX upload merged into inspector_leads by email.
  app.post("/api/admin/campaigns/import-leads", upload.single("file"), async (req, res) => {
    if (!await adminAuth(req, res)) return;
    if (!req.file) { res.status(400).json({error: "no_file"}); return; }
    let parsed;
    try {
      parsed = parseLeadSheet(req.file.buffer, req.file.originalname);
    } catch (err: any) {
      res.status(400).json({error: `Could not read the file: ${err?.message ?? err}`});
      return;
    }
    // "fill" (default) only fills empty fields on existing leads; "overwrite" replaces them with the file's values.
    const overwrite = String(req.body?.mode ?? "") === "overwrite";
    const batchId = `csv-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
    const source = `csv:${req.file.originalname}`.slice(0, 80);
    const leads = await inspectorLeadsCollection();
    const byEmail = new Map(parsed.rows.map((row) => [row.email, row]));
    const existing = await leads
      .find({email: {$in: [...byEmail.keys()].map((e) => new RegExp(`^${escapeRegex(e)}$`, "i"))}}, {projection: {email: 1}})
      .toArray();
    const existingByEmail = new Map(existing.map((doc: any) => [String(doc.email).trim().toLowerCase(), doc._id]));
    const now = new Date();
    const ops: any[] = [];
    for (const row of byEmail.values()) {
      const id = existingByEmail.get(row.email);
      if (id) {
        // A field the file leaves empty never clears existing data, in either mode.
        const merge = (field: "name" | "company" | "phone" | "city") => {
          const incoming = row[field];
          if (incoming == null) return `$${field}`;
          if (overwrite) return incoming;
          const current = {$trim: {input: {$ifNull: [{$toString: `$${field}`}, ""]}}};
          return {$cond: [{$gt: [{$strLenCP: current}, 0]}, `$${field}`, incoming]};
        };
        ops.push({updateOne: {
          filter: {_id: id},
          update: [{$set: {
            name: merge("name"),
            company: merge("company"),
            phone: merge("phone"),
            city: merge("city"),
            importBatches: {$setUnion: [{$ifNull: ["$importBatches", []]}, [batchId]]},
            updated_at: now,
          }}],
        }});
      } else {
        ops.push({insertOne: {document: {
          ...row, source, contactStatus: "NEW", leadScore: 0, importBatches: [batchId], created_at: now, updated_at: now,
        }}});
      }
    }
    if (ops.length) await leads.bulkWrite(ops, {ordered: false});
    const inserted = ops.filter((op) => op.insertOne).length;
    logger.info("campaign_leads_imported", {file: req.file.originalname, rows: parsed.totalRows, inserted, updated: ops.length - inserted, overwrite});
    res.json({
      batchId,
      file: req.file.originalname,
      totalRows: parsed.totalRows,
      valid: byEmail.size,
      duplicatesInFile: parsed.rows.length - byEmail.size,
      invalid: parsed.invalid,
      inserted,
      updated: ops.length - inserted,
      mode: overwrite ? "overwrite" : "fill",
    });
  });

  // POST /api/admin/campaigns/images — public image for use inside campaign HTML.
  app.post("/api/admin/campaigns/images", upload.single("image"), async (req, res) => {
    if (!await adminAuth(req, res)) return;
    if (!req.file || !req.file.mimetype.startsWith("image/")) { res.status(400).json({error: "only_images_allowed"}); return; }
    const {publicBucketEnabled, uploadBufferToPublicSpaces} = await import("../storage/spaces.js");
    if (!publicBucketEnabled()) { res.status(500).json({error: "public_storage_not_configured"}); return; }
    const ext = extname(req.file.originalname).toLowerCase() || ".png";
    const base = req.file.originalname.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "image";
    const url = await uploadBufferToPublicSpaces(req.file.buffer, `email-campaigns/${Date.now()}-${base}${ext}`, req.file.mimetype);
    res.json({url});
  });

  // POST /api/admin/campaigns/render — the exact subject/HTML recipients get (legal subject + footer).
  app.post("/api/admin/campaigns/render", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const message = buildCampaignMessage({subject: String(req.body?.subject ?? ""), html: String(req.body?.html ?? "")});
    res.json({subject: message.subject, html: message.html});
  });

  // GET /api/admin/campaigns
  app.get("/api/admin/campaigns", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const rows = await campaignsCol().find({}).sort({created_at: -1}).limit(50).toArray();
    res.json({rows: rows.map((row) => presentCampaign(row))});
  });

  // POST /api/admin/campaigns — new draft
  app.post("/api/admin/campaigns", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const name = String(req.body?.name ?? "").trim();
    if (!name) { res.status(400).json({error: "name_required"}); return; }
    const now = new Date();
    const doc: Omit<EmailCampaign, "_id"> = {
      key: campaignKey(name),
      name,
      subject: String(req.body?.subject ?? ""),
      html: String(req.body?.html ?? ""),
      status: "draft",
      recipients: [],
      counts: {total: 0, sent: 0, failed: 0},
      created_at: now,
      updated_at: now,
    };
    const result = await campaignsCol().insertOne(doc as EmailCampaign);
    res.json(presentCampaign({...doc, _id: result.insertedId} as EmailCampaign));
  });

  // PUT /api/admin/campaigns/:id — edit name/subject/html while not sending
  app.put("/api/admin/campaigns/:id", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    if (campaign.status === "sending") { res.status(409).json({error: "campaign_is_sending"}); return; }
    const set: Record<string, any> = {updated_at: new Date()};
    if (typeof req.body?.name === "string" && req.body.name.trim()) set.name = req.body.name.trim();
    if (typeof req.body?.subject === "string") set.subject = req.body.subject;
    if (typeof req.body?.html === "string") set.html = req.body.html;
    const updated = await campaignsCol().findOneAndUpdate({_id: campaign._id}, {$set: set}, {returnDocument: "after"});
    res.json(presentCampaign(updated!));
  });

  // GET /api/admin/campaigns/:id — progress
  app.get("/api/admin/campaigns/:id", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (campaign) res.json(presentCampaign(campaign));
  });

  // POST /api/admin/campaigns/:id/audience — count who would receive it, without sending
  app.post("/api/admin/campaigns/:id/audience", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    const audience = parseAudience(req.body?.audience);
    if (!audience) { res.status(400).json({error: "invalid_audience"}); return; }
    const leads = await inspectorLeadsCollection();
    const [{recipients, alreadySent, invalid}, unsubscribed] = await Promise.all([
      resolveRecipients(leads, audience, campaign),
      leads.countDocuments({...audienceFilter(audience), unsubscribed: true}),
    ]);
    res.json({count: recipients.length, alreadySent, invalid, unsubscribed, sample: recipients.slice(0, 8).map((r) => r.email)});
  });

  // POST /api/admin/campaigns/:id/test — one copy to the signed-in admin
  app.post("/api/admin/campaigns/:id/test", async (req, res) => {
    const auth = await adminAuth(req, res);
    if (!auth) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    const to = String(req.body?.to ?? (auth as any).user?.email ?? "").trim();
    if (!isValidCampaignEmail(to)) { res.status(400).json({error: "no_test_address"}); return; }
    if (!campaign.subject.trim() || !campaign.html.trim()) { res.status(400).json({error: "subject_and_html_required"}); return; }
    if (!process.env.RESEND_API_KEY) { res.status(500).json({error: "RESEND_API_KEY is not configured"}); return; }
    const {Resend} = await import("resend");
    const message = buildCampaignMessage(campaign);
    const {data, error} = await new Resend(process.env.RESEND_API_KEY).emails.send({...message, subject: `[TEST] ${message.subject}`, to: [to]});
    if (error) { res.status(502).json({error: `${error.name}: ${error.message}`}); return; }
    res.json({ok: true, to, id: data?.id ?? null});
  });

  // POST /api/admin/campaigns/:id/send — freeze the audience and start the background send.
  // body.expectedCount must match the audience size the admin confirmed.
  app.post("/api/admin/campaigns/:id/send", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    if (campaign.status === "sending") { res.status(409).json({error: "campaign_is_sending"}); return; }
    if (!campaign.subject.trim() || !campaign.html.trim()) { res.status(400).json({error: "subject_and_html_required"}); return; }
    const audience = parseAudience(req.body?.audience);
    if (!audience) { res.status(400).json({error: "invalid_audience"}); return; }
    // Catch "הסר" replies that arrived since the last scan. Best effort: a Gmail
    // problem is logged on the scan run and does not block the send.
    const preSendScan = await Promise.race([
      runUnsubscribeScan({trigger: "pre-send", triggeredBy: `campaign:${campaign.key}`}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000)),
    ]);
    const leads = await inspectorLeadsCollection();
    const {recipients} = await resolveRecipients(leads, audience, campaign);
    if (!recipients.length) { res.status(400).json({error: "no_recipients"}); return; }
    // A fresh unsubscribe changes the count, so the admin re-confirms the new number.
    if (Number(req.body?.expectedCount) !== recipients.length) {
      res.status(409).json({error: "audience_changed", count: recipients.length, newUnsubscribes: preSendScan?.newEmails ?? []});
      return;
    }
    const campaigns = campaignsCol();
    // Keep earlier sends of this campaign; add only new pending recipients.
    const known = new Set(campaign.recipients.map((r) => r.email));
    const added = recipients.filter((r) => !known.has(r.email));
    await campaigns.updateOne({_id: campaign._id}, {
      $push: {recipients: {$each: added}},
      $set: {status: "sending", audience, error: null, started_at: new Date(), updated_at: new Date(), "counts.total": campaign.recipients.length + added.length},
    });
    void runCampaign(campaigns, leads, campaign._id);
    res.json({ok: true, queued: added.length});
  });

  // POST /api/admin/campaigns/:id/pause | /resume
  app.post("/api/admin/campaigns/:id/pause", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    await campaignsCol().updateOne({_id: campaign._id, status: "sending"}, {$set: {status: "paused", updated_at: new Date()}});
    res.json({ok: true});
  });

  app.post("/api/admin/campaigns/:id/resume", async (req, res) => {
    if (!await adminAuth(req, res)) return;
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    if (!["paused", "failed", "sending"].includes(campaign.status)) { res.status(409).json({error: "nothing_to_resume"}); return; }
    const campaigns = campaignsCol();
    // Failed recipients get another attempt on resume.
    await campaigns.updateOne({_id: campaign._id}, {
      $set: {status: "sending", error: null, updated_at: new Date(), "recipients.$[f].status": "pending", "recipients.$[f].error": null},
      $inc: {"counts.failed": -campaign.recipients.filter((r) => r.status === "failed").length},
    }, {arrayFilters: [{"f.status": "failed"}]});
    void runCampaign(campaigns, await inspectorLeadsCollection(), campaign._id);
    res.json({ok: true});
  });
}
