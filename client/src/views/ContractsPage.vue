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
        <button class="btn btn--ghost" @click="openExport" title="ייצוא ל-Excel">
          📊 ייצוא ל-Excel
        </button>
        <button class="btn btn--ghost" @click="router.push('/documents')">
          📁 ארכיון
        </button>
        <button class="btn btn--primary" @click="openCreate">
          + {{ kind === "inspection" ? "תסקיר חדש" : "חוזה חדש" }}
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
        :placeholder="kind === 'inspection' ? 'חיפוש לפי לקוח, מספר תסקיר, ציוד...' : 'חיפוש לפי לקוח, מספר חוזה...'"
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
      <div v-if="pagedRows.length" class="cards">
        <article v-for="row in pagedRows" :key="row.id" class="card">
          <!-- Top row: number + actions -->
          <div class="card__row">
            <div class="card__num">
              <span class="card__num-main">{{ row.contract_number ?? "—" }}</span>
            </div>
            <div class="card__actions">
              <button class="btn btn--xs btn--ghost" @click="openDoc(row)" :title="row.document_id ? 'צפה במסמך' : 'אין מסמך מקושר'" :disabled="!row.document_id">
                <n-icon :component="EyeOutline" /> צפה
              </button>
              <button class="btn btn--xs btn--ghost" @click="openEdit(row)">
                <n-icon :component="CreateOutline" /> ערוך
              </button>
              <button class="btn btn--xs btn--danger" @click="confirmDelete(row)">
                <n-icon :component="TrashOutline" /> מחק
              </button>
            </div>
          </div>

          <!-- Subtitle -->
          <p class="card__sub">
            {{ row.summary ?? (row.contract_type ?? (kind === "inspection" ? "תסקיר" : "חוזה")) + " — " + (row.client_name ?? "—") }}
          </p>

          <!-- Status pills row -->
          <div class="card__pills">
            <span :class="statusTagClass(row.status)">{{ statusLabel(row.status) }}</span>
            <span class="tag tag--neutral">{{ row.contract_type ?? "—" }}</span>
            <span v-if="row.counterparty" class="tag tag--neutral">{{ row.counterparty }}</span>
          </div>

          <!-- Footer info -->
          <div class="card__foot">
            <div class="card__foot-col">
              <span class="kv"><strong>לקוח:</strong> {{ row.client_name ?? "—" }}</span>
              <span class="kv"><strong>תאריך התחלה:</strong> {{ formatDate(row.start_date) }}</span>
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
        </article>
      </div>

      <!-- Pagination -->
      <div v-if="filteredRows.length > pageSize" class="pagination">
        <n-pagination
          v-model:page="currentPage"
          :page-count="pageCount"
          :page-slot="5"
          show-quick-jumper
        />
        <span class="pagination__info">{{ filteredRows.length }} רשומות</span>
      </div>

      <div v-else-if="!pagedRows.length" class="empty">
        <p>אין {{ kind === "inspection" ? "תסקירים" : "חוזים" }} להצגה</p>
        <button class="btn btn--primary" style="margin-top:12px" @click="openCreate">
          + {{ kind === "inspection" ? "הוסף תסקיר ראשון" : "הוסף חוזה ראשון" }}
        </button>
      </div>
    </n-spin>

    <!-- ── Export wizard modal ──────────────────────────────────────────── -->
    <n-modal v-model:show="showExport" preset="card" style="width:640px; max-width:95vw" :mask-closable="false">
      <template #header>
        <div class="export-header">
          <span>ייצוא בדיקות ל-Excel</span>
          <div class="export-steps">
            <div v-for="(s, i) in exportSteps" :key="s.key" class="export-step" :class="{ 'export-step--active': exportStep === i, 'export-step--done': exportStep > i }">
              <div class="export-step__dot">{{ exportStep > i ? '✓' : i + 1 }}</div>
              <span class="export-step__label">{{ s.label }}</span>
              <div v-if="i < exportSteps.length - 1" class="export-step__line" />
            </div>
          </div>
        </div>
      </template>

      <!-- Step 0: סינון -->
      <div v-if="exportStep === 0" class="export-body">
        <h3 class="export-section-title">&#x25BD; סינון בדיקות לייצוא</h3>
        <n-grid :cols="3" :x-gap="16" :y-gap="12">
          <n-gi>
            <n-form-item label="לקוח">
              <n-select v-model:value="exportFilter.client_id" :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סטטוס">
              <n-select v-model:value="exportFilter.status" :options="[{ label: 'כל הסטטוסים', value: null }, ...statusOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סוג בדיקה">
              <n-select v-model:value="exportFilter.contract_type" :options="[{ label: 'כל הסוגים', value: null }, ...contractTypeOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi :span="3">
            <n-form-item label="טווח תאריכים">
              <n-date-picker v-model:value="exportFilter.dateRange" type="daterange" clearable style="width:100%" />
            </n-form-item>
          </n-gi>
        </n-grid>
      </div>

      <!-- Step 1: עמודות -->
      <div v-if="exportStep === 1" class="export-body">
        <h3 class="export-section-title">בחר עמודות לייצוא</h3>
        <div class="col-grid">
          <label v-for="col in exportColumns" :key="col.key" class="col-check">
            <n-checkbox v-model:checked="col.selected" />
            <span>{{ col.label }}</span>
          </label>
        </div>
      </div>

      <!-- Step 2: פורמט -->
      <div v-if="exportStep === 2" class="export-body">
        <h3 class="export-section-title">בחר פורמט ייצוא</h3>
        <div class="format-cards">
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'csv' }" @click="exportFormat = 'csv'">
            <div class="format-card__icon">📊</div>
            <div class="format-card__name">CSV / Excel</div>
            <div class="format-card__desc">נפתח ב-Excel / Google Sheets</div>
          </div>
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'pdf' }" @click="exportFormat = 'pdf'">
            <div class="format-card__icon">📄</div>
            <div class="format-card__name">PDF</div>
            <div class="format-card__desc">דף מודפס בעברית</div>
          </div>
        </div>
      </div>

      <!-- Step 3: ייצוא -->
      <div v-if="exportStep === 3" class="export-body export-body--summary">
        <div class="export-summary">
          <div class="export-summary__icon">📊</div>
          <div class="export-summary__text">
            <strong>{{ exportedRows.length }}</strong> רשומות יוצאו
          </div>
          <div class="export-summary__sub">
            {{ selectedExportColumns.map(c => c.label).join(' · ') }}
          </div>
        </div>
      </div>

      <template #footer>
        <n-space justify="space-between">
          <n-button @click="showExport = false">ביטול</n-button>
          <n-space>
            <n-button v-if="exportStep > 0 && exportStep < 3" @click="exportStep--">חזור</n-button>
            <n-button v-if="exportStep < 2" type="primary" @click="exportStep++">המשך ›</n-button>
            <n-button v-if="exportStep === 2" type="primary" @click="doExport">ייצא</n-button>
            <n-button v-if="exportStep === 3" type="primary" @click="showExport = false">סגור</n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <!-- ── Create / Edit modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showForm" :title="editingId ? 'עריכת תסקיר / חוזה' : 'תסקיר / חוזה חדש'" preset="card" style="width: 600px; max-width: 95vw" :mask-closable="false">
      <n-form label-placement="top" :model="form">
        <n-grid :cols="2" :x-gap="16">
          <n-gi>
            <n-form-item label="מספר תסקיר / חוזה">
              <n-input v-model:value="form.contract_number" placeholder="לדוגמה: 15935" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סוג">
              <n-select
                v-model:value="form.contract_type"
                :options="contractTypeOptions"
                clearable
                filterable
                tag
                placeholder="בחר או הקלד"
              />
            </n-form-item>
          </n-gi>

          <n-gi :span="2">
            <n-form-item label="לקוח">
              <n-select
                v-model:value="form.client_id"
                :options="clientOptions"
                clearable
                filterable
                placeholder="חיפוש לקוח..."
                :loading="loadingClients"
              />
            </n-form-item>
          </n-gi>

          <n-gi>
            <n-form-item label="תאריך התחלה">
              <n-input v-model:value="form.start_date" type="text" placeholder="YYYY-MM-DD" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="תאריך תפוגה / בדיקה הבאה">
              <n-input v-model:value="form.expiry_date" type="text" placeholder="YYYY-MM-DD" />
            </n-form-item>
          </n-gi>

          <n-gi>
            <n-form-item label="סכום">
              <n-input-number v-model:value="form.amount" placeholder="0" style="width:100%" :show-button="false" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="מטבע">
              <n-select v-model:value="form.currency" :options="currencyOptions" />
            </n-form-item>
          </n-gi>

          <n-gi>
            <n-form-item label="סטטוס">
              <n-select v-model:value="form.status" :options="statusOptions" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="צד שכנגד">
              <n-input v-model:value="form.counterparty" placeholder="שם החברה / איש קשר" />
            </n-form-item>
          </n-gi>

          <n-gi :span="2">
            <n-form-item label="סיכום / הערות">
              <n-input v-model:value="form.summary" type="textarea" :rows="3" placeholder="תיאור קצר..." />
            </n-form-item>
          </n-gi>
        </n-grid>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showForm = false">ביטול</n-button>
          <n-button type="primary" :loading="saving" @click="saveForm">
            {{ editingId ? "שמור שינויים" : "צור" }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- ── Delete confirm modal ────────────────────────────────────────── -->
    <n-modal v-model:show="showDeleteConfirm" title="מחיקת רשומה" preset="dialog" type="error" :positive-text="'מחק'" :negative-text="'ביטול'" @positive-click="doDelete" @negative-click="showDeleteConfirm = false">
      <p>האם למחוק את הרשומה <strong>{{ deletingRow?.contract_number ?? deletingRow?.contract_type ?? "זו" }}</strong>?</p>
      <p style="font-size:13px; color:var(--text-secondary)">פעולה זו אינה הפיכה. התזכורות הקשורות לא יימחקו.</p>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NIcon, NTag, NSelect, NSpin, NModal, NForm, NFormItem, NInput,
  NInputNumber, NGrid, NGi, NButton, NSpace, NCheckbox, NDatePicker,
  NPagination, useMessage,
} from "naive-ui";
import { EyeOutline, CreateOutline, TrashOutline } from "@vicons/ionicons5";
import { useContractsStore } from "../stores/contracts.js";
import { api } from "../services/apiService.js";
import ExpiryBadge from "../components/ExpiryBadge.vue";
import type { ContractWithClient } from "@shared/types.js";

