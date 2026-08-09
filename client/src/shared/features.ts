export const FEATURES = {
  pages: {
    dashboard: "pages.dashboard",
    documents: "pages.documents",
    contracts: "pages.contracts",
    reminders: "pages.reminders",
    reports: "pages.reports",
    clients: "pages.clients",
    equipment: "pages.equipment",
    field: "pages.field",
    profile: "pages.profile",
    docTemplates: "pages.doc_templates",
    emailTemplates: "pages.email_templates",
    settings: "pages.settings",
    search: "pages.search",
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

export function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized: FeatureFlags = {};
  for (const [key, enabled] of Object.entries(raw)) {
    if (typeof enabled === "boolean") normalized[key as FeatureKey] = enabled;
  }
  return normalized;
}

export function isFeatureEnabled(flags: FeatureFlags | null | undefined, key: FeatureKey): boolean {
  return flags?.[key] ?? DEFAULT_FEATURES[key] ?? true;
}
