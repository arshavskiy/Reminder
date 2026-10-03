<template>
  <n-config-provider :rtl="naiveRtl" :theme="theme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <div
          class="app-shell"
          :class="{
            'app-shell--with-nav': !hideAppChrome,
            'app-shell--nav-collapsed': !hideAppChrome && navCollapsed && !isMobileViewport,
          }"
          :dir="localeStore.dir"
        >
          <AppSidebar
            v-if="!hideAppChrome"
            v-model:collapsed="navCollapsed"
            v-model:mobile-open="mobileNavOpen"
            :is-mobile="isMobileViewport"
            :logo-src="logoSrc"
          />

          <div class="app-main">
            <!-- ── Slim top bar (utilities only) ──────────────────────────── -->
            <header v-if="!hideAppChrome" class="app-topbar">
              <button
                class="nav-menu-btn"
                type="button"
                :aria-label="mobileNavOpen ? l.chrome.closeNav : l.chrome.openNav"
                :aria-expanded="mobileNavOpen"
                aria-controls="app-sidebar-panel"
                @click="mobileNavOpen = !mobileNavOpen"
              >
                <span class="nav-menu-btn__icon">☰</span>
              </button>

              <div class="app-topbar__spacer" />

              <div class="app-topbar__actions">
                <div v-if="authStore.isAdmin" class="actas-control" :class="{ 'actas-control--open': actAsExpanded }">
                  <button
                    v-if="!actAsExpanded"
                    class="actas-toggle"
                    type="button"
                    @click="openActAsPicker"
                  >
                    {{ authStore.actingAs ? l.chrome.switchUser : l.chrome.actAs }}
                  </button>
                  <div v-else class="actas-picker">
                    <n-select
                      :value="authStore.actingAs?.id ?? null"
                      :options="actAsOptions"
                      :loading="actAsLoading"
                      :placeholder="l.chrome.actAsPlaceholder"
                      clearable
                      filterable
                      class="actas-select"
                      @update:value="onActAsChange"
                    />
                    <button class="actas-close" type="button" :aria-label="l.chrome.closeActAs" @click="actAsExpanded = false">
                      ×
                    </button>
                  </div>
                </div>
                <n-tooltip placement="bottom" :keep-alive-on-hover="false">
                  <template #trigger>
                    <button
                      class="iconbtn"
                      :aria-label="isDark ? l.auth.themeToLight : l.auth.themeToDark"
                      @click="toggleTheme"
                    >
                      <n-icon :component="isDark ? SunnyOutline : MoonOutline" :size="18" />
                    </button>
                  </template>
                  {{ isDark ? l.auth.themeLight : l.auth.themeDark }}
                </n-tooltip>
                <n-tooltip v-if="pwa.canInstall.value && !pwa.isInstalled.value" placement="bottom" :keep-alive-on-hover="false">
                  <template #trigger>
                    <button class="iconbtn" :aria-label="l.chrome.installApp" @click="pwa.install()">
                      <n-icon :component="DownloadOutline" :size="18" />
                    </button>
                  </template>
                  {{ l.chrome.installApp }}
                </n-tooltip>
                <NotificationBell v-if="authStore.user" />
              </div>
            </header>

            <!-- PWA install banner -->
            <div v-if="showInstallBanner && !hideAppChrome" class="install-banner">
              <span class="install-banner__text">{{ l.chrome.installBanner }}</span>
              <div class="install-banner__actions">
                <button class="install-banner__btn install-banner__btn--primary" @click="installAndDismiss">{{ l.common.install }}</button>
                <button class="install-banner__btn" @click="dismissInstallBanner">{{ l.common.notNow }}</button>
              </div>
            </div>

            <!-- Impersonation banner — always visible while acting as someone
                 else, because writes (uploads, emails) really affect that user -->
            <div v-if="authStore.actingAs" class="actas-banner">
              <span>{{ l.chrome.viewingAs }} <b>{{ authStore.actingAs.email }}</b></span>
              <button class="actas-banner__exit" @click="onActAsChange(null)">{{ l.chrome.backToSelf }}</button>
            </div>

            <!-- ── Main content ───────────────────────────────────────────── -->
            <div :class="['shell-body', { 'shell-body--fullpage': isMinimalShell }]">
              <main :class="['content', { 'content--fullpage': isMinimalShell }]">
                <div :class="isMinimalShell ? '' : 'page'">
                  <BillingReminder v-if="authStore.user && !hideAppChrome && !route.path.endsWith('/profile')"/>
                <router-view />
                </div>
              </main>
            </div>

            <footer v-if="!isPublicMarketingRoute && !isLegalRoute && !isAppAdminRoute" class="app-footer" :dir="localeStore.dir">
              <strong>RemindOCR</strong> — {{ l.chrome.footerTagline }}
              <div class="app-footer__legal">
                © 2026 HandCoded. {{ l.chrome.rights }} |
                <a :href="marketingUrl('/terms', localeStore.locale)">{{ l.chrome.terms }}</a> |
                <a :href="marketingUrl('/privacy', localeStore.locale)">{{ l.chrome.privacy }}</a> |
                <a :href="marketingUrl('/accessibility', localeStore.locale)">{{ l.chrome.accessibility }}</a> |
                <a :href="marketingUrl('/security', localeStore.locale)">{{ l.chrome.security }}</a>
              </div>
            </footer>
          </div>
        </div>

        <WsConnector />
        <OnboardingWizard v-if="showOnboarding" v-model="showOnboarding" />
        <WalkthroughOverlay />
        <component :is="DevModalHost" v-if="DevModalHost" />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch, watchEffect} from "vue";
