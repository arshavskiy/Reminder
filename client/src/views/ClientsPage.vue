<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div class="page__head-title">
        <h1 class="page__title">הלקוחות שלי</h1>
        <span class="count-badge">{{ store.total }}</span>
      </div>
      <div class="page__actions">
        <button :class="{ 'btn--loading': store.loading }" class="btn btn--ghost" title="רענן" @click="refresh">
          <span :class="{ 'refresh-icon--spin': store.loading }" class="refresh-icon">↻</span> רענן
        </button>
        <button class="btn btn--primary" @click="showCreate = true">+ צור לקוח</button>
      </div>
    </header>

    <!-- ── Search ───────────────────────────────────────────────────────── -->
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input
        v-model="search"
        class="search"
        placeholder="חיפוש לפי שם לקוח, איש קשר או אימייל..."
        type="search"
        @input="onSearch"
      />
    </div>

    <!-- ── Table ─────────────────────────────────────────────────────────── -->
    <div class="table-wrap">
      <table v-if="store.rows.length" class="clients-table">
        <thead>
          <tr>
            <th>שם הלקוח</th>
            <th>איש קשר</th>
            <th>פרטי התקשרות</th>
            <th>כתובת</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in store.rows"
            :key="row.id"
            class="client-row"
            @click="openQuickView(row)"
          >
            <td class="td-name">
              <span class="client-icon">🏢</span>
              <span class="client-name">{{ row.display_name }}</span>
            </td>
            <td class="td-contact">
              <span v-if="row.contact_person" class="contact-person">
                <span class="person-icon">👤</span> {{ row.contact_person }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="td-contact-info">
              <div v-if="row.email" class="contact-line">
                <span class="contact-icon">✉</span> {{ row.email }}
              </div>
              <div v-if="row.phone" class="contact-line">
                <span class="contact-icon">📞</span> {{ row.phone }}
              </div>
              <span v-if="!row.email && !row.phone" class="muted">—</span>
            </td>
            <td class="td-address">
              <span v-if="row.address">{{ row.address }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td class="td-actions" @click.stop>
              <div class="kebab-wrap">
                <button
                  :class="{ 'kebab-btn--open': openKebab === row.id }"
                  class="kebab-btn"
                  title="פעולות"
                  @click="toggleKebab(row.id)"
                >⋮</button>
                <div v-if="openKebab === row.id" class="kebab-menu">
                  <button class="kebab-item" @click="openEdit(row); openKebab = null">✏️ ערוך</button>
                  <button class="kebab-item kebab-item--danger" @click="doDelete(row); openKebab = null">🗑 מחק</button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="store.loading" class="empty">טוען...</div>
      <div v-else class="empty">
        <p>אין לקוחות להצגה</p>
        <button class="btn btn--primary" style="margin-top:12px" @click="showCreate = true">+ צור לקוח ראשון</button>
      </div>
    </div>

    <!-- Pagination info -->
    <div v-if="store.rows.length" class="pagination-info">
      מציג 1–{{ store.rows.length }} מתוך {{ store.total }} לקוחות
    </div>

    <!-- ── Quick-view modal ──────────────────────────────────────────────── -->
    <n-modal v-model:show="showQuickViewModal" :mask-closable="true" preset="card" style="width:640px;max-width:95vw">
      <template #header>
        <h2 class="qv-title">{{ quickViewClient?.display_name }}</h2>
      </template>
      <div v-if="quickViewClient" class="qv-body">
        <!-- Left: contact persons -->
        <div class="qv-left">
          <div class="qv-section-title">אנשי קשר ופרטי תקשורת</div>
          <div class="qv-contact-card">
            <div class="qv-contact-badge">ראשי</div>
            <div class="qv-contact-info">
              <div class="qv-contact-name">
                <span class="person-icon">👤</span>
                {{ quickViewClient.contact_person || quickViewClient.display_name }}
              </div>
              <div v-if="quickViewClient.phone" class="qv-contact-line">
                <span class="contact-icon">📞</span> {{ quickViewClient.phone }}
              </div>
              <div v-if="quickViewClient.email" class="qv-contact-line">
                <span class="contact-icon">✉</span> {{ quickViewClient.email }}
              </div>
            </div>
          </div>
          <div v-if="quickViewClient.address" class="qv-address-card">
            <div class="qv-section-title" style="margin-top:12px">כתובת</div>
            <div class="qv-address">
              <span class="contact-icon">📍</span> {{ quickViewClient.address }}
            </div>
          </div>
        </div>

        <!-- Right: stats -->
        <div class="qv-right">
          <div class="qv-section-title">תמונת מצב ביצועים</div>
          <div class="qv-stats">
            <div class="qv-stat">
              <span class="qv-stat__num qv-stat__num--orange">{{ qvStats.pending }}</span>
              <span class="qv-stat__label">↗ ממתינים</span>
            </div>
            <div class="qv-stat">
              <span class="qv-stat__num qv-stat__num--blue">{{ qvStats.approved }}</span>
              <span class="qv-stat__label">✓ אושרו</span>
            </div>
            <div class="qv-stat">
              <span class="qv-stat__num qv-stat__num--green">{{ qvStats.completed }}</span>
              <span class="qv-stat__label">✓ הושלמו</span>
            </div>
            <div class="qv-stat">
              <span class="qv-stat__num">{{ qvStats.total }}</span>
              <span class="qv-stat__label">↗ סה"כ תסקירים</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <n-button type="primary" @click="router.push(`/clients/${quickViewClient?.id}`)">פתח פרופיל לקוח</n-button>
          <div style="display:flex;gap:8px">
            <n-button ghost type="error" @click="showQuickViewModal = false; doDelete(quickViewClient!)">מחק</n-button>
            <n-button @click="showQuickViewModal = false">סגור</n-button>
          </div>
        </div>
      </template>
    </n-modal>

    <!-- ── Create / Edit modal ──────────────────────────────────────────── -->
    <n-modal
      v-model:show="showForm"
      :title="editingId ? 'עריכת לקוח' : 'לקוח חדש'"
      preset="dialog"
      style="width:500px"
    >
      <n-form label-placement="top">
        <n-form-item label="שם מלא / שם חברה" required>
          <n-input v-model:value="form.display_name" placeholder="ישראל ישראלי" />
        </n-form-item>
        <n-form-item label="סוג">
          <n-radio-group v-model:value="form.entity_type">
            <n-radio value="person">אדם פרטי</n-radio>
            <n-radio value="company">חברה</n-radio>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="איש קשר">
          <n-input v-model:value="form.contact_person" placeholder="שם איש הקשר" />
        </n-form-item>
        <n-form-item label="אימייל">
          <n-input v-model:value="form.email" placeholder="israel@example.com" />
        </n-form-item>
        <n-form-item label="טלפון">
          <n-input v-model:value="form.phone" placeholder="050-0000000" />
        </n-form-item>
        <n-form-item label="כתובת">
          <n-input v-model:value="form.address" placeholder="רחוב, עיר" />
        </n-form-item>
        <n-form-item label="מספר ת.ז / ח.פ">
          <n-input v-model:value="form.id_number" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showForm = false">ביטול</n-button>
        <n-button :loading="saving" type="primary" @click="doSave">
          {{ editingId ? 'שמור' : 'צור לקוח' }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {useRouter} from "vue-router";
import {NButton, NForm, NFormItem, NInput, NModal, NRadio, NRadioGroup, useMessage,} from "naive-ui";
import {useClientsStore} from "../stores/clients.js";
import {api} from "../services/apiService.js";
import {useConfirm} from "../composables/useConfirm.js";
import type {Client} from "@shared/types.js";

const store = useClientsStore();
const router = useRouter();
const message = useMessage();
const { confirm } = useConfirm();

// ── Search ────────────────────────────────────────────────────────────────────
const search = ref("");
let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.fetch({ q: search.value || undefined, limit: 200 }), 300);
}
function refresh() {
  store.fetch({ q: search.value || undefined, limit: 200 }, true);
}

onMounted(() => { if (!store.rows.length) store.fetch({ limit: 200 }); });

// ── Kebab menu ────────────────────────────────────────────────────────────────
const openKebab = ref<string | null>(null);
function toggleKebab(id: string) {
  openKebab.value = openKebab.value === id ? null : id;
}
// Close kebab when clicking outside
function onDocClick() { openKebab.value = null; }
onMounted(() => document.addEventListener("click", onDocClick));

// ── Quick-view modal ──────────────────────────────────────────────────────────
const showQuickViewModal = ref(false);
const quickViewClient = ref<Client & { contact_person?: string } | null>(null);
const qvStats = ref({ pending: 0, approved: 0, completed: 0, total: 0 });

async function openQuickView(row: Client) {
  quickViewClient.value = row as any;
  showQuickViewModal.value = true;
  // Fetch contract stats for this client
  try {
    const { rows } = await api.contracts.list({ clientId: String(row.id), limit: 500 });
    qvStats.value = {
      pending:   rows.filter(r => r.status === "active").length,
      approved:  rows.filter(r => r.status === "renewed").length,
      completed: rows.filter(r => r.status === "expired" || r.status === "cancelled").length,
      total:     rows.length,
    };
  } catch {
    qvStats.value = { pending: 0, approved: 0, completed: 0, total: 0 };
  }
}

// ── Create / Edit ─────────────────────────────────────────────────────────────
const showCreate = ref(false);
const showForm = computed({
  get: () => showCreate.value,
  set: (v) => { showCreate.value = v; if (!v) resetForm(); },
});
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref({
  display_name: "", entity_type: "person" as "person" | "company",
  contact_person: "", email: "", phone: "", address: "", id_number: "",
});

function resetForm() {
  editingId.value = null;
  form.value = { display_name: "", entity_type: "person", contact_person: "", email: "", phone: "", address: "", id_number: "" };
}

function openEdit(row: Client) {
  editingId.value = String(row.id);
  form.value = {
    display_name: row.display_name,
    entity_type:  row.entity_type,
    contact_person: (row as any).contact_person ?? "",
    email:        row.email ?? "",
    phone:        row.phone ?? "",
    address:      row.address ?? "",
    id_number:    row.id_number ?? "",
  };
  showCreate.value = true;
}

async function doSave() {
  if (!form.value.display_name.trim()) { message.warning("יש להזין שם"); return; }
  saving.value = true;
  try {
    if (editingId.value) {
      await store.update(editingId.value, form.value);
      message.success("הלקוח עודכן");
    } else {
      const created = await store.create(form.value);
      message.success(`לקוח "${created.display_name}" נוצר`);
    }
    showCreate.value = false;
    resetForm();
    refresh();
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

function doDelete(row: Client) {
  confirm({
    title: "מחיקת לקוח",
    content: `למחוק את "${row.display_name}"?`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await store.remove(String(row.id));
        message.success("הלקוח נמחק");
        refresh();
      } catch {
        message.error("שגיאה במחיקה");
      }
    },
  });
}
</script>

<style scoped>
/* ── Page header ─────────────────────────────────────────────────────────── */
.page__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 12px;
}
.page__head-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page__title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.3px;
}
.count-badge {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.page__actions { display: flex; gap: 8px; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
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
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
  font-family: inherit;
}
.btn:hover { background: var(--bg-hover); }
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: #fff;
  font-weight: 600;
}
.btn--primary:hover { filter: brightness(1.08); }
.btn--ghost { background: transparent; }

