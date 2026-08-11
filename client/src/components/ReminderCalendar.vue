<template>
  <section class="rcal">
    <header class="rcal__head">
      <div class="rcal__title-wrap">
        <h3 class="rcal__title">{{ testsOnly ? "לוח בדיקות מתוכננות" : "לוח תזכורות ותסקירים" }}</h3>
        <div class="rcal__counts">
          <span v-if="!testsOnly" class="rcal__count">{{ filteredRows.length }} תזכורות</span>
          <span v-if="filteredExpiryItems.length" class="rcal__expiry-count">
            {{ filteredExpiryItems.length }} תסקירים
          </span>
        </div>
      </div>
      <div class="rcal__controls">
        <div class="rcal__toggle">
          <n-button
            :type="view === 'month' ? 'primary' : 'default'"
            size="small"
            @click="view = 'month'"
          >▦ חודש</n-button>
          <n-button
            :type="view === 'agenda' ? 'primary' : 'default'"
            size="small"
            @click="view = 'agenda'"
          >☰ רשימה</n-button>
        </div>
        <n-button size="small" secondary @click="downloadVisibleMonthDoc">DOC דוח חודש נוכחי</n-button>
        <n-button size="small" secondary @click="printCalendar">הדפסה</n-button>
        <n-button
          v-if="!testsOnly"
          :disabled="sendableVisibleReminders.length === 0 || sendingVisible"
          :loading="sendingVisible"
          size="small"
          type="primary"
          ghost
          @click="showSendVisibleConfirm = true"
        >
          שלח נראות ({{ sendableVisibleReminders.length }})
        </n-button>
        <n-button :loading="loading" size="small" @click="$emit('refresh')">↻</n-button>
      </div>
      <div v-if="featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)" class="rcal__summary">
        <button
          v-for="item in summaryFilters"
          :key="item.key"
          class="rcal__summary-chip"
          :class="{ 'rcal__summary-chip--active': activeFilter === item.key }"
          type="button"
          @click="activeFilter = item.key"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.count }}</strong>
        </button>
      </div>
      <div v-if="featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)" class="rcal__filters">
        <button
          v-for="filter in calendarFilters"
          :key="filter.key"
          class="rcal__filter"
          :class="{ 'rcal__filter--active': activeFilter === filter.key }"
          type="button"
          @click="activeFilter = filter.key"
        >
          {{ filter.label }}
        </button>
      </div>
      <div class="rcal__legend">
        <span v-if="!testsOnly" class="rcal__legend-item">
          <span class="rcal__legend-dot" style="background:var(--brand-color)"></span> תזכורות
        </span>
        <span v-if="!testsOnly" class="rcal__legend-item">
          <span class="rcal__legend-dot" style="background:#2080f0"></span> נשלחה
        </span>
        <template v-if="featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)">
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#d03050"></span> פג תוקף
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#f0a020"></span> ≤30 יום
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#e8c84a"></span> ≤90 יום
          </span>
        </template>
      </div>
    </header>

    <!-- ── Month grid ──────────────────────────────────────────────────── -->
    <div v-if="view === 'month'" class="rcal__month">
      <div class="rcal__nav">
        <n-button class="rcal__nav-btn" size="small" @click="shiftMonth(-1)">‹</n-button>
        <span class="rcal__nav-label">{{ monthLabel }}</span>
        <n-button class="rcal__nav-btn" size="small" @click="shiftMonth(1)">›</n-button>
        <n-button class="rcal__today-btn" size="small" tertiary @click="goToday">היום</n-button>
      </div>

      <div class="rcal__weekdays">
        <span v-for="d in weekdayLabels" :key="d" class="rcal__weekday">{{ d }}</span>
      </div>

      <div class="rcal__grid">
        <div
          v-for="cell in monthCells"
          :key="cell.iso"
          :class="{
            'rcal__cell--off': !cell.inMonth,
            'rcal__cell--today': cell.isToday,
            'rcal__cell--has': cell.items.length > 0 || cell.expiryItems.length > 0,
          }"
          class="rcal__cell"
        >
          <div class="rcal__cell-num">{{ cell.day }}</div>
          <div v-if="cell.items.length || cell.expiryItems.length" class="rcal__cell-items">
            <n-popover
              v-for="r in visibleReminderItems(cell)"
              :key="r.id"
              :width="320"
              placement="right"
              trigger="click"
            >
              <template #trigger>
                <button
                  :class="`rcal__pill--${reminderVisualStatus(r)}`"
                  :title="reminderDisplayTitle(r)"
                  class="rcal__pill"
                  @click.stop
                >
                  {{ reminderCalendarLabel(r) }}
                </button>
              </template>
              <ReminderQuickView :reminder="r" @navigate="onNavigate" />
            </n-popover>
            <n-popover
              v-for="e in visibleExpiryItems(cell)"
              :key="`exp-${e.id}`"
              :width="260"
              placement="right"
              trigger="click"
            >
              <template #trigger>
                <button
                  :class="`rcal__pill--expiry-${expiryVisualStatus(e)}`"
                  :title="expiryCalendarTitle(e)"
                  class="rcal__pill rcal__pill--expiry"
                  @click.stop
                >
                  {{ expiryCalendarLabel(e) }}
                </button>
              </template>
              <div class="rcal__expiry-pop">
                <p class="rcal__expiry-pop__title">{{ expiryCalendarLabel(e) }}</p>
                <p v-if="e.equipment_name" class="rcal__expiry-pop__sub">ציוד: {{ e.equipment_name }}</p>
                <p v-if="e.client_name" class="rcal__expiry-pop__sub">לקוח: {{ e.client_name }}</p>
                <p v-if="e.contact_person" class="rcal__expiry-pop__sub">איש קשר: {{ e.contact_person }}</p>
                <p v-if="e.contact_phone" class="rcal__expiry-pop__sub">טלפון: {{ e.contact_phone }}</p>
                <p v-if="e.contact_email" class="rcal__expiry-pop__sub">אימייל: {{ e.contact_email }}</p>
                <p :class="`rcal__expiry-pop__days--${expiryVisualStatus(e)}`" class="rcal__expiry-pop__days">
                  {{ expiryTimeLabel(e) }}
                </p>
                <n-button class="rcal__expiry-pop__action" size="tiny" type="primary" ghost @click="onExpiryNavigate(e)">
                  פתח מקור
                </n-button>
              </div>
            </n-popover>
            <button
              v-if="hiddenItemCount(cell) > 0"
              class="rcal__more"
              type="button"
              @click.stop="openDay(cell)"
            >
              +{{ hiddenItemCount(cell) }} עוד
            </button>
          </div>
          <button
            v-if="cell.items.length + cell.expiryItems.length > 0"
            class="rcal__cell-all"
            type="button"
            title="הצג את כל התזכורות של היום"
            @click.stop="openDay(cell)"
          >
            הצג הכל</button>
        </div>
      </div>
    </div>

    <!-- ── Agenda list ─────────────────────────────────────────────────── -->
    <div v-else class="rcal__agenda">
      <div v-if="!agendaGroups.length" class="rcal__empty">אין תזכורות קרובות</div>
      <div v-for="grp in agendaGroups" :key="grp.iso" class="rcal__agenda-group">
        <div :class="{ 'rcal__agenda-date--today': grp.isToday, 'rcal__agenda-date--past': grp.isPast }" class="rcal__agenda-date">
          {{ grp.label }}
        </div>
        <div class="rcal__agenda-items">
          <n-popover
            v-for="r in grp.reminders"
            :key="r.id"
            :width="300"
            placement="right"
            trigger="click"
          >
            <template #trigger>
              <button :class="`rcal__agenda-item--${reminderVisualStatus(r)}`" class="rcal__agenda-item">
                <span class="rcal__agenda-dot" />
                <span class="rcal__agenda-title">{{ reminderCalendarLabel(r) }}</span>
                <span v-if="isReminderOverdue(r)" class="rcal__agenda-overdue">באיחור</span>
                <span v-if="reminderSecondaryLabel(r)" class="rcal__agenda-client">— {{ reminderSecondaryLabel(r) }}</span>
              </button>
            </template>
            <ReminderQuickView :reminder="r" @navigate="onNavigate" />
          </n-popover>
          <button
            v-for="e in grp.expiryItems"
            :key="`exp-${e.id}`"
            :class="`rcal__agenda-item--expiry-${expiryVisualStatus(e)}`"
            class="rcal__agenda-item"
            type="button"
            @click="onExpiryNavigate(e)"
          >
            <span class="rcal__agenda-dot rcal__agenda-dot--expiry" />
            <span class="rcal__agenda-title">{{ expiryCalendarLabel(e) }} — {{ expiryStatusLabel(e) }}</span>
            <span v-if="e.equipment_name" class="rcal__agenda-client">— {{ e.equipment_name }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Day detail modal (all reminders/expiries for a date) ──────────── -->
    <n-modal v-model:show="dayModalOpen">
      <div class="rcal__day-modal" dir="rtl">
        <header class="rcal__day-modal-head">
          <h3 class="rcal__day-modal-title">{{ dayModalLabel }}</h3>
          <span class="rcal__day-modal-count">
            {{ (dayModalItems.length + dayModalExpiry.length) }} פריטים
          </span>
          <button class="rcal__day-modal-close" type="button" @click="dayModalOpen = false">✕</button>
        </header>
        <div class="rcal__day-modal-body">
          <button
            v-for="r in dayModalItems"
            :key="`m-${r.id}`"
            :class="`rcal__day-row--${reminderVisualStatus(r)}`"
            class="rcal__day-row"
            type="button"
            @click="onNavigate({ type: 'reminder', id: r.id })"
          >
            <span class="rcal__day-dot" />
            <span class="rcal__day-row-title">{{ reminderCalendarLabel(r) }}</span>
            <span v-if="isReminderOverdue(r)" class="rcal__day-badge">באיחור</span>
            <span v-if="reminderSecondaryLabel(r)" class="rcal__day-row-sub">— {{ reminderSecondaryLabel(r) }}</span>
          </button>
          <button
            v-for="e in dayModalExpiry"
            :key="`me-${e.id}`"
            :class="`rcal__day-row--expiry-${expiryVisualStatus(e)}`"
            class="rcal__day-row"
            type="button"
            @click="onExpiryNavigate(e)"
          >
            <span class="rcal__day-dot rcal__day-dot--expiry" />
            <span class="rcal__day-row-title">{{ expiryCalendarLabel(e) }} — {{ expiryStatusLabel(e) }}</span>
            <span v-if="e.equipment_name" class="rcal__day-row-sub">— {{ e.equipment_name }}</span>
          </button>
        </div>
      </div>
    </n-modal>

    <n-modal
      v-model:show="showSendVisibleConfirm"
      preset="dialog"
      type="warning"
      title="שליחת תזכורות גלויות"
      positive-text="שלח תזכורות"
      negative-text="ביטול"
      :positive-button-props="{ loading: sendingVisible, disabled: sendingVisible }"
      :negative-button-props="{ disabled: sendingVisible }"
      @positive-click="sendVisibleReminders"
    >
      <div class="rcal__confirm" dir="rtl">
        <p>לשלוח {{ sendableVisibleReminders.length }} תזכורות גלויות?</p>
        <p>הפעולה תשלח רק תזכורות שמופיעות בחודש ובסינון הנוכחי, עם אימייל תקין ועדיין בסטטוס ממתין.</p>
      </div>
    </n-modal>
  </section>
</template>

<script lang="ts" setup>
import {computed, ref} from "vue";
import {useRouter} from "vue-router";
import {NButton, NModal, NPopover, useMessage} from "naive-ui";
import type {ReminderWithContext} from "@shared/types.js";
import {api, type ExpiryCalendarItem} from "../services/apiService.js";
import {useFeaturesStore} from "../stores/features.js";
import {FEATURES} from "../shared/features.js";
import ReminderQuickView from "./ReminderQuickView.vue";

const featuresStore = useFeaturesStore();

interface Props {
  rows: ReminderWithContext[];
  expiryItems?: ExpiryCalendarItem[];
  loading?: boolean;
  testsOnly?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false, expiryItems: () => [], testsOnly: false });
