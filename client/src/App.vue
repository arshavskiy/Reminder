<template>
  <n-config-provider :rtl="rtlConfig" :theme="theme" :theme-overrides="themeOverrides" :locale="heIL" :date-locale="dateHeIL">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-shell">
          <!-- ── Top horizontal app bar ─────────────────────────────────── -->
          <header v-if="!hideAppChrome" class="appbar">
            <!-- Brand on the right (RTL "start") -->
            <div class="appbar__brand" @click="router.push('/dashboard')">
              <div class="appbar__logo">
                <img class="appbar__logo-img" :src="logoSrc" alt="" />
              </div>
              <span class="appbar__brand-text"> RemindOCR </span>
            </div>

            <!-- Center nav -->
            <nav class="appbar__nav">
              <n-tooltip
                v-for="item in primaryNav"
                :key="item.key"
                placement="bottom"
                :disabled="!isPlanLocked(item)"
                :keep-alive-on-hover="false"
              >
                <template #trigger>
                  <a
                    class="navlink"
                    :class="{ 'navlink--active': isActiveNav(item.key), 'navlink--locked': isPlanLocked(item) }"
                    :aria-disabled="isPlanLocked(item) ? 'true' : undefined"
                    @click="navigate(item)"
                  >{{ item.label }}</a>
                </template>
                {{ navLockLabel(item) }}
              </n-tooltip>
            </nav>

            <button class="nav-menu-btn" type="button" aria-label="פתח ניווט" @click="mobileNavOpen = true">
              <span class="nav-menu-btn__icon">☰</span>
            </button>

             <!-- Tail actions: theme toggle + user dropdown -->
             <div class="appbar__actions">
               <n-tooltip placement="bottom" :keep-alive-on-hover="false">
                 <template #trigger>
                   <a
                     class="subscription-btn"
                     href="https://remindocr.com/pricing"
                   >
                     <n-icon :component="DiamondOutline" :size="15" class="subscription-btn__icon" />
                     <span class="subscription-btn__label">מנוי</span>
                     <span v-if="subscriptionPlanLabel" class="subscription-btn__plan">{{ subscriptionPlanLabel }}</span>
                   </a>
                 </template>
                 {{ subscriptionTooltip }}
               </n-tooltip>
               <div v-if="authStore.isAdmin" class="actas-control" :class="{ 'actas-control--open': actAsExpanded }">
                 <button
                   v-if="!actAsExpanded"
                   class="actas-toggle"
                   type="button"
                   @click="openActAsPicker"
                 >
                   {{ authStore.actingAs ? "החלף משתמש" : "צפה כ" }}
                 </button>
                 <div v-else class="actas-picker">
                   <n-select
                     :value="authStore.actingAs?.id ?? null"
                     :options="actAsOptions"
                     :loading="actAsLoading"
                     placeholder="צפה כמשתמש"
                     clearable
                     filterable
                     class="actas-select"
                     @update:value="onActAsChange"
                   />
                   <button class="actas-close" type="button" aria-label="סגור בחירת משתמש" @click="actAsExpanded = false">
                     ×
                   </button>
                 </div>
               </div>
               <n-tooltip placement="bottom" :keep-alive-on-hover="false">
                 <template #trigger>
                   <button
                     class="iconbtn"
                     :aria-label="isDark ? 'החלף למצב בהיר' : 'החלף למצב כהה'"
                     @click="toggleTheme"
                   >
                     <n-icon :component="isDark ? SunnyOutline : MoonOutline" :size="18" />
                   </button>
                 </template>
                 {{ isDark ? "מצב בהיר" : "מצב כהה" }}
               </n-tooltip>
               <n-tooltip v-if="pwa.canInstall.value && !pwa.isInstalled.value" placement="bottom" :keep-alive-on-hover="false">
                 <template #trigger>
                   <button class="iconbtn" aria-label="התקן אפליקציה" @click="pwa.install()">
                     <n-icon :component="DownloadOutline" :size="18" />
                   </button>
                 </template>
                 התקן אפליקציה
               </n-tooltip>
               <UserDropdown
                 :userName="authStore.user?.name ?? authStore.user?.email ?? null"
                 :userEmail="authStore.user?.email ?? null"
                 :userPicture="authStore.user?.picture_url ?? null"
                 :userRole="authStore.user?.role ?? null"
               />
             </div>
          </header>

          <!-- PWA install banner -->
          <div v-if="showInstallBanner && !hideAppChrome" class="install-banner">
            <span class="install-banner__text">📲 התקן את האפליקציה למחשב לגישה מהירה</span>
            <div class="install-banner__actions">
              <button class="install-banner__btn install-banner__btn--primary" @click="installAndDismiss">התקן</button>
              <button class="install-banner__btn" @click="dismissInstallBanner">לא עכשיו</button>
            </div>
          </div>

          <!-- Impersonation banner — always visible while acting as someone
               else, because writes (uploads, emails) really affect that user -->
          <div v-if="authStore.actingAs" class="actas-banner">
            <span>צופה כ: <b>{{ authStore.actingAs.email }}</b></span>
            <button class="actas-banner__exit" @click="onActAsChange(null)">חזור לעצמי</button>
          </div>

          <n-drawer v-model:show="mobileNavOpen" :width="280" placement="right">
            <n-drawer-content title="ניווט" closable>
              <nav class="mobile-nav-list">
                <n-tooltip
                  v-for="item in primaryNav"
                  :key="item.key"
                  placement="left"
                  :disabled="!isPlanLocked(item)"
                >
                  <template #trigger>
                    <span class="mobile-nav-list__trigger">
                      <button
                        :class="{ 'mobile-nav-list__item--active': isActiveNav(item.key), 'mobile-nav-list__item--locked': isPlanLocked(item) }"
                        class="mobile-nav-list__item"
                        type="button"
                        :disabled="isPlanLocked(item)"
                        @click="navigate(item)"
                      >
                        {{ item.label }}
                      </button>
                    </span>
                  </template>
                  {{ navLockLabel(item) }}
                </n-tooltip>
              </nav>
            </n-drawer-content>
          </n-drawer>

          <!-- ── Main content ───────────────────────────────────────────── -->
          <div :class="['shell-body', { 'shell-body--fullpage': isMinimalShell }]">
            <main :class="['content', { 'content--fullpage': isMinimalShell }]">
              <div :class="isMinimalShell ? '' : 'page'">
              <router-view />
              </div>
            </main>
          </div>

          <footer v-if="!isPublicMarketingRoute && !isLegalRoute" class="app-footer" dir="rtl">
            <strong>RemindOCR</strong> — מערכת ניהול תסקירים ותזכורות לעסקים ישראלים
            <div class="app-footer__legal">
              © 2026 HandCoded. כל הזכויות שמורות. |
              <a href="https://remindocr.com/terms">תנאי שימוש</a> |
              <a href="https://remindocr.com/privacy">מדיניות פרטיות</a> |
              <a href="https://remindocr.com/accessibility">נגישות</a> |
              <a href="https://remindocr.com/security">אבטחת מידע</a>
            </div>
          </footer>
        </div>

        <WsConnector />
        <OnboardingWizard v-if="showOnboarding" v-model="showOnboarding" />
        <WalkthroughOverlay />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch, watchEffect} from "vue";
