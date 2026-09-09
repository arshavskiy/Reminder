import { ref } from "vue";

// Module-level singleton, so both App.vue (auto-trigger on login) and any
// page (a "finish setup" button) control the same modal instance.
const showOnboarding = ref(false);

export function useOnboarding() {
  return {
    showOnboarding,
    openOnboarding: () => { showOnboarding.value = true; },
  };
}
