export const FEATURES = {
  pages: {
    dashboard: "pages.dashboard",
    documents: "pages.documents",
    invoices: "pages.invoices",
    contracts: "pages.contracts",
    reminders: "pages.reminders",
    discovery: "pages.discovery",
    reports: "pages.reports",
    clients: "pages.clients",
    equipment: "pages.equipment",
    field: "pages.field",
    profile: "pages.profile",
    docTemplates: "pages.doc_templates",
    emailTemplates: "pages.email_templates",
    settings: "pages.settings",
    search: "pages.search",
    gmail: "pages.gmail",
    printTemplates: "pages.print_templates",
  },
  dashboard: {
    statDocuments: "dashboard.stat_documents",
    statClients: "dashboard.stat_clients",
    statInspections: "dashboard.stat_inspections",
    statPendingReminders: "dashboard.stat_pending_reminders",
    statExpiringSoon: "dashboard.stat_expiring_soon",
    dropStrip: "dashboard.drop_strip",
    calendar: "dashboard.calendar",
    modules: "dashboard.modules",
    recentDocuments: "dashboard.recent_documents",
    upcomingReminders: "dashboard.upcoming_reminders",
    calendarFilters: "dashboard.calendar_filters",
  },
} as const;

export type FeatureKey =
  | typeof FEATURES.pages[keyof typeof FEATURES.pages]
  | typeof FEATURES.dashboard[keyof typeof FEATURES.dashboard];

export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;

export const DEFAULT_FEATURES: Record<FeatureKey, boolean> = Object.fromEntries(
  [
    ...Object.values(FEATURES.pages),
    ...Object.values(FEATURES.dashboard),
  ].map((key) => [key, true])
) as Record<FeatureKey, boolean>;

DEFAULT_FEATURES[FEATURES.pages.discovery] = false;

// Gmail inbox page is plan-gated to business in the router/nav; feature default matches server catalog.
// DEFAULT_FEATURES[FEATURES.pages.gmail] = true;

// Convert nested {pages: {dashboard: true}, dashboard: {calendar: true}}
// or flat {"pages.dashboard": true} to internal flat dotted-key format.
export function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized: FeatureFlags = {};
  function walk(obj: Record<string, unknown>, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "boolean") {
        normalized[key as FeatureKey] = v;
      } else if (typeof v === "string") {
        if (v === "true") normalized[key as FeatureKey] = true;
        else if (v === "false") normalized[key as FeatureKey] = false;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
      }
    }
  }
  walk(raw as Record<string, unknown>, "");
  return normalized;
}

// Convert internal flat dotted-key flags to nested object for storage/display.
export function featureFlagsToNested(flags: FeatureFlags): Record<string, Record<string, boolean>> {
  const nested: Record<string, Record<string, boolean>> = {};
  for (const [dotKey, val] of Object.entries(flags)) {
    if (typeof val !== "boolean") continue;
    const dot = dotKey.indexOf(".");
    if (dot === -1) continue;
    const scope = dotKey.slice(0, dot);
    const name = dotKey.slice(dot + 1);
    if (!nested[scope]) nested[scope] = {};
    nested[scope][name] = val;
  }
  return nested;
}

export function isFeatureEnabled(flags: FeatureFlags | null | undefined, key: FeatureKey): boolean {
  return flags?.[key] ?? DEFAULT_FEATURES[key] ?? true;
}
