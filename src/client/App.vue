<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :rtl="rtlConfig">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-shell">
          <!-- ── Top horizontal app bar ─────────────────────────────────── -->
          <header class="appbar">
            <!-- Brand on the right (RTL "start") -->
            <div class="appbar__brand" @click="router.push('/')">
              <div class="appbar__logo">
                <n-icon :component="BriefcaseOutline" :size="22" />
              </div>
              <span class="appbar__brand-text">תזכורת לקוח</span>
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
               <UserDropdown userName="משתמש בדיקה" userEmail="demo@example.com" />
             </div>
          </header>

          <!-- ── Main content ───────────────────────────────────────────── -->
          <main class="content">
            <div class="page">
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
import { computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  darkTheme, NConfigProvider, NMessageProvider, NDialogProvider, NIcon, NTooltip,
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
} from "naive-ui";
import {
  SunnyOutline, MoonOutline, BriefcaseOutline,
} from "@vicons/ionicons5";
import WsConnector from "./components/WsConnector.vue";
import UserDropdown from "./components/UserDropdown.vue";
import { useSettingsStore } from "./stores/settings.js";

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
const settingsStore = useSettingsStore();

// ── Theme ────────────────────────────────────────────────────────────────────
const isDark = computed(() => (settingsStore.settings?.theme ?? "light") === "dark");
const theme = computed(() => (isDark.value ? darkTheme : null));

const themeOverrides = computed(() => ({
  common: {
    primaryColor: isDark.value ? "#63e2b7" : "#18a058",
    primaryColorHover: isDark.value ? "#7fe7c4" : "#36ad6a",
    primaryColorPressed: isDark.value ? "#5acea7" : "#0c7a43",
  },
}));

async function toggleTheme() {
  if (!settingsStore.settings) await settingsStore.load();
  if (!settingsStore.settings) return;
  const next = isDark.value ? "light" : "dark";
  await settingsStore.save({ ...settingsStore.settings, theme: next });
}

onMounted(() => settingsStore.load());

watch(isDark, (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}, { immediate: true });

// ── Nav ──────────────────────────────────────────────────────────────────────
// Top-bar primary nav. Matches the Spects design — terse Hebrew labels.
// Settings is reached via the avatar; templates / search are hidden from the
// primary bar to keep it sparse (matches the spec which shows ~6 items).
const primaryNav = [
  { label: "לוח בקרה",        key: "dashboard" },
  { label: "ניהול תסקירים",   key: "contracts" },   // route stays /contracts (handles both)
  { label: "לקוחות",           key: "clients" },
  { label: "הגדרת ציוד",       key: "equipment" },
  { label: "תבניות אימייל",    key: "email-templates" },
  { label: "תזכורות",          key: "reminders" },
];

const activeKey = computed(() => {
  const seg = route.path.split("/")[1] || "dashboard";
  return seg;
});

function navigate(key: string) {
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
</style>
