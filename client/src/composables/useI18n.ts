import {computed} from "vue";
import {localizedPath, useLocaleStore} from "../stores/locale.js";

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
    locale: computed(() => localeStore.locale),
    // Creating inspections is Hebrew-only until the English inspection flow is complete.
    canCreateInspection: computed(() => localeStore.locale !== "en"),
  };
}
