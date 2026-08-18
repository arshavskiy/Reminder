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
          <span v-if="!row.document_id" class="tag tag--warn">⚠ חסר PDF</span>
          <span v-if="!hasEmail" class="tag tag--warn">⚠ חסר אימייל</span>
          <span v-for="issue in (issues ?? [])" :key="issue.kind" :class="['tag', issue.tagClass]">{{ issue.label }}</span>
        </div>
      </div>
    </div>

    <p class="card__sub">
      {{ subtitle }}
    </p>

    <div class="card__foot">
      <div class="card__foot-col">
        <span class="kv"><strong>לקוח:</strong> <router-link v-if="row.client_id" class="client-link" :to="`/clients/${row.client_id}`" @click.stop>{{ row.client_name ?? "-" }}</router-link><template v-else>{{ row.client_name ?? "-" }}</template></span>
        <span class="kv"><strong>תאריך תסקיר:</strong> {{ formatDate(row.start_date) }}</span>
        <span v-if="equipmentLabel" class="kv kv--equipment"><strong>ציוד נבדק:</strong> {{ equipmentLabel }}</span>
      </div>
      <div class="card__foot-col card__foot-col--end">
        <span class="kv">
          <strong>{{ kind === "inspection" ? "בתוקף עד:" : "תפוגה:" }}</strong>
          <span :class="expiryClass(row.expiry_date)">{{ formatDate(row.expiry_date) }}</span>
        </span>
        <span v-if="row.amount" class="kv">
          <strong>סכום:</strong> {{ row.amount?.toLocaleString() }} {{ row.currency }}
        </span>
      </div>
    </div>

    <div class="card__reminders">
      <div class="reminders-header">
        <span class="reminders-title">🔔 תזכורות</span>
        <div v-if="showActions" class="card__actions" @click.stop>
          <button
              :disabled="!row.document_id"
              class="btn btn--ghost btn--xs icon-btn"
              :title="row.document_id ? 'צפה במסמך' : 'אין מסמך מקושר'"
              type="button"
              @click.stop="emit('open-document', row)"
          >
            <n-icon :component="EyeOutline" class="btn-icon"/>
          </button>
          <button
              class="btn btn--ghost btn--xs icon-btn"
              title="ערוך"
              type="button"
              @click.stop="emit('edit', row)"
          >
            <n-icon :component="CreateOutline" class="btn-icon"/>
          </button>
          <button
              class="btn btn--ghost btn--xs icon-btn"
              title="פתח בתבנית"
              type="button"
              @click.stop="emit('open-template', row)"
          >
            <n-icon :component="DocumentTextOutline" class="btn-icon"/>
          </button>
          <button
              v-if="!row.document_id"
              class="btn btn--warn-ghost btn--xs icon-btn"
              title="הפק PDF"
              type="button"
              @click.stop="emit('open-template', row)"
          >
            <n-icon :component="DownloadOutline" class="btn-icon"/>
          </button>
          <button
              v-if="showReminderActions"
              :disabled="creatingReminder === row.id || (!reminders.length && !canCreateReminder)"
              class="btn btn--ghost btn--xs icon-btn"
              :class="{ 'btn--loading': creatingReminder === row.id }"
              :title="reminders.length ? 'הוסף תזכורת' : reminderButtonTitle"
              type="button"
              @click.stop="emit(reminders.length ? 'add-reminder' : 'create-reminder', row)"
          >
            <n-icon :component="NotificationsOutline" class="btn-icon"/>
          </button>
          <button
              v-if="showReminderActions"
              :disabled="!canSendReminder || sendingThisCard"
              class="btn btn--ghost btn--xs icon-btn"
              :class="{ 'btn--loading': sendingThisCard }"
              :title="sendReminderTitle"
              type="button"
              @click.stop="emit('send-card', row)"
          >
            <n-icon :component="PaperPlaneOutline" class="btn-icon"/>
          </button>
          <button
              class="btn btn--danger-ghost btn--xs icon-btn"
              title="מחק"
              type="button"
              @click.stop="emit('delete', row)"
          >
            <n-icon :component="TrashOutline" class="btn-icon"/>
          </button>
        </div>
