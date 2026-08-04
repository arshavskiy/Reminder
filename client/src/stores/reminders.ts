import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { ReminderWithContext } from "../../src/shared/types.js";

export const useRemindersStore = defineStore("reminders", () => {
  const rows = ref<ReminderWithContext[]>([]);
  const total = ref(0);
  const loading = ref(false);

  async function fetch(params?: { status?: string; days?: number; limit?: number }, force = false) {
    loading.value = true;
    try {
      const r = await api.reminders.list(params, force);
      rows.value = r.rows;
      total.value = r.total;
    } finally {
      loading.value = false;
    }
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

  return { rows, total, loading, fetch, dismiss, remove, sendNow, removeAll };
});
