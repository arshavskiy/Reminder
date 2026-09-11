import {col} from "../db/db";
import {logger} from "../logger";

/**
 * Background work this server runs, and the switch that turns each one off.
 *
 * Two different kinds of thing live behind one name here, because an operator
 * does not care about the distinction:
 *
 *  - DB-queue workers (documents, gmail_import, drive_export) drain a Mongo
 *    collection. Pausing them is durable and replica-wide: the loop checks the
 *    pause flag before claiming its next job, so every container stops and the
 *    pause survives a redeploy.
 *  - In-process timers (scheduler, whatsapp, temp_sweeper) are `setInterval`
 *    handles owned by one container. The pause flag is still stored in Mongo and
 *    still checked on every tick, which is what makes the pause outlive a
 *    restart — clearing the timer alone would be forgotten on the next boot.
 *
 * Checking a flag per tick rather than clearing timers is deliberate: it gives
 * one mechanism that behaves identically for both kinds, works across replicas,
 * and cannot leave a worker stopped with no way to start it again from the UI.
 */
export const PROCESS_IDS = [
  "scheduler",
  "documents",
  "gmail_import",
  "drive_export",
  "whatsapp",
  "temp_sweeper",
] as const;

export type ProcessId = (typeof PROCESS_IDS)[number];

export type ProcessKind = "queue_worker" | "interval_timer";

export type ProcessDescriptor = {
  id: ProcessId;
  label: string;
  kind: ProcessKind;
  /** Mongo collection holding this worker's job rows, when it is queue-backed. */
  jobCollection: string | null;
  description: string;
};

export const PROCESS_DESCRIPTORS: ProcessDescriptor[] = [
  {
    id: "scheduler",
    label: "Reminder scheduler",
    kind: "interval_timer",
    jobCollection: null,
    description: "Reminder checks, escalations, monthly reports and calendar sync.",
  },
  {
    id: "documents",
    label: "Document processing",
    kind: "queue_worker",
    jobCollection: "document_processing_jobs",
    description: "OCR, AI extraction and entity creation for imported documents.",
  },
  {
    id: "gmail_import",
    label: "Gmail import",
    kind: "queue_worker",
    jobCollection: "gmail_import_jobs",
    description: "Pulls matching Gmail attachments into the document pipeline.",
  },
  {
    id: "drive_export",
    label: "Drive export",
    kind: "queue_worker",
    jobCollection: "drive_export_jobs",
    description: "Mirrors processed documents into the user's Google Drive.",
  },
  {
    id: "whatsapp",
    label: "WhatsApp sender",
    kind: "interval_timer",
    jobCollection: "whatsapp_outbox",
    description: "Drains the outbound WhatsApp message queue.",
  },
  {
    id: "temp_sweeper",
    label: "Temp file sweeper",
    kind: "interval_timer",
    jobCollection: null,
    description: "Deletes scratch files left in the data directory past retention.",
  },
];

const PAUSE_COLLECTION = "process_controls";

/**
 * Pause flags, cached in memory so a hot worker loop does not hit Mongo before
 * every job. The TTL is short because the only cost of a stale read is that a
 * pause takes effect a few seconds late, while the cost of no cache is a query
 * per job on the busiest path in the system.
 */
const CACHE_TTL_MS = 5_000;
let _cache: { at: number; paused: Set<string> } | null = null;

export type ProcessControlRow = {
  process_id: ProcessId;
  paused: boolean;
  paused_at: Date | null;
  paused_by: string | null;
  reason: string | null;
  updated_at: Date;
};

/**
 * Whether a worker should skip its next unit of work.
 *
 * Never throws: if Mongo is unreachable the honest answer is "keep working",
 * because a DB blip must not silently stop reminder emails and document
 * processing across the whole fleet.
 */
