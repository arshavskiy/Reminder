<template>
  <div class="user-dropdown" :class="{ 'user-dropdown--inline': inline }">
    <div v-if="inline && menuOpen" class="user-menu user-menu--inline" :dir="localeStore.dir">
      <template v-for="item in menuEntries" :key="item.key">
        <div v-if="item.divider" class="user-menu__divider"/>
        <button
            v-else
            type="button"
            class="user-menu__item"
            :class="{ 'user-menu__item--active': isItemActive(item.key) }"
            @click="handleSelect(item.key)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>

    <n-popover
        v-if="!inline"
        :delay="40"
        :duration="120"
        :placement="menuPlacement"
        :show-arrow="false"
        trigger="hover"
        raw
    >
      <template #trigger>
        <div class="user-dropdown__trigger">
          <div class="user-dropdown__avatar">
            <img
                v-if="avatarSrc"
                :alt="userName"
                :src="avatarSrc"
                class="user-dropdown__avatar-img"
                referrerpolicy="no-referrer"
            />
            <n-icon v-else :component="PersonOutline" :size="18"/>
          </div>
          <div class="user-dropdown__meta">
            <span v-if="userName" class="user-dropdown__name">{{ userName }}</span>
          </div>
          <n-icon class="app-nav__chevron" :component="chevronIcon" :size="16"/>
        </div>
      </template>
      <div class="user-menu" :dir="localeStore.dir">
        <template v-for="item in menuEntries" :key="item.key">
          <div v-if="item.divider" class="user-menu__divider"/>
          <button
              v-else
              type="button"
              class="user-menu__item"
              :class="{ 'user-menu__item--active': isItemActive(item.key) }"
              @click="handleSelect(item.key)"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </n-popover>

    <button
        v-else
        type="button"
        class="user-dropdown__trigger"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
    >
      <div class="user-dropdown__avatar">
        <img
            v-if="avatarSrc"
            :alt="userName"
            :src="avatarSrc"
            class="user-dropdown__avatar-img"
            referrerpolicy="no-referrer"
        />
        <n-icon v-else :component="PersonOutline" :size="18"/>
      </div>
      <div class="user-dropdown__meta">
        <span v-if="userName" class="user-dropdown__name">{{ userName }}</span>
      </div>
      <n-icon
          class="app-nav__chevron"
          :class="{ 'app-nav__chevron--open': menuOpen }"
          :component="chevronIcon"
          :size="16"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NIcon, NPopover} from "naive-ui";
import {ChevronBackOutline, ChevronForwardOutline, PersonOutline} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {FEATURES} from "../shared/features.js";
import {featureFlagsForUser, PAID_PLAN_IDS, planMeetsMinimum, resolveUserPlan} from "../shared/pricingPlans.js";
import {useWalkthrough} from "../composables/useWalkthrough.js";
import {ALL_LOCALES, localizedPath, stripLocalePrefix, useLocaleStore} from "../stores/locale.js";
import {LANGUAGE_NAMES} from "../locales/authMessages.js";

interface Props {
  userName?: string | null;
  userEmail?: string | null;
  userPicture?: string | null;
  userRole?: string | null;
}

const props = withDefaults(defineProps<Props & { inline?: boolean }>(), {
  inline: false,
});
const emit = defineEmits<{ navigated: [] }>();
const menuOpen = ref(false);
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const walkthrough = useWalkthrough();
const localeStore = useLocaleStore();
const l = computed(() => localeStore.catalog);
const chevronIcon = computed(() => (localeStore.dir === "rtl" ? ChevronBackOutline : ChevronForwardOutline));

// Create avatar from email / name
const avatarUrl = computed<string>(() => {
  if (props.userPicture) return props.userPicture as string;
  const source = props.userName || props.userEmail || "";
  const initials =
      source
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase() || source.substring(0, 2).toUpperCase();
  return `https://ui-avatars.com/api/?name=${initials}&background=18a058&color=fff&size=40`;
});

const avatarSrc = computed<string>(() => avatarUrl.value || "");

const menuPlacement = computed(() => (localeStore.dir === "rtl" ? "left-end" : "right-end"));

const userPlan = computed(() => resolveUserPlan(authStore.user));
// Print + email templates stay on trial (inspections and reminders). Document
// templates match the paid-only route, so they must not appear for trial.
const templatesAllowed = computed(() =>
    userPlan.value !== "expired" && featureFlagsForUser(authStore.user).excelExport,
);

const templateMenuItems = computed(() => {
  const items: Array<{ label: string; key: string }> = [];
  if (!templatesAllowed.value) return items;
  if (featuresStore.hasFeature(FEATURES.pages.printTemplates)) {
    items.push({label: l.value.chrome.menu.printTemplates, key: "print-templates"});
  }
  if (featuresStore.hasFeature(FEATURES.pages.emailTemplates)) {
    items.push({label: l.value.chrome.menu.emailTemplates, key: "email-templates"});
  }
  if (
      featuresStore.hasFeature(FEATURES.pages.docTemplates)
      && planMeetsMinimum(userPlan.value, PAID_PLAN_IDS)
  ) {
    items.push({label: l.value.chrome.menu.docTemplates, key: "doc-templates"});
  }
  return items;
});