const store = useContractsStore();
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>(null);
const kind = ref<"contract" | "inspection" | "all">("inspection");
const search = ref("");

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref(emptyForm());

const showDeleteConfirm = ref(false);
const deletingRow = ref<ContractWithClient | null>(null);

// ── Client picker ─────────────────────────────────────────────────────────────
const clientOptions = ref<{ label: string; value: string }[]>([]);
const loadingClients = ref(false);

async function loadClients() {
  if (clientOptions.value.length) return;
  loadingClients.value = true;
  try {
    const r = await api.clients.list({ limit: 500 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
  } finally {
    loadingClients.value = false;
  }
}

const kindOptions = [
  { label: "תסקירים", value: "inspection" },
  { label: "חוזים",   value: "contract" },
  { label: "הכל",     value: "all" },
];

const contractTypeOptions = [
  { label: "תסקיר בדיקה תקופתית", value: "תסקיר בדיקה תקופתית" },
  { label: "תסקיר בדיקה", value: "תסקיר בדיקה" },
  { label: "חוזה שירות", value: "חוזה שירות" },
  { label: "חוזה תחזוקה", value: "חוזה תחזוקה" },
  { label: "חשבונית", value: "חשבונית" },
  { label: "ביטוח", value: "ביטוח" },
  { label: "אישור", value: "אישור" },
];

const currencyOptions = [
  { label: "₪ שקל", value: "ILS" },
  { label: "$ דולר", value: "USD" },
  { label: "€ אירו", value: "EUR" },
];

const statusOptions = [
  { label: "פעיל", value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל", value: "cancelled" },
  { label: "חודש", value: "renewed" },
];

const pillFilters = computed(() => [
  { label: "הכל",     value: null },
  { label: "פעיל",    value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל",    value: "cancelled" },
  { label: "חודש",    value: "renewed" },
]);

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 200, kind: kind.value });
}

onMounted(() => {
  load();
  store.fetchExpiring(30);
  loadClients();
});

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return store.rows;
  return store.rows.filter((r) =>
    (r.contract_number ?? "").toLowerCase().includes(q) ||
    (r.client_name ?? "").toLowerCase().includes(q) ||
    (r.contract_type ?? "").toLowerCase().includes(q) ||
    (r.summary ?? "").toLowerCase().includes(q)
  );
});

