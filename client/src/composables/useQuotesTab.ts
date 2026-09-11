import { ref } from "vue";
import { paymentService } from "../services/paymentService";

/**
 * Whether the quotes tab should be shown.
 *
 * An account that has never created a quote gets a tab leading to an empty
 * page, so the link is hidden until there is something behind it. The count is
 * fetched once per page load and shared across the three navs that render the
 * tab (documents, quotes, quote detail) so they cannot disagree.
 *
 * Defaults to visible while the count is unknown and stays visible if the
 * request fails: hiding navigation because of a transient error would strand
 * someone who does have quotes, which is worse than briefly showing a tab.
 */
const hasQuotes = ref(true);
let loaded = false;

export function useQuotesTab() {
  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      const { quotes } = await paymentService.counts();
      hasQuotes.value = quotes > 0;
    } catch {
      hasQuotes.value = true;
    }
  }

  /** Call after creating or deleting a quote so the tab appears or disappears. */
  function refresh() {
    loaded = false;
    return ensureLoaded();
  }

  return { hasQuotes, ensureLoaded, refresh };
}
