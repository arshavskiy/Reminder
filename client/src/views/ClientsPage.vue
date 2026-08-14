<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div class="page__head-title">
        <h1 class="page__title">הלקוחות שלי</h1>
        <span class="count-badge">{{ store.total }}</span>
      </div>
      <div class="page__actions">
        <n-button :loading="store.loading" @click="refresh">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          רענן
        </n-button>
        <n-button v-if="store.rows.length" type="error" quaternary @click="doDeleteAll">
          <template #icon><n-icon :component="TrashOutline" /></template>
          מחק הכל
        </n-button>
        <n-button type="primary" @click="showCreate = true">
          <template #icon><n-icon :component="AddOutline" /></template>
          צור לקוח
        </n-button>
      </div>
    </header>

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
        :scroll-x="1190"
        class="clients-data-table"
        dir="rtl"
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
          <n-input v-model:value="form.email" placeholder="israel@example.com" />
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
  NSpace,
  useMessage
} from "naive-ui";
import {
  AddOutline,
  BusinessOutline,
  CreateOutline,
  PersonOutline,
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {useClientsStore} from "../stores/clients.js";
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

onMounted(() => { store.fetch({ limit: 200 }, true); });

const columns: DataTableColumns<Client> = [
  {
    title: "שם הלקוח",
    key: "display_name",
    align: "right",
    titleAlign: "right",
    width: 300,
    minWidth: 300,
    render(row) {
      return h("div", { class: "client-main-cell" }, [
        h("span", { class: "client-avatar" }, [
          h(NIcon, { component: row.entity_type === "company" ? BusinessOutline : PersonOutline }),
        ]),
        h("div", { class: "client-main-cell__copy" }, [
          h("strong", displayClientName(row.display_name)),
          h("small", entityTypeLabel(row.entity_type)),
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
  {
    title: "",
    key: "actions",
    align: "left",
    titleAlign: "left",
    width: 132,
    render(row) {
      return h(
        NSpace,
        { justify: "end", size: 8, onClick: (event: MouseEvent) => event.stopPropagation() },
        {
          default: () => [
            h(NButton, { size: "small", quaternary: true, onClick: () => openEdit(row) }, {
              icon: () => h(NIcon, { component: CreateOutline }),
              default: () => "ערוך",
            }),
            h(NButton, { size: "small", quaternary: true, type: "error", onClick: () => doDelete(row) }, {
              icon: () => h(NIcon, { component: TrashOutline }),
              default: () => "מחק",
            }),
          ],
        },
      );
    },
  },
];

function rowProps(row: Client) {
  return {
    class: "client-row",
    onClick: () => router.push(`/clients/${row.id}`),
  };
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

function entityTypeLabel(value: Client["entity_type"]) {
  return value === "company" ? "חברה" : "אדם פרטי";
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
  font-size: 24px;
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
.clients-data-table :deep(td:last-child) {
  text-align: left;
}
.clients-data-table :deep(.client-row) {
  cursor: pointer;
  transition: background 0.12s;
}
.clients-data-table :deep(.client-row:hover td) { background: var(--bg-hover); }

.client-main-cell {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.client-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--brand-color);
  font-size: 18px;
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

.client-main-cell__copy small {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.3;
}

.client-text-cell {
  color: var(--text-primary);
  font-weight: 600;
}

.client-email-cell {
  direction: ltr;
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
  .page__head {
    align-items: stretch;
    flex-direction: column;
  }

  .page__title {
    font-size: 22px;
  }

  .page__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .page__actions :deep(.n-button) {
    justify-content: center;
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

@media (max-width: 420px) {
  .page__actions {
    grid-template-columns: 1fr;
  }

}
</style>