const emit = defineEmits<{ (e: "refresh"): void }>();

const router = useRouter();
const message = useMessage();
const view = ref<"month" | "agenda">(isMobileViewport() ? "agenda" : "month");
const CURSOR_KEY = "calendar_last_month";
function loadCursor(): Date {
  try {
    const saved = localStorage.getItem(CURSOR_KEY);
    if (saved) { const d = new Date(saved); if (!isNaN(d.getTime())) return d; }
  } catch {}
  return new Date();
}
function saveCursor(d: Date) {
  try { localStorage.setItem(CURSOR_KEY, d.toISOString()); } catch {}
}
const cursor = ref(loadCursor());
const activeFilter = ref<CalendarFilterKey>("all");
const sendingVisible = ref(false);
const showSendVisibleConfirm = ref(false);

// Day detail modal — shows every reminder/expiry for a clicked calendar day
const dayModalOpen = ref(false);
const dayModalItems = ref<ReminderWithContext[]>([]);
const dayModalExpiry = ref<ExpiryCalendarItem[]>([]);
const dayModalLabel = ref("");

function openDay(cell: { iso: string; items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[] }) {
  dayModalItems.value = cell.items;
  dayModalExpiry.value = cell.expiryItems;
  const d = new Date(cell.iso + "T00:00:00");
  dayModalLabel.value = d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  dayModalOpen.value = true;
}

