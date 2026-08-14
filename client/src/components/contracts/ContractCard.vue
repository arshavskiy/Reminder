<template>
  <article
    :class="{ 'card--selected': selected, 'card--selectable': bulkMode }"
    class="card"
    @click="openDefault"
  >
    <div class="card__row">
      <div class="card__meta">
        <div v-if="bulkMode || row.contract_number" class="card__num">
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
          <span v-if="!row.contact_email" class="tag tag--warn">⚠ חסר אימייל</span>
        </div>
      </div>
      <div v-if="showReminderActions" class="card__quick-actions">
        <button
          v-if="!reminders.length"
          :disabled="creatingReminder === row.id || !canCreateReminder"
          :title="reminderButtonTitle"
          class="btn btn--xs btn--primary"
          @click.stop="emit('create-reminder', row)"
        >
          {{ creatingReminder === row.id ? "..." : "🔔 צור תזכורת" }}
        </button>
        <button
          v-else
          :disabled="creatingReminder === row.id"
          class="btn btn--xs btn--ghost"
          @click.stop="emit('add-reminder', row)"
        >
          {{ creatingReminder === row.id ? "..." : "+ תזכורת" }}
        </button>
      </div>
    </div>

    <p class="card__sub">
      {{ subtitle }}
    </p>

    <div v-if="showActions" class="card__secondary-actions">
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
      <button class="btn btn--xs btn--ghost" @click.stop="emit('open-template', row)">
        <n-icon :component="DocumentTextOutline" /> פתח בתבנית
      </button>
      <button class="btn btn--xs btn--danger" @click.stop="emit('delete', row)">
        <n-icon :component="TrashOutline" /> מחק חוזה
      </button>
    </div>


    <div class="card__foot">
      <div class="card__foot-col">
        <span class="kv"><strong>לקוח:</strong> {{ row.client_name ?? "-" }}</span>
        <span class="kv"><strong>תאריך תסקיר:</strong> {{ formatDate(row.start_date) }}</span>
        <span v-if="equipmentLabel" class="kv kv--equipment"><strong>ציוד נבדק:</strong> {{ equipmentLabel }}</span>
      </div>
      <div class="card__foot-col card__foot-col--end">
        <span class="kv">
          <strong>{{ kind === "inspection" ? "בתוקף עד:" : "תפוגה:" }}</strong>
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
        <button
          v-if="showReminderActions"
          :disabled="creatingReminder === row.id || (!reminders.length && !canCreateReminder)"
          :title="reminders.length ? 'הוסף תזכורת נוספת' : reminderButtonTitle"
          class="btn btn--xs btn--primary"
          @click.stop="emit(reminders.length ? 'add-reminder' : 'create-reminder', row)"
        >
          {{ creatingReminder === row.id ? "..." : reminders.length ? "+ תזכורת חדשה" : "צור תזכורת" }}
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
import {CreateOutline, DocumentTextOutline, EyeOutline, TrashOutline} from "@vicons/ionicons5";
import ExpiryBadge from "../ExpiryBadge.vue";
import {useRouter} from "vue-router";
import type {ContractWithClient, ReminderWithContext} from "@shared/types.js";

const router = useRouter();

const props = defineProps<{
  row: ContractWithClient;
  inspectorNumber?: string;
  kind: "contract" | "inspection" | "all";
  bulkMode: boolean;
  selected: boolean;
  reminders: ReminderWithContext[];
  sendingReminder: number | null;
  creatingReminder?: string | null;
  showActions?: boolean;
  showReminderActions?: boolean;
}>();

const hasEmail = computed(() => Boolean((props.row.contact_email ?? "").trim()));
const canCreateReminder = computed(() => hasEmail.value && Boolean(props.row.expiry_date));
const reminderButtonTitle = computed(() => {
  if (!hasEmail.value) return "חסר אימייל ללקוח — לא ניתן ליצור תזכורת";
  if (!props.row.expiry_date) return "חסר תאריך תוקף — לא ניתן ליצור תזכורת";
  return "צור תזכורת לתסקיר זה";
});

const displayContractNumber = computed(() => {
  const number = props.row.contract_number?.trim();
  if (!number || number.includes("/")) return number;
  const inspector = props.kind === "inspection" ? props.inspectorNumber?.trim() : undefined;
  return inspector ? `${inspector}/${number}` : number;
});

const emit = defineEmits<{
  "toggle-select": [id: string];
  "open-document": [row: ContractWithClient];
  edit: [row: ContractWithClient];
  "open-template": [row: ContractWithClient];
  delete: [row: ContractWithClient, options?: { deleteRelatedReminders?: boolean }];
  "add-reminder": [row: ContractWithClient];
  "create-reminder": [row: ContractWithClient];
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
    overdue: "פג תוקף",
  };
  return map[status] ?? status;
}

function statusTagClass(status: string): string {
  const map: Record<string, string> = {
    active: "tag tag--ok",
    expired: "tag tag--bad",
    overdue: "tag tag--bad",
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

function openDefault() {
  if (props.bulkMode) {
    emit("toggle-select", String(props.row.id));
    return;
  }
  if (props.row.document_id) {
    emit("open-document", props.row);
    return;
  }
  emit("open-template", props.row);
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
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 14px;
}
.card__quick-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.card__num {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  min-height: 28px;
}
.card__sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; }
.card__secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 12px;
}
.card__pills { display: flex; flex-wrap: wrap; gap: 6px; }
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
.btn--ghost { background: transparent; font-weight: 600}
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 700;
}
.btn--primary:hover {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
}
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
.tag--warn { background: rgba(240,160,32,0.12); color: #b27a02; border-color: rgba(240,160,32,0.3); }
html[data-theme="dark"] .tag--warn { color: #f0a020; }
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

@media (max-width: 720px) {
  .card {
    padding: 15px;
    border-radius: 12px;
  }

  .card:hover {
    box-shadow: none;
  }

  .card__row,
  .card__foot {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .card__quick-actions {
    width: 100%;
  }

  .card__quick-actions .btn {
    width: 100%;
    justify-content: center;
  }

  .card__num {
    min-width: 0;
    font-size: 18px;
  }

  .card__num-main {
    overflow-wrap: anywhere;
  }

  .card__meta {
    width: 100%;
  }

  .card__secondary-actions .btn,
  .reminder-actions .btn {
    justify-content: center;
    min-width: 0;
    padding-inline: 8px;
  }

  .card__secondary-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .card__foot-col--end {
    text-align: right;
  }

  .kv {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .reminders-header,
  .reminder-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .reminder-date {
    min-width: 0;
  }

  .reminder-title {
    width: 100%;
    white-space: normal;
  }

  .reminder-actions {
    width: 100%;
  }
}
</style>
