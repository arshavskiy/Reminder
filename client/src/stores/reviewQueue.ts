import {defineStore} from "pinia";
import {ref} from "vue";
import {api} from "../services/apiService.js";

/** How many unattended imports are waiting for review, for the sidebar badge and the dashboard banner. */
export const useReviewQueueStore = defineStore("reviewQueue", () => {
  const pending = ref(0);

  async function refresh(): Promise<number> {
    try {
      pending.value = (await api.review.count()).pending;
    } catch {
      // The badge just stays as it was; the page itself reports errors.
    }
    return pending.value;
  }

  function set(value: number) {
    pending.value = Math.max(0, value);
  }

  return {pending, refresh, set};
});