<!--        <button-->
<!--            v-if="showReminderActions"-->
<!--            :disabled="creatingReminder === row.id || (!reminders.length && !canCreateReminder)"-->
<!--            :title="reminders.length ? 'הוסף תזכורת נוספת' : reminderButtonTitle"-->
<!--            class="btn btn&#45;&#45;xs btn&#45;&#45;primary"-->
<!--            :class="{ 'btn&#45;&#45;loading': creatingReminder === row.id }"-->
<!--            @click.stop="emit(reminders.length ? 'add-reminder' : 'create-reminder', row)"-->
<!--        >-->
<!--          {{ reminders.length ? "+ תזכורת חדשה" : "צור תזכורת" }}-->
<!--        </button>-->
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
          <div v-if="showReminderActions" class="reminder-actions" @click.stop>
            <button
                v-if="reminder.status !== 'dismissed'"
                :disabled="sendingReminder === reminder.id || !reminderSendable(reminder)"
                class="btn btn--ghost btn--xs icon-btn"
                :class="{ 'btn--loading': sendingReminder === reminder.id }"
                :title="reminderSendTitle(reminder)"
                type="button"
                @click.stop="emit('send-reminder', reminder)"
            >
              <n-icon :component="PaperPlaneOutline" class="btn-icon"/>
            </button>
            <button
                v-if="reminder.status === 'pending'"
                class="btn btn--ghost btn--xs icon-btn"
                title="בטל תזכורת"
                type="button"
                @click.stop="emit('dismiss-reminder', reminder)"
            >
              <n-icon :component="CloseCircleOutline" class="btn-icon"/>
            </button>
            <button
                class="btn btn--danger-ghost btn--xs icon-btn"
                title="מחק תזכורת"
                type="button"
                @click.stop="emit('delete-reminder', reminder)"
            >
              <n-icon :component="TrashOutline" class="btn-icon"/>
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
import {CloseCircleOutline, CreateOutline, DocumentTextOutline, DownloadOutline, EyeOutline, NotificationsOutline, PaperPlaneOutline, TrashOutline} from "@vicons/ionicons5";
import {useRouter} from "vue-router";
import type {ContractWithClient, ReminderWithContext} from "@shared/types.js";
import type {RowIssue} from "@shared/rowIssues.js";
import {contractRowHasEmail} from "@shared/contractEmail.js";

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
  issues?: RowIssue[];
}>();

const hasEmail = computed(() => contractRowHasEmail(props.row));
const sendableReminder = computed(() => {
  const rows = (props.reminders ?? []).filter((r) => r.status !== "dismissed");
  return rows.find((r) => r.status === "pending")
      ?? rows.find((r) => r.status === "sent")
      ?? rows.find((r) => r.status === "snoozed")
      ?? null;
});
const canSendReminder = computed(() => {
  if (sendableReminder.value) return reminderSendable(sendableReminder.value);
  return hasEmail.value && Boolean(props.row.expiry_date);
});
const sendingThisCard = computed(() =>
  props.creatingReminder === props.row.id
  || (props.sendingReminder != null && (props.reminders ?? []).some((r) => r.id === props.sendingReminder)),
);
const sendReminderTitle = computed(() => {
  if (sendableReminder.value) return reminderSendTitle(sendableReminder.value);
  if (!hasEmail.value) return "חסר אימייל — לא ניתן לשלוח";
  if (!props.row.expiry_date) return "חסר תאריך תוקף — לא ניתן לשלוח";
  return "צור ושלח תזכורת";
});
const canCreateReminder = computed(() => Boolean(props.row.expiry_date));
const reminderButtonTitle = computed(() => {
  if (!props.row.expiry_date) return "חסר תאריך תוקף — לא ניתן ליצור תזכורת";
  if (!hasEmail.value) return "צור תזכורת (חסר אימייל — לא תישלח עד שיתווסף)";
  return "צור תזכורת לתסקיר זה";
});

function reminderHasEmail(reminder: ReminderWithContext): boolean {
  if (hasEmail.value) return true;
  const to = reminder.email_to?.trim();
  if (to && to !== "[]" && to !== "null") return true;
  return Boolean(reminder.client_email?.trim());
}

function reminderSendable(reminder: ReminderWithContext): boolean {
  return reminder.status !== "dismissed" && reminderHasEmail(reminder);
}

function reminderSendTitle(reminder: ReminderWithContext): string {
  if (!reminderHasEmail(reminder)) return "חסר אימייל — לא ניתן לשלוח";
  return reminder.status === "sent" ? "שלח שוב" : "שלח תזכורת";
}

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
  "send-card": [row: ContractWithClient];
  "dismiss-reminder": [reminder: ReminderWithContext];
  "delete-reminder": [reminder: ReminderWithContext];
}>();

