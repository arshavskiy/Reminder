import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {
  appMessages,
  interpolateLabel,
  lookupLabel,
  type UiLocale,
} from "../locales/appMessages.js";

export const LOCALE_STORAGE_KEY = "remindocr_locale";
const EN_PREFIX_KEY = "remindocr_en_prefix";

export function localeFromPath(path: string): UiLocale | null {
  if (path === "/en" || path === "/en/login" || path === "/en/reset-password") return "en";
  if (path === "/" || path === "/login" || path === "/reset-password") return "he";
  return null;
}

export function isPublicAuthPath(path: string): boolean {
  return localeFromPath(path) !== null;
}

export function isEnglishPath(path: string): boolean {
  return path === "/en" || path.startsWith("/en/");
}

export function stripLocalePrefix(path: string): string {
  if (path === "/en") return "/";
  if (path.startsWith("/en/")) {
    const rest = path.slice(3);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return path;
}

export function readStoredLocale(): UiLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "en" || raw === "he") return raw;
  } catch {
    /* private mode */
  }
  return null;
}

export function persistLocale(locale: UiLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  try {
    if (locale === "en") sessionStorage.setItem(EN_PREFIX_KEY, "1");
    else sessionStorage.removeItem(EN_PREFIX_KEY);
  } catch {
    /* ignore */
  }
}

export function wantsEnglishPrefix(path?: string): boolean {
  if (path && isEnglishPath(path)) return true;
  try {
    if (sessionStorage.getItem(EN_PREFIX_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return readStoredLocale() === "en";
}

/** Prefix a root-relative app path when the UI locale is English. */
export function localizedPath(path: string, locale: UiLocale | null = null): string {
  const bare = stripLocalePrefix(path);
  const normalized = !bare || bare === "" ? "/" : bare;
  const useEn = locale === "en" || (locale == null && wantsEnglishPrefix());
  if (!useEn) return normalized;
  if (normalized === "/") return "/en";
  return `/en${normalized}`;
}

export function loginPath(locale: UiLocale | null = null): string {
  const useEn = locale === "en" || (locale == null && wantsEnglishPrefix());
  return useEn ? "/en/login" : "/login";
}

export function dashboardPath(locale: UiLocale | null = null): string {
  const useEn = locale === "en" || (locale == null && wantsEnglishPrefix());
  return useEn ? "/en/dashboard" : "/dashboard";
}

export const MARKETING_ORIGIN = "https://remindocr.com";

/** Marketing-site URL, with `/en` when the UI is English. */
export function marketingUrl(path: string, locale: UiLocale | null = null): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  const useEn = locale === "en" || (locale == null && wantsEnglishPrefix());
  return `${MARKETING_ORIGIN}${useEn ? `/en${bare}` : bare}`;
}

function applyDocumentLocale(locale: UiLocale) {
  if (typeof document === "undefined") return;
  const lang = locale === "en" ? "en" : "he";
  const dir = locale === "en" ? "ltr" : "rtl";
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  document.body.dir = dir;
  document.body.lang = lang;
}

export const useLocaleStore = defineStore("locale", () => {
  const locale = ref<UiLocale>(readStoredLocale() ?? "he");
  const catalog = computed(() => appMessages[locale.value]);
  const messages = computed(() => catalog.value.auth);
  const isEnglish = computed(() => locale.value === "en");
  const dir = computed(() => (locale.value === "en" ? "ltr" : "rtl"));

  function t(path: string, vars?: Record<string, string | number>): string {
    return interpolateLabel(lookupLabel(catalog.value, path), vars);
  }

  function setLocale(next: UiLocale, persist = true) {
    locale.value = next;
    applyDocumentLocale(next);
    if (persist) persistLocale(next);
  }

  /** URL prefix wins: `/en/...` is English LTR, unprefixed app routes are Hebrew RTL. */
  function syncFromPath(path: string) {
    if (isEnglishPath(path)) {
      setLocale("en", true);
      return;
    }
    if (path === "/login" || path === "/reset-password") {
      setLocale("he", true);
      return;
    }
    applyDocumentLocale("he");
    locale.value = "he";
  }

  return {locale, catalog, messages, isEnglish, dir, t, setLocale, syncFromPath};
});
