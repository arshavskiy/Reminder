/**
 * Which page features open a route under /api/gmail (any one is enough).
 *
 * The Gmail inbox page is admin-facing, but the invoices page imports through the same API
 * (import-all, import-retry, import-jobs, ...), so pages.invoices opens it too; without that a
 * user with invoices and no Gmail page got a 403 on import. Discovery is its own feature: its
 * routes depend only on pages.discovery, and it may also use the shared connection routes.
 */
export function gmailRequiredFeatures(path: string): string[] {
  const under = (base: string) => path === base || path.startsWith(`${base}/`);
  if (under("/obligation")) return ["pages.discovery"];
  if (under("/status") || under("/auth-url")) return ["pages.gmail", "pages.invoices", "pages.discovery"];
  return ["pages.gmail", "pages.invoices"];
}
