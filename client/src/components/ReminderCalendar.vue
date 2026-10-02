<template>
  <section class="rcal">
    <header class="rcal__head">
      <div class="rcal__title-wrap">
        <h3 class="rcal__title">{{ testsOnly ? l.calendar.journal : l.calendar.title }}</h3>
        <div class="rcal__counts">
          <span v-if="!testsOnly" class="rcal__count">{{ t('calendar.remindersCount', {n: filteredRows.length}) }}</span>
          <span v-if="inspectionItemCount" class="rcal__expiry-count">
            {{ t('calendar.inspectionsCount', {n: inspectionItemCount}) }}
          </span>
        </div>
      </div>
      <div class="rcal__controls">
        <div class="rcal__toggle" role="group" :aria-label="l.calendar.viewAria">
          <n-button
            :type="view === 'month' ? 'primary' : 'default'"
            size="small"
            @click="view = 'month'"
          >{{ l.calendar.month }}</n-button>
          <n-button
            :type="view === 'agenda' ? 'primary' : 'default'"
            size="small"
            @click="view = 'agenda'"
          >{{ l.calendar.list }}</n-button>
        </div>
        <div class="rcal__actions">
          <n-button size="small" secondary class="rcal__action-btn" @click="emit('open-monthly-report', cursor.getTime())">
            {{ l.calendar.monthlyReport }}
          </n-button>
          <!-- Hidden rather than disabled when nothing is sendable: a greyed-out
               "send (0)" told the user nothing about why, and the count depends on
               the month and filter currently in view. -->
          <n-button
            v-if="!testsOnly && sendableVisibleReminders.length > 0"
            :disabled="sendingVisible"
            :loading="sendingVisible"
            size="small"
            type="primary"
            ghost
            class="rcal__action-btn"
            @click="showSendVisibleConfirm = true"
          >
            {{ t('calendar.sendVisible', {n: sendableVisibleReminders.length}) }}
          </n-button>
          <n-button
            :disabled="loading"
            size="small"
            class="rcal__refresh-btn"
            :aria-label="l.calendar.refresh"
            @click="$emit('refresh')"
          >
            <span :class="{ 'rcal__refresh-icon--spin': loading }" aria-hidden="true">↻</span>
          </n-button>
        </div>
      </div>
      <div v-if="featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)" class="rcal__summary">
        <button
          v-for="item in summaryFilters"
          :key="item.key"
          class="rcal__summary-chip"
          :class="{ 'rcal__summary-chip--active': activeFilter === item.key, 'rcal__summary-chip--empty': item.count === 0 && activeFilter !== item.key }"
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
          :class="{ 'rcal__filter--active': activeFilter === filter.key, 'rcal__filter--empty': filter.key !== 'all' && filterCount(filter.key) === 0 && activeFilter !== filter.key }"
          :aria-label="filter.label"
          :aria-pressed="activeFilter === filter.key"
          :title="filter.label"
          type="button"
          @click="activeFilter = filter.key"
        >
          <!-- Phones show the icon only (the label is in the tooltip), like the table pages. -->
          <n-icon :component="filterIcon(filter.key)" :size="16" class="rcal__filter-icon" />
          <span class="rcal__filter-label">{{ filter.label }}</span>
        </button>
      </div>
      <div class="rcal__legend">
        <span v-if="!testsOnly" class="rcal__legend-item">
          <span class="rcal__legend-dot" style="background:var(--brand-color)"></span> {{ l.calendar.legendReminderDocs }}
        </span>
        <span v-if="!testsOnly" class="rcal__legend-item">
          <span class="rcal__legend-dot" style="background:#2080f0"></span> {{ l.calendar.legendSent }}
        </span>
        <template v-if="featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)">
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#d03050"></span> {{ l.calendar.legendExpired }}
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#f0a020"></span> {{ l.calendar.legend30 }}
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#e8c84a"></span> {{ l.calendar.legend90 }}
          </span>
          <span v-if="hasKind('invoice') || hasKind('discovery')" class="rcal__legend-item">
            <span class="rcal__legend-dot rcal__legend-dot--dashed"></span> {{ l.calendar.legendExtra }}
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
        <n-button class="rcal__today-btn" size="small" tertiary @click="goToday">{{ l.calendar.today }}</n-button>
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
          @click="onCellTap(cell)"
        >
          <div class="rcal__cell-num">{{ cell.day }}</div>
          <!-- Phones: the pills do not fit seven to a row, so a cell shows coloured dots and opens the day on tap. -->
          <div v-if="cell.items.length || cell.expiryItems.length" class="rcal__dots" aria-hidden="true">
            <span v-for="(dot, i) in cellDots(cell)" :key="i" :class="dot" class="rcal__dot" />
            <span v-if="cellExtraCount(cell) > 0" class="rcal__dots-more">+{{ cellExtraCount(cell) }}</span>
          </div>
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
                  <n-icon
                    v-if="r.calendar_synced"
                    :component="CalendarOutline"
                    class="rcal__gcal-icon"
                    :aria-label="l.calendar.synced"
                  />
                  <span class="rcal__pill-label">{{ reminderCalendarLabel(r) }}</span>
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
                  :class="[`rcal__pill--expiry-${expiryVisualStatus(e)}`, { 'rcal__pill--invoice': Boolean(e.kind) }]"
                  :title="expiryCalendarTitle(e)"
                  class="rcal__pill rcal__pill--expiry"
                  @click.stop
                >
                  {{ expiryCalendarLabel(e) }}
                </button>
              </template>
              <div class="rcal__expiry-pop">
                <p class="rcal__expiry-pop__title">{{ expiryCalendarLabel(e) }}</p>
                <p v-if="e.equipment_name" class="rcal__expiry-pop__sub">{{ t('calendar.equipment', {name: e.equipment_name}) }}</p>
                <p v-if="e.client_name" class="rcal__expiry-pop__sub">{{ t('calendar.client', {name: e.client_name}) }}</p>
                <p v-if="e.contact_person" class="rcal__expiry-pop__sub">{{ t('calendar.contact', {name: e.contact_person}) }}</p>
                <p v-if="e.contact_phone" class="rcal__expiry-pop__sub">{{ t('calendar.phone', {name: e.contact_phone}) }}</p>
                <p v-if="e.contact_email" class="rcal__expiry-pop__sub">{{ t('calendar.email', {name: e.contact_email}) }}</p>
                <p :class="`rcal__expiry-pop__days--${expiryVisualStatus(e)}`" class="rcal__expiry-pop__days">
                  {{ expiryTimeLabel(e) }}
                </p>
                <n-button class="rcal__expiry-pop__action" size="tiny" type="primary" ghost @click="onExpiryNavigate(e)">
                  {{ e.kind === 'invoice' ? l.calendar.openInvoice : e.kind === 'discovery' ? l.calendar.openSuggestion : l.calendar.openSource }}
                </n-button>
              </div>
            </n-popover>
            <button
              v-if="hiddenItemCount(cell) > 0"
              :title="t('calendar.moreItems', {n: hiddenItemCount(cell)})"
              class="rcal__more"
              type="button"
              @click.stop="openDay(cell)"
            >
              {{ t('calendar.more', {n: hiddenItemCount(cell)}) }}
            </button>
          </div>
          <button
            v-if="cell.items.length + cell.expiryItems.length > 0"
            class="rcal__cell-all"
            type="button"
            :title="l.calendar.showAllDay"
            @click.stop="openDay(cell)"
          >
            {{ l.calendar.showAll }}</button>
        </div>
      </div>
    </div>

    <!-- ── Agenda list ─────────────────────────────────────────────────── -->
    <div v-else class="rcal__agenda">
      <div v-if="!agendaGroups.length" class="rcal__empty">{{ l.calendar.empty }}</div>
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
                <n-icon
                  v-if="r.calendar_synced"
                  :component="CalendarOutline"
                  class="rcal__gcal-icon rcal__gcal-icon--agenda"
                  :aria-label="l.calendar.synced"
                />
                <span class="rcal__agenda-title">{{ reminderCalendarLabel(r) }}</span>
                <span v-if="isReminderOverdue(r)" class="rcal__agenda-overdue">{{ l.calendar.overdue }}</span>
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
      <div class="rcal__day-modal" :dir="dir">
        <header class="rcal__day-modal-head">
          <h3 class="rcal__day-modal-title">{{ dayModalLabel }}</h3>
          <span class="rcal__day-modal-count">
            {{ t('calendar.items', {n: dayModalItems.length + dayModalExpiry.length}) }}
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
            :title="reminderDisplayTitle(r)"
            @click="onNavigate({ type: 'reminder', id: r.id })"
          >
            <span class="rcal__day-dot" />
            <n-icon
              v-if="r.calendar_synced"
              :component="CalendarOutline"
              class="rcal__gcal-icon rcal__gcal-icon--day"
              :aria-label="l.calendar.synced"
            />
            <span class="rcal__day-row-title">{{ reminderCalendarLabel(r) }}</span>
            <span v-if="isReminderOverdue(r)" class="rcal__day-badge">{{ l.calendar.overdue }}</span>
            <span v-if="reminderSecondaryLabel(r)" class="rcal__day-row-sub">— {{ reminderSecondaryLabel(r) }}</span>
          </button>
          <button
            v-for="e in dayModalExpiry"
            :key="`me-${e.id}`"
            :class="`rcal__day-row--expiry-${expiryVisualStatus(e)}`"
            class="rcal__day-row"
            type="button"
            :title="expiryCalendarTitle(e)"
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
      :class="confirmDialogClass"
      :negative-button-props="confirmCancelButtonProps"
      :positive-button-props="{ ...confirmActionButtonProps('warning'), loading: sendingVisible, disabled: sendingVisible }"
      :show-icon="false"
      preset="dialog"
      type="warning"
      :positive-text="l.calendar.sendReminders"
      :negative-text="l.common.cancel"
      @positive-click="sendVisibleReminders"
    >
      <template #header>
        <ConfirmDialogHead :title="l.calendar.sendVisibleTitle" type="warning"/>
      </template>
      <div class="rcal__confirm" :dir="dir">
        <p>{{ t('calendar.sendVisibleQ', {n: sendableVisibleReminders.length}) }}</p>
        <p>{{ l.calendar.sendVisibleBody }}</p>
      </div>
    </n-modal>
  </section>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {NButton, NIcon, NModal, NPopover, useMessage} from "naive-ui";
