import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {logger} from "../logger";
import {isProcessPaused} from "../ops/processControl";
import {recordJobHealth} from "../outreach/unsubscribeScan";
import {existsInR2, putToR2, r2MirrorEnabled} from "./r2Mirror";
import {readFromSpaces} from "./spaces";

/**
 * Copies document files that are in the primary bucket but missing from R2 —
 * uploads from before the mirror existed, or ones whose mirror write failed.
 * Never overwrites: a key already in R2 is left alone.
 */

export interface R2ReconcileResult {
  scope: "recent" | "full";
  checked: number;
  copied: number;
  /** In Mongo but not in the primary bucket either — nothing to copy. */
  missingSource: number;
  failed: number;
  failedKeys: string[];
}

const CONCURRENCY = 8;
/** The hourly run only looks at recent documents; a full pass is an admin action. */
const RECENT_DAYS = 3;
let runInFlight: Promise<R2ReconcileResult> | null = null;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

async function reconcileKey(key: string, result: R2ReconcileResult) {
  try {
    if (await existsInR2(key)) return;
    const object = await readFromSpaces(key);
    if (!object) {
      result.missingSource += 1;
      return;
    }
    await putToR2(key, object.body, object.contentType);
    result.copied += 1;
  } catch (err) {
    result.failed += 1;
    if (result.failedKeys.length < 20) result.failedKeys.push(key);
    logger.warn("r2_reconcile_key_failed", {key, error: String(err)});
  }
}

export function runR2Reconcile(opts: {full?: boolean} = {}): Promise<R2ReconcileResult> {
  if (runInFlight) return runInFlight;
  runInFlight = (async () => {
    const result: R2ReconcileResult = {
      scope: opts.full ? "full" : "recent",
      checked: 0,
      copied: 0,
      missingSource: 0,
      failed: 0,
      failedKeys: [],
    };
    if (!r2MirrorEnabled()) throw new Error("R2 mirror not configured");

    const filter: Record<string, unknown> = {spaces_key: {$type: "string", $ne: ""}};
    if (!opts.full) {
      filter._id = {$gte: ObjectId.createFromTime(Math.floor(Date.now() / 1000) - RECENT_DAYS * 24 * 3600)};
    }
    const cursor = col<any>("documents").find(filter, {projection: {spaces_key: 1}});
    let batch: string[] = [];
    const flush = async () => {
      await Promise.all(batch.map((key) => reconcileKey(key, result)));
      batch = [];
    };
    for await (const doc of cursor) {
      result.checked += 1;
      batch.push(doc.spaces_key);
      if (batch.length >= CONCURRENCY) await flush();
    }
    await flush();

    const log = result.failed ? logger.warn : logger.info;
    log("r2_reconcile_completed", {...result});
    return result;
  })().finally(() => { runInFlight = null; });
  return runInFlight;
}

/**
 * Hourly catch-up while the mirror is configured. Pausing the document
 * processing worker from the admin Processes page also pauses this.
 */
export function startR2ReconcileScheduler() {
  if (schedulerTimer || !r2MirrorEnabled()) return;
  const tick = async () => {
    if (await isProcessPaused("documents")) return;
    const startedAt = new Date();
    try {
      await runR2Reconcile();
      await recordJobHealth("r2Reconcile", null, startedAt);
    } catch (err) {
      await recordJobHealth("r2Reconcile", String(err), startedAt);
    }
  };
  setTimeout(() => { void tick(); }, 5 * 60 * 1000).unref?.();
  schedulerTimer = setInterval(() => { void tick(); }, 60 * 60 * 1000);
  schedulerTimer.unref?.();
  logger.info("r2_reconcile_scheduler_started", {});
}

export function stopR2ReconcileScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
