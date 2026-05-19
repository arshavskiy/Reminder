<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :rtl="rtlConfig">
    <n-message-provider>
      <n-dialog-provider>
        <n-layout has-sider style="height: 100vh">
          <n-layout-sider
            bordered
            collapse-mode="width"
            :collapsed-width="64"
            :width="220"
            :collapsed="collapsed"
            show-trigger
            @collapse="collapsed = true"
            @expand="collapsed = false"
          >
            <div class="brand" :class="{ 'brand--collapsed': collapsed }">
              <n-icon :component="BriefcaseOutline" size="22" />
              <span v-if="!collapsed" class="brand__text">תזכורת לקוח</span>
            </div>
            <n-menu
              :collapsed="collapsed"
              :collapsed-width="64"
              :collapsed-icon-size="22"
              :options="menuOptions"
              :value="activeKey"
              @update:value="navigate"
            />
          </n-layout-sider>

          <n-layout>
            <!-- Top app bar -->
            <header class="topbar">
              <div class="topbar__title">{{ activePageTitle }}</div>
              <div class="topbar__actions">
                <n-tooltip :trigger="'hover'" placement="bottom">
                  <template #trigger>
                    <n-button
                      circle
                      :aria-label="isDark ? 'החלף למצב בהיר' : 'החלף למצב כהה'"
                      @click="toggleTheme"
                    >
                      <template #icon>
                        <n-icon :component="isDark ? SunnyOutline : MoonOutline" />
                      </template>
                    </n-button>
                  </template>
                  {{ isDark ? "מצב בהיר" : "מצב כהה" }}
                </n-tooltip>
              </div>
            </header>

            <n-layout-content class="content">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>

        <WsConnector />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, h } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  darkTheme, NConfigProvider, NLayout, NLayoutSider, NLayoutContent,
  NMenu, NMessageProvider, NDialogProvider, NButton, NIcon, NTooltip,
  // Per-component RTL config objects. Naive UI exports them with an
  // `unstable` prefix; we alias them back to short names for readability.
  unstableAlertRtl,        unstableAvatarGroupRtl, unstableBadgeRtl,
  unstableButtonRtl,       unstableButtonGroupRtl, unstableCardRtl,
  unstableCheckboxRtl,     unstableCollapseRtl,
  unstableCollapseTransitionRtl, unstableDataTableRtl, unstableDialogRtl,
  unstableDrawerRtl,       unstableDynamicInputRtl, unstableFlexRtl,
  unstableInputRtl,        unstableInputNumberRtl,  unstableListRtl,
  unstableMessageRtl,      unstableNotificationRtl, unstablePaginationRtl,
  unstablePopoverRtl,      unstableRadioRtl,        unstableSelectRtl,
  unstableSpaceRtl,        unstableStatisticRtl,    unstableStepsRtl,
  unstableTableRtl,        unstableTagRtl,          unstableTreeRtl,
  unstableTreeSelectRtl,   unstableUploadsRtl,      unstableScrollbarRtl,
} from "naive-ui";

// Flat RTL info list for n-config-provider :rtl
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
import {
  HomeOutline, DocumentTextOutline, PeopleOutline, ClipboardOutline,
  AlarmOutline, SearchOutline, SettingsOutline,
  SunnyOutline, MoonOutline, BriefcaseOutline,
  ExtensionPuzzleOutline, MailOutline,
} from "@vicons/ionicons5";
import WsConnector from "./components/WsConnector.vue";
import { useSettingsStore } from "./stores/settings.js";

const router = useRouter();
const route = useRoute();
const collapsed = ref(false);
const settingsStore = useSettingsStore();

// ── Theme ─────────────────────────────────────────────────────────────────────
// Light is the default. Falls back to "light" if settings haven't loaded yet.
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

watch(
  isDark,
  (dark) => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  },
  { immediate: true }
);

// ── Nav ───────────────────────────────────────────────────────────────────────
const activeKey = computed(() => route.path.split("/")[1] || "dashboard");

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) });
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Component = unknown;

function navigate(key: string) {
  router.push(key === "dashboard" ? "/" : `/${key}`);
}

const menuOptions = [
  { label: "לוח בקרה", key: "dashboard", icon: renderIcon(HomeOutline) },
  { label: "מסמכים", key: "documents", icon: renderIcon(DocumentTextOutline) },
  { label: "לקוחות", key: "clients", icon: renderIcon(PeopleOutline) },
  { label: "חוזים", key: "contracts", icon: renderIcon(ClipboardOutline) },
  { label: "תזכורות", key: "reminders", icon: renderIcon(AlarmOutline) },
  { label: "תבניות מסמכים", key: "doc-templates", icon: renderIcon(ExtensionPuzzleOutline) },
  { label: "תבניות אימייל", key: "email-templates", icon: renderIcon(MailOutline) },
  { label: "חיפוש", key: "search", icon: renderIcon(SearchOutline) },
  { label: "הגדרות", key: "settings", icon: renderIcon(SettingsOutline) },
];

const activePageTitle = computed(() => {
  const found = menuOptions.find((m) => m.key === activeKey.value);
  return found?.label ?? "תזכורת לקוח";
});
</script>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-weight: 700;
  font-size: 15px;
  color: var(--brand-color);
  white-space: nowrap;
  overflow: hidden;
  border-bottom: 1px solid var(--border-color);
}
.brand--collapsed {
  justify-content: center;
  padding: 18px 0;
}
.brand__text {
  letter-spacing: 0.2px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}
.topbar__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.topbar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.content {
  padding: 24px;
  overflow-y: auto;
  height: calc(100vh - 56px);
  background: var(--bg-app);
}
</style>