import {useRoute, useRouter} from "vue-router";
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NDrawer,
  NDrawerContent,
  NIcon,
  NMessageProvider,
  NSelect,
  NTooltip,
  unstableAlertRtl,
  unstableAvatarGroupRtl,
  unstableBadgeRtl,
  unstableButtonGroupRtl,
  unstableButtonRtl,
  unstableCardRtl,
  unstableCheckboxRtl,
  unstableCollapseRtl,
  unstableCollapseTransitionRtl,
  unstableDataTableRtl,
  unstableDialogRtl,
  unstableDrawerRtl,
  unstableDynamicInputRtl,
  unstableFlexRtl,
  unstableInputNumberRtl,
  unstableInputRtl,
  unstableListRtl,
  unstableMessageRtl,
  unstableNotificationRtl,
  unstablePaginationRtl,
  unstablePopoverRtl,
  unstableRadioRtl,
  unstableScrollbarRtl,
  unstableSelectRtl,
  unstableSpaceRtl,
  unstableStatisticRtl,
  unstableStepsRtl,
  unstableTableRtl,
  unstableTagRtl,
  unstableTreeRtl,
  unstableTreeSelectRtl,
  unstableUploadsRtl,
} from "naive-ui";
import {
  DiamondOutline,
  DownloadOutline,
  MoonOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import {usePwa} from "./composables/usePwa.js";
import WsConnector from "./components/WsConnector.vue";
import UserDropdown from "./components/UserDropdown.vue";
import OnboardingWizard from "./components/OnboardingWizard.vue";
import WalkthroughOverlay from "./components/WalkthroughOverlay.vue";
import {useWalkthrough} from "./composables/useWalkthrough.js";
import {useAuthStore} from "./stores/auth.js";
import {useFeaturesStore} from "./stores/features.js";
import {useUserSettingsStore} from "./stores/userSettings.js";
import {dateHeIL, heIL} from "./locales/heIL.js";
import {type FeatureKey, FEATURES} from "./shared/features.js";
import {normalizePlanId, resolveUserPlan, type PlanId} from "./shared/pricingPlans.js";

const rtlConfig = [
  unstableAlertRtl, unstableAvatarGroupRtl, unstableBadgeRtl,
  unstableButtonRtl, unstableButtonGroupRtl, unstableCardRtl,
  unstableCheckboxRtl, unstableCollapseRtl, unstableCollapseTransitionRtl,
  unstableDataTableRtl, unstableDialogRtl, unstableDrawerRtl,
  unstableDynamicInputRtl, unstableFlexRtl, unstableInputRtl,
  unstableInputNumberRtl, unstableListRtl, unstableMessageRtl,
  unstableNotificationRtl, unstablePaginationRtl, unstablePopoverRtl,
  unstableRadioRtl, unstableSelectRtl, unstableSpaceRtl,
  unstableStatisticRtl, unstableStepsRtl, unstableTableRtl,
  unstableTagRtl, unstableTreeRtl, unstableTreeSelectRtl,
  unstableUploadsRtl, unstableScrollbarRtl,
];

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const userSettingsStore = useUserSettingsStore();
const pwa = usePwa();

const isLegalRoute = computed(() => Boolean(route.meta.legal));
// /pricing, /privacy and /terms are served by the marketing site now, so the
// only routes reachable here without a session are sign-in and password reset.
const isPublicMarketingRoute = computed(() =>
  route.path === "/" ||
  route.path === "/login" ||
  route.path === "/reset-password",
);
const isMinimalShell = computed(() =>
  isPublicMarketingRoute.value ||
  isLegalRoute.value ||
  route.path.startsWith("/admin"),
);
const hideAppChrome = computed(() =>
  isPublicMarketingRoute.value ||
  isLegalRoute.value ||
  route.path.startsWith("/admin"),
);

const mobileNavOpen = ref(false);

// ── Onboarding wizard ───────────────────────────────────────────────────────
const showOnboarding = ref(false);

watch(
  () => authStore.user,
  (user) => {
    if (user && !(user as any).onboarding_completed && !hideAppChrome.value) {
      showOnboarding.value = true;
    }
  },
  { immediate: true },
);

// ── Walkthrough auto-trigger per page ────────────────────────────────────────
const walkthrough = useWalkthrough();
watch(
  () => route.path,
  (path) => {
    if (authStore.user && !showOnboarding.value && path !== "/login") {
      walkthrough.autoTriggerForPage(path);
    }
  },
);

// ── PWA install banner ───────────────────────────────────────────────────────
const showInstallBanner = ref(false);
const INSTALL_DISMISSED_KEY = "pwa_install_dismissed";

watchEffect(() => {
  if (
    pwa.canInstall.value &&
    !pwa.isInstalled.value &&
    authStore.user &&
    !localStorage.getItem(INSTALL_DISMISSED_KEY)
  ) {
    showInstallBanner.value = true;
  }
});

function dismissInstallBanner() {
  showInstallBanner.value = false;
  localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
}

async function installAndDismiss() {
  await pwa.install();
  showInstallBanner.value = false;
}

// ── Admin "view as user" ────────────────────────────────────────────────────
const actAsUsers = ref<Array<{ id: string; email: string; name: string | null }>>([]);
const actAsLoading = ref(false);
const actAsExpanded = ref(false);

const actAsOptions = computed(() =>
  actAsUsers.value.map((u) => ({ label: u.name ? `${u.name} — ${u.email}` : u.email, value: u.id })),
);

async function loadActAsUsers() {
  if (!authStore.isAdmin || actAsLoading.value || actAsUsers.value.length) return;
  actAsLoading.value = true;
  try {
    const { api } = await import("./services/apiService.js");
    const users = await api.admin.listUsers();
    actAsUsers.value = (users as any[]).map((u) => ({ id: String(u.id), email: u.email, name: u.name ?? null }));
  } catch {
    // Non-critical — the selector just stays empty.
  } finally {
    actAsLoading.value = false;
  }
}

function openActAsPicker() {
  actAsExpanded.value = true;
  loadActAsUsers();
}

// Switching reloads the page (handled in the store) so no stale data from the
// previous identity lingers in any Pinia store.
async function onActAsChange(userId: string | null) {
  try {
    actAsExpanded.value = false;
    await authStore.setActingAs(userId);
  } catch {
    /* store surfaces the failure; keep the current view */
  }
}

// ── Theme ────────────────────────────────────────────────────────────────────
const darkPref = ref<boolean>(localStorage.getItem("theme") === "dark");
const isDark = computed(() => darkPref.value);
const theme = computed(() => (isDark.value ? darkTheme : null));
const logoSrc = computed(() => (isDark.value ? "/remindocr-logo-dark.png" : "/remindocr-logo-light.png"));

const PLAN_SHORT: Record<PlanId, string> = {
  free: "חינמי",
  basic: "בסיסי",
  business: "עסקי",
};

const PLAN_RANK: Record<PlanId, number> = {free: 0, basic: 1, business: 2};

const subscriptionPlanLabel = computed(() => {
  if (!authStore.user) return "";
  return PLAN_SHORT[resolveUserPlan(authStore.user)] ?? "";
});

const subscriptionTooltip = computed(() => {
  const plan = subscriptionPlanLabel.value;
  return plan ? `מנוי נוכחי: ${plan} — לחצו לצפייה במסלולים` : "מסלולי מנוי ומחירים";
});

const themeOverrides = computed(() => ({
  common: {
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif',
    primaryColor: isDark.value ? "#63e2b7" : "#18a058",
    primaryColorHover: isDark.value ? "#7fe7c4" : "#0c7a43",
    primaryColorPressed: isDark.value ? "#5acea7" : "#085c32",
  },
  Card: {
    titleFontSize: "18px",
    titleFontWeight: "700",
  },
  Dialog: {
    titleFontSize: "18px",
    titleFontWeight: "700",
  },
}));

async function toggleTheme() {
  const next = isDark.value ? "light" : "dark";
  darkPref.value = next === "dark";
  localStorage.setItem("theme", next);
  userSettingsStore.save({ theme: next }).catch(() => {});
}

function onThemeChanged(event: Event) {
  const next = (event as CustomEvent<"dark" | "light">).detail;
  if (next === "dark" || next === "light") {
    darkPref.value = next === "dark";
  }
}

onMounted(async () => {
  window.addEventListener("remindocr:theme-change", onThemeChanged);

  if (authStore.user) {
    // Sync theme from user-settings only after auth is known. The login page
    // should not call protected user-settings endpoints.
    try {
      const data = await userSettingsStore.load();
      if (data?.theme) {
        darkPref.value = data.theme === "dark";
        localStorage.setItem("theme", data.theme);
      }
    } catch { /* keep localStorage value */ }
    featuresStore.fetchFeatures().catch(() => {});
    loadActAsUsers();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("remindocr:theme-change", onThemeChanged);
});

watch(
  () => authStore.user?.id,
  () => {
    if (authStore.isAdmin) {
      loadActAsUsers();
    } else {
      actAsUsers.value = [];
    }
  },
);

watch(isDark, (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}, { immediate: true });

// ── Nav ──────────────────────────────────────────────────────────────────────
// Top-bar primary nav. Matches the Spects design — terse Hebrew labels.
// Settings is reached via the avatar; templates / search are hidden from the
// primary bar to keep it sparse (matches the spec which shows ~6 items).
const ROLE_RANK: Record<string, number> = { user: 0, pro: 1, admin: 2 };

const allNav: Array<{
  label: string;
  key: string;
  minRole?: string;
  minPlan?: PlanId;
  feature?: FeatureKey;
}> = [
  {label: "ראשי", key: "dashboard", minPlan: "free", feature: FEATURES.pages.dashboard},
  {label: "מסמכים", key: "documents", minPlan: "free", feature: FEATURES.pages.documents},
  {label: "תסקירים", key: "contracts", minPlan: "free", feature: FEATURES.pages.contracts},
  {label: "תזכורות", key: "reminders", minPlan: "basic", feature: FEATURES.pages.reminders},
  {label: "דוחות", key: "reports", minPlan: "free", feature: FEATURES.pages.reports},
  {label: "לקוחות", key: "clients", minPlan: "basic", feature: FEATURES.pages.clients},
  {label: "שטח", key: "field", minPlan: "business", feature: FEATURES.pages.field},
  {label: "ציוד", key: "equipment", minPlan: "business", feature: FEATURES.pages.equipment},
  {label: "חשבוניות", key: "invoices", minPlan: "business", feature: FEATURES.pages.invoices},
  {label: "Gmail", key: "gmail", minRole: "admin", feature: FEATURES.pages.gmail},
  // Template management lives under the account dropdown.
  // {label: "הגדרות", key: "settings", minRole: "admin", feature: FEATURES.pages.settings},
];

const primaryNav = computed(() => {
  const userRank = ROLE_RANK[authStore.user?.role ?? "user"] ?? 0;
  return allNav.filter((item) =>
    userRank >= (ROLE_RANK[item.minRole] ?? 0) &&
      (!item.feature || featuresStore.hasFeature(item.feature))
  );
});

function isPlanLocked(item: {minPlan?: PlanId}): boolean {
  if (!item.minPlan) return false;
  const userPlan = resolveUserPlan(authStore.user);
  return (PLAN_RANK[userPlan] ?? 0) < (PLAN_RANK[normalizePlanId(item.minPlan)] ?? 0);
}

function navLockLabel(item: {minPlan?: PlanId}): string {
  const label = item.minPlan ? PLAN_SHORT[normalizePlanId(item.minPlan)] : "";
  return label ? `זמין במסלול ${label} ומעלה` : "";
}

const activeKey = computed(() => {
  const seg = route.path.split("/")[1] || "dashboard";
  return seg;
});

function isActiveNav(key: string): boolean {
  if (key.includes("/")) return route.path === `/${key}` || route.path.startsWith(`/${key}/`);
  return activeKey.value === key;
}

function navigate(itemOrKey: string | {key: string; minPlan?: PlanId}) {
  const item = typeof itemOrKey === "string" ? allNav.find((nav) => nav.key === itemOrKey) : itemOrKey;
  if (!item || isPlanLocked(item)) return;
  mobileNavOpen.value = false;
  router.push(item.key === "dashboard" ? "/dashboard" : `/${item.key}`);
}
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-app);
}

