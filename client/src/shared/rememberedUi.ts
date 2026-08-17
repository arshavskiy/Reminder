const PREFIX = "ui.filter.";

export function readRememberedFilter(pageKey: string, fallback = "all"): string {
  try {
    return sessionStorage.getItem(PREFIX + pageKey) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeRememberedFilter(pageKey: string, value: string): void {
  try {
    sessionStorage.setItem(PREFIX + pageKey, value);
  } catch {
    /* ignore quota / private mode */
  }
}
