import { onScopeDispose, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth.js";
import {
  clearTableState,
  loadTableState,
  saveTableState,
  tableStateKey,
  type StorageLike,
} from "../shared/tableState";

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Remember a table page's selections per user. Call it once while the page sets
 * up: `restore` runs immediately with whatever was saved (before the first
 * load, so the first request already uses it) and every later change to
 * `snapshot()` is written back, debounced.
 *
 *   usePersistedTableState("invoices", {
 *     snapshot: () => ({ sortBy: sortBy.value, pageSize: pageSize.value }),
 *     restore: (saved) => { if (saved.sortBy) sortBy.value = saved.sortBy; },
 *   });
 *
 * `restore` must validate what it reads: saved data can be stale (an option that
 * no longer exists) or from an older version of the page.
 */
export function usePersistedTableState<T extends Record<string, unknown>>(
  pageKey: string,
  options: { snapshot: () => T; restore: (saved: Partial<T>) => void; debounceMs?: number },
) {
  const authStore = useAuthStore();
  const storage = browserStorage();
  const key = tableStateKey(authStore.user?.id, pageKey);

  const saved = loadTableState<T>(storage, key);
  if (saved) {
    try { options.restore(saved); } catch { /* a broken saved view must never block the page */ }
  }

  let timer: number | undefined;
  let pending: T | null = null;
  const flush = () => {
    window.clearTimeout(timer);
    if (pending) saveTableState(storage, key, pending);
    pending = null;
  };
  const stop = watch(options.snapshot, (value) => {
    pending = value;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, options.debounceMs ?? 300);
  }, { deep: true });

  // Leaving the page inside the debounce window must not lose the last change.
  onScopeDispose(() => {
    stop();
    flush();
  });

  return {
    /** Forget the saved view; the caller resets its own refs. */
    clear: () => clearTableState(storage, key),
    hadSavedState: saved !== null,
  };
}

export type SavedSort = { columnKey: string; order: "ascend" | "descend" } | null;

/** Parses a saved sort, dropping anything that is not a known column. */
export function parseSavedSort(value: unknown, columnKeys: readonly string[]): SavedSort {
  if (!value || typeof value !== "object") return null;
  const { columnKey, order } = value as Record<string, unknown>;
  if (typeof columnKey !== "string" || !columnKeys.includes(columnKey)) return null;
  return order === "ascend" || order === "descend" ? { columnKey, order } : null;
}

/**
 * Controlled sorting for an n-data-table, so the chosen column and direction can
 * be saved with the rest of the page's state. `initial` is the order the page
 * opens with when nothing is saved:
 *
 *   const tableSort = useTableSort();
 *   <n-data-table :columns="tableSort.apply(columns)" @update:sorter="tableSort.onUpdate" />
 */
export function useTableSort(initial: SavedSort = null) {
  const sort = ref<SavedSort>(initial);
  function apply<C extends { key?: unknown; sorter?: unknown }>(columns: C[]): C[] {
    return columns.map((column) => {
      if (!column.sorter) return column;
      const active = sort.value && sort.value.columnKey === String(column.key) ? sort.value.order : false;
      return { ...column, sortOrder: active };
    });
  }
  function onUpdate(next: { columnKey: string | number; order: "ascend" | "descend" | false } | Array<{ columnKey: string | number; order: "ascend" | "descend" | false }> | null) {
    const state = Array.isArray(next) ? next[0] : next;
    sort.value = state && state.order ? { columnKey: String(state.columnKey), order: state.order } : null;
  }
  return { sort, apply, onUpdate };
}
