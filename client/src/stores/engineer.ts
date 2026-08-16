import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import type {EngineerProfile} from "../../src/shared/types.js";

export const useEngineerStore = defineStore("engineer", () => {
  const profile = ref<EngineerProfile | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const initialized = ref(false);
  let pendingLoad: Promise<EngineerProfile | null> | null = null;

  const inspectorNumber = computed(() => profile.value?.inspector_number?.trim() ?? "");

  async function load(force = false): Promise<EngineerProfile | null> {
    if (profile.value && !force) return profile.value;
    if (pendingLoad && !force) return pendingLoad;

    loading.value = true;
    pendingLoad = api.profile.getEngineer()
      .then((row) => {
        profile.value = row ?? {};
        initialized.value = true;
        return profile.value;
      })
      .catch(() => {
        initialized.value = true;
        return profile.value;
      })
      .finally(() => {
        loading.value = false;
        pendingLoad = null;
      });

    return pendingLoad;
  }

  async function save(updates: Partial<EngineerProfile>): Promise<EngineerProfile> {
    saving.value = true;
    try {
      const row = await api.profile.saveEngineer(updates);
      profile.value = row ?? {};
      initialized.value = true;
      return profile.value;
    } finally {
      saving.value = false;
    }
  }

  function patch(partial: Partial<EngineerProfile>) {
    profile.value = {...(profile.value ?? {}), ...partial};
  }

  function reset() {
    profile.value = null;
    initialized.value = false;
    pendingLoad = null;
  }

  return {profile, loading, saving, initialized, inspectorNumber, load, save, patch, reset};
});