const weekdayLabels = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 720;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

const today = startOfDay(new Date());
type CalendarFilterKey = "all" | "overdue" | "next30" | "month" | "sent" | "no_email" | "reminders" | "expiries";

const calendarFilters: Array<{ key: CalendarFilterKey; label: string }> = [
  { key: "all", label: "הכל" },
  { key: "overdue", label: "פג / באיחור" },
  { key: "next30", label: "30 יום" },
  { key: "month", label: "החודש" },
  { key: "sent", label: "נשלחו" },
  { key: "no_email", label: "חסר אימייל" },
  { key: "reminders", label: "תזכורות" },
  { key: "expiries", label: "תסקירים" },
];

function monthBounds(date: Date) {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toIso(from), to: toIso(to) };
}

function isIsoInRange(value: string | null | undefined, from: string, to: string): boolean {
  const iso = value?.slice(0, 10);
  return Boolean(iso && iso >= from && iso <= to);
}

function reminderHasEmail(r: ReminderWithContext): boolean {
  return Boolean((r.email_to || r.client_email || "").trim());
}

function reminderMatchesFilter(r: ReminderWithContext, filter: CalendarFilterKey): boolean {
  const iso = r.trigger_date?.slice(0, 10);
  const { from, to } = monthBounds(cursor.value);
  if (filter === "overdue") return isReminderOverdue(r);
  if (filter === "next30") {
    const limit = toIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
    return Boolean(iso && iso >= toIso(today) && iso <= limit);
  }
  if (filter === "month") return isIsoInRange(iso, from, to);
  if (filter === "sent") return r.status === "sent";
  if (filter === "no_email") return !reminderHasEmail(r);
  if (filter === "expiries") return false;
  return true;
}

