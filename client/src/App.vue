<template>
  <n-config-provider :rtl="rtlConfig" :theme="theme" :theme-overrides="themeOverrides" :locale="heIL" :date-locale="dateHeIL">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-shell">
          <!-- ── Top horizontal app bar ─────────────────────────────────── -->
          <header v-if="route.path !== '/login' && !route.path.startsWith('/admin')" class="appbar">
            <!-- Brand on the right (RTL "start") -->
            <div class="appbar__brand" @click="router.push('/')">
              <div class="appbar__logo">
                <n-icon :component="BriefcaseOutline" :size="22" />
              </div>
              <span class="appbar__brand-text"> ReminderOCR </span>
            </div>

            <!-- Center nav -->
            <nav class="appbar__nav">
              <a
                v-for="item in primaryNav"
                :key="item.key"
                class="navlink"
                :class="{ 'navlink--active': isActiveNav(item.key) }"
                @click="navigate(item.key)"
              >{{ item.label }}</a>
            </nav>

            <button class="nav-menu-btn" type="button" aria-label="פתח ניווט" @click="mobileNavOpen = true">
              <span class="nav-menu-btn__icon">☰</span>
            </button>

             <!-- Tail actions: theme toggle + user dropdown -->
             <div class="appbar__actions">
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
          <div v-if="showInstallBanner && route.path !== '/login'" class="install-banner">
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
                <button
                  v-for="item in primaryNav"
                  :key="item.key"
                  :class="{ 'mobile-nav-list__item--active': isActiveNav(item.key) }"
                  class="mobile-nav-list__item"
                  type="button"
                  @click="navigate(item.key)"
                >
                  {{ item.label }}
                </button>
              </nav>
            </n-drawer-content>
          </n-drawer>

          <!-- ── Main content ───────────────────────────────────────────── -->
          <main :class="['content', { 'content--fullpage': route.path === '/login' || route.path.startsWith('/admin') }]">
            <div :class="(route.path === '/login' || route.path.startsWith('/admin')) ? '' : 'page'">
            <router-view />
            </div>
          </main>

          <footer v-if="route.path !== '/login'" class="app-footer" dir="rtl">
            <strong>ReminderOCR</strong> — מערכת ניהול תסקירים ותזכורות לעסקים ישראלים
            <div class="app-footer__legal">
              © 2026 HandCoded. All rights reserved. |
              <a href="https://remindocr.com/privacy.html" target="_blank">Privacy Policy</a> |
              <a href="https://remindocr.com/terms.html" target="_blank">Terms of Service</a>
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
import {computed, onMounted, ref, watch, watchEffect} from "vue";
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
import {BriefcaseOutline, DownloadOutline, MoonOutline, SunnyOutline} from "@vicons/ionicons5";
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

const mobileNavOpen = ref(false);

// ── Onboarding wizard ───────────────────────────────────────────────────────
const showOnboarding = ref(false);

watch(
  () => authStore.user,
  (user) => {
    if (user && !(user as any).onboarding_completed && route.path !== "/login") {
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

const themeOverrides = computed(() => ({
  common: {
    fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif',
    primaryColor: isDark.value ? "#63e2b7" : "#18a058",
    primaryColorHover: isDark.value ? "#7fe7c4" : "#36ad6a",
    primaryColorPressed: isDark.value ? "#5acea7" : "#0c7a43",
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

onMounted(async () => {
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

const allNav = [
  {label: "ראשי", key: "dashboard", minRole: "user", feature: FEATURES.pages.dashboard},
  {label: "מסמכים", key: "documents", minRole: "user", feature: FEATURES.pages.documents},
  {label: "תסקירים", key: "contracts", minRole: "user", feature: FEATURES.pages.contracts},
  {label: "תזכורות", key: "reminders", minRole: "user", feature: FEATURES.pages.reminders},
  {label: "דוחות", key: "reports", minRole: "user", feature: FEATURES.pages.reports},
  {label: "לקוחות", key: "clients", minRole: "user", feature: FEATURES.pages.clients},
  {label: "שטח", key: "field", minRole: "user", feature: FEATURES.pages.field},
  {label: "ציוד", key: "equipment", minRole: "user", feature: FEATURES.pages.equipment },
  // {label: "פרופיל", key: "profile", minRole: "user", feature: FEATURES.pages.profile},
  // Print templates are reached from the contracts page, next to "תסקיר חדש".
  // {label: "הדפסת תסקיר", key: "compose", minRole: "user", feature: FEATURES.pages.printTemplates},
  {label: "Gmail", key: "gmail-inbox", minRole: "user" ,feature: FEATURES.pages.gmail},
  // Template management lives under the account dropdown.
  // {label: "הגדרות", key: "settings", minRole: "admin", feature: FEATURES.pages.settings},
];

const primaryNav = computed(() => {
  const userRank = ROLE_RANK[authStore.user?.role ?? "user"] ?? 0;
  return allNav.filter((item) =>
    userRank >= (ROLE_RANK[item.minRole] ?? 0) &&
    featuresStore.hasFeature(item.feature as FeatureKey)
  );
});

const activeKey = computed(() => {
  const seg = route.path.split("/")[1] || "dashboard";
  return seg;
});

function isActiveNav(key: string): boolean {
  if (key.includes("/")) return route.path === `/${key}` || route.path.startsWith(`/${key}/`);
  return activeKey.value === key;
}

function navigate(key: string) {
  mobileNavOpen.value = false;
  router.push(key === "dashboard" ? "/" : `/${key}`);
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
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-color), var(--brand-color-hover));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
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
}
.mobile-nav-list__item:hover {
  background: var(--bg-hover);
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

.install-banner__btn:hover { background: var(--bg-hover); }

.install-banner__btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: #fff;
  font-weight: 600;
}

.install-banner__btn--primary:hover { background: var(--brand-color-hover); }

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
.content {
  flex: 1;
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
