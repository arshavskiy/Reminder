<template>
  <div class="page2">
    <PageHeader :count="store.total" title="הלקוחות שלי">
      <template #breadcrumb>
        <router-link to="/">לוח שנה</router-link>
        <span class="sep">/</span>
        <span>לקוחות</span>
      </template>
      <template #actions>
        <div class="clients-actions">
          <button :disabled="store.loading" class="rbtn rbtn--ghost" @click="refresh">
            <n-icon :class="{ 'refresh-icon--spin': store.loading }" :component="RefreshOutline" class="btn-icon"/>
            רענן
          </button>
          <button class="rbtn rbtn--primary" type="button" @click="showCreate = true">
            <n-icon :component="AddOutline" class="btn-icon"/>
            צור לקוח
          </button>
          <button v-if="store.rows.length" class="rbtn rbtn--danger" type="button" @click="doDeleteAll">
            <n-icon :component="TrashOutline" class="btn-icon"/>
            מחק הכל
          </button>
          <div v-if="store.rows.length" class="bulk-action-anchor">
            <button
                :class="{ 'rbtn--ghost-active': bulkMode }"
                class="rbtn rbtn--ghost"
                title="בחירה מרובה"
                type="button"
                @click="toggleBulkMode"
            >
              <n-icon :component="CheckboxOutline" class="btn-icon"/>
              בחירה מרובה
              <span v-if="selectedClientKeys.length">({{ selectedClientKeys.length }})</span>
            </button>
            <div v-if="bulkMode && selectedClientKeys.length > 0" class="bulk-action-anchor__actions">
              <button class="bulk-action-item bulk-action-item--danger" type="button" @click="bulkDeleteSelected">
                <n-icon :component="TrashOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">מחק נבחרים</span>
                <span class="bulk-action-item__count">{{ selectedClientKeys.length }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </PageHeader>

    <!-- ── Search ───────────────────────────────────────────────────────── -->
    <n-input
      v-model:value="search"
      clearable
      class="client-search"
      placeholder="חיפוש לפי שם לקוח, איש קשר או אימייל..."
      @update:value="onSearch"
    >
      <template #prefix><n-icon :component="SearchOutline" /></template>
    </n-input>

    <!-- ── Table ─────────────────────────────────────────────────────────── -->
    <div class="table-wrap">
      <n-data-table
        v-if="store.rows.length"
        :bordered="false"
        :columns="columns"
        :data="store.rows"
        :loading="store.loading"
        :pagination="false"
        :row-key="(row: Client) => row.id"
        :row-props="rowProps"
        :checked-row-keys="selectedClientKeys"
        :scroll-x="bulkMode ? 1116 : 1070"
        class="clients-data-table"
        dir="rtl"
        @update:checked-row-keys="onSelectedClientKeys"
      />

      <n-empty v-else-if="store.loading" description="טוען..." class="empty-state" />
      <n-empty v-else description="אין לקוחות להצגה" class="empty-state">
        <template #extra>
          <n-button type="primary" @click="showCreate = true">
            <template #icon><n-icon :component="AddOutline" /></template>
            צור לקוח ראשון
          </n-button>
        </template>
      </n-empty>
    </div>

    <!-- Pagination info -->
    <div v-if="store.rows.length" class="pagination-info">
      מציג 1–{{ store.rows.length }} מתוך {{ store.total }} לקוחות
    </div>

    <!-- ── Create / Edit modal ──────────────────────────────────────────── -->
    <n-modal
      v-model:show="showForm"
      :title="editingId ? 'עריכת לקוח' : 'לקוח חדש'"
      :show-icon="false"
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
          <n-input v-model:value="form.email" class="email-ltr" dir="ltr" placeholder="israel@example.com" />
        </n-form-item>
        <n-form-item label="טלפון">
          <n-input v-model:value="form.phone" placeholder="050-0000000" />
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
import {computed, h, onMounted, ref} from "vue";
import {useRouter} from "vue-router";
import {
  type DataTableColumns,
  NButton,
  NDataTable,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
  useMessage
} from "naive-ui";
import {AddOutline, CheckboxOutline, RefreshOutline, SearchOutline, TrashOutline,} from "@vicons/ionicons5";
import {useClientsStore} from "../stores/clients.js";
import {useConfirm} from "../composables/useConfirm.js";
import PageHeader from "../components/PageHeader.vue";
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

onMounted(() => { store.fetch({ limit: 200 }, true); });

const bulkMode = ref(false);
const selectedClientKeys = ref<Array<string | number>>([]);

const baseColumns: DataTableColumns<Client> = [
  {
    title: "שם הלקוח",
    key: "display_name",
    align: "right",
    titleAlign: "right",
    width: 300,
    minWidth: 300,
    render(row) {
      return h("div", { class: "client-main-cell" }, [
        h("div", { class: "client-main-cell__copy" }, [
          h("strong", displayClientName(row.display_name)),
        ]),
      ]);
    },
  },
  {
    title: "איש קשר",
    key: "contact_person",
    align: "right",
    titleAlign: "right",
    width: 190,
    minWidth: 190,
    render(row) {
      return row.contact_person
        ? h("span", { class: "client-text-cell" }, row.contact_person)
        : h("span", { class: "muted" }, "—");
    },
  },
  {
    title: "אימייל",
    key: "email",
    align: "right",
    titleAlign: "right",
    width: 260,
    minWidth: 260,
    render(row) {
      return row.email
        ? h("span", { class: "client-email-cell" }, row.email)
        : h("span", { class: "muted" }, "—");
    },
  },
  {
    title: "טלפון",
    key: "phone",
    align: "right",
    titleAlign: "right",
    width: 160,
    minWidth: 160,
    render(row) {
      return row.phone
        ? h("span", { class: "client-phone-cell" }, row.phone)
        : h("span", { class: "muted" }, "—");
    },
  },
  {
    title: "מספר מזהה",
    key: "id_number",
    align: "right",
    titleAlign: "right",
    width: 160,
    minWidth: 160,
    render(row) {
      return row.id_number
        ? h("span", { class: "client-id-cell" }, row.id_number)
        : h("span", { class: "muted" }, "—");
    },
  },
];

const columns = computed<DataTableColumns<Client>>(() =>
  bulkMode.value
    ? [{ type: "selection", width: 46, fixed: "right" }, ...baseColumns]
    : baseColumns
);

function rowProps(row: Client) {
  return {
    class: `client-row${bulkMode.value ? " client-row--selectable" : ""}`,
    onClick: (event: MouseEvent) => {
      if (!bulkMode.value) {
        router.push(`/clients/${row.id}`);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, .n-checkbox")) return;
      toggleClientSelection(row);
    },
  };
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedClientKeys.value = [];
}

function onSelectedClientKeys(keys: Array<string | number>) {
  selectedClientKeys.value = keys;
}

function toggleClientSelection(row: Client) {
  const id = row.id;
  const selected = new Set(selectedClientKeys.value);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  selectedClientKeys.value = [...selected];
}

function selectedClients() {
  const selected = new Set(selectedClientKeys.value.map(String));
  return store.rows.filter((row) => selected.has(String(row.id)));
}

function displayClientName(value: string) {
  const spaced = value
    .replace(/([א-ת])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([א-ת])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const numericPrefix = spaced.match(/^(\d{3,4})\s+(.+[\u0590-\u05FF].*)$/);
  return numericPrefix ? `${numericPrefix[2].trim()} ${numericPrefix[1]}` : spaced;
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
  contact_person: "", email: "", phone: "", id_number: "",
});

function resetForm() {
  editingId.value = null;
  form.value = { display_name: "", entity_type: "person", contact_person: "", email: "", phone: "", id_number: "" };
}

function openEdit(row: Client) {
  editingId.value = String(row.id);
  form.value = {
    display_name: row.display_name,
    entity_type:  row.entity_type,
    contact_person: row.contact_person ?? "",
    email:        row.email ?? "",
    phone:        row.phone ?? "",
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

function doDeleteAll() {
  confirm({
    title: "מחיקת כל הלקוחות",
    content: `למחוק את כל ${store.total} הלקוחות? פעולה זו אינה הפיכה.`,
    confirmText: "מחק הכל",
    onConfirm: async () => {
      try {
        await store.removeAll();
        message.success("כל הלקוחות נמחקו");
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

function bulkDeleteSelected() {
  const rows = selectedClients();
  const count = rows.length;
  if (!count) return;
  confirm({
    title: "מחיקת לקוחות",
    content: `למחוק ${count} לקוחות נבחרים? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await Promise.all(rows.map((row) => store.remove(String(row.id))));
        message.success(`${count} לקוחות נמחקו`);
        selectedClientKeys.value = [];
        refresh();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}
</script>

<style scoped>
.clients-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--danger {
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.bulk-action-anchor {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.bulk-action-anchor > .rbtn {
  width: 100%;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.refresh-icon {
  display: inline-flex;
  line-height: 1;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Search ──────────────────────────────────────────────────────────────── */
.client-search {
  width: 100%;
  margin-bottom: 16px;
}
.client-search :deep(.n-input__input-el) { direction: rtl; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.table-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}
.clients-data-table {
  direction: rtl;
}
.clients-data-table :deep(.n-data-table-wrapper),
.clients-data-table :deep(.n-data-table-base-table),
.clients-data-table :deep(.n-data-table-table) {
  direction: rtl;
}
.clients-data-table :deep(th) {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
}
.clients-data-table :deep(.n-data-table-th__title) {
  justify-content: flex-start;
  width: 100%;
}
.clients-data-table :deep(td) {
  direction: rtl;
  text-align: right;
  vertical-align: middle;
}
.clients-data-table :deep(.client-row) {
  cursor: pointer;
  transition: background 0.12s;
}
.clients-data-table :deep(.client-row:hover td) { background: var(--bg-hover); }
.clients-data-table :deep(.client-row--selectable:hover td) {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.client-main-cell {
  display: block;
  align-items: center;
  min-width: 0;
}

.client-main-cell__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.client-main-cell__copy strong,
.client-text-cell,
.client-email-cell,
.client-phone-cell,
.client-id-cell {
  display: block;
  overflow: hidden;
  min-width: 0;
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-main-cell__copy strong {
  color: var(--text-primary);
  font-weight: 700;
}

.client-text-cell {
  color: var(--text-primary);
  font-weight: 600;
}

.client-email-cell {
  direction: ltr;
  unicode-bidi: isolate;
  color: var(--text-secondary);
  text-align: right;
}

.client-phone-cell,
.client-id-cell {
  direction: ltr;
  color: var(--text-secondary);
  text-align: right;
  font-weight: 600;
}

.muted { color: var(--text-muted); font-size: 12px; }

/* ── Pagination info ─────────────────────────────────────────────────────── */
.pagination-info {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 10px;
  text-align: start;
}

.empty-state {
  padding: 60px 20px;
}

@media (max-width: 720px) {
  .clients-actions,
  .rbtn {
    width: 100%;
  }

  .bulk-action-anchor {
    width: 100%;
  }

  .bulk-action-anchor__actions {
    right: auto;
    left: 0;
    min-width: 100%;
  }

  .pagination-info {
    text-align: center;
  }

  :deep(.n-dialog .n-dialog__action),
  :deep(.n-card__footer > div) {
    align-items: stretch !important;
    flex-direction: column-reverse;
    gap: 8px;
  }

  :deep(.n-card__footer .n-button) {
    width: 100%;
  }
}

</style>