// ── CRUD actions ──────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    contract_number: null as string | null,
    contract_type: kind.value === "inspection" ? "תסקיר בדיקה תקופתית" : null as string | null,
    client_id: null as string | null,
    start_date: null as string | null,
    expiry_date: null as string | null,
    amount: null as number | null,
    currency: "ILS",
    counterparty: null as string | null,
    summary: null as string | null,
    status: "active" as string,
  };
}

function openCreate() {
  editingId.value = null;
  form.value = emptyForm();
  form.value.contract_type = kind.value === "inspection" ? "תסקיר בדיקה תקופתית" : null;
  showForm.value = true;
}

function openEdit(row: ContractWithClient) {
  editingId.value = row.id;
  form.value = {
    contract_number: row.contract_number,
    contract_type: row.contract_type,
    client_id: row.client_id,
    start_date: row.start_date,
    expiry_date: row.expiry_date,
    amount: row.amount,
    currency: row.currency ?? "ILS",
    counterparty: row.counterparty,
    summary: row.summary,
    status: row.status,
  };
  showForm.value = true;
}

async function saveForm() {
  saving.value = true;
  try {
    if (editingId.value) {
      await store.update(editingId.value, form.value as any);
      message.success("הרשומה עודכנה בהצלחה");
    } else {
      await store.create(form.value as any);
      message.success("הרשומה נוצרה בהצלחה");
      load();
    }
    showForm.value = false;
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: ContractWithClient) {
  deletingRow.value = row;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!deletingRow.value) return;
  try {
    await store.remove(deletingRow.value.id);
    message.success("הרשומה נמחקה");
  } catch (e) {
    message.error(String(e));
  } finally {
    deletingRow.value = null;
  }
}

