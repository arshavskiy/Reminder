import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import type {UserSettings} from "../../src/shared/types.js";

type UserSettingsPatch = Parameters<typeof api.userSettings.save>[0];

export const useUserSettingsStore = defineStore("userSettings", () => {
  const settings = ref<UserSettings | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const initialized = ref(false);
  let pendingLoad: Promise<UserSettings | null> | null = null;

  const theme = computed(() => settings.value?.theme);
  const features = computed(() => settings.value?.features ?? null);

  async function load(force = false): Promise<UserSettings | null> {
    if (settings.value && !force) return settings.value;
    if (pendingLoad && !force) return pendingLoad;

    loading.value = true;
    pendingLoad = api.userSettings.get()
      .then((row) => {
        settings.value = row;
        initialized.value = true;
        return row;
      })
      .catch(() => {
        initialized.value = true;
        return null;
      })
      .finally(() => {
        loading.value = false;
        pendingLoad = null;
      });

    return pendingLoad;
  }

  async function save(updates: UserSettingsPatch): Promise<UserSettings> {
    saving.value = true;
    try {
      const row = await api.userSettings.save(updates);
      settings.value = row;
      initialized.value = true;
      const {useFeaturesStore} = await import("./features.js");
      useFeaturesStore().setFromRaw(row.features);
      return row;
    } finally {
      saving.value = false;
    }
  }

  function reset() {
    settings.value = null;
    initialized.value = false;
    pendingLoad = null;
  }

  return {settings, theme, features, loading, saving, initialized, load, save, reset};
});
