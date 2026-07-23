<template>
  <article
    :class="{ 'card--selected': selected, 'card--selectable': bulkMode }"
    class="card"
    @click="bulkMode ? emit('toggle-select', String(row.id)) : emit('open-document', row)"
  >
    <div class="card__row">
      <div class="card__num">
        <n-checkbox
          v-if="bulkMode"
          :checked="selected"
          @click.stop
          @update:checked="emit('toggle-select', String(row.id))"
        />
        <span v-if="row.contract_number" class="card__num-main">{{ displayContractNumber }}</span>
      </div>

      <div class="card__pills">
        <span :class="statusTagClass(row.status)">{{ statusLabel(row.status) }}</span>
        <span class="tag tag--neutral">{{ row.contract_type ?? "-" }}</span>
        <span v-if="row.counterparty" class="tag tag--neutral">{{ row.counterparty }}</span>
      </div>
      <div v-if="showActions" class="card__actions">
        <button
          :disabled="!row.document_id"
          :title="row.document_id ? 'צפה במסמך' : 'אין מסמך מקושר'"
          class="btn btn--xs btn--ghost"
          @click.stop="emit('open-document', row)"
        >
          <n-icon :component="EyeOutline" /> צפה
        </button>
        <button class="btn btn--xs btn--ghost" @click.stop="emit('edit', row)">
          <n-icon :component="CreateOutline" /> ערוך
        </button>
        <button class="btn btn--xs btn--danger" @click.stop="emit('delete', row)">
          <n-icon :component="TrashOutline" /> מחק
        </button>
      </div>
    </div>

    <p class="card__sub">
      {{ subtitle }}
    </p>


    <div class="card__foot">
      <div class="card__foot-col">
        <span class="kv"><strong>לקוח:</strong> {{ row.client_name ?? "-" }}</span>
        <span class="kv"><strong>תאריך התחלה:</strong> {{ formatDate(row.start_date) }}</span>
        <span v-if="equipmentLabel" class="kv kv--equipment"><strong>ציוד נבדק:</strong> {{ equipmentLabel }}</span>
      </div>
      <div class="card__foot-col card__foot-col--end">
        <span class="kv">
          <strong>{{ kind === "inspection" ? "בדיקה הבאה:" : "תפוגה:" }}</strong>
          <span :class="expiryClass(row.expiry_date)">{{ formatDate(row.expiry_date) }}</span>
          <ExpiryBadge :date="row.expiry_date" />
        </span>
        <span v-if="row.amount" class="kv">
          <strong>סכום:</strong> {{ row.amount?.toLocaleString() }} {{ row.currency }}
        </span>
      </div>
    </div>

    <div class="card__reminders">
      <div class="reminders-header">
        <span class="reminders-title">🔔 תזכורות</span>
        <button v-if="showReminderActions" class="btn btn--xs btn--ghost" @click.stop="emit('add-reminder', row)">
          + תזכורת חדשה
        </button>
      </div>
      <div v-if="reminders.length" class="reminders-list">
        <div
          v-for="reminder in reminders"
          :key="reminder.id"
          class="reminder-row reminder-row--clickable"
          title="פתח בעמוד התזכורות"
          @click.stop="router.push('/reminders')"
        >
          <span class="reminder-date">{{ reminder.trigger_date }}</span>
          <span class="reminder-title">{{ reminder.title }}</span>
          <span :class="reminderStatusClass(reminder.status)" class="reminder-status-badge">
            {{ reminderStatusLabel(reminder.status) }}
          </span>
          <div v-if="showReminderActions" class="reminder-actions">
            <button
              v-if="reminder.status === 'pending'"
              :disabled="sendingReminder === reminder.id"
              class="btn btn--xs btn--ghost"
              title="שלח עכשיו"
              @click.stop="emit('send-reminder', reminder)"
            >
              {{ sendingReminder === reminder.id ? "..." : "📤 שלח" }}
            </button>
            <button
              v-if="reminder.status === 'pending'"
              class="btn btn--xs btn--ghost"
              title="בטל תזכורת"
              @click.stop="emit('dismiss-reminder', reminder)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      <p v-else class="reminders-empty">אין תזכורות לתסקיר זה</p>
    </div>
  </article>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NCheckbox, NIcon} from "naive-ui";
import {CreateOutline, EyeOutline, TrashOutline} from "@vicons/ionicons5";
import ExpiryBadge from "../ExpiryBadge.vue";
import {useRouter} from "vue-router";
import type {ContractWithClient, ReminderWithContext} from "@shared/types.js";

const router = useRouter();

const props = defineProps<{
  row: ContractWithClient;`r`n  inspectorNumber?: string;
  kind: "contract" | "inspection" | "all";
  bulkMode: boolean;
  selected: boolean;
  reminders: ReminderWithContext[];
  sendingReminder: number | null;
  showActions?: boolean;
  showReminderActions?: boolean;
}>();

const emit = defineEmits<{
  "toggle-select": [id: string];
  "open-document": [row: ContractWithClient];
  edit: [row: ContractWithClient];
  delete: [row: ContractWithClient];
  "add-reminder": [row: ContractWithClient];
  "send-reminder": [reminder: ReminderWithContext];
  "dismiss-reminder": [reminder: ReminderWithContext];
}>();

const showActions = computed(() => props.showActions ?? true);
const showReminderActions = computed(() => props.showReminderActions ?? true);

