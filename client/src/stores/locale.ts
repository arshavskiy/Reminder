import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {
  appMessages,
  interpolateLabel,
  lookupLabel,
  type UiLocale,
} from "../locales/appMessages.js";

export const LOCALE_STORAGE_KEY = "remindocr_locale";
// Kept for sessions started before Russian existed ("1" meant the English prefix).
const EN_PREFIX_KEY = "remindocr_en_prefix";
const PREFIX_LOCALE_KEY = "remindocr_prefix_locale";

/** Locales that live under a URL prefix. Hebrew is the unprefixed default. */
export type PrefixedLocale = Exclude<UiLocale, "he">;
export const PREFIXED_LOCALES: PrefixedLocale[] = ["en", "ru"];
export const ALL_LOCALES: UiLocale[] = ["he", "en", "ru"];

function isPrefixedLocale(value: unknown): value is PrefixedLocale {
  return value === "en" || value === "ru";
}

/** `/en`, `/en/...`, `/ru`, `/ru/...` -> the locale; anything else -> null. */
export function prefixLocaleOf(path: string): PrefixedLocale | null {
  for (const locale of PREFIXED_LOCALES) {
    if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return locale;
  }
  return null;
}

export function localeFromPath(path: string): UiLocale | null {
  if (path === "/en" || path === "/en/login" || path === "/en/reset-password") return "en";
  if (path === "/ru" || path === "/ru/login" || path === "/ru/reset-password") return "ru";
  if (path === "/" || path === "/login" || path === "/reset-password") return "he";
  return null;
}

export function isPublicAuthPath(path: string): boolean {
  return localeFromPath(path) !== null;
}

export function isEnglishPath(path: string): boolean {
  return prefixLocaleOf(path) === "en";
}

/** True for any prefixed (non-Hebrew) app path. */
export function isPrefixedPath(path: string): boolean {
  return prefixLocaleOf(path) !== null;
}

export function stripLocalePrefix(path: string): string {
  const locale = prefixLocaleOf(path);
  if (!locale) return path;
  if (path === `/${locale}`) return "/";
  const rest = path.slice(locale.length + 1);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function readStoredLocale(): UiLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "en" || raw === "he" || raw === "ru") return raw;
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
    if (isPrefixedLocale(locale)) {
      sessionStorage.setItem(PREFIX_LOCALE_KEY, locale);
      if (locale === "en") sessionStorage.setItem(EN_PREFIX_KEY, "1");
      else sessionStorage.removeItem(EN_PREFIX_KEY);
    } else {
      sessionStorage.removeItem(PREFIX_LOCALE_KEY);
      sessionStorage.removeItem(EN_PREFIX_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** The prefixed locale (en or ru) this visit should use, or null for Hebrew. */
export function wantedPrefixLocale(path?: string): PrefixedLocale | null {
  if (path) {
    const fromPath = prefixLocaleOf(path);
    if (fromPath) return fromPath;
  }
  try {
    const session = sessionStorage.getItem(PREFIX_LOCALE_KEY);
    if (isPrefixedLocale(session)) return session;
    if (sessionStorage.getItem(EN_PREFIX_KEY) === "1") return "en";
  } catch {
    /* ignore */
  }
  const stored = readStoredLocale();
  return isPrefixedLocale(stored) ? stored : null;
}

export function wantsEnglishPrefix(path?: string): boolean {
  return wantedPrefixLocale(path) === "en";
}

function prefixFor(locale: UiLocale | null): PrefixedLocale | null {
  if (locale == null) return wantedPrefixLocale();
  return isPrefixedLocale(locale) ? locale : null;
}

/** Prefix a root-relative app path for the UI locale (Hebrew stays unprefixed). */
export function localizedPath(path: string, locale: UiLocale | null = null): string {
  const bare = stripLocalePrefix(path);
  const normalized = !bare || bare === "" ? "/" : bare;
  const prefix = prefixFor(locale);
  if (!prefix) return normalized;
  if (normalized === "/") return `/${prefix}`;
  return `/${prefix}${normalized}`;
}

export function loginPath(locale: UiLocale | null = null): string {
  const prefix = prefixFor(locale);
  return prefix ? `/${prefix}/login` : "/login";
}

export function dashboardPath(locale: UiLocale | null = null): string {
  const prefix = prefixFor(locale);
  return prefix ? `/${prefix}/dashboard` : "/dashboard";
}

export const MARKETING_ORIGIN = "https://remindocr.com";

/** Marketing-site URL. The site has Hebrew and English, so Russian points at the English pages. */
export function marketingUrl(path: string, locale: UiLocale | null = null): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  const prefix = prefixFor(locale);
  return `${MARKETING_ORIGIN}${prefix ? `/en${bare}` : bare}`;
}

function applyDocumentLocale(locale: UiLocale) {
  if (typeof document === "undefined") return;
  const lang = locale;
  const dir = locale === "he" ? "rtl" : "ltr";
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
  const dir = computed(() => (locale.value === "he" ? "rtl" : "ltr"));

  function t(path: string, vars?: Record<string, string | number>): string {
    return interpolateLabel(lookupLabel(catalog.value, path), vars);
  }

  function setLocale(next: UiLocale, persist = true) {
    locale.value = next;
    applyDocumentLocale(next);
    if (persist) persistLocale(next);
  }

  /** URL prefix wins: `/en/...` is English LTR, `/ru/...` Russian LTR, unprefixed app routes are Hebrew RTL. */
  function syncFromPath(path: string) {
    const prefixed = prefixLocaleOf(path);
    if (prefixed) {
      setLocale(prefixed, true);
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