/* ── App bar ──────────────────────────────────────────────────────────────── */
.appbar {
  display: flex;
  align-items: center;
  gap: 32px;
  height: 64px;
  padding: 0 28px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.appbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.appbar__logo {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
  box-shadow: var(--shadow-sm);
}
.appbar__logo-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.appbar__brand-text {
  font-weight: 700;
  font-size: 16px;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.appbar__nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
}
.navlink {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast), color var(--transition-fast);
  white-space: nowrap;
}
.navlink:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.navlink--locked {
  opacity: 0.48;
  cursor: not-allowed;
}
.navlink--locked:hover {
  background: transparent;
  color: var(--text-secondary);
}
.navlink--active {
  background: rgba(99, 226, 183, 0.14); /* tinted with brand */
  color: var(--brand-color);
  font-weight: 600;
}
html[data-theme="light"] .navlink--active {
  background: rgba(24, 160, 88, 0.10);
}

.nav-menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  padding: 0;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}
.nav-menu-btn:hover {
  border-color: var(--brand-color);
  background: rgba(99, 226, 183, 0.10);
  color: var(--brand-color);
}
.nav-menu-btn__icon {
  font-size: 20px;
  line-height: 1;
}

.mobile-nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mobile-nav-list__trigger {
  display: block;
}
.mobile-nav-list__item {
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 14px;
  text-align: right;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  width: 100%;
}
.mobile-nav-list__item:hover {
  background: var(--bg-hover);
}
.mobile-nav-list__item--locked,
.mobile-nav-list__item:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
.mobile-nav-list__item--locked:hover,
.mobile-nav-list__item:disabled:hover {
  background: transparent;
}
.mobile-nav-list__item--active {
  border-color: rgba(99, 226, 183, 0.24);
  background: rgba(99, 226, 183, 0.12);
  color: var(--brand-color);
}
html[data-theme="light"] .mobile-nav-list__item--active {
  border-color: rgba(24, 160, 88, 0.18);
  background: rgba(24, 160, 88, 0.10);
}

.appbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subscription-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 0 12px;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
}

.subscription-btn__icon {
  display: inline-flex;
  flex: 0 0 auto;
  opacity: 0.85;
}

.subscription-btn__label {
  line-height: 1;
}

.subscription-btn__plan {
  color: var(--text-muted, var(--text-secondary));
  font-size: 11px;
  font-weight: 600;
  opacity: 0.85;
}

.subscription-btn__plan::before {
  content: "·";
  margin-inline-end: 5px;
  opacity: 0.55;
}

.subscription-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.subscription-btn:hover .subscription-btn__plan {
  color: var(--text-secondary);
  opacity: 1;
}

.subscription-btn--active {
  border-color: color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 8%, transparent);
  color: var(--brand-color);
}

.subscription-btn--active .subscription-btn__plan {
  color: var(--brand-color);
  opacity: 0.8;
}

.actas-control {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.actas-toggle {
  min-width: 74px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 0 12px;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.actas-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.actas-picker {
  display: flex;
  align-items: center;
  gap: 6px;
}

.actas-select {
  width: min(300px, 28vw);
  min-width: 190px;
  flex: 0 0 auto;
}

.actas-close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.actas-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.install-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 9px 16px;
  background: rgba(24, 160, 88, 0.12);
  border-bottom: 1px solid rgba(24, 160, 88, 0.3);
  font-size: 13px;
  color: var(--text-primary);
}

html[data-theme="dark"] .install-banner {
  background: rgba(99, 226, 183, 0.1);
  border-bottom-color: rgba(99, 226, 183, 0.25);
}

.install-banner__text { font-weight: 500; }

.install-banner__actions {
  display: flex;
  gap: 8px;
}

.install-banner__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  padding: 3px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s;
}

