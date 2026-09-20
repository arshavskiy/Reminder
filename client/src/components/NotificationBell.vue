<template>
  <n-popover trigger="click" placement="bottom-end" :width="340" @update:show="onToggle">
    <template #trigger>
      <button class="notif-bell" type="button" :aria-label="l.notifications.title">
        <n-icon :component="NotificationsOutline" :size="18" />
        <span v-if="unreadCount > 0" class="notif-bell__dot" aria-hidden="true" />
      </button>
    </template>

    <div class="notif-panel">
      <div class="notif-panel__head">
        <strong>{{ l.notifications.title }}</strong>
        <button v-if="unreadCount > 0" class="notif-panel__mark-all" type="button" @click="markAllRead">
          {{ l.notifications.markAllRead }}
        </button>
      </div>

      <div class="notif-panel__list">
        <div v-if="!items.length" class="notif-panel__empty">{{ l.notifications.empty }}</div>
        <button
          v-for="item in items"
          :key="item.id"
          class="notif-item"
          :class="{ 'notif-item--unread': !item.read_at }"
          type="button"
          @click="onItemClick(item)"
        >
          <span class="notif-item__title">{{ item.title }}</span>
          <span v-if="item.body" class="notif-item__body">{{ item.body }}</span>
        </button>
      </div>

      <div class="notif-panel__quickadd">
        <div class="notif-panel__quickadd-title">{{ l.notifications.quickAdd }}</div>
        <n-input v-model:value="quickTitle" size="small" :placeholder="l.notifications.quickAddTitlePlaceholder" />
        <n-date-picker v-model:value="quickDateMs" type="date" size="small" class="notif-panel__field" />
        <n-select
          v-model:value="quickCategory"
          size="small"
          :options="categoryOptions"
          :placeholder="l.notifications.quickAddCategoryPlaceholder"
          clearable
          filterable
          tag
          :virtual-scroll="false"
          class="notif-panel__field"
        />
        <div class="notif-panel__remind-label">{{ l.notifications.quickAddRemindBeforeLabel }}</div>
        <n-input
          v-model:value="quickRemindBeforeDays"
          size="small"
          :placeholder="l.notifications.quickAddRemindBeforePlaceholder"
          class="notif-panel__field"
        />
        <n-checkbox v-model:checked="quickAlsoEmailSelf" class="notif-panel__field">
          {{ l.reminders.alsoEmailSelf }}
        </n-checkbox>
        <n-button
          size="small"
          type="primary"
          class="notif-panel__submit"
          :disabled="!quickTitle.trim() || !quickDateMs"
          :loading="quickAdding"
          @click="submitQuickAdd"
        >
          {{ l.notifications.quickAddSubmit }}
        </n-button>
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { NButton, NCheckbox, NDatePicker, NIcon, NInput, NPopover, NSelect, useMessage } from "naive-ui";
import { NotificationsOutline } from "@vicons/ionicons5";
import { useI18n } from "../composables/useI18n.js";
import { useNotifications } from "../composables/useNotifications.js";
import { useAuthStore } from "../stores/auth.js";
import { api } from "../services/apiService.js";
import { categoryLabel } from "../utils/reminderCategoryLabels.js";
import type { NotificationItem } from "@shared/types.js";

const { l, href, locale } = useI18n();
const message = useMessage();
const router = useRouter();
const authStore = useAuthStore();
const { items, unreadCount, refresh, markRead, markAllRead, startPolling } = useNotifications();

const quickTitle = ref("");
const quickDateMs = ref<number | null>(null);
const quickCategory = ref<string | null>("Personal");
const quickRemindBeforeDays = ref("");
const quickAlsoEmailSelf = ref(false);
const quickAdding = ref(false);
const categories = ref<{ name: string; count: number }[]>([]);

const categoryOptions = computed(() => {
  const options = categories.value.map((c) => ({ label: categoryLabel(c.name, locale.value), value: c.name }));
  if (!options.some((o) => o.value === "Personal")) {
    options.push({ label: categoryLabel("Personal", locale.value), value: "Personal" });
  }
  return options;
});

onMounted(async () => {
  startPolling();
  try {
    const data = await api.reminders.categories();
    categories.value = data.categories;
  } catch {
    // Non-critical — quick-add still works without a prefilled category list.
  }
});

function onToggle(show: boolean) {
  if (show) void refresh();
}

function onItemClick(item: NotificationItem) {
  if (!item.read_at) void markRead(item.id);
  if (item.reminder_id) router.push(href(`/reminders/${item.reminder_id}`));
  else router.push(href("/reminders"));
}

async function submitQuickAdd() {
  if (!quickTitle.value.trim() || !quickDateMs.value) return;
  quickAdding.value = true;
  try {
    const d = new Date(quickDateMs.value);
    const targetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await api.reminders.createPersonal({
      title: quickTitle.value.trim(),
      target_date: targetDate,
      reminder_category: quickCategory.value || "Personal",
      email_to: quickAlsoEmailSelf.value ? (authStore.user?.email ?? null) : null,
      remind_before_days: quickRemindBeforeDays.value.trim() || null,
    });
    message.success(l.value.notifications.quickAddSuccess);
    quickTitle.value = "";
    quickDateMs.value = null;
    quickCategory.value = "Personal";
    quickRemindBeforeDays.value = "";
    quickAlsoEmailSelf.value = false;
    await refresh();
  } catch {
    message.error(l.value.notifications.quickAddError);
  } finally {
    quickAdding.value = false;
  }
}
</script>

<style scoped>
.notif-bell {
  position: relative;
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
  flex: 0 0 auto;
  padding: 0;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.notif-bell:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.notif-bell__dot {
  position: absolute;
  top: 6px;
  inset-inline-end: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error, #d03050);
  border: 1.5px solid var(--bg-card);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-error, #d03050) 35%, transparent);
}
.notif-panel {
  display: grid;
  gap: 10px;
  max-height: 70vh;
  overflow: auto;
}
.notif-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.notif-panel__mark-all {
  border: none;
  background: none;
  color: var(--brand-color);
  font-size: 12px;
  cursor: pointer;
}
.notif-panel__list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}
.notif-panel__empty {
  padding: 12px 4px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
.notif-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  text-align: start;
  cursor: pointer;
}
.notif-item--unread {
  border-color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 6%, var(--bg-card));
}
.notif-item__title {
  font-size: 13px;
  font-weight: 600;
}
.notif-item__body {
  font-size: 12px;
  color: var(--text-secondary);
}
.notif-panel__quickadd {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  display: grid;
  gap: 0;
}
.notif-panel__quickadd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.notif-panel__field {
  width: 100%;
  margin-top: 6px;
}
.notif-panel__remind-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  margin-bottom: 2px;
}
.notif-panel__submit {
  margin-top: 8px;
  width: 100%;
}
</style>
