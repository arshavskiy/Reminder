import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { AppSettings } from "@shared/types.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings | null>(null);
  const loading = ref(false);
  const saving = ref(false);

  async function load() {
    loading.value = true;
    try {
      settings.value = await api.settings.get();
    } finally {
      loading.value = false;
    }
  }

  async function save(updates: Partial<AppSettings>) {
    saving.value = true;
    try {
      settings.value = await api.settings.save(updates);
    } finally {
      saving.value = false;
    }
  }

  return { settings, loading, saving, load, save };
});
