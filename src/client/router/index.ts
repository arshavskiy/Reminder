import { createRouter, createWebHashHistory } from "vue-router";
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

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: DashboardPage },
    { path: "/documents", component: DocumentsPage },
    { path: "/documents/:id", component: DocumentDetailPage },
    { path: "/clients", component: ClientsPage },
    { path: "/clients/:id", component: ClientDetailPage },
    { path: "/contracts", component: ContractsPage },
    { path: "/reminders", component: RemindersPage },
    { path: "/search", component: SearchPage },
    { path: "/profile", component: ProfilePage },
    { path: "/settings", component: SettingsPage },
    { path: "/doc-templates", component: DocTemplatesPage },
    { path: "/email-templates", component: EmailTemplatesPage },
    { path: "/equipment", component: EquipmentPage },
  ],
});
