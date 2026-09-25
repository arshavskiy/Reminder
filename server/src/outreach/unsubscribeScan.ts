import {ObjectId} from "mongodb";
import {col, runWithPrimaryDb} from "../db/db";
import {seedCollection} from "../db/seedDb";
import {logger} from "../logger";
import {isProcessPaused} from "../ops/processControl";
import {gmailFetch, resolveGmailToken, retryWithRefresh} from "../routes/gmail";
import {inspectorLeadsCollection} from "../routes/admin";
import {
  dedupeUnsubscribeReplies,
  parseUnsubscribeReply,
  recordUnsubscribes,
  UNSUBSCRIBE_GMAIL_QUERY,
  type UnsubscribeReply,
} from "./unsubscribeReplies";

export type UnsubscribeScanTrigger = "manual" | "schedule" | "pre-send";

export interface UnsubscribeScanRun {
  _id: ObjectId;
  trigger: UnsubscribeScanTrigger;
  triggeredBy: string | null;
  gmailUserId: string | null;
  status: "running" | "ok" | "error" | "skipped";
  started_at: Date;
  finished_at: Date | null;
  scanned: number;
  requests: number;
  newlyUnsubscribed: number;
  alreadyUnsubscribed: number;
  insertedLeads: number;
  newEmails: string[];
  error: string | null;
}

const MAX_PAGES = 5;
let scanInFlight: Promise<UnsubscribeScanRun> | null = null;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/** Scan history lives with the leads it updates, in the SEED (production) database. */
export const scanRunsCollection = () => seedCollection<UnsubscribeScanRun>("unsubscribe_scans");

/** Same scheduler_health row shape the reminder scheduler writes, shown on the admin Scheduler/Processes pages. */
export async function recordJobHealth(name: string, error: string | null, startedAt: Date) {
  try {
    await col("scheduler_health").updateOne(
      {name},
      error
        ? {$set: {name, last_run_at: startedAt, last_error: error}, $inc: {consecutive_failures: 1}}
        : {$set: {name, last_run_at: startedAt, last_success_at: startedAt, last_error: null, consecutive_failures: 0}},
      {upsert: true},
    );
  } catch (err) {
    logger.warn("job_health_write_failed", {name, error: String(err)});
  }
}

/**
 * The account whose Gmail receives replies to contact@remindocr.com:
 * UNSUBSCRIBE_SCAN_GMAIL_USER (an email) when set, otherwise the first admin
 * with a connected Gmail. Null when neither exists.
 */
export async function unsubscribeScanUserId(): Promise<string | null> {
  return runWithPrimaryDb(async () => {
    const users = col<any>("users");
    const configured = process.env.UNSUBSCRIBE_SCAN_GMAIL_USER?.trim().toLowerCase();
    if (configured) {
      const user = await users.findOne({email: configured});
      if (user) return user._id.toString();
      logger.warn("unsubscribe_scan_user_not_found", {email: configured});
    }
    const admin = await users.findOne(
      {role: "admin", gmail_refresh_token: {$type: "string", $ne: ""}},
      {sort: {updated_at: -1}},
    );
    return admin ? admin._id.toString() : null;
  });
}