function expiryMatchesFilter(e: ExpiryCalendarItem, filter: CalendarFilterKey): boolean {
  const { from, to } = monthBounds(cursor.value);
  if (filter === "overdue") return e.days_until < 0;
  if (filter === "next30") return e.days_until >= 0 && e.days_until <= 30;
  if (filter === "month") return isIsoInRange(e.expiry_date, from, to);
  if (filter === "sent") return false;
  if (filter === "no_email") return !e.contact_email;
  if (filter === "reminders") return false;
  return true;
}

const filteredRows = computed(() =>
  props.rows.filter((row) => reminderMatchesFilter(row, activeFilter.value)),
);

const filteredExpiryItems = computed(() =>
  (props.expiryItems ?? []).filter((item) => expiryMatchesFilter(item, activeFilter.value)),
);

const visibleMonthRange = computed(() => monthBounds(cursor.value));

const visibleMonthReminders = computed(() =>
  filteredRows.value.filter((row) =>
    isIsoInRange(row.trigger_date, visibleMonthRange.value.from, visibleMonthRange.value.to),
  ),
);

const visibleMonthExpiryItems = computed(() =>
  filteredExpiryItems.value.filter((item) =>
    isIsoInRange(item.expiry_date, visibleMonthRange.value.from, visibleMonthRange.value.to),
  ),
);

const monthReminders = computed(() =>
  props.rows.filter((row) =>
    isIsoInRange(row.trigger_date, visibleMonthRange.value.from, visibleMonthRange.value.to),
  ),
);

const monthExpiryItems = computed(() =>
  (props.expiryItems ?? []).filter((item) =>
    isIsoInRange(item.expiry_date, visibleMonthRange.value.from, visibleMonthRange.value.to),
  ),
);

const summaryFilters = computed(() => [
  {
    key: "overdue" as CalendarFilterKey,
    label: "באיחור",
    count: monthReminders.value.filter(isReminderOverdue).length + monthExpiryItems.value.filter((item) => item.days_until < 0).length,
  },
  {
    key: "month" as CalendarFilterKey,
    label: "החודש",
    count: monthReminders.value.length + monthExpiryItems.value.length,
  },
  {
    key: "sent" as CalendarFilterKey,
    label: "נשלחו",
    count: monthReminders.value.filter((row) => row.status === "sent").length,
  },
  {
    key: "no_email" as CalendarFilterKey,
    label: "חסר אימייל",
    count: monthReminders.value.filter((row) => !reminderHasEmail(row)).length + monthExpiryItems.value.filter((item) => !item.contact_email).length,
  },
]);

const sendableVisibleReminders = computed(() =>
  visibleMonthReminders.value.filter((row) => row.status === "pending" && reminderHasEmail(row)),
);

function isReminderOverdue(r: ReminderWithContext): boolean {
  if (r.status !== "pending" || !r.trigger_date) return false;
  return startOfDay(new Date(r.trigger_date)).getTime() < today.getTime();
}

function reminderVisualStatus(r: ReminderWithContext): string {
  return isReminderOverdue(r) ? "overdue" : r.status;
}

function reminderDisplayTitle(r: ReminderWithContext): string {
  const label = [
    reminderCalendarLabel(r),
    r.title,
    shortContractNumber(r.contract_number),
  ].filter(Boolean).join(" — ");
  return isReminderOverdue(r) ? `באיחור: ${label}` : label;
}