import {
  AppsOutline,
  BulbOutline,
  CalendarOutline,
  CardOutline,
  ClipboardOutline,
  MailOutline,
  NotificationsOutline,
  TimeOutline,
  WarningOutline,
  CheckmarkCircleOutline,
} from "@vicons/ionicons5";
import type {ReminderWithContext} from "@shared/types.js";
import {api, type ExpiryCalendarItem} from "../services/apiService.js";
import {useFeaturesStore} from "../stores/features.js";
import {FEATURES} from "../shared/features.js";
import ReminderQuickView from "./ReminderQuickView.vue";
import ConfirmDialogHead from "./ConfirmDialogHead.vue";
import {confirmActionButtonProps, confirmCancelButtonProps, CONFIRM_DIALOG_CLASS} from "../composables/useConfirm.js";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";

const featuresStore = useFeaturesStore();
const {l, t, locale, dir} = useI18n();
const confirmDialogClass = CONFIRM_DIALOG_CLASS;

interface Props {
  rows: ReminderWithContext[];
  expiryItems?: ExpiryCalendarItem[];
  loading?: boolean;
  testsOnly?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false, expiryItems: () => [], testsOnly: false });
const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "open-monthly-report", monthMs: number): void;
  (e: "month-change", range: { from: string; to: string }): void;
}>();

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
const activeFilter = ref<CalendarFilterKey>(props.testsOnly ? "expiries" : "all");
watch(() => props.testsOnly, (testsOnly) => {
  activeFilter.value = testsOnly ? "expiries" : "all";
});
const sendingVisible = ref(false);
const showSendVisibleConfirm = ref(false);
useDevModal("calendar.sendVisible", showSendVisibleConfirm);