export async function isProcessPaused(id: ProcessId): Promise<boolean> {
  try {
    const now = Date.now();
    if (!_cache || now - _cache.at > CACHE_TTL_MS) {
      const rows = await col<ProcessControlRow>(PAUSE_COLLECTION)
        .find({ paused: true } as any, { projection: { process_id: 1 } } as any)
        .toArray();
      _cache = { at: now, paused: new Set(rows.map((r: any) => String(r.process_id))) };
    }
    return _cache.paused.has(id);
  } catch (err) {
    logger.warn("process_pause_check_failed", { process_id: id, error: String(err) });
    return false;
  }
}

/** Drop the cache so a pause or resume takes effect on the next check. */
export function invalidateProcessPauseCache(): void {
  _cache = null;
}

export async function setProcessPaused(
  id: ProcessId,
  paused: boolean,
  actor: { userId?: string; email?: string } = {},
  reason?: string,
): Promise<ProcessControlRow> {
  const now = new Date();
  const by = actor.email ?? actor.userId ?? null;
  await col<ProcessControlRow>(PAUSE_COLLECTION).updateOne(
    { process_id: id } as any,
    {
      $set: {
        process_id: id,
        paused,
        paused_at: paused ? now : null,
        paused_by: paused ? by : null,
        reason: paused ? (reason ?? null) : null,
        updated_at: now,
      },
    } as any,
    { upsert: true },
  );
  invalidateProcessPauseCache();
  logger.info(paused ? "process_paused" : "process_resumed", {
    process_id: id,
    actor: by,
    reason: reason ?? null,
  });
  return {
    process_id: id,
    paused,
    paused_at: paused ? now : null,
    paused_by: paused ? by : null,
    reason: paused ? (reason ?? null) : null,
    updated_at: now,
  };
}

export async function listProcessControls(): Promise<Map<ProcessId, ProcessControlRow>> {
  const rows = await col<ProcessControlRow>(PAUSE_COLLECTION).find({}).toArray();
  const map = new Map<ProcessId, ProcessControlRow>();
  for (const row of rows as any[]) {
    map.set(row.process_id, row as ProcessControlRow);
  }
  return map;
}

export type JobQueueStats = {
  queued: number;
  running: number;
  retry_wait: number;
  failed: number;
  completed_last_hour: number;
  oldest_queued_at: string | null;
  /** Rows stuck in `running` past the point where a live worker would have finished. */
  stale_running: number;
};

const STALE_RUNNING_MS = 15 * 60_000;

/**
 * Queue depth for one worker's job collection. Counts are computed in a single
 * aggregation per collection rather than one countDocuments per status, because
 * this endpoint is polled by the admin dashboard.
 */
export async function jobQueueStats(collection: string): Promise<JobQueueStats> {
  const hourAgo = new Date(Date.now() - 3600_000);
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

  const [byStatus, oldestQueued, completedRecently, staleRunning] = await Promise.all([
    col(collection).aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    col(collection).find({ status: "queued" } as any, {
      projection: { created_at: 1 },
      sort: { created_at: 1 },
      limit: 1,
    } as any).toArray(),
    col(collection).countDocuments({
      status: "completed",
      completed_at: { $gte: hourAgo },
    } as any),
    col(collection).countDocuments({
      status: "running",
      locked_at: { $lt: staleBefore },
    } as any),
  ]);

  const count = (status: string) =>
    Number((byStatus as any[]).find((r) => r._id === status)?.count ?? 0);

  const oldest = (oldestQueued as any[])[0]?.created_at ?? null;
  return {
    queued: count("queued"),
    running: count("running"),
    retry_wait: count("retry_wait"),
    failed: count("failed"),
    completed_last_hour: Number(completedRecently),
    oldest_queued_at: oldest ? new Date(oldest).toISOString() : null,
    stale_running: Number(staleRunning),
  };
}

export type UserQueueLoad = {
  user_id: string | null;
  queued: number;
  running: number;
  retry_wait: number;
  failed: number;
  total: number;
};

/**
 * Queue load broken down by user.
 *
 * The fleet-wide totals answer "is the pipeline healthy"; this answers "whose
 * work is affected", which is the question an operator actually acts on — one
 * account's stuck batch looks identical to a systemic outage in the aggregate.
 * Completed rows are excluded so the list stays about outstanding work.
 */
