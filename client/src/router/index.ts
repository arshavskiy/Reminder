import {createRouter, createWebHistory, type RouteRecordRaw} from "vue-router";
// LoginPage stays a static import: it's the first thing almost every visitor
// hits, so it should render without an extra network round-trip. Every other
// page is lazy-loaded so the main bundle doesn't carry code for pages the
// visitor may never open — this is what keeps the PWA precache chunk under
// its size cap as the app (and its i18n catalog) grows.
import LoginPage from "../views/LoginPage.vue";
const DashboardPage = () => import("../views/DashboardPage.vue");
const DocumentsPage = () => import("../views/DocumentsPage.vue");
const DocumentDetailPage = () => import("../views/DocumentDetailPage.vue");
const ClientsPage = () => import("../views/ClientsPage.vue");
const ClientDetailPage = () => import("../views/ClientDetailPage.vue");
const RemindersPage = () => import("../views/RemindersPage.vue");
const SearchPage = () => import("../views/SearchPage.vue");
const ProfilePage = () => import("../views/ProfilePage.vue");
const DocTemplatesPage = () => import("../views/DocTemplatesPage.vue");
const EmailTemplatesPage = () => import("../views/EmailTemplatesPage.vue");
const EquipmentPage = () => import("../views/EquipmentPage.vue");
const ReportsPage = () => import("../views/ReportsPage.vue");
const ResetPasswordPage = () => import("../views/ResetPasswordPage.vue");
const AdminPage = () => import("../views/AdminPage.vue");
import {trackPageView} from "../analytics.js";
import {applySeo} from "../seo.js";
import {useAuthStore} from "../stores/auth.js";
import {dashboardPath, isEnglishPath, localeFromPath, localizedPath, loginPath, useLocaleStore, wantsEnglishPrefix} from "../stores/locale.js";
import {useFeaturesStore} from "../stores/features.js";
import {type FeatureKey, FEATURES} from "../shared/features.js";
import {PAID_PLAN_IDS, planMeetsMinimum, type PlanId, resolveUserPlan} from "../shared/pricingPlans.js";

function englishRedirect(path: string): string {
    if (!path.startsWith("/") || path.startsWith("/en")) return path;
    return `/en${path}`;
}

function prefixEnglishRoute(route: RouteRecordRaw): RouteRecordRaw {
    const prefixed: RouteRecordRaw = {
        ...route,
        path: route.path === "/" ? "/en" : `/en${route.path}`,
    };
    if (route.name) prefixed.name = `${String(route.name)}__en`;
    if (typeof route.redirect === "string") {
        prefixed.redirect = englishRedirect(route.redirect);
    } else if (typeof route.redirect === "function") {
        const original = route.redirect;
        prefixed.redirect = (to) => {
            const result = original(to);
            if (typeof result === "string") return englishRedirect(result);
            if (result && typeof result === "object" && "path" in result && typeof result.path === "string") {
                return {...result, path: englishRedirect(result.path)};
            }
            return result;
        };
    }
    return prefixed;
}

const publicRoutes: RouteRecordRaw[] = [
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
        {
            path: "/en",
            component: LoginPage,
            meta: {
                public: true,
                canonicalPath: "/en",
                title: "RemindOCR - EXTRACT • TRACK • AUTOMATE",
                description: "RemindOCR manages inspection reports, documents, clients, and reminders with OCR, data extraction, and optional Gmail PDF import.",
            },
        },
        {
            path: "/en/login",
            component: LoginPage,
            meta: {
                public: true,
                canonicalPath: "/en/login",
                robots: "noindex,nofollow",
                title: "Sign in - RemindOCR",
                description: "Sign in to your RemindOCR account.",
            },
        },
        {
            path: "/en/reset-password",
            component: ResetPasswordPage,
            meta: {
                public: true,
                robots: "noindex,nofollow",
                title: "Reset password - RemindOCR",
                description: "Reset your RemindOCR password.",
            },
        },
];