const menuEntries = computed(() => {
  const templates = templateMenuItems.value;
  return [
    {label: l.value.chrome.menu.profile, key: "profile"},
    {label: l.value.chrome.menu.settings, key: "settings"},
    {label: l.value.chrome.menu.subscription, key: "subscription"},
    ...templates,
    ...(props.userRole === "admin" ? [{label: l.value.chrome.menu.admin, key: "admin"}] : []),
    {label: "", key: "divider", divider: true},
    // Language: each name is written in its own language so it is findable from any UI language.
    ...ALL_LOCALES.map((code) => ({label: LANGUAGE_NAMES[code], key: `lang:${code}`})),
    {label: "", key: "divider-lang", divider: true},
    {label: l.value.chrome.menu.tour, key: "tour"},
    {label: l.value.chrome.menu.logout, key: "logout"},
  ];
});

const TEMPLATE_KEYS = new Set(["print-templates", "email-templates", "doc-templates"]);

const activeMenuKey = computed(() => {
  if (route.path.startsWith("/print-templates") || route.path.includes("/print-templates")) return "print-templates";
  if (route.path.includes("/email-templates")) return "email-templates";
  if (route.path.includes("/doc-templates")) return "doc-templates";
  if (route.path === "/admin" || route.path.startsWith("/admin")) return "admin";
  if (route.path !== "/profile") return "";
  const section = String(route.query.section ?? "personal");
  if (section === "personal") return "profile";
  if (section === "engineer" || section === "settings" || section === "subscription") return section;
  return "";
});

const templateActive = computed(() => TEMPLATE_KEYS.has(activeMenuKey.value));

function isItemActive(key: string) {
  if (key.startsWith("lang:")) return key === `lang:${localeStore.locale}`;
  return key === activeMenuKey.value || (key === "templates" && templateActive.value);
}

async function handleSelect(key: string) {
  menuOpen.value = false;
  emit("navigated");
  if (key.startsWith("lang:")) {
    // Same page, other language: the URL prefix carries the language.
    const code = key.slice("lang:".length) as "he" | "en" | "ru";
    if (code === localeStore.locale) return;
    // Persist first: Hebrew has no URL prefix, so without this the route guard still
    // sees the stored en/ru choice and bounces /dashboard back to /ru/dashboard.
    localeStore.setLocale(code);
    router.push({path: localizedPath(stripLocalePrefix(route.path), code), query: route.query, hash: route.hash});
  } else if (key === "profile") {
    router.push({path: localizedPath("/profile"), query: {section: "personal"}});
  } else if (key === "engineer") {
    router.push({path: localizedPath("/profile"), query: {section: "engineer"}});
  } else if (key === "settings") {
    router.push({path: localizedPath("/profile"), query: {section: "settings"}});
  } else if (key === "subscription") {
    router.push({path: localizedPath("/profile"), query: {section: "subscription"}});
  } else if (key === "print-templates") {
    router.push(localizedPath("/print-templates"));
  } else if (key === "email-templates") {
    router.push(localizedPath("/settings/email-templates"));
  } else if (key === "doc-templates") {
    router.push(localizedPath("/settings/doc-templates"));
  } else if (key === "admin") {
    router.push(localizedPath("/admin"));
  } else if (key === "tour") {
    walkthrough.startTour("main");
  } else if (key === "logout") {
    await authStore.logout();
  }
}
</script>

<style scoped>
.user-dropdown {
  display: flex;
  align-items: center;
  width: 100%;
}

.user-dropdown--inline {
  flex-direction: column;
  align-items: stretch;
}

.user-dropdown :deep(.n-popover) {
  display: block;
  width: 100%;
}

.user-dropdown__trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 5px 8px 5px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.user-dropdown__trigger:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.user-dropdown__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.user-dropdown__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.user-dropdown__name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-dropdown__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.user-dropdown__role {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  margin-top: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
}

.user-menu {
  min-width: 180px;
  padding: 10px 8px;
  border-radius: 14px;
  background: #243b46;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-menu__item {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: start;
}

.user-menu__item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.user-menu__item--active {
  background: rgba(99, 226, 183, 0.14);
  color: #63e2b7;
}

.user-menu__divider {
  height: 1px;
  margin: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
}

.user-menu--inline {
  width: 100%;
  min-width: 0;
  max-height: min(320px, 46vh);
  margin-bottom: 4px;
  overflow: auto;
  box-shadow: none;
}

.user-dropdown--inline :deep(.app-nav__chevron--open) {
  transform: rotate(-90deg);
}

</style>
