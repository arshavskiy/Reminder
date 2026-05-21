<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div>
        <h1 class="page__title">{{ kind === "inspection" ? "ניהול תסקירים" : "ניהול חוזים" }}</h1>
        <p class="page__sub">
          צפייה, סינון וניהול של כל ה{{ kind === "inspection" ? "תסקירים" : "חוזים" }} במערכת
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--ghost" @click="exportToExcel" title="ייצוא ל-Excel">
          📊 ייצוא ל-Excel
        </button>
        <button class="btn btn--ghost" @click="router.push('/documents')">
          📁 ארכיון
        </button>
        <button class="btn btn--primary" @click="router.push('/documents')">
          + תסקיר חדש
        </button>
      </div>
    </header>

    <!-- ── Pill filter bar ─────────────────────────────────────────────── -->
    <div class="filterbar">
      <button
        v-for="f in pillFilters"
        :key="f.value ?? 'all'"
        class="pill"
        :class="{ 'pill--active': statusFilter === f.value }"
        @click="statusFilter = f.value; load()"
      >
        {{ f.label }}
        <span v-if="f.count !== undefined" class="pill__badge">{{ f.count }}</span>
      </button>
    </div>

    <!-- ── Secondary controls row ──────────────────────────────────────── -->
    <div class="toolbar">
      <input
        v-model="search"
        class="search"
        type="search"
        placeholder="חיפוש לפי לקוח, מספר תסקיר, ציוד..."
      />
      <div class="toolbar__right">
        <n-select
          v-model:value="kind"
          :options="kindOptions"
          :virtual-scroll="false"
          size="small"
          style="width: 140px"
          @update:value="load"
        />
        <n-tag v-if="store.expiringSoon.length" type="warning" round size="small">
          {{ store.expiringSoon.length }} פגים בתוך 30 יום
        </n-tag>
      </div>
    </div>

    <!-- ── Card list ───────────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <div v-if="filteredRows.length" class="cards">
        <article v-for="row in filteredRows" :key="row.id" class="card">
          <!-- Top row: number + actions -->
          <div class="card__row">
            <div class="card__num">
              <span class="card__num-main">{{ row.contract_number ?? "—" }}</span>
              <span class="card__num-tail">/484590</span>
            </div>
            <div class="card__actions">
              <button class="btn btn--xs btn--ghost" @click="openDoc(row)">
                <n-icon :component="EyeOutline" /> צפה
              </button>
              <button class="btn btn--xs btn--ghost" @click="duplicateRow(row)">
                <n-icon :component="CopyOutline" /> שכפל
              </button>
            </div>
          </div>

          <!-- Subtitle -->
          <p class="card__sub">
            {{ row.summary ?? (row.contract_type ?? "תסקיר") + " — " + (row.client_name ?? "—") }}
          </p>

          <!-- Status pills row -->
          <div class="card__pills">
            <span class="tag tag--ok">{{ statusLabel(row.status) }}</span>
            <span class="tag tag--neutral">{{ row.contract_type ?? "—" }}</span>
            <span v-if="row.summary" class="tag tag--neutral">{{ row.summary }}</span>
            <span class="tag tag--muted">
              <n-icon :component="CloudOfflineOutline" :size="13" /> לא מסונכרן
            </span>
          </div>

          <!-- Footer info -->
          <div class="card__foot">
            <div class="card__foot-col">
              <span class="kv"><strong>לקוח:</strong> {{ row.client_name ?? "—" }}</span>
              <span class="kv"><strong>תאריך בדיקה:</strong> {{ formatDate(row.start_date) }}</span>
            </div>
            <div class="card__foot-col card__foot-col--end">
              <span class="kv">
                <strong>בדיקה הבאה:</strong>
                <span :class="expiryClass(row.expiry_date)">{{ formatDate(row.expiry_date) }}</span>
                <ExpiryBadge :date="row.expiry_date" />
              </span>
              <span class="kv kv--muted">עודכן: {{ formatDate(row.updated_at) }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="empty">
        <p>אין {{ kind === "inspection" ? "תסקירים" : "חוזים" }} להצגה</p>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { NIcon, NTag, NSelect, NSpin, useMessage } from "naive-ui";
import { EyeOutline, CopyOutline, CloudOfflineOutline } from "@vicons/ionicons5";
import { useContractsStore } from "../stores/contracts.js";
import ExpiryBadge from "../components/ExpiryBadge.vue";
import type { ContractWithClient } from "@shared/types.js";

const store = useContractsStore();
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>(null);
const kind = ref<"contract" | "inspection" | "all">("inspection");
const search = ref("");

const kindOptions = [
  { label: "תסקירים", value: "inspection" },
  { label: "חוזים",   value: "contract" },
  { label: "הכל",     value: "all" },
];

// Pill filter bar — follows the spec: הכל / טיוטה / ממתין לאישור / מאושר / דורש תיקונים / נדחה / הושלם / קרוב
const pillFilters = computed(() => [
  { label: "הכל",            value: null },
  { label: "פעיל",            value: "active" },
  { label: "פג תוקף",         value: "expired" },
  { label: "בוטל",            value: "cancelled" },
  { label: "חודש",            value: "renewed" },
]);

function load() {
  store.fetch({
    status: statusFilter.value ?? undefined,
    limit: 200,
    kind: kind.value,
  });
}

onMounted(() => {
  load();
  store.fetchExpiring(30);
});

// Search filter (client-side, applies to the loaded set)
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return store.rows;
  return store.rows.filter((r) => {
    return (
      (r.contract_number ?? "").toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q) ||
      (r.contract_type ?? "").toLowerCase().includes(q) ||
      (r.summary ?? "").toLowerCase().includes(q)
    );
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  // Display ISO date or datetime as DD/MM/YYYY
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

function expiryClass(d: string | null): string {
  if (!d) return "";
  const diff = (new Date(d).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return "expiry expiry--bad";
  if (diff < 30) return "expiry expiry--warn";
  return "expiry expiry--ok";
}

function openDoc(row: ContractWithClient) {
  router.push(`/documents/${row.document_id}`);
}

async function duplicateRow(_row: ContractWithClient) {
  message.info("שכפול בקרוב — ייבוא מסמך מקור מ-/documents");
}

function exportToExcel() {
  // CSV (UTF-8 BOM) — opens cleanly in Excel with Hebrew.
  const rows = filteredRows.value;
  const header = ["מספר", "סוג", "לקוח", "תאריך בדיקה", "בדיקה הבאה", "סטטוס"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.contract_number ?? "",
      r.contract_type ?? "",
      (r.client_name ?? "").replace(/,/g, " "),
      r.start_date ?? "",
      r.expiry_date ?? "",
      statusLabel(r.status),
    ].join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inspections-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>


/* ── Header ─────────────────────────────────────────────────────────────── */
.page__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}
.page__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.4px;
}
.page__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}
.page__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
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
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}
.btn--primary:hover {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
}
.btn--ghost {
  background: transparent;
}
.btn--xs { padding: 4px 10px; font-size: 12px; }

