import {existsSync, mkdirSync, readdirSync, statSync, unlinkSync} from "fs";
import {join, resolve, sep} from "path";
import {getDataDir, getSettings} from "../settings";
import {logger} from "../logger";
import {isProcessPaused} from "../ops/processControl";

/**
 * Scratch directories under DATA_DIR.
 *
 * Railway runs this server on an ephemeral container disk with no volume
 * mounted, so every byte written here is both lost on redeploy and counted
 * against the container's disk until then. Files used to accumulate forever in
 * these directories: the write sites never unlinked them and nothing swept
 * them, so a long-lived deploy slowly filled its own disk with uploads that had
 * already been copied to object storage.
 *
 * Each entry is a directory whose contents are, by definition, reconstructible:
 * either the real copy already lives in object storage, or the file was only
 * ever an input to one request. `data/documents` is deliberately NOT listed —
 * releaseLocalDocumentCache() owns that directory and only removes a file after
 * verifying the object storage copy exists.
 */
export const TEMP_DIR_NAMES = [
  "uploads",
  "gmail-tmp",
  "template_samples",
  "tmp",
] as const;

export type TempDirName = (typeof TEMP_DIR_NAMES)[number];

/** Absolute path of a managed temp directory, created if missing. */
export function tempDir(name: TempDirName): string {
  const dir = join(getDataDir(), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Delete a scratch file once its consumer is done with it.
 *
 * Refuses any path outside the managed temp directories, so a caller that
 * accidentally passes a document's managed path (or anything else) cannot
 * destroy the only copy of a file. Never throws: cleanup failures are logged
 * and swallowed, because a leaked temp file is a much smaller problem than a
 * request failing after its real work succeeded.
 */
export function releaseTempFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  if (!isManagedTempPath(filePath)) {
    logger.warn("temp_file_release_rejected", { path: filePath });
    return;
  }
  try {
    unlinkSync(filePath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      logger.warn("temp_file_release_failed", { path: filePath, error: String(err) });
    }
  }
}

/**
 * Whether a path lies inside one of the managed temp directories. Resolved
 * before comparing so `..` segments cannot walk out of the data dir, and the
 * separator is appended so a sibling like `data/uploads-archive` does not match
 * the `data/uploads` prefix.
 */
export function isManagedTempPath(filePath: string): boolean {
  const target = resolve(filePath);
  return TEMP_DIR_NAMES.some((name) => {
    const dir = resolve(join(getDataDir(), name));
    return target.startsWith(dir + sep);
  });
}

export type TempDirUsage = {
  name: TempDirName;
  path: string;
  exists: boolean;
  file_count: number;
  total_bytes: number;
  /** Files already past the retention cutoff — what a sweep would remove now. */
  stale_count: number;
  stale_bytes: number;
  oldest_file_age_minutes: number | null;
};

/** Per-directory disk usage, for the admin processes dashboard. */
export function tempDirUsage(): TempDirUsage[] {
  const cutoff = Date.now() - retentionMs();
  return TEMP_DIR_NAMES.map((name) => {
    const path = join(getDataDir(), name);
    const usage: TempDirUsage = {
      name,
      path,
      exists: existsSync(path),
      file_count: 0,
      total_bytes: 0,
      stale_count: 0,
      stale_bytes: 0,
      oldest_file_age_minutes: null,
    };
    if (!usage.exists) return usage;

    let oldestMtime: number | null = null;
    for (const entry of safeReaddir(path)) {
      const stat = safeStat(join(path, entry));
      if (!stat?.isFile()) continue;
      usage.file_count += 1;
      usage.total_bytes += stat.size;
      if (stat.mtimeMs < cutoff) {
        usage.stale_count += 1;
        usage.stale_bytes += stat.size;
      }
      if (oldestMtime === null || stat.mtimeMs < oldestMtime) oldestMtime = stat.mtimeMs;
    }
    if (oldestMtime !== null) {
      usage.oldest_file_age_minutes = Math.round((Date.now() - oldestMtime) / 60000);
    }
    return usage;
  });
}

export type SweepResult = {
  deleted_count: number;
  deleted_bytes: number;
  failed_count: number;
  per_dir: Array<{ name: TempDirName; deleted_count: number; deleted_bytes: number }>;
};

/**
 * Remove temp files older than the retention window.
 *
 * This is the safety net, not the primary mechanism: the write sites release
 * their own files as soon as the work that needed them finishes. The sweep
 * exists for the paths that never reach their unlink — a crash mid-pipeline, an
 * early error return, a SIGTERM during a redeploy.
 *
 * Age is measured from mtime, so a file still being written keeps moving out of
 * range of the cutoff and cannot be swept out from under its writer as long as
 * retention stays well above the longest plausible processing time.
 */
export function sweepTempFiles(): SweepResult {
  const cutoff = Date.now() - retentionMs();
  const result: SweepResult = { deleted_count: 0, deleted_bytes: 0, failed_count: 0, per_dir: [] };

  for (const name of TEMP_DIR_NAMES) {
    const dir = join(getDataDir(), name);
    const perDir = { name, deleted_count: 0, deleted_bytes: 0 };
    if (existsSync(dir)) {
      for (const entry of safeReaddir(dir)) {
        const filePath = join(dir, entry);
        const stat = safeStat(filePath);
        if (!stat?.isFile() || stat.mtimeMs >= cutoff) continue;
        try {
          unlinkSync(filePath);
          perDir.deleted_count += 1;
          perDir.deleted_bytes += stat.size;
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            result.failed_count += 1;
            logger.warn("temp_file_sweep_unlink_failed", { path: filePath, error: String(err) });
          }
        }
      }
    }
    result.deleted_count += perDir.deleted_count;
    result.deleted_bytes += perDir.deleted_bytes;
    result.per_dir.push(perDir);
  }

  if (result.deleted_count > 0 || result.failed_count > 0) {
    logger.info("temp_file_sweep_completed", {
      deleted_count: result.deleted_count,
      deleted_bytes: result.deleted_bytes,
      failed_count: result.failed_count,
      retention_hours: getSettings().tempFileRetentionHours,
    });
  }
  return result;
}