// Day detail modal — shows every reminder/expiry for a clicked calendar day
const dayModalOpen = ref(false);
useDevModal("calendar.day", dayModalOpen);
const dayModalItems = ref<ReminderWithContext[]>([]);
const dayModalExpiry = ref<ExpiryCalendarItem[]>([]);
const dayModalLabel = ref("");

const MAX_CELL_DOTS = 3;

/** Colour classes for a cell's dots: reminders first, then expiries, payments and suggestions. */
function cellDots(cell: { items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[] }): string[] {
  const dots = [
    ...cell.items.map((r) => `rcal__pill--${reminderVisualStatus(r)}`),
    ...cell.expiryItems.map((e) => `rcal__pill--expiry-${expiryVisualStatus(e)}`),
  ];
  return dots.slice(0, MAX_CELL_DOTS);
}

function cellExtraCount(cell: { items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[] }): number {
  return Math.max(0, cell.items.length + cell.expiryItems.length - MAX_CELL_DOTS);
}

/** On a phone a tap anywhere in a day opens its list; on larger screens the pills handle their own clicks. */
function onCellTap(cell: { iso: string; items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[] }) {
  if (!isMobileViewport() || !(cell.items.length || cell.expiryItems.length)) return;
  openDay(cell);
}

function openDay(cell: { iso: string; items: ReminderWithContext[]; expiryItems: ExpiryCalendarItem[] }) {
  dayModalItems.value = cell.items;
  dayModalExpiry.value = cell.expiryItems;
  const d = new Date(cell.iso + "T00:00:00");
  dayModalLabel.value = d.toLocaleDateString(locale.value === "en" ? "en-US" : "he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  dayModalOpen.value = true;
}

const weekdayLabels = computed(() => [...l.value.calendar.weekdays]);

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 720;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

const today = startOfDay(new Date());
type CalendarFilterKey = "all" | "overdue" | "next30" | "month" | "sent" | "no_email" | "reminders" | "expiries" | "payments" | "mailbox";

const FILTER_ICONS: Record<string, unknown> = {
  all: AppsOutline,
  overdue: WarningOutline,
  next30: TimeOutline,
  month: CalendarOutline,
  sent: CheckmarkCircleOutline,
  no_email: MailOutline,
  reminders: NotificationsOutline,
  expiries: ClipboardOutline,
  payments: CardOutline,
  mailbox: BulbOutline,
};

/** How many events a filter would show; filters with none are hidden on phones. */
function filterCount(key: CalendarFilterKey): number {
  const reminders = props.testsOnly ? 0 : props.rows.filter((row) => reminderMatchesFilter(row, key)).length;
  const expiries = (props.expiryItems ?? []).filter((item) => expiryMatchesFilter(item, key)).length;
  return reminders + expiries;
}

function filterIcon(key: CalendarFilterKey) {
  return (FILTER_ICONS[key] ?? AppsOutline) as typeof CalendarOutline;
}

const calendarFilters = computed(() => [
  { key: "all" as CalendarFilterKey, label: l.value.calendar.filterAll },
  { key: "overdue" as CalendarFilterKey, label: l.value.calendar.filterOverdue },
  { key: "next30" as CalendarFilterKey, label: l.value.calendar.filter30 },
  { key: "month" as CalendarFilterKey, label: l.value.calendar.filterMonth },
  { key: "sent" as CalendarFilterKey, label: l.value.calendar.filterSent },
  { key: "no_email" as CalendarFilterKey, label: l.value.calendar.filterNoEmail },
  { key: "reminders" as CalendarFilterKey, label: l.value.calendar.filterReminders },
  { key: "expiries" as CalendarFilterKey, label: l.value.calendar.filterExpiries },
  // Only offered when the calendar actually has such events, so there are no empty chips.
  ...(hasKind("invoice") ? [{ key: "payments" as CalendarFilterKey, label: l.value.calendar.filterPayments }] : []),
  ...(hasKind("discovery") ? [{ key: "mailbox" as CalendarFilterKey, label: l.value.calendar.filterMailbox }] : []),
]);

function hasKind(kind: "invoice" | "discovery"): boolean {
  return (props.expiryItems ?? []).some((item) => item.kind === kind);
}

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
  if (filter === "no_email") return r.status === "no_email" || !reminderHasEmail(r);
  if (filter === "expiries" || filter === "payments" || filter === "mailbox") return false;
  return true;
}