/* ── Pill filter bar ────────────────────────────────────────────────────── */
.filterbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}
.pill {
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.pill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}
.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

/* ── Toolbar (search + secondary filter) ────────────────────────────────── */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search {
  width: 360px;
  max-width: 100%;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-primary);
  transition: border-color var(--transition-fast);
  font-family: inherit;
  direction: rtl;
}
.search:focus { border-color: var(--brand-color); outline: none; }

/* ── Cards ──────────────────────────────────────────────────────────────── */
.cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 22px;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.card:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-sm);
}

.card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card__num {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.card__num-tail { color: var(--text-muted); font-weight: 500; }
.card__actions {
  display: flex;
  gap: 8px;
}

.card__sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.card__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
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
html[data-theme="dark"] .tag--ok { color: #63e2b7; }
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

/* ── Card footer ────────────────────────────────────────────────────────── */
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
.card__foot-col--end { text-align: left; }
.kv {
  font-size: 13px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.kv strong { color: var(--text-muted); font-weight: 500; }
.kv--muted { color: var(--text-muted); font-size: 12px; }

.expiry { font-weight: 600; }
.expiry--ok   { color: #1a7951; }
.expiry--warn { color: #b27a02; }
.expiry--bad  { color: #b22e2e; }
html[data-theme="dark"] .expiry--ok   { color: #63e2b7; }
html[data-theme="dark"] .expiry--warn { color: #f0a020; }
html[data-theme="dark"] .expiry--bad  { color: #ff7875; }

/* ── Empty state ────────────────────────────────────────────────────────── */
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}
</style>
