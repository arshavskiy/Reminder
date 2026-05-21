import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { ReminderWithContext } from "../../src/shared/types.js";

export const useRemindersStore = defineStore("reminders", () => {
  const rows = ref<ReminderWithContext[]>([]);
  const total = ref(0);
  const loading = ref(false);

  async function fetch(params?: { status?: string; days?: number; limit?: number }) {
    loading.value = true;
    try {
      const r = await api.reminders.list(params);
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

  async function sendNow(id: number) {
    return api.reminders.sendNow(id);
  }

  return { rows, total, loading, fetch, dismiss, sendNow };
});
