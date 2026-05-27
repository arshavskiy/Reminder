import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { DashboardStats } from "../../src/shared/types.js";

export const useDashboardStore = defineStore("dashboard", () => {
  const stats = ref<DashboardStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetch(force = false) {
    loading.value = true;
    error.value = null;
    try {
      stats.value = await api.dashboard.stats(force);
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  return { stats, loading, error, fetch };
});