function openDoc(row: ContractWithClient) {
  if (row.document_id) router.push(`/documents/${row.document_id}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const datePart = d.includes("T") ? d.split("T")[0] : d.split(" ")[0];
  const [y, m, day] = datePart.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "פעיל", expired: "פג תוקף", cancelled: "בוטל", renewed: "חודש",
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

function exportToExcel() {
  const rows = filteredRows.value;
  const header = ["מספר", "סוג", "לקוח", "תאריך התחלה", "תאריך תפוגה", "סכום", "מטבע", "סטטוס"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.contract_number ?? "",
      r.contract_type ?? "",
      (r.client_name ?? "").replace(/,/g, " "),
      r.start_date ?? "",
      r.expiry_date ?? "",
      r.amount ?? "",
      r.currency ?? "ILS",
      statusLabel(r.status),
    ].join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contracts-${new Date().toISOString().slice(0, 10)}.csv`;
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
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}
.btn--primary:hover { background: var(--brand-color-hover); border-color: var(--brand-color-hover); }
.btn--ghost { background: transparent; }
.btn--danger {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}
.btn--danger:hover { background: rgba(208, 48, 80, 0.08); }
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

/* ── Toolbar ────────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.toolbar__right { display: flex; align-items: center; gap: 10px; }
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
.cards { display: flex; flex-direction: column; gap: 14px; }
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 22px;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.card:hover { border-color: var(--brand-color); box-shadow: var(--shadow-sm); }
.card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card__num { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.card__actions { display: flex; gap: 8px; }
.card__sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; }
.card__pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.tag--ok    { background: rgba(99,226,183,0.15); color: #1a7951; border-color: rgba(99,226,183,0.3); }
.tag--bad   { background: rgba(208,48,80,0.10);  color: #b22e2e; border-color: rgba(208,48,80,0.2); }
.tag--info  { background: rgba(32,128,240,0.10); color: #1560bd; border-color: rgba(32,128,240,0.2); }
.tag--neutral { background: var(--bg-elevated); color: var(--text-secondary); border-color: var(--border-color); }
.tag--muted   { background: transparent; color: var(--text-muted); border-color: var(--border-color); }
html[data-theme="dark"] .tag--ok   { color: #63e2b7; }
html[data-theme="dark"] .tag--bad  { color: #ff7875; }
html[data-theme="dark"] .tag--info { color: #63b3ed; }

/* ── Card footer ────────────────────────────────────────────────────────── */
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

/* ── Pagination ─────────────────────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.pagination__info { font-size: 13px; color: var(--text-secondary); }

/* ── Export wizard ──────────────────────────────────────────────────────── */
.export-header { display: flex; flex-direction: column; gap: 16px; }
.export-steps { display: flex; align-items: center; }
.export-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.export-step--active { color: var(--brand-color, #18a058); font-weight: 600; }
.export-step__dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.export-step--active .export-step__dot { border-color: var(--brand-color, #18a058); color: var(--brand-color, #18a058); }
.export-step--done .export-step__dot { background: var(--brand-color, #18a058); border-color: var(--brand-color, #18a058); color: #fff; }
.export-step__label { white-space: nowrap; }
.export-step__line { width: 32px; height: 2px; background: var(--border-color); margin: 0 4px; }

.export-body { min-height: 180px; }
.export-section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 16px; }

.col-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.col-check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }

.format-cards { display: flex; gap: 16px; }
.format-card {
  flex: 1;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.format-card--active { border-color: var(--brand-color, #18a058); }
.format-card__icon { font-size: 32px; margin-bottom: 8px; }
.format-card__name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.format-card__desc { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

.export-body--summary { display: flex; align-items: center; justify-content: center; }
.export-summary { text-align: center; }
.export-summary__icon { font-size: 48px; margin-bottom: 12px; }
.export-summary__text { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.export-summary__sub { font-size: 13px; color: var(--text-secondary); margin-top: 6px; }
</style>
