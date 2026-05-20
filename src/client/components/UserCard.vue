<template>
  <div class="user-card">
    <div class="user-card__avatar">
      <img v-if="user?.name" :src="avatarUrl" :alt="user.name" class="user-card__avatar-img" />
      <div v-else class="user-card__avatar-placeholder">
        <n-icon :component="PersonOutline" :size="24" />
      </div>
    </div>
    <div class="user-card__info">
      <h3 class="user-card__name">{{ user?.name || "משתמש" }}</h3>
      <p class="user-card__email">{{ user?.email }}</p>
      <div class="user-card__role">
        <n-tag :type="user?.role === 'admin' ? 'warning' : 'info'">
          {{ user?.role === 'admin' ? '👑 מנהל' : '👤 משתמש' }}
        </n-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { User } from '@shared/types.js';
import { NIcon, NTag } from 'naive-ui';
import { PersonOutline } from '@vicons/ionicons5';

interface Props {
  user?: User | null;
}

const props = defineProps<Props>();

// Create a simple avatar based on user email
function getAvatarUrl(email?: string): string {
  if (!email) return '';
  // Use UI Avatars service for initials
  const initials = email.split('@')[0].substring(0, 2).toUpperCase();
  return `https://ui-avatars.com/api/?name=${initials}&background=18a058&color=fff&size=96`;
}

const avatarUrl = computed(() => getAvatarUrl(props.user?.email));
</script>

<style scoped>
.user-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 20px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.user-card__avatar {
  flex-shrink: 0;
}

.user-card__avatar-img,
.user-card__avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 2px solid var(--border-color);
}

.user-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-card__name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-card__email {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.user-card__role {
  display: inline-flex;
  width: fit-content;
}
</style>