.install-banner__btn:hover:not(.install-banner__btn--primary) { background: var(--bg-hover); }

.install-banner__btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: #fff;
  font-weight: 600;
}

.install-banner__btn--primary:hover {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: #fff;
}

.actas-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 7px 16px;
  background: rgba(240, 160, 32, 0.14);
  border-bottom: 1px solid rgba(240, 160, 32, 0.4);
  color: #8a5a00;
  font-size: 13px;
}

.actas-banner__exit {
  border: 1px solid rgba(240, 160, 32, 0.55);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  padding: 2px 12px;
  border-radius: 999px;
  cursor: pointer;
}

.actas-banner__exit:hover {
  background: rgba(240, 160, 32, 0.2);
}

@media (max-width: 768px) {
  .actas-select {
    width: 190px;
    min-width: 160px;
  }
}

.iconbtn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.iconbtn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.avatar:hover { background: var(--bg-hover); }

/* ── Content ──────────────────────────────────────────────────────────────── */
.shell-body {
  flex: 1;
  min-height: 0;
  background: var(--bg-app);
}

.shell-body--fullpage {
  display: block;
}

.content {
  height: 100%;
  overflow-y: auto;
  padding: 32px 48px;
  background: var(--bg-app);
}
.content--fullpage {
  padding: 0;
}