function reminderCalendarLabel(r: ReminderWithContext): string {
  const client = r.client_name?.trim();
  const contact = r.contact_person?.trim();
  const identity = client && contact ? `${client} · ${contact}` : client || contact || r.title;
  return [contractNumberLabel(r.contract_number), identity].filter(Boolean).join(" · ");
}

function reminderSecondaryLabel(r: ReminderWithContext): string {
  return r.title ?? "";
}

function shortContractNumber(contractNumber: string | null | undefined): string | null {
  if (!contractNumber) return null;
  const parts = contractNumber.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => /^\d+$/.test(part))) {
    return [...parts].sort((a, b) => a.length - b.length)[0] ?? null;
  }
  return (parts.at(-1) ?? contractNumber).trim() || contractNumber;
}

function contractNumberLabel(contractNumber: string | null | undefined): string | null {
  const value = shortContractNumber(contractNumber);
  return value ? `מס׳ ${value}` : null;
}

function expiryVisualStatus(e: ExpiryCalendarItem): "overdue" | "critical" | "warning" | "ok" {
  if (!featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)) return "ok";
  if (e.days_until < 0) return "overdue";
  if (e.days_until <= 30) return "critical";
  if (e.days_until <= 90) return "warning";
  return "ok";
}

function expiryCalendarLabel(e: ExpiryCalendarItem): string {
  const client = e.client_name?.trim();
  const contact = e.contact_person?.trim();
  const identity = client && contact ? `${client} · ${contact}` : client || contact || e.equipment_name || e.contract_type || "תסקירים";
  return [contractNumberLabel(e.contract_number), identity].filter(Boolean).join(" · ");
}

function expiryCalendarTitle(e: ExpiryCalendarItem): string {
  return [
    `${expiryStatusLabel(e)}: ${expiryCalendarLabel(e)}`,
    e.equipment_name ? `ציוד: ${e.equipment_name}` : null,
    e.contract_number ? `מס׳ ${e.contract_number}` : null,
  ].filter(Boolean).join(" — ");
}

function expiryStatusLabel(e: ExpiryCalendarItem): string {
  const status = expiryVisualStatus(e);
  if (status === "overdue") return "פג תוקף";
  if (status === "critical") return e.days_until === 0 ? "פג היום" : "תוקף קרוב";
  if (status === "warning") return "תוקף עד 90 יום";
  return "בתוקף";
}

function expiryTimeLabel(e: ExpiryCalendarItem): string {
  if (e.days_until < 0) return `פג לפני ${Math.abs(e.days_until)} ימים`;
  if (e.days_until === 0) return "פג היום";
  return `${e.days_until} ימים לפקיעה`;
}

const rowsByIso = computed(() => {
  const m = new Map<string, ReminderWithContext[]>();
  for (const r of filteredRows.value) {
    if (!r.trigger_date) continue;
    const iso = r.trigger_date.slice(0, 10);
    if (!m.has(iso)) m.set(iso, []);
    m.get(iso)!.push(r);
  }
  return m;
});

const expiryByIso = computed(() => {
  const m = new Map<string, ExpiryCalendarItem[]>();
  for (const e of filteredExpiryItems.value) {
    if (!e.expiry_date) continue;
    const iso = e.expiry_date.slice(0, 10);
    if (!m.has(iso)) m.set(iso, []);
    m.get(iso)!.push(e);
  }
  return m;
});

const monthLabel = computed(() => cursor.value.toLocaleDateString("he-IL", { month: "long", year: "numeric" }));

const monthCells = computed(() => {
  const c = cursor.value;
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const startWeekday = first.getDay(); // 0 = Sunday
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);

  const cells: Array<{
    iso: string; day: number; inMonth: boolean; isToday: boolean;
    items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[];
  }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toIso(d);
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === c.getMonth(),
      isToday: sameDay(d, today),
      items: rowsByIso.value.get(iso) ?? [],
      expiryItems: expiryByIso.value.get(iso) ?? [],
    });
  }
  return cells;
});

type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  items: ReminderWithContext[];
  expiryItems: ExpiryCalendarItem[];
};

function visibleReminderItems(cell: CalendarCell): ReminderWithContext[] {
  const expiryReserve = Math.min(cell.expiryItems.length, 2);
  return cell.items.slice(0, Math.max(0, 4 - expiryReserve));
}

function visibleExpiryItems(cell: CalendarCell): ExpiryCalendarItem[] {
  const reminderCount = visibleReminderItems(cell).length;
  return cell.expiryItems.slice(0, Math.max(0, 4 - reminderCount));
}

function hiddenItemCount(cell: CalendarCell): number {
  return Math.max(
    0,
    cell.items.length + cell.expiryItems.length - visibleReminderItems(cell).length - visibleExpiryItems(cell).length,
  );
}

