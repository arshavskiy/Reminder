import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {type FeatureFlags, type FeatureKey, isFeatureEnabled, normalizeFeatureFlags} from "../shared/features.js";
import {useUserSettingsStore} from "./userSettings.js";

export const useFeaturesStore = defineStore("features", () => {
  const flags = ref<FeatureFlags>({});
  const loading = ref(false);
  const initialized = ref(false);

  const enabled = computed(() => flags.value);

  function hasFeature(key: FeatureKey): boolean {
    return isFeatureEnabled(flags.value, key);
  }

  function setFromRaw(raw: unknown) {
    flags.value = normalizeFeatureFlags(raw);
    initialized.value = true;
  }

  async function fetchFeatures(force = false) {
    if (initialized.value && !force) return;
    loading.value = true;
    try {
      const userSettingsStore = useUserSettingsStore();
      const settings = await userSettingsStore.load(force);
      setFromRaw(settings?.features);
    } catch {
      flags.value = {};
      initialized.value = true;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    flags.value = {};
    initialized.value = false;
  }

  return {flags, enabled, loading, initialized, hasFeature, setFromRaw, fetchFeatures, reset};
});