/* ── Search ──────────────────────────────────────────────────────────────── */
.search-wrap {
  position: relative;
  margin-bottom: 16px;
}
.search-icon {
  position: absolute;
  left: auto;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  pointer-events: none;
  color: var(--text-muted);
}
.search {
  width: 100%;
  padding: 10px 40px 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
  direction: rtl;
  box-sizing: border-box;
}
.search:focus { border-color: var(--brand-color); outline: none; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.table-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}
.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  direction: rtl;
}
.clients-table th {
  text-align: right;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
.client-row td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.client-row:last-child td { border-bottom: none; }
.client-row {
  cursor: pointer;
  transition: background 0.12s;
}
.client-row:hover { background: var(--bg-hover); }

.td-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}
.client-icon { font-size: 14px; color: var(--text-muted); }
.client-name { font-size: 13px; }

.td-contact { color: var(--text-secondary); }
.contact-person { display: flex; align-items: center; gap: 5px; }
.person-icon { font-size: 12px; }

.td-contact-info { color: var(--text-secondary); }
.contact-line { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; font-size: 12px; }
.contact-icon { font-size: 11px; }

.td-address { color: var(--text-secondary); font-size: 12px; }

.muted { color: var(--text-muted); font-size: 12px; }

/* ── Kebab menu ──────────────────────────────────────────────────────────── */
.td-actions { width: 40px; padding: 0 8px !important; }
.kebab-wrap { position: relative; }
.kebab-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.kebab-btn:hover, .kebab-btn--open {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.kebab-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,.15));
  min-width: 130px;
  z-index: 50;
  overflow: hidden;
}
.kebab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: right;
  font-family: inherit;
  transition: background 0.12s;
}
.kebab-item:hover { background: var(--bg-hover); }
.kebab-item--danger { color: var(--color-error, #d03050); }
.kebab-item--danger:hover { background: rgba(208, 48, 80, 0.08); }

/* ── Pagination info ─────────────────────────────────────────────────────── */
.pagination-info {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 10px;
  text-align: start;
}

/* ── Empty ───────────────────────────────────────────────────────────────── */
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

/* ── Quick-view modal ────────────────────────────────────────────────────── */
.qv-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.qv-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  direction: rtl;
}
.qv-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.qv-contact-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.qv-contact-badge {
  background: var(--brand-color);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}
.qv-contact-info { flex: 1; }
.qv-contact-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.qv-contact-line {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}
.qv-address-card { margin-top: 8px; }
.qv-address {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Stats side */
.qv-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.qv-stat {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.qv-stat__num {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.qv-stat__num--orange { color: #f0a020; }
.qv-stat__num--blue   { color: #2080f0; }
.qv-stat__num--green  { color: var(--brand-color); }
.qv-stat__label {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
}

/* refresh spin */
.refresh-icon { display: inline-block; font-size: 15px; transition: transform 0.4s; }
.refresh-icon--spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
