import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { Task } from "../../src/shared/types.js";

export const useTasksStore = defineStore("tasks", () => {
  const rows = ref<Task[]>([]);
  const loading = ref(false);

  async function fetch(params?: { status?: string; clientId?: number }) {
    loading.value = true;
    try {
      rows.value = await api.tasks.list(params);
    } finally {
      loading.value = false;
    }
  }

  async function update(id: number, body: Partial<Task>) {
    const updated = await api.tasks.update(id, body);
    const idx = rows.value.findIndex((t) => t.id === id);
    if (idx !== -1) rows.value[idx] = updated;
    return updated;
  }

  async function markDone(id: number) {
    return update(id, { status: "done" });
  }

  return { rows, loading, fetch, update, markDone };
});
