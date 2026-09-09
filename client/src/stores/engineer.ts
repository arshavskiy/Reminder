import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import {useAuthStore} from "./auth.js";
import type {User} from "../../src/shared/types.js";

// The engineer/company fields live on the users document, which /api/auth/me
// already returns in full — so reads come from the auth store rather than a
// second request. Writes still go through PUT /api/profile/engineer, and push
// the result back onto the auth store so both stay in sync.
type EngineerProfile = Partial<User>;

export const useEngineerStore = defineStore("engineer", () => {
  const auth = useAuthStore();
  const saving = ref(false);

  const profile = computed<EngineerProfile | null>(() => auth.user);
  const loading = computed(() => auth.loading);
  const initialized = computed(() => auth.initialized);
  const inspectorNumber = computed(() => profile.value?.inspector_number?.trim() ?? "");

  async function load(force = false): Promise<EngineerProfile | null> {
    if (!auth.user || force) await auth.fetchMe();
    return profile.value;
  }

  async function save(updates: Partial<EngineerProfile>): Promise<EngineerProfile> {
    saving.value = true;
    try {
      const row = await api.profile.saveEngineer(updates);
      if (row) auth.setUser({...(auth.user ?? {}), ...row} as User);
      return profile.value ?? {};
    } finally {
      saving.value = false;
    }
  }

  function patch(partial: Partial<EngineerProfile>) {
    if (auth.user) auth.setUser({...auth.user, ...partial} as User);
  }

  function reset() {
    // The auth store owns this data now; clearing it is logout's job.
  }

  return {profile, loading, saving, initialized, inspectorNumber, load, save, patch, reset};
});
