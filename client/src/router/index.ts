import {createRouter, createWebHistory} from "vue-router";
import DashboardPage from "../views/DashboardPage.vue";
import DocumentsPage from "../views/DocumentsPage.vue";
import DocumentDetailPage from "../views/DocumentDetailPage.vue";
import ClientsPage from "../views/ClientsPage.vue";
import ClientDetailPage from "../views/ClientDetailPage.vue";
import ContractsPage from "../views/ContractsPage.vue";
import RemindersPage from "../views/RemindersPage.vue";
import SearchPage from "../views/SearchPage.vue";
import SettingsPage from "../views/SettingsPage.vue";
import ProfilePage from "../views/ProfilePage.vue";
import DocTemplatesPage from "../views/DocTemplatesPage.vue";
import GmailInboxPage from "../views/GmailInboxPage.vue";
import EmailTemplatesPage from "../views/EmailTemplatesPage.vue";
import EquipmentPage from "../views/EquipmentPage.vue";
import ReportsPage from "../views/ReportsPage.vue";
import LoginPage from "../views/LoginPage.vue";
import ResetPasswordPage from "../views/ResetPasswordPage.vue";
import AdminPage from "../views/AdminPage.vue";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {type FeatureKey, FEATURES} from "../shared/features.js";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginPage, meta: { public: true } },
    { path: "/reset-password", component: ResetPasswordPage, meta: { public: true } },
    { path: "/", component: DashboardPage, meta: { feature: FEATURES.pages.dashboard } },
    { path: "/documents", component: DocumentsPage, meta: { feature: FEATURES.pages.documents } },
    { path: "/documents/:id", component: DocumentDetailPage, meta: { feature: FEATURES.pages.documents } },
    { path: "/clients", component: ClientsPage, meta: { feature: FEATURES.pages.clients } },
    { path: "/clients/:id", component: ClientDetailPage, meta: { feature: FEATURES.pages.clients } },
    { path: "/contracts", component: ContractsPage, meta: { feature: FEATURES.pages.contracts } },
    { path: "/contracts/:contractId/draft", component: () => import("../views/ContractDraftPage.vue"), meta: { feature: FEATURES.pages.contracts } },
    { path: "/reminders", component: RemindersPage, meta: { feature: FEATURES.pages.reminders } },
    { path: "/search", component: SearchPage, meta: { feature: FEATURES.pages.search } },
    { path: "/profile", component: ProfilePage, meta: { feature: FEATURES.pages.profile } },
    { path: "/settings", component: SettingsPage, meta: { requireRole: "admin", feature: FEATURES.pages.settings } },
    { path: "/settings/doc-templates", component: DocTemplatesPage, meta: { feature: FEATURES.pages.docTemplates } },
    { path: "/settings/email-templates", component: EmailTemplatesPage, meta: { feature: FEATURES.pages.emailTemplates } },
    { path: "/equipment", component: EquipmentPage, meta: { feature: FEATURES.pages.equipment } },
    { path: "/reports", component: ReportsPage, meta: { feature: FEATURES.pages.reports } },
    { path: "/field", component: () => import("../views/FieldPage.vue"), meta: { feature: FEATURES.pages.field } },
    { path: "/settings/print-templates", component: () => import("../views/PrintTemplatesHubPage.vue"), meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/settings/print-templates/excel", component: () => import("../views/PrintTemplatesPage.vue"), meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/settings/print-templates/layout", name: "print-templates-layout", component: () => import("../views/SimplePrintTemplatesPage.vue"), meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/settings/print-templates/layout/:templateId/compose", name: "print-templates-layout-compose", component: () => import("../views/SimplePrintTemplatesPage.vue"), meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/print-templates/:templateId/draft", component: () => import("../views/PrintTemplatesPage.vue"), meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/doc-templates", redirect: "/settings/doc-templates", meta: { feature: FEATURES.pages.docTemplates } },
    { path: "/email-templates", redirect: "/settings/email-templates", meta: { feature: FEATURES.pages.emailTemplates } },
    { path: "/print-templates", redirect: "/settings/print-templates", meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/compose", redirect: "/settings/print-templates", meta: { feature: FEATURES.pages.printTemplates } },
    { path: "/gmail-inbox", component: GmailInboxPage },
    { path: "/admin", component: AdminPage, meta: { requireRole: "admin" } },
    { path: "/403", component: () => import("../views/ForbiddenPage.vue") },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const authStore = useAuthStore();

  // No cached user and not yet initialized — wait for the server check.
  if (!authStore.initialized) {
    await authStore.fetchMe();
  }

  if (!authStore.user) {
    return { path: "/login" };
  }

  const featuresStore = useFeaturesStore();
  await featuresStore.fetchFeatures();
  const requiredFeature = to.meta.feature as FeatureKey | undefined;
  if (requiredFeature && !featuresStore.hasFeature(requiredFeature)) {
    return { path: "/403" };
  }

  // Role-based route guard — must run for every navigation, even cached users
  const requiredRole = to.meta.requireRole as string | undefined;
  if (requiredRole) {
    const RANK: Record<string, number> = { user: 0, pro: 1, admin: 2 };
    const userRank = RANK[authStore.user.role] ?? 0;
    const minRank = RANK[requiredRole] ?? 0;
    if (userRank < minRank) {
      return { path: "/403" };
    }
  }

  return true;
});