import {useRoute} from "vue-router";
import {
  darkTheme,
  dateEnUS,
  dateRuRU,
  enUS,
  ruRU,
  NConfigProvider,
  NDialogProvider,
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
  DownloadOutline,
  MoonOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import {usePwa} from "./composables/usePwa.js";
import WsConnector from "./components/WsConnector.vue";
import AppSidebar from "./components/AppSidebar.vue";
import NotificationBell from "./components/NotificationBell.vue";
import BillingReminder from "./components/BillingReminder.vue";
import OnboardingWizard from "./components/OnboardingWizard.vue";
import WalkthroughOverlay from "./components/WalkthroughOverlay.vue";
import {useWalkthrough} from "./composables/useWalkthrough.js";
import {useOnboarding} from "./composables/useOnboarding.js";
import {useDevModal} from "./composables/useDevModal.js";
import {useAuthStore} from "./stores/auth.js";
import {useFeaturesStore} from "./stores/features.js";
import {useUserSettingsStore} from "./stores/userSettings.js";
import {dateHeIL, heIL} from "./locales/heIL.js";
import {isPublicAuthPath, marketingUrl, stripLocalePrefix, useLocaleStore} from "./stores/locale.js";

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

const route = useRoute();
const localeStore = useLocaleStore();
const authStore = useAuthStore();
const naiveUsesLatin = computed(() => localeStore.locale !== "he");
const l = computed(() => localeStore.catalog);
const naiveRtl = computed(() => (naiveUsesLatin.value ? [] : rtlConfig));
const naiveLocale = computed(() => (localeStore.locale === "ru" ? ruRU : naiveUsesLatin.value ? enUS : heIL));
const naiveDateLocale = computed(() => (localeStore.locale === "ru" ? dateRuRU : naiveUsesLatin.value ? dateEnUS : dateHeIL));
const featuresStore = useFeaturesStore();
const userSettingsStore = useUserSettingsStore();
const pwa = usePwa();

const isLegalRoute = computed(() => Boolean(route.meta.legal));
// /pricing, /privacy and /terms are served by the marketing site now, so the
// only routes reachable here without a session are sign-in and password reset.
const isPublicMarketingRoute = computed(() => isPublicAuthPath(route.path));
const isAppAdminRoute = computed(() => stripLocalePrefix(route.path).startsWith("/admin"));
const isMinimalShell = computed(() =>
  isPublicMarketingRoute.value ||
  isLegalRoute.value ||
  isAppAdminRoute.value,
);
const hideAppChrome = computed(() =>
  isPublicMarketingRoute.value ||
  isLegalRoute.value ||
  isAppAdminRoute.value,
);

const NAV_COLLAPSED_KEY = "remindocr_nav_collapsed";
const mobileNavOpen = ref(false);
const navCollapsed = ref(localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
const isMobileViewport = ref(false);

function syncMobileViewport() {
  isMobileViewport.value = window.matchMedia("(max-width: 900px)").matches;
  if (!isMobileViewport.value) mobileNavOpen.value = false;
}

watch(navCollapsed, (collapsed) => {
  localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
});

const DevModalHost = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./dev/DevModalHost.vue"))
  : null;

// ── Onboarding wizard ───────────────────────────────────────────────────────
const {showOnboarding} = useOnboarding();
useDevModal("onboarding", showOnboarding);
useDevModal("chrome.mobileNav", mobileNavOpen);

watch(
  [() => authStore.user, hideAppChrome],
  ([user, hideChrome]) => {
    // Login sets the user while the route is still /login (chrome hidden).
    // Re-check after the dashboard opens or the card never appears.
    if (user && !user.onboarding_completed && !hideChrome) {
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
    if (authStore.user && !showOnboarding.value && stripLocalePrefix(path) !== "/login") {
      walkthrough.autoTriggerForPage(stripLocalePrefix(path));
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

watch(
  () => route.path,
  (path) => localeStore.syncFromPath(path),
  {immediate: true},
);

onMounted(async () => {
  window.addEventListener("remindocr:theme-change", onThemeChanged);
  syncMobileViewport();
  window.addEventListener("resize", syncMobileViewport);

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
  window.removeEventListener("resize", syncMobileViewport);
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
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: row;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-app);
  overflow: hidden;
}

.app-shell:not(.app-shell--with-nav) {
  flex-direction: column;
}

.app-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
}

.app-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  flex: 0 0 auto;
}

.app-topbar__spacer {
  flex: 1 1 auto;
}

.app-topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-topbar__actions :deep(.n-popover),
.app-topbar__actions :deep(.n-popover-trigger),
.app-topbar__actions :deep(.n-popover__trigger) {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
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
  min-width: 0;
  overflow-y: auto;
  padding: 32px 48px;
  background: var(--bg-app);
}
.content--fullpage {
  padding: 0;
}

@media (max-width: 900px) {
  .nav-menu-btn {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .app-topbar {
    padding: 0 14px;
  }

  .app-topbar__actions {
    gap: 6px;
  }

  .actas-select {
    width: 190px;
    min-width: 160px;
  }

  .content {
    padding: 12px 10px 20px;
  }
}

@media (max-width: 520px) {
  .app-topbar {
    padding-inline: 10px;
    gap: 8px;
  }

  .iconbtn,
  .nav-menu-btn {
    width: 34px;
    height: 34px;
  }

  .actas-control:not(.actas-control--open) {
    display: none;
  }

  .content {
    padding: 10px 8px 16px;
  }

  .app-footer {
    padding: 14px;
    font-size: 12px;
  }
}

.app-footer {
  padding: 10px 48px;
  text-align: center;
  font-size: 13px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  flex: 0 0 auto;
}

.app-footer__legal {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
}

.app-footer__legal a {
  opacity: 0.9;
  text-decoration: none;
}

.app-footer__legal a:hover {
  opacity: 1;
}

@media (max-width: 900px) {
  .content--fullpage {
    padding: 0;
  }

  .app-footer {
    padding: 8px 10px;
    font-size: 12px;
  }
}
</style>