function expiryMatchesFilter(e: ExpiryCalendarItem, filter: CalendarFilterKey): boolean {
  const { from, to } = monthBounds(cursor.value);
  if (filter === "overdue") return e.days_until < 0;
  if (filter === "next30") return e.days_until >= 0 && e.days_until <= 30;
  if (filter === "month") return isIsoInRange(e.expiry_date, from, to);
  if (filter === "sent") return false;
  if (filter === "no_email") return !e.kind && !e.contact_email;
  if (filter === "reminders") return false;
  // "Inspections" means contract expiries only; payments and mailbox suggestions have their own chips.
  // In the journal (next-tests-only) view this chip is the default and also shows them, so they are not hidden on first load.
  if (filter === "expiries") return props.testsOnly || !e.kind;
  if (filter === "payments") return e.kind === "invoice";
  if (filter === "mailbox") return e.kind === "discovery";
  return true;
}

const filteredRows = computed(() =>
  props.rows.filter((row) => reminderMatchesFilter(row, activeFilter.value)),
);

const filteredExpiryItems = computed(() =>
  (props.expiryItems ?? []).filter((item) => expiryMatchesFilter(item, activeFilter.value)),
);

/** Inspections only: payment dates and mailbox suggestions are listed in the calendar but are not inspections. */
const inspectionItemCount = computed(() => filteredExpiryItems.value.filter((item) => !item.kind).length);

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
    label: l.value.calendar.overdue,
    count: monthReminders.value.filter(isReminderOverdue).length + monthExpiryItems.value.filter((item) => item.days_until < 0).length,
  },
  {
    key: "month" as CalendarFilterKey,
    label: l.value.calendar.filterMonth,
    count: monthReminders.value.length + monthExpiryItems.value.length,
  },
  {
    key: "sent" as CalendarFilterKey,
    label: l.value.calendar.filterSent,
    count: monthReminders.value.filter((row) => row.status === "sent").length,
  },
  {
    key: "no_email" as CalendarFilterKey,
    label: l.value.calendar.filterNoEmail,
    count: monthReminders.value.filter((row) => !reminderHasEmail(row)).length + monthExpiryItems.value.filter((item) => !item.kind && !item.contact_email).length,
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
  return isReminderOverdue(r) ? t("calendar.overduePrefix", {label}) : label;
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
  return value ? t("calendar.num", {n: value}) : null;
}

