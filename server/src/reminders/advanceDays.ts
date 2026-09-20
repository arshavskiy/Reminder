import {col} from "../db/db";
import {getSettings} from "../settings";

/** Guard against a typo turning into hundreds of reminders per contract. */
const MAX_ENTRIES = 6;
const MAX_DAYS = 365;

export function parseAdvanceDays(raw: unknown): number[] | null {
  if (raw == null || raw === "") return null;
  let list: unknown = raw;
  if (typeof raw === "number") {
    list = [raw];
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      list = JSON.parse(trimmed);
    } catch {
      // Also accept a bare "90,60,30" so a hand-edited value is not silently lost.
      list = trimmed.split(",");
    }
    if (typeof list === "number") list = [list];
  }
  if (!Array.isArray(list)) return null;

  const days = list
    .map((entry) => Number(String(entry).trim()))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= MAX_DAYS);

  const unique = [...new Set(days)].sort((a, b) => b - a).slice(0, MAX_ENTRIES);
  return unique.length ? unique : null;
}

/**
 * Advance-warning days for one user, falling back to the server-wide default.
 * The scheduler used to read only the env value, so a user's own
 * `reminder_advance_days` was stored but never applied.
 */
export async function advanceDaysForUser(userId?: string | null): Promise<number[]> {
  const fallback = getSettings().reminderAdvanceDays;
  if (!userId) return fallback;
  try {
    const row = await col("user_settings").findOne(
      {user_id: String(userId)} as any,
      {projection: {reminder_advance_days: 1}} as any,
    );
    return parseAdvanceDays((row as any)?.reminder_advance_days) ?? fallback;
  } catch {
    return fallback;
  }
}