async function searchReplies(gmailUserId: string): Promise<{scanned: number; replies: UnsubscribeReply[]}> {
  let accessToken = await runWithPrimaryDb(() => resolveGmailToken(gmailUserId));
  if (!accessToken) throw new Error("gmail_not_connected");
  const replies: UnsubscribeReply[] = [];
  let scanned = 0;
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listPath = `messages?q=${encodeURIComponent(UNSUBSCRIBE_GMAIL_QUERY)}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    let listRes = await gmailFetch(accessToken, listPath);
    if (listRes.status === 401) {
      const refreshed = await runWithPrimaryDb(() => retryWithRefresh(gmailUserId));
      if (!refreshed) throw new Error("gmail_not_connected");
      accessToken = refreshed;
      listRes = await gmailFetch(accessToken, listPath);
    }
    if (!listRes.ok) throw new Error(`gmail_search_failed (${listRes.status})`);
    const listData = await listRes.json() as {messages?: {id: string}[]; nextPageToken?: string};
    const ids = (listData.messages ?? []).map((m) => m.id);
    scanned += ids.length;
    const token = accessToken;
    const parsed = await Promise.all(ids.map(async (id) => {
      const msgRes = await gmailFetch(token, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
      if (!msgRes.ok) return null;
      const msg = await msgRes.json() as any;
      return parseUnsubscribeReply({id, snippet: msg.snippet, internalDate: msg.internalDate, headers: msg.payload?.headers ?? []});
    }));
    for (const reply of parsed) if (reply) replies.push(reply);
    if (!listData.nextPageToken) break;
    pageToken = listData.nextPageToken;
  }
  return {scanned, replies};
}

/**
 * Searches Gmail for "הסר" replies, flags the senders unsubscribed in
 * inspector_leads, and logs the run in unsubscribe_scans. Concurrent callers
 * share the run already in progress instead of starting a second one.
 */
export function runUnsubscribeScan(opts: {
  trigger: UnsubscribeScanTrigger;
  triggeredBy?: string | null;
  gmailUserId?: string | null;
}): Promise<UnsubscribeScanRun> {
  if (scanInFlight) return scanInFlight;
  scanInFlight = (async () => {
    const run: UnsubscribeScanRun = {
      _id: new ObjectId(),
      trigger: opts.trigger,
      triggeredBy: opts.triggeredBy ?? null,
      gmailUserId: null,
      status: "running",
      started_at: new Date(),
      finished_at: null,
      scanned: 0,
      requests: 0,
      newlyUnsubscribed: 0,
      alreadyUnsubscribed: 0,
      insertedLeads: 0,
      newEmails: [],
      error: null,
    };
    let runs: Awaited<ReturnType<typeof scanRunsCollection>> | null = null;
    try {
      runs = await scanRunsCollection();
      await runs.insertOne(run);
      const gmailUserId = opts.gmailUserId ?? await unsubscribeScanUserId();
      run.gmailUserId = gmailUserId;
      if (!gmailUserId) throw new Error("gmail_not_connected");
      const {scanned, replies} = await searchReplies(gmailUserId);
      const unique = dedupeUnsubscribeReplies(replies);
      const result = await recordUnsubscribes(await inspectorLeadsCollection(), unique, run._id.toString());
      Object.assign(run, {status: "ok", scanned, requests: unique.length, ...result});
    } catch (err: any) {
      run.status = "error";
      run.error = err?.message ?? String(err);
    }
    run.finished_at = new Date();
    // Without a reachable SEED DB there is nowhere to log the run; the error still goes to the logs and health row.
    if (runs) await runs.updateOne({_id: run._id}, {$set: run}).catch(() => undefined);
    await recordJobHealth("unsubscribeScan", run.status === "error" ? `${run.trigger}: ${run.error}` : null, run.started_at);
    const log = run.status === "ok" ? logger.info : logger.warn;
    log("unsubscribe_scan_completed", {
      scan_id: run._id.toString(), trigger: run.trigger, status: run.status, scanned: run.scanned,
      requests: run.requests, new: run.newEmails.length, error: run.error,
    });
    return run;
  })().finally(() => { scanInFlight = null; });
  return scanInFlight;
}

/**
 * Hourly (UNSUBSCRIBE_SCAN_INTERVAL_MINUTES) background scan. Like the reminder
 * scheduler it only runs in production, unless UNSUBSCRIBE_SCAN_ENABLED=true.
 */
export function startUnsubscribeScanScheduler() {
  if (schedulerTimer) return;
  const isProd = (process.env.APP_ENV ?? "development") === "production";
  const forced = process.env.UNSUBSCRIBE_SCAN_ENABLED === "true";
  const disabled = process.env.UNSUBSCRIBE_SCAN_ENABLED === "false";
  if (disabled || (!isProd && !forced)) {
    logger.info("unsubscribe_scan_scheduler_skipped", {reason: disabled ? "UNSUBSCRIBE_SCAN_ENABLED=false" : "APP_ENV is not 'production'"});
    return;
  }
  const minutes = Math.max(5, Number(process.env.UNSUBSCRIBE_SCAN_INTERVAL_MINUTES ?? 60) || 60);
  const tick = async () => {
    if (await isProcessPaused("unsubscribe_scan")) {
      logger.info("unsubscribe_scan_paused", {});
      return;
    }
    await runUnsubscribeScan({trigger: "schedule"}).catch(() => undefined);
  };
  // First run shortly after boot, then on the interval.
  setTimeout(() => { void tick(); }, 2 * 60 * 1000).unref?.();
  schedulerTimer = setInterval(() => { void tick(); }, minutes * 60 * 1000);
  schedulerTimer.unref?.();
  logger.info("unsubscribe_scan_scheduler_started", {interval_minutes: minutes});
}

export function stopUnsubscribeScanScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
