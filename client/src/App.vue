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
                :class="{ 'navlink--active': activeKey === item.key }"
                @click="navigate(item.key)"
              >{{ item.label }}</a>
            </nav>

            <button class="nav-menu-btn" type="button" aria-label="פתח ניווט" @click="mobileNavOpen = true">
              <span class="nav-menu-btn__icon">☰</span>
            </button>

             <!-- Tail actions: theme toggle + user dropdown -->
             <div class="appbar__actions">
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
               <n-tooltip v-if="pwa.updateAvailable.value" placement="bottom" :keep-alive-on-hover="false">
                 <template #trigger>
                   <button class="iconbtn iconbtn--update" aria-label="עדכן אפליקציה" @click="pwa.applyUpdate()">
                     <n-icon :component="RefreshOutline" :size="18" />
                   </button>
                 </template>
                 עדכון זמין — לחץ להפעלה מחדש
               </n-tooltip>
               <UserDropdown
                 :userName="authStore.user?.name ?? authStore.user?.email ?? null"
                 :userEmail="authStore.user?.email ?? null"
                 :userPicture="authStore.user?.picture_url ?? null"
                 :userRole="authStore.user?.role ?? null"
               />
             </div>
          </header>

          <n-drawer v-model:show="mobileNavOpen" :width="280" placement="right">
            <n-drawer-content title="ניווט" closable>
              <nav class="mobile-nav-list">
                <button
                  v-for="item in primaryNav"
                  :key="item.key"
                  :class="{ 'mobile-nav-list__item--active': activeKey === item.key }"
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
        </div>

        <WsConnector />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NDrawer,
  NDrawerContent,
  NIcon,
  NMessageProvider,
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
import {BriefcaseOutline, DownloadOutline, MoonOutline, RefreshOutline, SunnyOutline,} from "@vicons/ionicons5";
import {usePwa} from "./composables/usePwa.js";
import WsConnector from "./components/WsConnector.vue";
import UserDropdown from "./components/UserDropdown.vue";
import {useAuthStore} from "./stores/auth.js";
import {useFeaturesStore} from "./stores/features.js";
import {dateHeIL, heIL} from "./locales/heIL.js";
import {FEATURES, type FeatureKey} from "./shared/features.js";

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
const pwa = usePwa();

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const mobileNavOpen = ref(false);

// ── Theme ────────────────────────────────────────────────────────────────────
const darkPref = ref<boolean>(localStorage.getItem("theme") === "dark");
const isDark = computed(() => darkPref.value);
const theme = computed(() => (isDark.value ? darkTheme : null));

const themeOverrides = computed(() => ({
  common: {
    primaryColor: isDark.value ? "#63e2b7" : "#18a058",
    primaryColorHover: isDark.value ? "#7fe7c4" : "#36ad6a",
    primaryColorPressed: isDark.value ? "#5acea7" : "#0c7a43",
  },
}));

async function toggleTheme() {
  const next = isDark.value ? "light" : "dark";
  darkPref.value = next === "dark";
  localStorage.setItem("theme", next);
  // Persist to user-settings in the background (best-effort)
  fetch(`${SERVER}/api/user-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ theme: next }),
  }).catch(() => {});
}

onMounted(async () => {
  // Sync theme from user-settings on load
  try {
    const res = await fetch(`${SERVER}/api/user-settings`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json() as { theme?: string };
      if (data.theme) {
        darkPref.value = data.theme === "dark";
        localStorage.setItem("theme", data.theme);
      }
    }
  } catch { /* keep localStorage value */ }
  if (authStore.user) {
    featuresStore.fetchFeatures().catch(() => {});
  }
});

watch(isDark, (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}, { immediate: true });

// ── Nav ──────────────────────────────────────────────────────────────────────
// Top-bar primary nav. Matches the Spects design — terse Hebrew labels.
// Settings is reached via the avatar; templates / search are hidden from the
// primary bar to keep it sparse (matches the spec which shows ~6 items).
const ROLE_RANK: Record<string, number> = { user: 0, pro: 1, admin: 2 };

const allNav = [
  {label: "לוח בקרה", key: "dashboard", minRole: "user", feature: FEATURES.pages.dashboard},
  {label: "מסמכים", key: "documents", minRole: "user", feature: FEATURES.pages.documents},
  {label: "תסקירים", key: "contracts", minRole: "user", feature: FEATURES.pages.contracts},
  {label: "תזכורות", key: "reminders", minRole: "user", feature: FEATURES.pages.reminders},
  {label: "דוחות", key: "reports", minRole: "user", feature: FEATURES.pages.reports},
  {label: "לקוחות", key: "clients", minRole: "user", feature: FEATURES.pages.clients},
  {label: "הגדרת ציוד", key: "equipment", minRole: "user", feature: FEATURES.pages.equipment},
  {label: "שטח", key: "field", minRole: "user", feature: FEATURES.pages.field},
  {label: "פרופיל", key: "profile", minRole: "user", feature: FEATURES.pages.profile},
  {label: "תבניות", key: "email-templates", minRole: "user", feature: FEATURES.pages.emailTemplates},
  {label: "הגדרות", key: "settings", minRole: "admin", feature: FEATURES.pages.settings},
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
  padding: 8px 14px;
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
.iconbtn--update {
  color: #f0a020;
  border-color: rgba(240, 160, 32, 0.4);
}
.iconbtn--update:hover {
  background: rgba(240, 160, 32, 0.1);
  color: #f0a020;
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
}
</style>