const agendaGroups = computed(() => {
  const now = today.getTime();
  const isoSet = new Set<string>();

  for (const r of filteredRows.value) { if (r.trigger_date) isoSet.add(r.trigger_date.slice(0, 10)); }
  for (const e of filteredExpiryItems.value) { if (e.expiry_date) isoSet.add(e.expiry_date.slice(0, 10)); }

  const sorted = [...isoSet].sort();
  return sorted.map((iso) => {
    const d = new Date(iso + "T00:00:00");
    return {
      iso,
      reminders: (rowsByIso.value.get(iso) ?? []),
      expiryItems: (expiryByIso.value.get(iso) ?? []),
      isToday: sameDay(d, today),
      isPast: d.getTime() < now,
      label: d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  });
});

function shiftMonth(delta: number) {
  const c = new Date(cursor.value);
  c.setMonth(c.getMonth() + delta);
  cursor.value = c;
  saveCursor(c);
}
function goToday() {
  const d = new Date();
  cursor.value = d;
  saveCursor(d);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function groupedVisibleMonthDocRows() {
  const rows = [
    ...visibleMonthReminders.value.map((row) => ({
      date: row.trigger_date?.slice(0, 10) ?? "",
      client: row.client_name ?? "",
      type: "תזכורת",
      title: reminderSecondaryLabel(row) || row.title || "",
      email: row.email_to || row.client_email || "",
      status: row.status ?? "",
    })),
    ...visibleMonthExpiryItems.value.map((item) => ({
      date: item.expiry_date?.slice(0, 10) ?? "",
      client: item.client_name ?? "",
      type: "תסקיר",
      title: [item.equipment_name, item.contract_number].filter(Boolean).join(" / "),
      email: item.contact_email ?? "",
      status: expiryStatusLabel(item),
    })),
  ];
  return rows.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.client.localeCompare(b.client, "he") ||
    a.type.localeCompare(b.type, "he"),
  );
}

function downloadVisibleMonthDoc() {
  const rows = groupedVisibleMonthDocRows();
  const month = cursor.value.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const body = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.client || "ללא לקוח")}</td>
        <td>${escapeHtml(row.type)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">אין פריטים גלויים לחודש זה</td></tr>`;
  const html = `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; color: #1f2937; }
    h1 { font-size: 22px; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>דוח חודש נוכחי - ${escapeHtml(month)}</h1>
  <table>
    <thead>
      <tr><th>תאריך</th><th>לקוח</th><th>סוג</th><th>פירוט</th><th>אימייל</th><th>סטטוס</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calendar-${visibleMonthRange.value.from.slice(0, 7)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

function printCalendar() {
  window.print();
}

async function sendVisibleReminders() {
  const rows = sendableVisibleReminders.value;
  if (!rows.length) return;

  sendingVisible.value = true;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await api.reminders.sendNow(row.id);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  sendingVisible.value = false;
  showSendVisibleConfirm.value = false;
  if (failed) message.warning(`נשלחו ${sent}, נכשלו ${failed}`);
  else message.success(`${sent} תזכורות נשלחו`);
  emit("refresh");
}

function onNavigate(target: { type: "contract" | "document" | "reminder"; id: number | string }) {
  dayModalOpen.value = false;
  if (target.type === "contract") router.push(`/contracts/${target.id}`);
  else if (target.type === "document") router.push(`/documents/${target.id}?from=calendar`);
  else if (target.type === "reminder") router.push("/reminders");
}

function onExpiryNavigate(item: ExpiryCalendarItem) {
  dayModalOpen.value = false;
  if (item.document_id) router.push(`/documents/${item.document_id}?from=calendar`);
  else router.push(`/contracts/${item.id}`);
}
</script>

<style scoped>
.rcal {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 24px;
}

.rcal__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 14px;
}
.rcal__title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.rcal__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}
.rcal__counts {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rcal__count {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
}
.rcal__controls {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.rcal__toggle { display: flex; gap: 4px; }
.rcal__summary,
.rcal__filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  gap: 8px;
}
.rcal__summary {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
}
.rcal__summary-chip,
.rcal__filter {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.rcal__summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 5px 10px;
  font-size: 12px;
}
.rcal__summary-chip strong {
  min-width: 24px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  text-align: center;
}
.rcal__filter {
  min-height: 30px;
  padding: 4px 11px;
  font-size: 12px;
}
.rcal__summary-chip:hover,
.rcal__filter:hover {
  border-color: var(--brand-color);
  color: var(--text-primary);
}
.rcal__summary-chip--active,
.rcal__filter--active {
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  border-color: color-mix(in srgb, var(--brand-color) 45%, var(--border-color));
  color: var(--brand-color);
  font-weight: 700;
}

/* ── Month nav ─────────────────────────────────────────────────────────── */
.rcal__nav {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  justify-content: center;
}
.rcal__nav-btn {
  min-width: 38px;
  height: 34px;
  font-size: 20px;
  font-weight: 700;
}
.rcal__today-btn {
  min-width: 54px;
  height: 34px;
  font-weight: 700;
}
.rcal__nav-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 150px;
  text-align: center;
}

/* ── Weekday header ────────────────────────────────────────────────────── */
.rcal__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
}
.rcal__weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ── Grid ──────────────────────────────────────────────────────────────── */
.rcal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.rcal__cell {
  min-height: 106px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 0.12s, border-color 0.12s;
}
.rcal__cell--off { opacity: 0.4; background: transparent; }
.rcal__cell--today { border-color: var(--brand-color); background: rgba(99,226,183,0.05); }
.rcal__cell--has { background: var(--bg-elevated); }
.rcal__cell-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: end;
}
.rcal__cell--today .rcal__cell-num { color: var(--brand-color); }
.rcal__cell-items { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rcal__pill {
  border: none;
  background: var(--brand-color);
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: start;
  font-family: inherit;
  transition: filter 0.12s;
  max-width: 100%;
  width: 100%;
  display: block;
}
.rcal__pill:hover { filter: brightness(1.1); }
.rcal__pill--overdue { background: #d03050; }
.rcal__pill--sent { background: #2080f0; }
.rcal__pill--dismissed { background: var(--text-muted); }
.rcal__pill--error { background: var(--color-error, #d03050); }
.rcal__pill--failed { background: var(--color-error, #d03050); }
.rcal__more {
  font-size: 10px;
  color: var(--brand-color);
  padding: 1px 4px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  text-align: start;
  font-weight: 600;
}
.rcal__more:hover { text-decoration: underline; }
.rcal__cell-all {
  margin-top: auto;
  font-size: 10px;
  color: var(--brand-color);
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--brand-color) 8%, transparent);
  cursor: pointer;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 5px;
  text-align: center;
  opacity: 1;
  transition: background 0.12s, border-color 0.12s;
}
.rcal__cell-all:hover {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--brand-color) 26%, transparent);
}

/* ── Day detail modal ──────────────────────────────────────────────────── */
.rcal__day-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  width: min(520px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rcal__day-modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}
.rcal__day-modal-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-primary); flex: 1; }
.rcal__day-modal-count {
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 1px 8px;
  border-radius: 999px;
}
.rcal__day-modal-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 15px;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 6px;
}
.rcal__day-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.rcal__day-modal-body {
  padding: 12px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rcal__day-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 9px 11px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  text-align: start;
  transition: background 0.12s, border-color 0.12s;
}
.rcal__day-row:hover { background: var(--bg-hover); border-color: var(--brand-color); }
.rcal__day-row--overdue { border-color: rgba(208,48,80,0.35); background: rgba(208,48,80,0.06); }
.rcal__day-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--brand-color); flex-shrink: 0; }
.rcal__day-row--overdue .rcal__day-dot { background: #d03050; }
.rcal__day-row--sent .rcal__day-dot { background: #2080f0; }
.rcal__day-row--dismissed .rcal__day-dot { background: var(--text-muted); }
.rcal__day-row--error .rcal__day-dot,
.rcal__day-row--failed .rcal__day-dot { background: var(--color-error, #d03050); }
.rcal__day-row--expiry-overdue  .rcal__day-dot { background: #d03050; }
.rcal__day-row--expiry-critical .rcal__day-dot { background: #f0a020; }
.rcal__day-row--expiry-warning  .rcal__day-dot { background: #e8c84a; }
.rcal__day-row--expiry-ok       .rcal__day-dot { background: #18a058; }
.rcal__day-dot--expiry { border-radius: 2px; }
.rcal__day-row-title { font-weight: 500; flex: 1; }
.rcal__day-row-sub { color: var(--text-muted); font-size: 12px; }
.rcal__day-badge {
  border: 1px solid rgba(208,48,80,0.26);
  border-radius: 999px;
  color: #d03050;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
}

/* ── Expiry pills ──────────────────────────────────────────────────────────── */
.rcal__pill--expiry { font-style: italic; }
.rcal__pill--expiry-overdue  { background: #d03050; }
.rcal__pill--expiry-critical { background: #f0a020; }
.rcal__pill--expiry-warning  { background: #e8c84a; color: #333; }
.rcal__pill--expiry-ok       { background: #18a058; }

.rcal__expiry-pop { padding: 4px 0; font-size: 13px; direction: rtl; }
.rcal__expiry-pop__title { font-weight: 600; margin: 0 0 4px; color: var(--text-primary); }
.rcal__expiry-pop__sub { margin: 2px 0; color: var(--text-secondary); font-size: 12px; }
.rcal__expiry-pop__days { margin: 6px 0 0; font-weight: 600; font-size: 12px; }
.rcal__expiry-pop__days--overdue  { color: #d03050; }
.rcal__expiry-pop__days--critical { color: #f0a020; }
.rcal__expiry-pop__days--warning  { color: #c9a800; }
.rcal__expiry-pop__days--ok       { color: #18a058; }
.rcal__expiry-pop__action { margin-top: 8px; }

/* ── Agenda ─────────────────────────────────────────────────────────────── */
.rcal__agenda { display: flex; flex-direction: column; gap: 14px; max-height: 480px; overflow-y: auto; }
.rcal__empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 32px 0; }
.rcal__agenda-group {}
.rcal__agenda-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}
.rcal__agenda-date--today { color: var(--brand-color); }
.rcal__agenda-date--past { color: var(--text-muted); opacity: 0.7; }
.rcal__agenda-items { display: flex; flex-direction: column; gap: 4px; }
.rcal__agenda-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  text-align: start;
  transition: background 0.12s, border-color 0.12s;
}
.rcal__agenda-item:hover { background: var(--bg-hover); border-color: var(--brand-color); }
.rcal__agenda-item--overdue {
  border-color: rgba(208, 48, 80, 0.35);
  background: rgba(208, 48, 80, 0.06);
}
.rcal__agenda-item--overdue:hover {
  border-color: #d03050;
  background: rgba(208, 48, 80, 0.10);
}
.rcal__agenda-dot {
  width: 8px; height: 8px;
  border-radius: 999px;
  background: var(--brand-color);
  flex-shrink: 0;
}
.rcal__agenda-item--overdue .rcal__agenda-dot { background: #d03050; }
.rcal__agenda-item--sent .rcal__agenda-dot { background: #2080f0; }
.rcal__agenda-item--dismissed .rcal__agenda-dot { background: var(--text-muted); }
.rcal__agenda-item--error .rcal__agenda-dot { background: var(--color-error, #d03050); }
.rcal__agenda-item--failed .rcal__agenda-dot { background: var(--color-error, #d03050); }
.rcal__agenda-item--expiry-overdue  .rcal__agenda-dot { background: #d03050; }
.rcal__agenda-item--expiry-critical .rcal__agenda-dot { background: #f0a020; }
.rcal__agenda-item--expiry-warning  .rcal__agenda-dot { background: #e8c84a; }
.rcal__agenda-item--expiry-ok       .rcal__agenda-dot { background: #18a058; }
.rcal__agenda-dot--expiry { border-radius: 2px; }
.rcal__agenda-title { font-weight: 500; flex: 1; }
.rcal__agenda-overdue {
  border: 1px solid rgba(208, 48, 80, 0.26);
  border-radius: 999px;
  color: #d03050;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
}
.rcal__agenda-client { color: var(--text-muted); font-size: 12px; }

.rcal__legend {
  display: flex;
  align-items: center;
  gap: 10px 12px;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  padding-top: 2px;
}
.rcal__legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.rcal__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rcal__expiry-count {
  font-size: 12px;
  background: rgba(240, 160, 32, 0.15);
  color: #f0a020;
  border-radius: 10px;
  padding: 2px 8px;
}

@media (max-width: 780px) {
  .rcal {
    padding: 12px;
  }

  .rcal__head {
    grid-template-columns: 1fr;
  }

  .rcal__title-wrap,
  .rcal__controls,
  .rcal__legend {
    justify-content: flex-start;
  }

  .rcal__controls {
    flex-wrap: wrap;
  }

  .rcal__toggle {
    flex: 1 1 auto;
  }

  .rcal__toggle :deep(.n-button) {
    flex: 1;
  }

  .rcal__summary,
  .rcal__filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .rcal__summary::-webkit-scrollbar,
  .rcal__filters::-webkit-scrollbar {
    display: none;
  }

  .rcal__month {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .rcal__weekdays,
  .rcal__grid {
    min-width: 680px;
  }

  .rcal__agenda-item,
  .rcal__day-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}

@media print {
  .rcal {
    border: 0;
    box-shadow: none;
    padding: 0;
    margin: 0;
  }

  .rcal__controls,
  .rcal__summary,
  .rcal__filters,
  .rcal__legend,
  .rcal__cell-all,
  .rcal__more {
    display: none !important;
  }

  .rcal__head {
    display: block;
  }

  .rcal__grid,
  .rcal__weekdays {
    min-width: 0;
  }

  .rcal__cell {
    min-height: 92px;
    break-inside: avoid;
  }
}
</style>
