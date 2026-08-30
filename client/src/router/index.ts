import {createRouter, createWebHistory} from "vue-router";
import DashboardPage from "../views/DashboardPage.vue";
import DocumentsPage from "../views/DocumentsPage.vue";
import DocumentDetailPage from "../views/DocumentDetailPage.vue";
import ClientsPage from "../views/ClientsPage.vue";
import ClientDetailPage from "../views/ClientDetailPage.vue";
import ContractsPage from "../views/ContractsPage.vue";
import RemindersPage from "../views/RemindersPage.vue";
import SearchPage from "../views/SearchPage.vue";
import ProfilePage from "../views/ProfilePage.vue";
import DocTemplatesPage from "../views/DocTemplatesPage.vue";
import EmailTemplatesPage from "../views/EmailTemplatesPage.vue";
import EquipmentPage from "../views/EquipmentPage.vue";
import ReportsPage from "../views/ReportsPage.vue";
import LoginPage from "../views/LoginPage.vue";
import ResetPasswordPage from "../views/ResetPasswordPage.vue";
import AdminPage from "../views/AdminPage.vue";
import {trackPageView} from "../analytics.js";
import {applySeo} from "../seo.js";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {type FeatureKey, FEATURES} from "../shared/features.js";
import {normalizePlanId, type PlanId, resolveUserPlan} from "../shared/pricingPlans.js";

const PLAN_RANK: Record<PlanId, number> = {free: 0, basic: 1, trial: 1, business: 2};

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: "/",
            component: LoginPage,
            meta: {
                public: true,
                canonicalPath: "/",
                title: "RemindOCR - EXTRACT • TRACK • AUTOMATE",
                description: "RemindOCR מרכזת תסקירי בדיקה, מסמכים, לקוחות ותזכורות במערכת עברית עם OCR, חילוץ נתונים וייבוא PDF אופציונלי מ-Gmail.",
            },
        },
        {
            path: "/login",
            component: LoginPage,
            meta: {
                public: true,
                canonicalPath: "/login",
                robots: "noindex,nofollow",
                title: "כניסה - RemindOCR",
                description: "כניסה לחשבון RemindOCR.",
            },
        },
        {
            path: "/reset-password",
            component: ResetPasswordPage,
            meta: {
                public: true,
                robots: "noindex,nofollow",
                title: "איפוס סיסמה - RemindOCR",
                description: "איפוס סיסמה למשתמשי RemindOCR.",
            },
        },
        {path: "/dashboard", component: DashboardPage, meta: {feature: FEATURES.pages.dashboard}},
        {path: "/documents", component: DocumentsPage, meta: {feature: FEATURES.pages.documents}},
        {path: "/documents/:id", component: DocumentDetailPage, meta: {feature: FEATURES.pages.documents}},
        {
            path: "/invoices",
            component: () => import("../views/InvoicesPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: ["trial", "business"]}
        },
        {
            path: "/invoices/expenses",
            component: () => import("../views/ExpenseAnalyticsPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: ["trial", "business"]}
        },
        {
            path: "/invoices/:id",
            component: () => import("../views/InvoiceDetailPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: ["trial", "business"]}
        },
        {path: "/clients", component: ClientsPage, meta: {feature: FEATURES.pages.clients, requirePlan: "basic"}},
        {
            path: "/clients/:id",
            component: ClientDetailPage,
            meta: {feature: FEATURES.pages.clients, requirePlan: "basic"}
        },
        {path: "/contracts", component: ContractsPage, meta: {feature: FEATURES.pages.contracts}},
        {
            path: "/contracts/:contractId/draft",
            component: () => import("../views/ContractDraftPage.vue"),
            meta: {feature: FEATURES.pages.contracts}
        },
        {path: "/reminders", component: RemindersPage, meta: {feature: FEATURES.pages.reminders, requirePlan: "basic"}},
        {path: "/search", component: SearchPage, meta: {feature: FEATURES.pages.search}},
        {path: "/profile", component: ProfilePage, meta: {feature: FEATURES.pages.profile}},
        {path: "/settings/doc-templates", component: DocTemplatesPage, meta: {feature: FEATURES.pages.docTemplates}},
        {
            path: "/settings/email-templates",
            component: EmailTemplatesPage,
            meta: {feature: FEATURES.pages.emailTemplates}
        },
        {path: "/equipment", component: EquipmentPage, meta: {feature: FEATURES.pages.equipment, requirePlan: "basic"}},
        {path: "/reports", component: ReportsPage, meta: {feature: FEATURES.pages.reports}},
        {path: "/reports/expenses", redirect: "/invoices/expenses"},
        {
            path: "/field",
            component: () => import("../views/FieldPage.vue"),
            meta: {feature: FEATURES.pages.field, requirePlan: "business"}
        },
        {
            path: "/print-templates",
            component: () => import("../views/PrintTemplatesHubPage.vue"),
            meta: {feature: FEATURES.pages.printTemplates}
        },
        {
            path: "/print-templates/excel",
            component: () => import("../views/PrintTemplatesPage.vue"),
            meta: {feature: FEATURES.pages.printTemplates}
        },
        {
            path: "/print-templates/layout",
            name: "print-templates-layout",
            component: () => import("../views/SimplePrintTemplatesPage.vue"),
            meta: {feature: FEATURES.pages.printTemplates}
        },
        {
            path: "/print-templates/layout/:templateId/compose",
            name: "print-templates-layout-compose",
            component: () => import("../views/SimplePrintTemplatesPage.vue"),
            meta: {feature: FEATURES.pages.printTemplates}
        },
        {
            path: "/print-templates/:templateId/draft",
            component: () => import("../views/PrintTemplatesPage.vue"),
            meta: {feature: FEATURES.pages.printTemplates}
        },
        {path: "/settings/print-templates", redirect: "/print-templates"},
        {path: "/settings/print-templates/excel", redirect: "/print-templates/excel"},
        {path: "/settings/print-templates/layout", redirect: "/print-templates/layout"},
        {
            path: "/settings/print-templates/layout/:templateId/compose",
            redirect: (to) => ({
                path: `/print-templates/layout/${to.params.templateId}/compose`,
                query: to.query,
            }),
        },
        {path: "/doc-templates", redirect: "/settings/doc-templates", meta: {feature: FEATURES.pages.docTemplates}},
        {
            path: "/email-templates",
            redirect: "/settings/email-templates",
            meta: {feature: FEATURES.pages.emailTemplates}
        },
        {path: "/compose", redirect: "/print-templates", meta: {feature: FEATURES.pages.printTemplates}},
        {
            path: "/gmail",
            component: () => import("../views/GmailInboxPage.vue"),
            meta: {feature: FEATURES.pages.gmail, requirePlan: "business"},
        },
        {path: "/gmail-inbox", redirect: "/gmail"},
        {path: "/admin", component: AdminPage, meta: {requireRole: "admin"}},
        {path: "/403", component: () => import("../views/ForbiddenPage.vue")},
    ],
});