const appRoutes: RouteRecordRaw[] = [
        {path: "/dashboard", component: DashboardPage, meta: {feature: FEATURES.pages.dashboard}},
        {path: "/documents", component: DocumentsPage, meta: {feature: FEATURES.pages.documents}},
        {path: "/documents/:id", component: DocumentDetailPage, meta: {feature: FEATURES.pages.documents}},
        {
            path: "/invoices",
            component: () => import("../views/InvoicesPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: "business"}
        },
        {
            path: "/invoices/expenses",
            component: () => import("../views/ExpenseAnalyticsPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: "business"}
        },
        {
            path: "/invoices/:id",
            component: () => import("../views/InvoiceDetailPage.vue"),
            meta: {feature: FEATURES.pages.invoices, requirePlan: "business"}
        },
    {path: "/clients", component: ClientsPage, meta: {feature: FEATURES.pages.clients, requirePlan: "expired"}},
        {
            path: "/clients/:id",
            component: ClientDetailPage,
            meta: {feature: FEATURES.pages.clients, requirePlan: "expired"}
        },
        {path: "/contracts", redirect: "/documents"},
        {path: "/quotes", component: () => import("../views/QuotesPage.vue"), meta: {feature: FEATURES.pages.contracts}},
        {path: "/quotes/new", component: () => import("../views/QuoteCreatePage.vue"), meta: {feature: FEATURES.pages.contracts}},
        {path: "/quotes/:id/edit", component: () => import("../views/QuoteCreatePage.vue"), meta: {feature: FEATURES.pages.contracts}},
        {path: "/quotes/:id", component: () => import("../views/QuoteDetailPage.vue"), meta: {feature: FEATURES.pages.contracts}},
        {
            path: "/contracts/:contractId/draft",
            component: () => import("../views/ContractDraftPage.vue"),
            meta: {feature: FEATURES.pages.contracts}
        },
    {path: "/reminders", component: RemindersPage, meta: {feature: FEATURES.pages.reminders, requirePlan: "expired"}},
        {
            path: "/reminders/:id",
            component: () => import("../views/ReminderDetailPage.vue"),
            meta: {feature: FEATURES.pages.reminders, requirePlan: "expired"},
        },
        {
            path: "/activity",
            component: () => import("../views/ActivityLogPage.vue"),
            meta: {feature: FEATURES.pages.reminders, requirePlan: "expired"},
        },
        {path: "/search", component: SearchPage, meta: {feature: FEATURES.pages.search}},
        {path: "/profile", component: ProfilePage, meta: {feature: FEATURES.pages.profile}},
    {
        path: "/settings/doc-templates",
        component: DocTemplatesPage,
        meta: {feature: FEATURES.pages.docTemplates, requirePlan: PAID_PLAN_IDS}
    },
        {
            path: "/settings/email-templates",
            component: EmailTemplatesPage,
            meta: {feature: FEATURES.pages.emailTemplates}
        },
    {path: "/equipment", component: EquipmentPage, meta: {feature: FEATURES.pages.equipment, requirePlan: "expired"}},
    {path: "/reports", component: ReportsPage, meta: {feature: FEATURES.pages.reports, requirePlan: PAID_PLAN_IDS}},
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
];

export const router = createRouter({
    history: createWebHistory(),
    routes: [...publicRoutes, ...appRoutes, ...appRoutes.map(prefixEnglishRoute)],
});

router.afterEach((to) => {
    useLocaleStore().syncFromPath(to.path);
    applySeo(to);
    trackPageView(to.fullPath);
});

router.beforeEach(async (to) => {
    const authStore = useAuthStore();

    if (to.meta.public) {
        if (!authStore.initialized) {
            await authStore.fetchMe();
        }
        const loginHome = to.path === "/" || to.path === "/en" || to.path === "/login" || to.path === "/en/login";
        if (authStore.user && loginHome) {
            const loc = isEnglishPath(to.path) || (to.path === "/" && wantsEnglishPrefix())
                ? "en"
                : (localeFromPath(to.path) ?? (wantsEnglishPrefix() ? "en" : "he"));
            if (to.query.billing === "one_time") {
                return {path: localizedPath("/profile", loc), query: {section: "subscription"}};
            }
            return {path: dashboardPath(loc), query: to.query};
        }
        return true;
    }

    // No cached user and not yet initialized — wait for the server check.
    if (!authStore.initialized) {
        await authStore.fetchMe();
    }

    const locale = localeFromPath(to.path)
        ?? (isEnglishPath(to.path) || wantsEnglishPrefix(to.path) ? "en" : "he");

    if (!authStore.user) {
        return {path: loginPath(locale), query: to.query};
    }

    if (locale === "en" && !isEnglishPath(to.path)) {
        return {path: localizedPath(to.path, "en"), query: to.query, hash: to.hash};
    }

    const deny = (path: string) => ({path: localizedPath(path, locale)});

    const featuresStore = useFeaturesStore();
    await featuresStore.fetchFeatures();
    const requiredFeature = to.meta.feature as FeatureKey | undefined;
    if (requiredFeature && !featuresStore.hasFeature(requiredFeature)) {
        return deny("/403");
    }

    // Role-based route guard — must run for every navigation, even cached users
    const requiredRole = to.meta.requireRole as string | undefined;
    if (requiredRole) {
        const RANK: Record<string, number> = {user: 0, pro: 1, admin: 2};
        const userRank = RANK[authStore.user.role] ?? 0;
        const minRank = RANK[requiredRole] ?? 0;
        if (userRank < minRank) {
            return deny("/403");
        }
    }

    // requirePlan takes either a minimum plan or an explicit list.
    //
    // A minimum ("basic") is a rank comparison, so anything above it passes. A
    // list is membership, for pages that do not sit on a ladder — invoices are
    // open to trial and business but not basic, which no single threshold can
    // express. Passing an array to normalizePlanId would have yielded "expired"
    // and silently let everyone through.
    const requiredPlan = to.meta.requirePlan as PlanId | PlanId[] | undefined;
    if (requiredPlan) {
        const userPlan = resolveUserPlan(authStore.user);
        if (!planMeetsMinimum(userPlan, requiredPlan)) {
            return deny("/403");
        }
    }

    return true;
});
