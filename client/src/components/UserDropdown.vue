<template>
  <div class="user-dropdown">
    <n-dropdown
      trigger="click"
      :options="dropdownItems"
      @select="handleSelect"
      placement="bottom-end"
    >
      <div class="user-dropdown__trigger">
        <div class="user-dropdown__avatar">
          <img
            v-if="avatarSrc"
            :src="avatarSrc"
            :alt="userName"
            class="user-dropdown__avatar-img"
          />
          <n-icon v-else :component="PersonOutline" :size="18" />
        </div>
        <div class="user-dropdown__meta">
          <span v-if="userName" class="user-dropdown__name">{{
            userName
          }}</span>
          <span v-if="props.userRole" class="user-dropdown__role">{{
            props.userRole === "admin" ? "👑 מנהל" : "👤 משתמש"
          }}</span>
        </div>
      </div>
    </n-dropdown>
  </div>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {useRouter} from "vue-router";
import {NDropdown, NIcon} from "naive-ui";
import {PersonOutline,} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";

interface Props {
  userName?: string | null;
  userEmail?: string | null;
  userPicture?: string | null;
  userRole?: string | null;
}

const props = defineProps<Props>();
const router = useRouter();
const authStore = useAuthStore();

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

const dropdownItems = computed(() => [
  {
    label: "👤 הפרופיל שלי",
    key: "profile",
  },
  ...(props.userRole === "admin"
    ? [
        { label: "⚙️ הגדרות אישיות", key: "settings" },
        { label: "🛡 פאנל ניהול", key: "admin" },
      ]
    : []),
  {
    type: "divider",
  },
  {
    label: "🚪 התנתק",
    key: "logout",
  },
]);

async function handleSelect(key: string) {
  if (key === "profile") {
    router.push("/profile");
  } else if (key === "settings") {
    router.push("/settings");
  } else if (key === "admin") {
    router.push("/admin");
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
  gap: 8px;
  padding: 4px 8px;
  border-radius: 50%;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.user-dropdown__trigger:hover {
  //background: var(--bg-hover);
}

.user-dropdown__avatar {
  width: 32px;
  height: 32px;
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
  object-fit: contain;
}

.user-dropdown__name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-dropdown__meta {
  display: flex;
  flex-direction: column;
}
.user-dropdown__role {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

@media (max-width: 768px) {
  .user-dropdown__name {
    display: none;
  }
}
</style>
