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
import {useRouter} from "vue-router";
import {NDropdown, NIcon} from "naive-ui";
import {
  ConstructOutline,
  DiamondOutline,
  LogOutOutline,
  MapOutline,
  PersonOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";
import {useWalkthrough} from "../composables/useWalkthrough.js";

interface Props {
  userName?: string | null;
  userEmail?: string | null;
  userPicture?: string | null;
  userRole?: string | null;
}

const props = defineProps<Props>();
const router = useRouter();
const authStore = useAuthStore();
const walkthrough = useWalkthrough();

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
  admin: ShieldCheckmarkOutline,
  tour: MapOutline,
  logout: LogOutOutline,
};

const dropdownItems = computed(() => [
  {
    label: "הפרופיל שלי",
    key: "profile",
  },
  {
    label: "פרופיל מהנדס",
    key: "engineer",
  },
  {
    label: "הגדרות",
    key: "settings",
  },
  {
    label: "מנוי ותשלומים",
    key: "subscription",
  },
  ...(props.userRole === "admin"
      ? [
        {label: "פאנל ניהול", key: "admin"},
      ]
      : []),
  {
    type: "divider",
  },
  {
    label: "סיור במערכת",
    key: "tour",
  },
  {
    label: "התנתק",
    key: "logout",
  },
]);

function renderDropdownLabel(option: any) {
  const icon = menuIcons[String(option.key)];
  return h("span", {class: "user-menu-label", dir: "rtl"}, [
    icon
      ? h(NIcon, {component: icon, size: 16, class: "user-menu-label__glyph"})
      : h("span", {class: "user-menu-label__icon-spacer"}),
    h("span", {class: "user-menu-label__text"}, String(option.label ?? "")),
  ]);
}

async function handleSelect(key: string) {
  if (key === "profile") {
    router.push({path: "/profile", query: {section: "personal"}});
  } else if (key === "engineer") {
    router.push({path: "/profile", query: {section: "engineer"}});
  } else if (key === "settings") {
    router.push({path: "/profile", query: {section: "settings"}});
  } else if (key === "subscription") {
    router.push({path: "/profile", query: {section: "subscription"}});
  } else if (key === "admin") {
    router.push("/admin");
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
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 132px;
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
  text-align: right;
}

</style>
