<template>
  <div class="rqv">
    <div class="rqv__title">{{ popupTitle }}</div>

    <div class="rqv__meta">
      <div class="rqv__row">
        <span class="rqv__label">תאריך</span>
        <span class="rqv__value">{{ formatDate(reminder.trigger_date) }}</span>
      </div>
      <div v-if="reminder.client_name" class="rqv__row">
        <span class="rqv__label">לקוח</span>
        <span class="rqv__value">{{ reminder.client_name }}</span>
      </div>
      <div v-if="reminder.contact_person" class="rqv__row">
        <span class="rqv__label">איש קשר</span>
        <span class="rqv__value">{{ reminder.contact_person }}</span>
      </div>
      <div v-if="reminder.client_phone" class="rqv__row">
        <span class="rqv__label">טלפון</span>
        <span class="rqv__value">{{ reminder.client_phone }}</span>
      </div>
      <div v-if="contactEmail" class="rqv__row">
        <span class="rqv__label">אימייל</span>
        <span class="rqv__value">{{ contactEmail }}</span>
      </div>
      <div v-if="reminder.calendar_synced" class="rqv__row">
        <span class="rqv__label">Google Calendar</span>
        <span class="rqv__value rqv__value--synced">
          <n-icon :component="CalendarOutline" :size="14" />
          מסונכרן
        </span>
      </div>
    </div>

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
import {NButton, NIcon} from "naive-ui";
import {CalendarOutline} from "@vicons/ionicons5";
import type {ReminderWithContext} from "@shared/types.js";

interface Props {
  reminder: ReminderWithContext;
}
const props = defineProps<Props>();
defineEmits<{ (e: "navigate", target: { type: "contract" | "document" | "reminder"; id: number | string }): void }>();

const popupTitle = computed(() => reminderCalendarLabel(props.reminder));
const contactEmail = computed(() => props.reminder.client_email?.trim() || firstReminderEmail(props.reminder.email_to));

function reminderCalendarLabel(r: ReminderWithContext): string {
  const client = r.client_name?.trim();
  const contact = r.contact_person?.trim();
  if (client && contact) return `${client} · ${contact}`;
  if (client) return client;
  if (contact) return contact;
  return [r.title, shortContractNumber(r.contract_number)].filter(Boolean).join(" ");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function shortContractNumber(contractNumber: string | null | undefined): string {
  if (!contractNumber) return "—";
  const parts = contractNumber.split("/");
  return (parts.at(-1) ?? contractNumber).trim() || contractNumber;
}

function firstReminderEmail(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.find((item) => typeof item === "string" && item.trim())?.trim() ?? null;
    }
  } catch {
    // Keep supporting older/manual reminders where email_to is a plain string.
  }
  return value.includes("@") ? value.trim() : null;
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
.rqv__value--synced {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #18a058;
}
.rqv__actions { margin-top: 8px; }
</style>