const showActions = computed(() => props.showActions ?? true);
const showReminderActions = computed(() => true);

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
        .map((eq) => {
          const model = (eq as any).models?.length ? (eq as any).models.join(", ") : eq.model;
          const serial = (eq as any).serial_numbers?.length ? (eq as any).serial_numbers.join(", ") : eq.serial_number;
          const qty = (eq as any).serial_numbers?.length > 1 ? ` (×${(eq as any).serial_numbers.length})` : "";
          return [eq.name, eq.manufacturer, model, serial ? `מס׳ ${serial}` : null].filter(Boolean).join(" · ") + qty;
        })
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
    draft: "טיוטה",
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
    draft: "tag tag--warn",
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

.card:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-sm);
}

.card--selected {
  border-color: var(--brand-color);
  background: rgba(99, 226, 183, 0.06);
}

.card--selectable {
  cursor: pointer;
}

.card--selectable:hover {
  border-color: var(--brand-color);
}

.card__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 14px;
}

.card__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
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

.card__sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.card__secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 12px;
}

.card__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

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

.btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn--loading {
  opacity: 0.75;
}

.btn--loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.75s linear infinite;
  flex: 0 0 auto;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.btn--ghost {
  background: transparent;
}

.btn--danger-ghost {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}

.btn--danger-ghost:hover {
  background: rgba(208, 48, 80, 0.08);
}

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

.btn--danger:hover {
  background: rgba(208, 48, 80, 0.08);
}

.btn--xs {
  padding: 4px 10px;
  font-size: 12px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.tag--ok {
  background: rgba(99, 226, 183, 0.15);
  color: #1a7951;
  border-color: rgba(99, 226, 183, 0.3);
}

.tag--bad {
  background: rgba(208, 48, 80, 0.10);
  color: #b22e2e;
  border-color: rgba(208, 48, 80, 0.2);
}

.tag--info {
  background: rgba(32, 128, 240, 0.10);
  color: #1560bd;
  border-color: rgba(32, 128, 240, 0.2);
}

.tag--neutral {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border-color: var(--border-color);
}

.tag--muted {
  background: transparent;
  color: var(--text-muted);
  border-color: var(--border-color);
}

.tag--warn {
  background: rgba(240, 160, 32, 0.12);
  color: #b27a02;
  border-color: rgba(240, 160, 32, 0.3);
}

html[data-theme="dark"] .tag--warn {
  color: #f0a020;
}

html[data-theme="dark"] .tag--ok {
  color: #63e2b7;
}

html[data-theme="dark"] .tag--bad {
  color: #ff7875;
}

html[data-theme="dark"] .tag--info {
  color: #63b3ed;
}

.card__foot {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.card__foot-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card__foot-col--end {
  text-align: left;
  align-items: flex-end;
  min-width: 150px;
}

.kv {
  font-size: 13px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kv strong {
  color: var(--text-muted);
  font-weight: 500;
}

.kv--equipment {
  align-items: flex-start;
}

.kv--equipment strong {
  white-space: nowrap;
}

.client-link {
  color: var(--brand-color, #63e2b7);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.client-link:hover {
  opacity: 0.8;
}

.expiry {
  font-weight: 600;
}

.expiry--ok {
  color: #1a7951;
}

.expiry--warn {
  color: #b27a02;
}

.expiry--bad {
  color: #b22e2e;
}

html[data-theme="dark"] .expiry--ok {
  color: #63e2b7;
}

html[data-theme="dark"] .expiry--warn {
  color: #f0a020;
}

html[data-theme="dark"] .expiry--bad {
  color: #ff7875;
}

.card__reminders {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.reminders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.icon-btn {
  padding: 4px 6px;
  min-width: 32px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

.rbadge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.rbadge--pending {
  background: rgba(240, 160, 32, 0.15);
  color: #b27a02;
  border: 1px solid rgba(240, 160, 32, 0.3);
}

.rbadge--sent {
  background: rgba(99, 226, 183, 0.15);
  color: #1a7951;
  border: 1px solid rgba(99, 226, 183, 0.3);
}

.rbadge--snoozed {
  background: rgba(32, 128, 240, 0.12);
  color: #1560bd;
  border: 1px solid rgba(32, 128, 240, 0.2);
}

.rbadge--dismissed {
  background: var(--bg-elevated);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

.rbadge--error {
  background: rgba(208, 48, 80, 0.12);
  color: #b22e2e;
  border: 1px solid rgba(208, 48, 80, 0.2);
}

html[data-theme="dark"] .rbadge--pending {
  color: #f0a020;
}

html[data-theme="dark"] .rbadge--sent {
  color: #63e2b7;
}

html[data-theme="dark"] .rbadge--snoozed {
  color: #63b3ed;
}

html[data-theme="dark"] .rbadge--error {
  color: #ff7875;
}

.reminders-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

  .card__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
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
    justify-content: flex-start;
  }
}
</style>
