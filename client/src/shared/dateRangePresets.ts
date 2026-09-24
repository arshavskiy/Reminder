/**
 * Shared date-range presets for the invoice and expense toolbars.
 *
 * These are trailing windows counted back from today, not calendar periods:
 * "3m" is the last three months ending now, not the current quarter.
 *
 * Values are epoch milliseconds to match n-date-picker's daterange model. The
 * end bound is the end of today and the start bound is the start of its day,
 * so both edge days are fully included.
 */

export type DateRangePresetId = "1m" | "3m" | "6m" | "1y" | "3y";

export type DateRangeTuple = [number, number];

const PRESET_MONTHS: Record<DateRangePresetId, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
  "3y": 36,
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/**
 * Subtracting months can overflow when the source day does not exist in the
 * target month — Date would roll Mar 31 minus 1 month into Mar 3. Clamp to the
 * last valid day of the target month instead.
 */
function subtractMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date);
  target.setDate(1);
  target.setMonth(target.getMonth() - months);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

export function resolveDateRangePreset(
  id: DateRangePresetId,
  now: Date = new Date(),
): DateRangeTuple {
  const to = endOfDay(now);
  const from = startOfDay(subtractMonths(now, PRESET_MONTHS[id]));
  return [from.getTime(), to.getTime()];
}

// `label` is the compact chip text; `title` is the spoken/hover description,
// since "1m" alone is not meaningful to a screen reader.
export const DATE_RANGE_PRESETS: Array<{ id: DateRangePresetId; label: string; title: string }> = [
  { id: "1m", label: "1m", title: "החודש האחרון" },
  { id: "3m", label: "3m", title: "3 החודשים האחרונים" },
  { id: "6m", label: "6m", title: "6 החודשים האחרונים" },
  { id: "1y", label: "1y", title: "השנה האחרונה" },
  { id: "3y", label: "3y", title: "3 השנים האחרונות" },
];

/** Which preset, if any, the current range matches — for highlighting the active chip. */
export function matchDateRangePreset(
  range: DateRangeTuple | null,
  now: Date = new Date(),
): DateRangePresetId | null {
  if (!range) return null;
  for (const preset of DATE_RANGE_PRESETS) {
    const [from, to] = resolveDateRangePreset(preset.id, now);
    if (range[0] === from && range[1] === to) return preset.id;
  }
  return null;
}
