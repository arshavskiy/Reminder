<template>
  <section class="rcal">
    <header class="rcal__head">
      <div class="rcal__title-wrap">
        <h3 class="rcal__title">לוח תזכורות ותסקירים</h3>
        <span class="rcal__count">{{ rows.length }} תזכורות</span>
        <span v-if="(expiryItems ?? []).length" class="rcal__expiry-count">
          {{ (expiryItems ?? []).length }} תסקירים
        </span>
      </div>
      <div class="rcal__controls">
        <div class="rcal__legend">
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:var(--brand-color)"></span> תזכורות
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#d03050"></span> פג תוקף
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#f0a020"></span> ≤30 יום
          </span>
          <span class="rcal__legend-item">
            <span class="rcal__legend-dot" style="background:#e8c84a"></span> ≤90 יום
          </span>
        </div>
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
        <n-button :loading="loading" size="small" @click="$emit('refresh')">↻</n-button>
      </div>
    </header>

    <!-- ── Month grid ──────────────────────────────────────────────────── -->
    <div v-if="view === 'month'" class="rcal__month">
      <div class="rcal__nav">
        <n-button size="tiny" @click="shiftMonth(-1)">‹</n-button>
        <span class="rcal__nav-label">{{ monthLabel }}</span>
        <n-button size="tiny" @click="shiftMonth(1)">›</n-button>
        <n-button size="tiny" tertiary @click="goToday">היום</n-button>
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
              v-for="r in cell.items.slice(0, 2)"
              :key="r.id"
              :width="320"
              placement="right"
              trigger="click"
            >
              <template #trigger>
                <button
                  :class="`rcal__pill--${r.status}`"
                  :title="r.title"
                  class="rcal__pill"
                  @click.stop
                >
                  {{ r.title }}
                </button>
              </template>
              <ReminderQuickView :reminder="r" @navigate="onNavigate" />
            </n-popover>
            <n-popover
              v-for="e in cell.expiryItems.slice(0, 2)"
              :key="`exp-${e.id}`"
              :width="260"
              placement="right"
              trigger="click"
            >
              <template #trigger>
                <button
                  :class="`rcal__pill--expiry-${e.urgency}`"
                  :title="`פג תוקף: ${e.equipment_name ?? e.contract_type ?? 'תסקירים'} — ${e.client_name ?? ''}`"
                  class="rcal__pill rcal__pill--expiry"
                  @click.stop
                >
                  {{ e.equipment_name ?? e.contract_type ?? 'תסקירים' }}
                </button>
              </template>
              <div class="rcal__expiry-pop">
                <p class="rcal__expiry-pop__title">{{ e.equipment_name ?? e.contract_type ?? 'תסקירים' }}</p>
                <p v-if="e.client_name" class="rcal__expiry-pop__sub">לקוח: {{ e.client_name }}</p>
                <p v-if="e.contract_number" class="rcal__expiry-pop__sub">מס׳ {{ e.contract_number }}</p>
                <p :class="`rcal__expiry-pop__days--${e.urgency}`" class="rcal__expiry-pop__days">
                  {{ e.days_until < 0 ? `פג לפני ${Math.abs(e.days_until)} ימים` : e.days_until === 0 ? 'פג היום' : `${e.days_until} ימים לפקיעה` }}
                </p>
              </div>
            </n-popover>
            <span v-if="cell.items.length + cell.expiryItems.length > 4" class="rcal__more">
              +{{ cell.items.length + cell.expiryItems.length - 4 }}
            </span>
          </div>
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
              <button :class="`rcal__agenda-item--${r.status}`" class="rcal__agenda-item">
                <span class="rcal__agenda-dot" />
                <span class="rcal__agenda-title">{{ r.title }}</span>
                <span v-if="r.client_name" class="rcal__agenda-client">— {{ r.client_name }}</span>
              </button>
            </template>
            <ReminderQuickView :reminder="r" @navigate="onNavigate" />
          </n-popover>
          <button
            v-for="e in grp.expiryItems"
            :key="`exp-${e.id}`"
            :class="`rcal__agenda-item--expiry-${e.urgency}`"
            class="rcal__agenda-item"
          >
            <span class="rcal__agenda-dot rcal__agenda-dot--expiry" />
            <span class="rcal__agenda-title">{{ e.equipment_name ?? e.contract_type ?? 'תסקירים' }} — פג תוקף</span>
            <span v-if="e.client_name" class="rcal__agenda-client">— {{ e.client_name }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import {computed, ref} from "vue";
import {useRouter} from "vue-router";
import {NButton, NPopover} from "naive-ui";
import type {ReminderWithContext} from "@shared/types.js";
import type {ExpiryCalendarItem} from "../services/apiService.js";
import ReminderQuickView from "./ReminderQuickView.vue";

interface Props {
  rows: ReminderWithContext[];
  expiryItems?: ExpiryCalendarItem[];
  loading?: boolean;
}
const props = withDefaults(defineProps<Props>(), { loading: false, expiryItems: () => [] });
defineEmits<{ (e: "refresh"): void }>();

const router = useRouter();
const view = ref<"month" | "agenda">("month");
const cursor = ref(new Date());

const weekdayLabels = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

const today = startOfDay(new Date());

const rowsByIso = computed(() => {
  const m = new Map<string, ReminderWithContext[]>();
  for (const r of props.rows) {
    if (!r.trigger_date) continue;
    const iso = r.trigger_date.slice(0, 10);
    if (!m.has(iso)) m.set(iso, []);
    m.get(iso)!.push(r);
  }
  return m;
});

const expiryByIso = computed(() => {
  const m = new Map<string, ExpiryCalendarItem[]>();
  for (const e of props.expiryItems ?? []) {
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

const agendaGroups = computed(() => {
  const now = today.getTime();
  const isoSet = new Set<string>();

  for (const r of props.rows) { if (r.trigger_date) isoSet.add(r.trigger_date.slice(0, 10)); }
  for (const e of props.expiryItems ?? []) { if (e.expiry_date) isoSet.add(e.expiry_date.slice(0, 10)); }

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
}
function goToday() { cursor.value = new Date(); }

function onNavigate(target: { type: "contract" | "document" | "reminder"; id: number | string }) {
  if (target.type === "contract") router.push(`/contracts/${target.id}`);
  else if (target.type === "document") router.push(`/documents/${target.id}`);
  else if (target.type === "reminder") router.push("/reminders");
}
</script>

<style scoped>
.rcal {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 24px;
}

.rcal__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.rcal__title-wrap { display: flex; align-items: center; gap: 8px; }
.rcal__title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
.rcal__count {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
}
.rcal__controls { display: flex; gap: 8px; align-items: center; }
.rcal__toggle { display: flex; gap: 4px; }

/* ── Month nav ─────────────────────────────────────────────────────────── */
.rcal__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  justify-content: center;
}
.rcal__nav-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 140px;
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
  gap: 4px;
}
.rcal__cell {
  min-height: 80px;
  padding: 4px 6px;
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
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
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
.rcal__pill--sent { background: #2080f0; }
.rcal__pill--dismissed { background: var(--text-muted); }
.rcal__pill--failed { background: var(--color-error, #d03050); }
.rcal__more { font-size: 10px; color: var(--text-muted); padding: 1px 4px; }

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
.rcal__agenda-dot {
  width: 8px; height: 8px;
  border-radius: 999px;
  background: var(--brand-color);
  flex-shrink: 0;
}
.rcal__agenda-item--sent .rcal__agenda-dot { background: #2080f0; }
.rcal__agenda-item--dismissed .rcal__agenda-dot { background: var(--text-muted); }
.rcal__agenda-item--failed .rcal__agenda-dot { background: var(--color-error, #d03050); }
.rcal__agenda-item--expiry-overdue  .rcal__agenda-dot { background: #d03050; }
.rcal__agenda-item--expiry-critical .rcal__agenda-dot { background: #f0a020; }
.rcal__agenda-item--expiry-warning  .rcal__agenda-dot { background: #e8c84a; }
.rcal__agenda-item--expiry-ok       .rcal__agenda-dot { background: #18a058; }
.rcal__agenda-dot--expiry { border-radius: 2px; }
.rcal__agenda-title { font-weight: 500; flex: 1; }
.rcal__agenda-client { color: var(--text-muted); font-size: 12px; }

.rcal__legend {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
</style>
