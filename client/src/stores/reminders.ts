import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { ReminderWithContext } from "../../src/shared/types.js";

export const useRemindersStore = defineStore("reminders", () => {
  const rows = ref<ReminderWithContext[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const lastParams = ref<{ status?: string; days?: number; limit?: number; category?: string } | undefined>(undefined);

  /** The server returns at most this many reminders per request. */
  const PAGE_SIZE = 200;

  /**
   * Loads up to `limit` reminders. The API caps one response at PAGE_SIZE, so
   * larger requests are fetched page by page; otherwise the page's totals and
   * tabs were counted from only the first 200 rows.
   */
  async function fetch(params?: { status?: string; days?: number; limit?: number; category?: string }, force = false) {
    lastParams.value = params;
    loading.value = true;
    try {
      const wanted = params?.limit ?? 50;
      const first = await api.reminders.list({ ...params, limit: Math.min(wanted, PAGE_SIZE) }, force);
      const all = [...first.rows];
      const target = Math.min(wanted, first.total);
      while (all.length < target) {
        const page = await api.reminders.list({ ...params, limit: Math.min(PAGE_SIZE, target - all.length), offset: all.length }, force);
        if (!page.rows.length) break;
        all.push(...page.rows);
      }
      const seen = new Set<unknown>();
      rows.value = all.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
      total.value = first.total;
    } finally {
      loading.value = false;
    }
  }

  async function refetchLast() {
    if (!lastParams.value && rows.value.length === 0) return;
    await fetch(lastParams.value, true);
  }

  async function dismiss(id: number) {
    await api.reminders.dismiss(id);
    rows.value = rows.value.filter((r) => r.id !== id);
  }

  async function remove(id: number) {
    await api.reminders.delete(id);
    rows.value = rows.value.filter((r) => r.id !== id);
  }

  async function sendNow(id: number) {
    return api.reminders.sendNow(id);
  }

  async function removeAll() {
    await api.reminders.deleteAll();
    rows.value = [];
    total.value = 0;
  }

  return { rows, total, loading, fetch, refetchLast, dismiss, remove, sendNow, removeAll };
});
