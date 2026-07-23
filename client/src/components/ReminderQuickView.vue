<template>
  <div class="rqv">
    <div class="rqv__title">{{ reminder.title }}</div>

    <div class="rqv__meta">
      <div class="rqv__row">
        <span class="rqv__label">תאריך</span>
        <span class="rqv__value">{{ formatDate(reminder.trigger_date) }}</span>
      </div>
      <div v-if="reminder.client_name" class="rqv__row">
        <span class="rqv__label">לקוח</span>
        <span class="rqv__value">{{ reminder.client_name }}</span>
      </div>
      <div v-if="reminder.document_name" class="rqv__row">
        <span class="rqv__label">מסמך</span>
        <span class="rqv__value">{{ reminder.document_name }}</span>
      </div>
      <div class="rqv__row">
        <span class="rqv__label">סטטוס</span>
        <span :class="`rqv__status--${reminder.status}`" class="rqv__status">{{ statusLabel }}</span>
      </div>
    </div>

    <p v-if="reminder.body" class="rqv__body">{{ reminder.body }}</p>

    <div class="rqv__actions">
      <n-button block size="small" type="primary" @click="$emit('navigate', { type: 'reminder', id: reminder.id })">
        פתח תזכורת
      </n-button>
      <n-button
        v-if="reminder.document_id"
        block
        size="small"
        style="margin-top: 6px"
        @click="$emit('navigate', { type: 'document', id: reminder.document_id! })"
      >
        פתח מסמך
      </n-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NButton} from "naive-ui";
import type {ReminderWithContext} from "@shared/types.js";

interface Props {
  reminder: ReminderWithContext;
}
const props = defineProps<Props>();
defineEmits<{ (e: "navigate", target: { type: "contract" | "document" | "reminder"; id: number | string }): void }>();

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתינה",
  sent: "נשלחה",
  dismissed: "נדחתה",
  failed: "נכשלה",
  snoozed: "נדחתה זמנית",
};
const statusLabel = computed(() => STATUS_LABELS[props.reminder.status] ?? props.reminder.status);

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
</script>

<style scoped>
.rqv { padding: 4px 2px; }
.rqv__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
  line-height: 1.4;
}
.rqv__meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.rqv__row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.rqv__label { color: var(--text-muted); }
.rqv__value { color: var(--text-primary); font-weight: 500; text-align: end; }
.rqv__status {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
}
.rqv__status--pending { background: rgba(240,160,32,0.15); color: #b27a02; }
.rqv__status--sent { background: rgba(32,128,240,0.15); color: #2080f0; }
.rqv__status--dismissed { background: var(--bg-elevated); color: var(--text-muted); }
.rqv__status--failed { background: rgba(208,48,80,0.15); color: var(--color-error, #d03050); }
.rqv__status--snoozed { background: rgba(99,226,183,0.15); color: var(--brand-color); }

.rqv__body {
  margin: 8px 0;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
.rqv__actions { margin-top: 8px; }
</style>
