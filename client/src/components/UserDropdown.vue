<template>
  <div class="user-dropdown">
    <n-dropdown
        :options="dropdownItems"
        :render-label="renderDropdownLabel"
        :theme-overrides="dropdownThemeOverrides"
        placement="bottom-end"
        show-arrow
        trigger="click"
        @select="handleSelect"
    >
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
          <!--          <span v-if="props.userRole" class="user-dropdown__role">{{ roleLabel }}</span>-->
        </div>
      </div>
    </n-dropdown>
  </div>
</template>

<script setup lang="ts">
import {computed, h} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NDropdown, NIcon} from "naive-ui";
import {
  AlbumsOutline,
  ConstructOutline,
  DiamondOutline,
  DocumentTextOutline,
  LogOutOutline,
  MailOutline,
  MapOutline,
  PersonOutline,
  PrintOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {FEATURES} from "../shared/features.js";
import {featureFlagsForUser, PAID_PLAN_IDS, planMeetsMinimum, resolveUserPlan} from "../shared/pricingPlans.js";
import {useWalkthrough} from "../composables/useWalkthrough.js";
import {localizedPath, useLocaleStore} from "../stores/locale.js";

interface Props {
  userName?: string | null;
  userEmail?: string | null;
  userPicture?: string | null;
  userRole?: string | null;
}

const props = defineProps<Props>();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const walkthrough = useWalkthrough();
const localeStore = useLocaleStore();
const l = computed(() => localeStore.catalog);

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

const dropdownThemeOverrides = {
  borderRadius: "10px",
  padding: "6px",
  optionHeightMedium: "40px",
  fontSizeMedium: "13px",
  optionColorHover: "rgba(24, 160, 88, 0.08)",
  optionTextColorHover: "#18a058",
  dividerColor: "rgba(17, 24, 39, 0.08)",
};

const menuIcons: Record<string, typeof PersonOutline> = {
  profile: PersonOutline,
  engineer: ConstructOutline,
  settings: SettingsOutline,
  subscription: DiamondOutline,
  templates: AlbumsOutline,
  "print-templates": PrintOutline,
  "email-templates": MailOutline,
  "doc-templates": DocumentTextOutline,
  admin: ShieldCheckmarkOutline,
  tour: MapOutline,
  logout: LogOutOutline,
};

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

const dropdownItems = computed(() => {
  const templates = templateMenuItems.value;
  return [
    {
      label: l.value.chrome.menu.profile,
      key: "profile",
    },
    {
      label: l.value.chrome.menu.settings,
      key: "settings",
    },
    {
      label: l.value.chrome.menu.subscription,
      key: "subscription",
    },
    ...(templates.length
        ? [{
          label: l.value.chrome.menu.templates,
          key: "templates",
          children: templates,
        }]
        : []),
    ...(props.userRole === "admin"
        ? [
          {label: l.value.chrome.menu.admin, key: "admin"},
        ]
        : []),
    {
      type: "divider" as const,
    },
    {
      label: l.value.chrome.menu.tour,
      key: "tour",
    },
    {
      label: l.value.chrome.menu.logout,
      key: "logout",
    },
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

function renderDropdownLabel(option: any) {
  const key = String(option.key ?? "");
  if (!key || option.type === "divider") return option.label;
  const icon = menuIcons[key];
  const isActive = key === activeMenuKey.value
      || (key === "templates" && TEMPLATE_KEYS.has(activeMenuKey.value));
  return h("span", {class: ["user-menu-label", {"user-menu-label--active": isActive}], dir: localeStore.dir}, [
    icon
      ? h(NIcon, {component: icon, size: 16, class: "user-menu-label__glyph"})
      : h("span", {class: "user-menu-label__icon-spacer"}),
    h("span", {class: "user-menu-label__text"}, String(option.label ?? "")),
    isActive && key !== "templates" ? h("span", {class: "user-menu-label__active-dot"}) : null,
  ]);
}

async function handleSelect(key: string) {
  if (key === "profile") {
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
}

.user-dropdown__trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 5px 8px 5px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--transition-fast),
  border-color var(--transition-fast),
  box-shadow var(--transition-fast);
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

@media (max-width: 768px) {
  .user-dropdown__name {
    display: none;
  }

  .user-dropdown__role {
    display: none;
  }

  .user-dropdown__trigger {
    padding: 4px;
  }
}

:global(.user-menu-label) {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 168px;
  font-weight: 600;
  color: var(--text-primary);
}

:global(.user-menu-label__glyph),
:global(.user-menu-label__icon-spacer) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
  color: var(--brand-color);
  flex: 0 0 auto;
}

:global(.user-menu-label__text) {
  flex: 1;
  min-width: 0;
  text-align: start;
}

:global(.user-menu-label--active) {
  color: var(--brand-color);
}

:global(.user-menu-label--active .user-menu-label__glyph) {
  background: color-mix(in srgb, var(--brand-color) 18%, transparent);
}

:global(.user-menu-label__active-dot) {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--brand-color);
  flex: 0 0 auto;
}

</style>