@media (max-width: 900px) {
  .appbar {
    gap: 14px;
    height: auto;
    min-height: 60px;
    padding: 10px 14px;
  }

  .appbar__brand {
    display: none;
  }

  .appbar__nav {
    display: none;
  }

  .nav-menu-btn {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .appbar__actions {
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
    justify-content: flex-end;
  }

  .subscription-btn {
    padding: 0 10px;
    max-width: 100%;
  }

  .subscription-btn__label {
    display: none;
  }

  .subscription-btn__plan::before {
    display: none;
  }

  .actas-toggle {
    min-width: 0;
    padding: 0 10px;
  }

  .content {
    padding: 18px 14px 28px;
  }
}

@media (max-width: 520px) {
  .appbar {
    padding-inline: 10px;
    gap: 8px;
  }

  .appbar__logo,
  .iconbtn {
    width: 34px;
    height: 34px;
  }

  .nav-menu-btn {
    width: 34px;
    height: 34px;
  }

  .subscription-btn {
    height: 32px;
    padding: 0 8px;
    font-size: 11px;
  }

  .actas-control:not(.actas-control--open) {
    display: none;
  }

  .content {
    padding: 14px 10px 24px;
  }

  .app-footer {
    padding: 14px;
    font-size: 12px;
  }
}

.app-footer {
  background: #161616;
  color: rgba(255, 255, 255, 0.65);
  padding: 10px 48px;
  text-align: center;
  font-size: 13px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
}

.app-footer strong {
  color: var(--brand, #63e2b7);
}

.app-footer__legal {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
}

.app-footer__legal a {
  color: var(--brand, #63e2b7);
  opacity: 0.7;
  text-decoration: none;
}

.app-footer__legal a:hover {
  opacity: 1;
}
</style>