router.afterEach((to) => {
    applySeo(to);
    trackPageView(to.fullPath);
});

router.beforeEach(async (to) => {
    if (to.meta.public) return true;

    const authStore = useAuthStore();

    // No cached user and not yet initialized — wait for the server check.
    if (!authStore.initialized) {
        await authStore.fetchMe();
    }

    if (!authStore.user) {
        return {path: "/login"};
    }

    const featuresStore = useFeaturesStore();
    await featuresStore.fetchFeatures();
    const requiredFeature = to.meta.feature as FeatureKey | undefined;
    if (requiredFeature && !featuresStore.hasFeature(requiredFeature)) {
        debugger
        return {path: "/403"};
    }

    // Role-based route guard — must run for every navigation, even cached users
    const requiredRole = to.meta.requireRole as string | undefined;
    if (requiredRole) {
        debugger
        const RANK: Record<string, number> = {user: 0, pro: 1, admin: 2};
        const userRank = RANK[authStore.user.role] ?? 0;
        const minRank = RANK[requiredRole] ?? 0;
        if (userRank < minRank) {
            return {path: "/403"};
        }
    }

    // requirePlan takes either a minimum plan or an explicit list.
    //
    // A minimum ("basic") is a rank comparison, so anything above it passes. A
    // list is membership, for pages that do not sit on a ladder — invoices are
    // open to trial and business but not basic, which no single threshold can
    // express. Passing an array to normalizePlanId would have yielded "free"
    // and silently let everyone through.
    const requiredPlan = to.meta.requirePlan as PlanId | PlanId[] | undefined;
    if (requiredPlan) {
        const userPlan = resolveUserPlan(authStore.user);
        const allowed = Array.isArray(requiredPlan)
            ? requiredPlan.map((plan) => normalizePlanId(plan)).includes(userPlan)
            : (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[normalizePlanId(requiredPlan)] ?? 0);
        if (!allowed) {
            return {path: "/403"};
        }
    }

    return true;
});
