import {createRouter, createWebHashHistory} from "vue-router";
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
import EmailTemplatesPage from "../views/EmailTemplatesPage.vue";
import EquipmentPage from "../views/EquipmentPage.vue";
import LoginPage from "../views/LoginPage.vue";
import ResetPasswordPage from "../views/ResetPasswordPage.vue";
import {useAuthStore} from "../stores/auth.js";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: LoginPage, meta: { public: true } },
    { path: "/reset-password", component: ResetPasswordPage, meta: { public: true } },
    { path: "/", component: DashboardPage },
    { path: "/documents", component: DocumentsPage },
    { path: "/documents/:id", component: DocumentDetailPage },
    { path: "/clients", component: ClientsPage },
    { path: "/clients/:id", component: ClientDetailPage },
    { path: "/contracts", component: ContractsPage },
    { path: "/reminders", component: RemindersPage },
    { path: "/search", component: SearchPage },
    { path: "/profile", component: ProfilePage },
    { path: "/settings", component: SettingsPage, meta: { requireRole: "admin" } },
    { path: "/doc-templates", component: DocTemplatesPage },
    { path: "/email-templates", component: EmailTemplatesPage },
    { path: "/equipment", component: EquipmentPage },
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
