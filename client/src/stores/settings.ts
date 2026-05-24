import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { AppSettings } from "../../src/shared/types.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings | null>(null);
  const loading = ref(false);
  const saving = ref(false);

  // Public config available to all authenticated users
  const userDocumentLimit = ref<number>(25);
  let _configLoaded = false;

  async function loadConfig() {
    if (_configLoaded) return;
    try {
      const cfg = await api.config.get();
      userDocumentLimit.value = cfg.userDocumentLimit;
      _configLoaded = true;
    } catch { /* keep default */ }
  }

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

  return { settings, loading, saving, load, save, userDocumentLimit, loadConfig };
});