let _sweepTimer: ReturnType<typeof setInterval> | null = null;
let _lastSweepAt: Date | null = null;
let _lastSweepResult: SweepResult | null = null;

export type TempSweeperState = {
  running: boolean;
  retention_hours: number;
  interval_minutes: number;
  last_run_at: string | null;
  last_result: SweepResult | null;
};

export function tempSweeperState(): TempSweeperState {
  const settings = getSettings();
  return {
    running: _sweepTimer !== null,
    retention_hours: settings.tempFileRetentionHours,
    interval_minutes: settings.tempFileSweepIntervalMinutes,
    last_run_at: _lastSweepAt ? _lastSweepAt.toISOString() : null,
    last_result: _lastSweepResult,
  };
}

/** Run a sweep now and record it as the latest run, for the admin view. */
export function runTempFileSweep(): SweepResult {
  const result = sweepTempFiles();
  _lastSweepAt = new Date();
  _lastSweepResult = result;
  return result;
}

/**
 * Sweep at boot and then on an interval. The boot sweep matters most on Railway:
 * a redeploy is exactly when the previous container's half-finished work was
 * abandoned, and on a platform that keeps the disk across a restart those files
 * would otherwise never be claimed by anyone.
 */
export function startTempFileSweeper(): void {
  if (_sweepTimer) return;
  // Not awaited: the boot sweep must never delay the server becoming healthy,
  // and Railway's healthcheck is what decides whether this deploy goes live.
  void isProcessPaused("temp_sweeper")
    .then((paused) => {
      if (!paused) runTempFileSweep();
    })
    .catch((err) => logger.warn("temp_file_sweep_boot_failed", { error: String(err) }));
  const intervalMs = getSettings().tempFileSweepIntervalMinutes * 60_000;
  _sweepTimer = setInterval(() => {
    void isProcessPaused("temp_sweeper")
      .then((paused) => {
        if (paused) return;
        runTempFileSweep();
      })
      .catch((err) => logger.warn("temp_file_sweep_failed", { error: String(err) }));
  }, intervalMs);
  _sweepTimer.unref?.();
  logger.info("temp_file_sweeper_started", {
    retention_hours: getSettings().tempFileRetentionHours,
    interval_minutes: getSettings().tempFileSweepIntervalMinutes,
    directories: TEMP_DIR_NAMES,
  });
}

export function stopTempFileSweeper(): void {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
    logger.info("temp_file_sweeper_stopped", {});
  }
}

function retentionMs(): number {
  return getSettings().tempFileRetentionHours * 3600_000;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (err) {
    logger.warn("temp_dir_read_failed", { path: dir, error: String(err) });
    return [];
  }
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return null; // raced with another deleter, or vanished mid-scan
  }
}
