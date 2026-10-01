import {
  DATE_RANGE_PRESETS,
  matchDateRangePreset,
  resolveDateRangePreset,
  type DateRangePresetId,
  type DateRangeTuple,
} from "./dateRangePresets";

/**
 * Remembers what a user selected on a table page (filters, sort, page size,
 * date range, visible tab) so it is still there on the next visit.
 *
 * Pure helpers over an injected storage so they can be tested without a browser;
 * `composables/useTableState.ts` wires them to localStorage and Vue.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "ui.table.";
const VERSION = 1;

/** Keyed per user, so two accounts on one browser do not share a view. */
export function tableStateKey(userKey: string | number | null | undefined, pageKey: string): string {
  return `${PREFIX}${userKey ?? "anon"}.${pageKey}`;
}

export function loadTableState<T extends Record<string, unknown>>(storage: StorageLike | null, key: string): Partial<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
    if (parsed?.v !== VERSION || !parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return null;
    return parsed.data as Partial<T>;
  } catch {
    return null;
  }
}

export function saveTableState(storage: StorageLike | null, key: string, data: Record<string, unknown>): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ v: VERSION, data }));
  } catch {
    /* quota exceeded or private mode: the view just is not remembered */
  }
}

export function clearTableState(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * A date range as saved. A preset is stored by id so "last 3 months" keeps
 * meaning the trailing three months on the next visit rather than the dates it
 * covered when it was saved. `none` records an explicit "all time", which is
 * different from never having chosen (where a page default applies).
 */
export type SavedDateRange = { preset: DateRangePresetId } | { from: number; to: number } | { none: true };

export function encodeDateRange(range: DateRangeTuple | null, now: Date = new Date()): SavedDateRange {
  if (!range) return { none: true };
  const preset = matchDateRangePreset(range, now);
  return preset ? { preset } : { from: range[0], to: range[1] };
}

/** `undefined` = nothing saved (use the default), `null` = saved as all time. */
export function decodeDateRange(saved: unknown, now: Date = new Date()): DateRangeTuple | null | undefined {
  if (!saved || typeof saved !== "object") return undefined;
  const value = saved as Record<string, unknown>;
  if (value.none === true) return null;
  if (typeof value.preset === "string" && DATE_RANGE_PRESETS.some((p) => p.id === value.preset)) {
    return resolveDateRangePreset(value.preset as DateRangePresetId, now);
  }
  if (Number.isFinite(value.from) && Number.isFinite(value.to) && (value.from as number) <= (value.to as number)) {
    return [value.from as number, value.to as number];
  }
  return undefined;
}

/** Keeps a saved value only if it is one of the allowed options. */
export function pickOne<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

export function asString(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