function expiryVisualStatus(e: ExpiryCalendarItem): "overdue" | "critical" | "warning" | "ok" {
  // Payment dates always carry their urgency; the calendar-filters flag only governs contract expiries.
  if (e.kind) return e.days_until < 0 ? "overdue" : e.days_until <= 7 ? "critical" : e.days_until <= 30 ? "warning" : "ok";
  if (!featuresStore.hasFeature(FEATURES.dashboard.calendarFilters)) return "ok";
  if (e.days_until < 0) return "overdue";
  if (e.days_until <= 30) return "critical";
  if (e.days_until <= 90) return "warning";
  return "ok";
}

function expiryCalendarLabel(e: ExpiryCalendarItem): string {
  if (e.kind === "discovery") return e.title?.trim() || l.value.calendar.suggestion;
  if (e.kind === "invoice") return [e.supplier_name?.trim() || l.value.common.unidentifiedSupplier, e.amount_display].filter(Boolean).join(" · ");
  const client = e.client_name?.trim();
  const contact = e.contact_person?.trim();
  const identity = client && contact ? `${client} · ${contact}` : client || contact || e.equipment_name || e.contract_type || l.value.calendar.filterExpiries;
  return [contractNumberLabel(e.contract_number), identity].filter(Boolean).join(" · ");
}

function expiryCalendarTitle(e: ExpiryCalendarItem): string {
  return [
    `${expiryStatusLabel(e)}: ${expiryCalendarLabel(e)}`,
    e.equipment_name ? t("calendar.equipment", {name: e.equipment_name}) : null,
    e.contract_number ? t("calendar.num", {n: e.contract_number}) : null,
  ].filter(Boolean).join(" — ");
}

