import {computed} from "vue";
import {localizedPath, useLocaleStore} from "../stores/locale.js";

/** BCP 47 tag for Intl / toLocaleDateString. */
export function intlTagFor(locale: "he" | "en" | "ru"): string {
  if (locale === "en") return "en-US";
  if (locale === "ru") return "ru-RU";
  return "he-IL";
}

export function useI18n() {
  const localeStore = useLocaleStore();
  const l = computed(() => localeStore.catalog);
  function t(path: string, vars?: Record<string, string | number>) {
    return localeStore.t(path, vars);
  }
  function href(path: string) {
    return localizedPath(path, localeStore.locale);
  }
  return {
    l,
    t,
    href,
    dir: computed(() => localeStore.dir),
    /**
     * Content locale: "he" or "en". Russian counts as "en" here, because the many places that
     * pick between Hebrew and English content (inspection presets, email wording, plan names)
     * only have those two versions; Latin-script English is the closer fallback for Russian.
     */
    locale: computed(() => (localeStore.locale === "ru" ? "en" : localeStore.locale)),
    /** The language the user actually chose: "he", "en" or "ru". */
    uiLocale: computed(() => localeStore.locale),
    /** Intl tag for dates and numbers in the chosen language (ru-RU for Russian). */
    intl: computed(() => intlTagFor(localeStore.locale)),
    // Creating inspections is Hebrew-only until the English inspection flow is complete.
    canCreateInspection: computed(() => localeStore.locale === "he"),
  };
}