const subtitle = computed(() =>
  props.row.summary ??
  `${props.row.contract_type ?? (props.kind === "inspection" ? "תסקיר" : "חוזה")} - ${props.row.client_name ?? "-"}`
);

// Short label for the tested equipment: prefer the structured _equipment rows
// (manufacturer / model / serial), fall back to the free-text description.
const equipmentLabel = computed<string | null>(() => {
  const items = props.row._equipment ?? [];
  if (items.length) {
    const parts = items
      .map((eq) => [eq.name, eq.manufacturer, eq.model, eq.serial_number].filter(Boolean).join(" · "))
      .filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  return props.row.equipment_description || null;
});

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const datePart = d.includes("T") ? d.split("T")[0] : d.split(" ")[0];
  const [y, m, day] = datePart.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "פעיל",
    expired: "פג תוקף",
    cancelled: "בוטל",
    renewed: "חודש",
  };
  return map[status] ?? status;
}

function statusTagClass(status: string): string {
  const map: Record<string, string> = {
    active: "tag tag--ok",
    expired: "tag tag--bad",
    cancelled: "tag tag--muted",
    renewed: "tag tag--info",
  };
  return map[status] ?? "tag tag--neutral";
}

function expiryClass(d: string | null): string {
  if (!d) return "";
  const diff = (new Date(d).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return "expiry expiry--bad";
  if (diff < 30) return "expiry expiry--warn";
  return "expiry expiry--ok";
}

function reminderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "ממתין",
    sent: "נשלח",
    snoozed: "נדחה",
    dismissed: "בוטל",
    error: "שגיאה",
  };
  return map[status] ?? status;
}

function reminderStatusClass(status: string): string {
  const map: Record<string, string> = {
    pending: "rbadge rbadge--pending",
    sent: "rbadge rbadge--sent",
    snoozed: "rbadge rbadge--snoozed",
    dismissed: "rbadge rbadge--dismissed",
    error: "rbadge rbadge--error",
  };
  return map[status] ?? "rbadge";
}
</script>

<style scoped>
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 22px;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.card:hover { border-color: var(--brand-color); box-shadow: var(--shadow-sm); }
.card--selected { border-color: var(--brand-color); background: rgba(99,226,183,0.06); }
.card--selectable { cursor: pointer; }
.card--selectable:hover { border-color: var(--brand-color); }
.card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card__num {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.card__actions { display: flex; gap: 8px; }
.card__sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; }
.card__pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}
.btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--ghost { background: transparent; }
.btn--danger {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}
.btn--danger:hover { background: rgba(208, 48, 80, 0.08); }
.btn--xs { padding: 4px 10px; font-size: 12px; }

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.tag--ok { background: rgba(99,226,183,0.15); color: #1a7951; border-color: rgba(99,226,183,0.3); }
.tag--bad { background: rgba(208,48,80,0.10); color: #b22e2e; border-color: rgba(208,48,80,0.2); }
.tag--info { background: rgba(32,128,240,0.10); color: #1560bd; border-color: rgba(32,128,240,0.2); }
.tag--neutral { background: var(--bg-elevated); color: var(--text-secondary); border-color: var(--border-color); }
.tag--muted { background: transparent; color: var(--text-muted); border-color: var(--border-color); }
html[data-theme="dark"] .tag--ok { color: #63e2b7; }
html[data-theme="dark"] .tag--bad { color: #ff7875; }
html[data-theme="dark"] .tag--info { color: #63b3ed; }

.card__foot {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.card__foot-col { display: flex; flex-direction: column; gap: 4px; }
.card__foot-col--end { text-align: left; }
.kv {
  font-size: 13px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.kv strong { color: var(--text-muted); font-weight: 500; }
.kv--equipment { align-items: flex-start; }
.kv--equipment strong { white-space: nowrap; }

.expiry { font-weight: 600; }
.expiry--ok { color: #1a7951; }
.expiry--warn { color: #b27a02; }
.expiry--bad { color: #b22e2e; }
html[data-theme="dark"] .expiry--ok { color: #63e2b7; }
html[data-theme="dark"] .expiry--warn { color: #f0a020; }
html[data-theme="dark"] .expiry--bad { color: #ff7875; }

.card__reminders {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.reminders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.reminders-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.reminders-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reminder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 13px;
}
.reminder-row--clickable {
  cursor: pointer;
}
.reminder-row--clickable:hover {
  border-color: var(--brand-color);
}
.reminder-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 80px;
}
.reminder-title {
  flex: 1;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reminder-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.rbadge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}
.rbadge--pending { background: rgba(240,160,32,0.15); color: #b27a02; border: 1px solid rgba(240,160,32,0.3); }
.rbadge--sent { background: rgba(99,226,183,0.15); color: #1a7951; border: 1px solid rgba(99,226,183,0.3); }
.rbadge--snoozed { background: rgba(32,128,240,0.12); color: #1560bd; border: 1px solid rgba(32,128,240,0.2); }
.rbadge--dismissed { background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-color); }
.rbadge--error { background: rgba(208,48,80,0.12); color: #b22e2e; border: 1px solid rgba(208,48,80,0.2); }
html[data-theme="dark"] .rbadge--pending { color: #f0a020; }
html[data-theme="dark"] .rbadge--sent { color: #63e2b7; }
html[data-theme="dark"] .rbadge--snoozed { color: #63b3ed; }
html[data-theme="dark"] .rbadge--error { color: #ff7875; }

.reminders-empty {
  font-size: 12px;
  color: var(--text-muted);
  margin: 6px 0 0;
  padding: 0;
}
</style>