function expiryStatusLabel(e: ExpiryCalendarItem): string {
  if (e.kind === "discovery") return e.days_until < 0 ? l.value.calendar.suggestionMissed : l.value.calendar.suggestion;
  if (e.kind === "invoice") return e.days_until < 0 ? l.value.calendar.paymentOverdue : l.value.calendar.paymentDue;
  const status = expiryVisualStatus(e);
  if (status === "overdue") return l.value.calendar.expired;
  if (status === "critical") return e.days_until === 0 ? l.value.calendar.expiredToday : l.value.calendar.dueSoon;
  if (status === "warning") return l.value.calendar.due90;
  return l.value.calendar.valid;
}

function expiryTimeLabel(e: ExpiryCalendarItem): string {
  if (e.kind === "discovery") {
    if (e.days_until < 0) return t("calendar.suggestionDaysAgo", {n: Math.abs(e.days_until)});
    return e.days_until === 0 ? l.value.calendar.suggestionToday : t("calendar.suggestionInDays", {n: e.days_until});
  }
  if (e.kind === "invoice") {
    if (e.days_until < 0) return t("calendar.paymentOverdueDays", {n: Math.abs(e.days_until)});
    return e.days_until === 0 ? l.value.calendar.paymentToday : t("calendar.paymentInDays", {n: e.days_until});
  }
  if (e.days_until < 0) return t("calendar.expiredDaysAgo", {n: Math.abs(e.days_until)});
  if (e.days_until === 0) return l.value.calendar.expiredToday;
  return t("calendar.daysUntil", {n: e.days_until});
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

const monthLabel = computed(() => cursor.value.toLocaleDateString(locale.value === "en" ? "en-US" : "he-IL", { month: "long", year: "numeric" }));

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
      label: d.toLocaleDateString(locale.value === "en" ? "en-US" : "he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  });
});

function shiftMonth(delta: number) {
  const c = new Date(cursor.value);
  c.setMonth(c.getMonth() + delta);
  cursor.value = c;
  saveCursor(c);
  emitMonthChange();
}
function goToday() {
  const d = new Date();
  cursor.value = d;
  saveCursor(d);
  emitMonthChange();
}

/**
 * The month currently on screen, widened by one month either side.
 *
 * The grid shows trailing and leading days from the neighbouring months, so a
 * strict month range would leave those cells looking empty.
 */
function emitMonthChange() {
  const start = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1);
  const end = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 2, 0);
  emit("month-change", { from: isoDate(start), to: isoDate(end) });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The cursor can be restored from storage, so the first load has to announce the
// month too — otherwise it would fetch unbounded until the user navigates.
onMounted(emitMonthChange);

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
  if (item.kind === "discovery") {
    router.push("/discover-reminders");
    return;
  }
  if (item.kind === "invoice" && item.invoice_id) {
    router.push(`/invoices/${item.invoice_id}`);
    return;
  }
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
  /* A compact month view: wide screens would otherwise stretch it past 1000px. */
  width: 100%;
  max-width: 880px;
  margin-inline: auto;
}

.rcal__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 16px;
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
.rcal__toggle {
  display: inline-flex;
  gap: 4px;
}
.rcal__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rcal__refresh-btn {
  min-width: 34px;
  padding-inline: 0;
}
.rcal__refresh-icon--spin {
  display: inline-block;
  animation: rcal-spin 0.8s linear infinite;
}