export async function userQueueLoad(collection: string, limit = 20): Promise<UserQueueLoad[]> {
  const rows = await col(collection).aggregate([
    { $match: { status: { $in: ["queued", "running", "retry_wait", "failed"] } } },
    {
      $group: {
        _id: "$user_id",
        queued: { $sum: { $cond: [{ $eq: ["$status", "queued"] }, 1, 0] } },
        running: { $sum: { $cond: [{ $eq: ["$status", "running"] }, 1, 0] } },
        retry_wait: { $sum: { $cond: [{ $eq: ["$status", "retry_wait"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]).toArray();

  return (rows as any[]).map((r) => ({
    user_id: r._id ? String(r._id) : null,
    queued: r.queued ?? 0,
    running: r.running ?? 0,
    retry_wait: r.retry_wait ?? 0,
    failed: r.failed ?? 0,
    total: r.total ?? 0,
  }));
}

export type CancelJobResult = { ok: boolean; reason?: string };

/**
 * Cancel one job row.
 *
 * A queued or retry_wait job is marked failed so no worker picks it up. A
 * running job is only released back to `queued` — there is no way to interrupt
 * the async work already in flight for it, so pretending otherwise would be a
 * lie. Releasing it lets a worker retry once the current attempt dies, which is
 * the same recovery path a stale lock already takes.
 */
export async function cancelQueueJob(
  collection: string,
  jobId: string,
  actor: string | null,
): Promise<CancelJobResult> {
  const { ObjectId } = await import("mongodb");
  let filter: Record<string, any>;
  try {
    filter = { _id: new ObjectId(jobId) };
  } catch {
    return { ok: false, reason: "invalid_job_id" };
  }

  const job = await col(collection).findOne(filter) as any;
  if (!job) return { ok: false, reason: "not_found" };

  if (job.status === "running") {
    await col(collection).updateOne(filter, {
      $set: {
        status: "queued",
        locked_at: null,
        locked_by: null,
        error_message: `released by ${actor ?? "admin"}`,
        updated_at: new Date(),
      },
    } as any);
    logger.info("queue_job_released", { collection, job_id: jobId, actor });
    return { ok: true, reason: "released_running_job" };
  }

  await col(collection).updateOne(filter, {
    $set: {
      status: "failed",
      error_code: "cancelled_by_admin",
      error_message: `cancelled by ${actor ?? "admin"}`,
      completed_at: new Date(),
      updated_at: new Date(),
    },
  } as any);
  logger.info("queue_job_cancelled", { collection, job_id: jobId, actor });
  return { ok: true };
}

export type QueueJobRow = {
  id: string;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  user_id: string | null;
  document_id: string | null;
  error_code: string | null;
  error_message: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string | null;
  next_run_at: string | null;
};

/**
 * Most recent job rows for one worker, newest first, for the admin table.
 *
 * Every queue row carries the user it belongs to, so `userId` narrows the list
 * to one account — the usual question when a queue is backed up is whose work
 * is stuck, not what the fleet is doing in aggregate.
 */
export async function recentQueueJobs(
  collection: string,
  limit = 20,
  userId?: string,
): Promise<QueueJobRow[]> {
  const filter = userId ? { user_id: userId } : {};
  const rows = await col(collection)
    .find(filter as any, { sort: { created_at: -1 }, limit } as any)
    .toArray();
  return (rows as any[]).map((r) => ({
    id: String(r._id),
    status: String(r.status ?? "unknown"),
    attempts: r.attempts ?? null,
    max_attempts: r.max_attempts ?? null,
    user_id: r.user_id ? String(r.user_id) : null,
    document_id: r.document_id ? String(r.document_id) : null,
    error_code: r.error_code ?? null,
    error_message: r.error_message ?? null,
    locked_by: r.locked_by ?? null,
    locked_at: r.locked_at ? new Date(r.locked_at).toISOString() : null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    next_run_at: r.next_run_at ? new Date(r.next_run_at).toISOString() : null,
  }));
}