@keyframes rcal-spin {
  to {
    transform: rotate(360deg);
  }
}
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
.rcal__filter-icon { display: none; }
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
  /* minmax(0, 1fr) keeps all seven columns equal: a bare 1fr floors at the
     content's min-width, so one long event title widens its column. */
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.rcal__cell {
  min-height: 106px;
  min-width: 0;
  overflow: hidden;
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
.rcal__dots { display: none; }
/* Base colour only; the status classes (rcal__pill--*) are declared later and override it. */
.rcal__dot { background: var(--brand-color); }
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rcal__pill:hover { filter: brightness(1.1); }
.rcal__pill--overdue { background: #d03050; }
.rcal__pill--sent { background: #2080f0; }
.rcal__pill--dismissed { background: var(--text-muted); }
.rcal__pill--error { background: var(--color-error, #d03050); }
.rcal__pill--failed { background: var(--color-error, #d03050); }
.rcal__gcal-icon {
  flex: 0 0 auto;
  color: currentColor;
  font-size: 12px;
  opacity: 0.95;
}
.rcal__gcal-icon--agenda,
.rcal__gcal-icon--day {
  color: #18a058;
  font-size: 14px;
}
.rcal__pill-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
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
/* Payment dates: same colours as expiries by urgency, but upright with a dashed edge so they read as a different kind. */
.rcal__legend-dot--dashed { background: transparent; outline: 1px dashed currentColor; outline-offset: -1px; }
.rcal__pill--invoice { font-style: normal; outline: 1px dashed rgba(255, 255, 255, 0.55); outline-offset: -2px; }
.rcal__pill--expiry-overdue  { background: #d03050; }
.rcal__pill--expiry-critical { background: #f0a020; }
.rcal__pill--expiry-warning  { background: #e8c84a; color: #333; }
.rcal__pill--expiry-ok       { background: #18a058; }

.rcal__expiry-pop { padding: 4px 0; font-size: 13px; }
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
    gap: 12px;
  }

  .rcal__title-wrap {
    flex-wrap: wrap;
    gap: 8px;
  }

  .rcal__title {
    font-size: 16px;
    width: 100%;
  }

  .rcal__controls {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    width: 100%;
  }

  .rcal__toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    gap: 6px;
  }

  .rcal__toggle :deep(.n-button) {
    width: 100%;
    height: 38px;
    justify-content: center;
  }

  .rcal__actions {
    display: flex;
    width: 100%;
    gap: 6px;
  }

  .rcal__action-btn {
    flex: 1 1 0;
    min-width: 0;
    height: 38px;
    justify-content: center;
  }

  .rcal__refresh-btn {
    flex: 0 0 38px;
    width: 38px;
    height: 38px;
    min-width: 38px;
  }

  .rcal__summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
    overflow: visible;
  }

  .rcal__summary-chip {
    justify-content: space-between;
    min-height: 38px;
    width: 100%;
    padding: 6px 10px;
  }

  /* Wrap instead of scrolling sideways: a scrolling chip row hid its first chips off-screen. */
  .rcal__filters {
    flex-wrap: wrap;
    overflow: visible;
    gap: 6px;
  }

  /* Icon-only filter buttons, as on the table pages. */
  .rcal__filter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    min-height: 40px;
    padding: 6px 8px;
  }

  .rcal__filter-icon {
    display: inline-flex;
  }

  .rcal__filter-label {
    display: none;
  }

  /* Nothing to show for these: drop them rather than leave dead buttons (the active one always stays). */
  .rcal__summary-chip--empty,
  .rcal__filter--empty {
    display: none;
  }

  /* No tile left in the summary box: hide the box too. */
  .rcal__summary:not(:has(.rcal__summary-chip:not(.rcal__summary-chip--empty))) {
    display: none;
  }

  .rcal__legend {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  /* The month fits the screen: seven equal columns, small cells, dots instead of pills. */
  .rcal__month {
    overflow: visible;
    padding-bottom: 4px;
  }

  .rcal__weekdays,
  .rcal__grid {
    min-width: 0;
    gap: 3px;
  }

  .rcal__weekday {
    font-size: 10px;
    padding: 2px 0;
  }

  .rcal__cell {
    min-height: 52px;
    padding: 4px 3px;
    border-radius: 6px;
    gap: 3px;
    align-items: center;
  }

  .rcal__cell--has {
    cursor: pointer;
  }

  .rcal__cell-num {
    font-size: 12px;
    text-align: center;
  }

  .rcal__cell-items,
  .rcal__cell-all {
    display: none;
  }

  .rcal__dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .rcal__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .rcal__dots-more {
    font-size: 9px;
    font-weight: 700;
    line-height: 7px;
    color: var(--text-secondary);
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
