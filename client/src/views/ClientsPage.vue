<template>
  <div class="clients-page" dir="rtl">
    <PageHeader
      :count="store.total"
      title="לקוחות"
      subtitle="צפייה, סינון וניהול של כל הלקוחות במערכת"
    >
      <template #actions>
        <div class="clients-actions">
          <button :disabled="store.loading" class="btn btn--ghost" type="button" @click="refresh">
            <n-icon :class="{ 'spin': store.loading }" :component="RefreshOutline" class="btn-icon" />
            רענן
          </button>
          <button
            class="btn btn--ghost"
            :class="{ 'btn--ghost-active': bulkMode }"
            type="button"
            @click="toggleBulkMode"
          >
            <n-icon :component="CheckboxOutline" class="btn-icon" />
            בחירה
          </button>
          <button
            v-if="store.rows.length"
            class="btn btn--danger-ghost"
            type="button"
            @click="doDeleteAll"
          >
            <n-icon :component="TrashOutline" class="btn-icon" />
            מחק הכל
          </button>
          <button class="btn btn--primary" type="button" @click="openCreate">
            <n-icon :component="AddOutline" class="btn-icon" />
            לקוח חדש
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="clients-toolbar">
      <n-input
        v-model:value="search"
        clearable
        class="clients-toolbar__search"
        placeholder="חיפוש לפי שם, איש קשר או אימייל..."
        @update:value="onSearch"
      >
        <template #prefix><n-icon :component="SearchOutline" :size="16" /></template>
      </n-input>

      <div class="clients-filters">
        <button
          v-for="f in typeFilters"
          :key="f.value"
          class="pill"
          :class="{ 'pill--active': entityFilter === f.value }"
          type="button"
          @click="entityFilter = f.value"
        >
          {{ f.label }}
          <span class="pill__badge">{{ f.count }}</span>
        </button>
      </div>
      <button
        v-if="store.rows.length >= 2"
        class="btn btn--ghost"
        type="button"
        @click="openClientMergeModal"
      >
        <n-icon :component="BriefcaseOutline" class="btn-icon" />
        מזג לקוחות
      </button>
    </div>

    <!-- Bulk bar -->
    <div v-if="bulkMode && selectedClientKeys.length" class="bulk-bar">
      <span class="bulk-bar__label">נבחרו {{ selectedClientKeys.length }}</span>
      <button
        v-if="selectedClientKeys.length >= 2"
        class="btn btn--ghost btn--xs"
        type="button"
        @click="openClientMergeModal"
      >
        <n-icon :component="BriefcaseOutline" :size="14" class="btn-icon" />
        מזג נבחרים
      </button>
      <button class="btn btn--danger-ghost btn--xs" type="button" @click="bulkDeleteSelected">
        <n-icon :component="TrashOutline" :size="14" class="btn-icon" />
        מחק נבחרים
      </button>
      <button class="btn btn--ghost btn--xs" type="button" @click="selectedClientKeys = []">
        נקה בחירה
      </button>
    </div>

    <!-- List -->
    <n-spin :show="store.loading">
      <div v-if="filteredRows.length" class="clients-table-wrap">
        <table class="clients-table">
          <thead>
            <tr>
              <th v-if="bulkMode" class="col-check">
                <n-checkbox
                  :checked="allVisibleSelected"
                  :indeterminate="someVisibleSelected && !allVisibleSelected"
                  @update:checked="toggleSelectAll"
                />
              </th>
              <th class="col-name">
                <button class="th-sort" type="button" @click="toggleSort('display_name')">
                  שם הלקוח
                  <span class="th-sort__mark">{{ sortMark('display_name') }}</span>
                </button>
              </th>
              <th class="col-contact">
                <button class="th-sort" type="button" @click="toggleSort('contact_person')">
                  איש קשר
                  <span class="th-sort__mark">{{ sortMark('contact_person') }}</span>
                </button>
              </th>
              <th class="col-email">
                <button class="th-sort" type="button" @click="toggleSort('email')">
                  אימייל
                  <span class="th-sort__mark">{{ sortMark('email') }}</span>
                </button>
              </th>
              <th class="col-phone">
                <button class="th-sort" type="button" @click="toggleSort('phone')">
                  נייד
                  <span class="th-sort__mark">{{ sortMark('phone') }}</span>
                </button>
              </th>
              <th class="col-docs">
                <button class="th-sort" type="button" @click="toggleSort('doc_count')">
                  מסמכים
                  <span class="th-sort__mark">{{ sortMark('doc_count') }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.id"
              class="clients-row"
              :class="{ 'clients-row--selected': selectedClientKeys.includes(row.id) }"
              @click="onRowClick(row, $event)"
            >
              <td v-if="bulkMode" class="col-check" @click.stop>
                <n-checkbox
                  :checked="selectedClientKeys.includes(row.id)"
                  @update:checked="() => toggleClientSelection(row)"
                />
              </td>
              <td class="col-name">
                <div class="client-name">
                  <span class="client-avatar" :class="`client-avatar--${row.entity_type}`">
                    <n-icon
                      :component="row.entity_type === 'company' ? BusinessOutline : PersonOutline"
                      :size="14"
                    />
                  </span>
                  <div class="client-name__meta">
                    <strong class="client-name__title" :title="displayClientName(row.display_name)">
                      {{ displayClientName(row.display_name) }}
                    </strong>
                    <span class="client-type">{{ row.entity_type === 'company' ? 'חברה' : 'פרטי' }}</span>
                  </div>
                </div>
              </td>
              <td class="col-contact">
                <span :class="row.contact_person ? '' : 'muted'" :title="row.contact_person || undefined">
                  {{ row.contact_person || "—" }}
                </span>
              </td>
              <td class="col-email">
                <span
                  class="ltr"
                  :class="row.email ? '' : 'muted'"
                  :title="row.email || undefined"
                >{{ row.email || "—" }}</span>
              </td>
              <td class="col-phone">
                <span
                  v-if="row.mobile || row.phone"
                  class="ltr"
                  :title="row.mobile || row.phone || undefined"
                >{{ row.mobile || row.phone }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-docs">
                <span class="ltr">{{ row.doc_count ?? 0 }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="!store.loading" class="clients-empty">
        <n-icon :component="PeopleOutline" :size="40" class="clients-empty__icon" />
        <h3 class="clients-empty__title">{{ search || entityFilter !== 'all' ? 'לא נמצאו לקוחות' : 'אין לקוחות עדיין' }}</h3>
        <p class="clients-empty__desc">
          {{ search || entityFilter !== 'all' ? 'נסו לשנות את החיפוש או הסינון' : 'צרו לקוח ראשון כדי להתחיל' }}
        </p>
        <button v-if="!search && entityFilter === 'all'" class="btn btn--primary" type="button" @click="openCreate">
          <n-icon :component="AddOutline" class="btn-icon" />
          צור לקוח ראשון
        </button>
      </div>
    </n-spin>

    <p v-if="filteredRows.length" class="clients-foot">
      מציג {{ filteredRows.length }} מתוך {{ store.total }} לקוחות
    </p>

    <!-- Create / Edit -->
    <n-modal
      v-model:show="showForm"
      preset="card"
      :title="editingId ? 'עריכת לקוח' : 'לקוח חדש'"
      class="client-form-modal"
      style="width: min(560px, 94vw)"
      :mask-closable="!saving"
    >
      <n-form label-placement="top" class="client-form">
        <n-form-item label="שם מלא / שם חברה" required>
          <n-input v-model:value="form.display_name" placeholder="ישראל ישראלי / חברת דוגמה בע״מ" />
        </n-form-item>
        <n-form-item label="סוג">
          <n-radio-group v-model:value="form.entity_type">
            <n-radio-button value="person">אדם פרטי</n-radio-button>
            <n-radio-button value="company">חברה</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <div class="client-form__grid">
          <n-form-item label="איש קשר">
            <n-input v-model:value="form.contact_person" placeholder="שם איש הקשר" />
          </n-form-item>
          <n-form-item label="מספר ת.ז / ח.פ">
            <n-input v-model:value="form.id_number" dir="ltr" />
          </n-form-item>
          <n-form-item label="אימייל">
            <n-input v-model:value="form.email" dir="ltr" placeholder="israel@example.com" />
          </n-form-item>
          <n-form-item label="טלפון">
            <n-input v-model:value="form.phone" placeholder="02-0000000" />
          </n-form-item>
          <n-form-item label="נייד">
            <n-input v-model:value="form.mobile" placeholder="050-0000000" />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div class="client-form__footer">
          <n-button :disabled="saving" @click="showForm = false">ביטול</n-button>
          <n-button :loading="saving" type="primary" @click="doSave">
            {{ editingId ? 'שמור שינויים' : 'צור לקוח' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="mergeModal.show"
      preset="card"
      title="מיזוג לקוחות"
      class="client-merge-modal"
      :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="client-merge-form" dir="rtl">
        <label class="client-merge-label">
          לקוחות למיזוג
          <n-select
            v-model:value="mergeModal.sourceIds"
            :options="clientMergeOptions"
            clearable
            filterable
            multiple
            max-tag-count="responsive"
            placeholder="בחר לקוחות"
          />
        </label>
        <label class="client-merge-label">
          לקוח מאוחד
          <n-select
            v-model:value="mergeModal.canonicalId"
            :options="canonicalMergeOptions"
            clearable
            filterable
            placeholder="בחר את הלקוח שישאר"
          />
        </label>
        <p class="client-merge-hint">
          כל המסמכים, החוזים והתזכורות של הלקוחות שנבחרו יועברו ללקוח המאוחד. הלקוחות האחרים יימחקו.
        </p>
        <div class="client-merge-actions">
          <n-button @click="mergeModal.show = false">ביטול</n-button>
          <n-button
            type="primary"
            :loading="mergeModal.saving"
            :disabled="mergeModal.sourceIds.length < 2 || !mergeModal.canonicalId"
            @click="saveClientMerge"
          >
            מזג ושמור
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin,
  useMessage,
  type SelectOption,
} from "naive-ui";
import {
  AddOutline,
  BriefcaseOutline,
  BusinessOutline,
  CheckboxOutline,
  PeopleOutline,
  PersonOutline,
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { useClientsStore } from "../stores/clients.js";
import { useConfirm } from "../composables/useConfirm.js";
import PageHeader from "../components/PageHeader.vue";
import { api } from "../services/apiService.js";
import type { Client } from "@shared/types.js";

const store = useClientsStore();
const router = useRouter();
const message = useMessage();
const { confirm } = useConfirm();

const search = ref("");
let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.fetch({ q: search.value || undefined, limit: 200 }), 300);
}
function refresh() {
  return store.fetch({ q: search.value || undefined, limit: 200 }, true);
}

onMounted(() => {
  store.fetch({ limit: 200 }, true);
});

type EntityFilter = "all" | "person" | "company";
const entityFilter = ref<EntityFilter>("all");

type ClientSortKey = "display_name" | "contact_person" | "email" | "phone" | "doc_count";
const sortKey = ref<ClientSortKey>("display_name");
const sortDir = ref<"asc" | "desc">("asc");

function clientSortValue(row: Client, key: ClientSortKey): string | number {
  if (key === "doc_count") return Number(row.doc_count ?? 0);
  if (key === "phone") return String(row.mobile || row.phone || "").trim().toLowerCase();
  if (key === "display_name") return displayClientName(row.display_name).toLowerCase();
  return String(row[key] ?? "").trim().toLowerCase();
}

function toggleSort(key: ClientSortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = key;
  sortDir.value = key === "doc_count" ? "desc" : "asc";
}

function sortMark(key: ClientSortKey): string {
  if (sortKey.value !== key) return "↕";
  return sortDir.value === "asc" ? "↑" : "↓";
}

const filteredRows = computed(() => {
  const rows = entityFilter.value === "all"
      ? [...store.rows]
      : store.rows.filter((r) => r.entity_type === entityFilter.value);
  const dir = sortDir.value === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = clientSortValue(a, sortKey.value);
    const bv = clientSortValue(b, sortKey.value);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), "he") * dir;
  });
  return rows;
});

const typeFilters = computed(() => {
  const person = store.rows.filter((r) => r.entity_type === "person").length;
  const company = store.rows.filter((r) => r.entity_type === "company").length;
  return [
    { value: "all" as const, label: "הכל", count: store.rows.length },
    { value: "person" as const, label: "פרטי", count: person },
    { value: "company" as const, label: "חברה", count: company },
  ];
});

const bulkMode = ref(false);
const selectedClientKeys = ref<Array<string | number>>([]);

const allVisibleSelected = computed(
  () =>
    filteredRows.value.length > 0 &&
    filteredRows.value.every((r) => selectedClientKeys.value.includes(r.id)),
);
const someVisibleSelected = computed(() =>
  filteredRows.value.some((r) => selectedClientKeys.value.includes(r.id)),
);

function toggleSelectAll(checked: boolean) {
  if (checked) {
    const ids = new Set(selectedClientKeys.value);
    for (const r of filteredRows.value) ids.add(r.id);
    selectedClientKeys.value = [...ids];
  } else {
    const visible = new Set(filteredRows.value.map((r) => r.id));
    selectedClientKeys.value = selectedClientKeys.value.filter((id) => !visible.has(String(id)) && !visible.has(Number(id)));
  }
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedClientKeys.value = [];
}

function toggleClientSelection(row: Client) {
  const selected = new Set(selectedClientKeys.value);
  if (selected.has(row.id)) selected.delete(row.id);
  else selected.add(row.id);
  selectedClientKeys.value = [...selected];
}

function selectedClients() {
  const selected = new Set(selectedClientKeys.value.map(String));
  return store.rows.filter((row) => selected.has(String(row.id)));
}

const mergeModal = reactive({
  show: false,
  sourceIds: [] as string[],
  canonicalId: null as string | null,
  saving: false,
});

const clientMergeOptions = computed<SelectOption[]>(() =>
  store.rows.map((row) => ({
    label: displayClientName(row.display_name),
    value: String(row.id),
  })),
);

const canonicalMergeOptions = computed<SelectOption[]>(() => {
  const selected = new Set(mergeModal.sourceIds);
  return clientMergeOptions.value.filter((option) => selected.has(String(option.value)));
});

watch(
  () => mergeModal.sourceIds.join("|"),
  () => {
    if (!mergeModal.sourceIds.includes(String(mergeModal.canonicalId ?? ""))) {
      mergeModal.canonicalId = mergeModal.sourceIds[0] ?? null;
    }
  },
);

async function openClientMergeModal() {
  const selected = selectedClients().map((row) => String(row.id));
  if (store.total > store.rows.length) {
    await store.fetch({ limit: Math.max(store.total, 2000) });
  }
  mergeModal.sourceIds = selected.length >= 2 ? selected : [];
  mergeModal.canonicalId = mergeModal.sourceIds[0] ?? null;
  mergeModal.show = true;
}

async function saveClientMerge() {
  const sourceIds = [...new Set(mergeModal.sourceIds.map((id) => String(id).trim()).filter(Boolean))];
  const canonicalId = String(mergeModal.canonicalId ?? "").trim();
  if (sourceIds.length < 2 || !canonicalId) return;
  mergeModal.saving = true;
  try {
    const result = await api.clients.merge({ sourceIds, canonicalId });
    mergeModal.show = false;
    selectedClientKeys.value = selectedClientKeys.value.filter((id) => String(id) === result.kept);
    message.success(`${result.merged + 1} לקוחות מוזגו תחת ${result.clientName || "הלקוח המאוחד"}`);
    await refresh();
  } catch {
    message.error("שגיאה במיזוג לקוחות");
  } finally {
    mergeModal.saving = false;
  }
}

function onRowClick(row: Client, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a, .n-checkbox, .col-check")) return;
  if (bulkMode.value) {
    toggleClientSelection(row);
    return;
  }
  goDetail(row);
}

function goDetail(row: Client) {
  router.push(`/clients/${row.id}`);
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

const showCreate = ref(false);
const showForm = computed({
  get: () => showCreate.value,
  set: (v) => {
    showCreate.value = v;
    if (!v) resetForm();
  },
});
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref({
  display_name: "",
  entity_type: "person" as "person" | "company",
  contact_person: "",
  email: "",
  phone: "",
  mobile: "",
  id_number: "",
});

function resetForm() {
  editingId.value = null;
  form.value = {
    display_name: "",
    entity_type: "person",
    contact_person: "",
    email: "",
    phone: "",
    mobile: "",
    id_number: "",
  };
}

function openCreate() {
  resetForm();
  showCreate.value = true;
}

function openEdit(row: Client) {
  editingId.value = String(row.id);
  form.value = {
    display_name: row.display_name,
    entity_type: row.entity_type,
    contact_person: row.contact_person ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    mobile: row.mobile ?? "",
    id_number: row.id_number ?? "",
  };
  showCreate.value = true;
}

async function doSave() {
  if (!form.value.display_name.trim()) {
    message.warning("יש להזין שם");
    return;
  }
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
.clients-page {
  margin: 0 auto;
  padding: 0 4px 32px;
}

.clients-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.clients-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.clients-toolbar__search {
  flex: 1 1 260px;
  max-width: 420px;
}

.clients-toolbar__search :deep(.n-input__input-el) {
  direction: rtl;
}

.clients-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.client-merge-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.client-merge-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.client-merge-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.client-merge-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pill--active {
  border-color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  color: var(--brand-color);
}

.pill__badge {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.pill--active .pill__badge {
  background: color-mix(in srgb, var(--brand-color) 18%, transparent);
  color: var(--brand-color);
}

.bulk-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand-color) 8%, var(--bg-card));
}

.bulk-bar__label {
  margin-inline-end: auto;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.clients-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  overflow: auto;
  max-height: min(70vh, 720px);
}

.clients-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.clients-table th,
.clients-table td {
  padding: 8px 10px;
  text-align: right;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  line-height: 1.35;
}

.clients-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.th-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.th-sort:hover {
  color: var(--text-primary);
}

.th-sort__mark {
  font-size: 10px;
  opacity: 0.7;
}

.clients-table tbody tr:last-child td {
  border-bottom: none;
}

.clients-row {
  cursor: pointer;
  transition: background 0.12s;
}

.clients-row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.clients-row--selected td {
  background: color-mix(in srgb, var(--brand-color) 9%, var(--bg-card));
}

.col-check {
  width: 44px;
}

.col-name {
  width: 30%;
}

.col-contact {
  width: 16%;
}

.col-email {
  width: 24%;
}

.col-phone {
  width: 16%;
}

.col-docs {
  width: 10%;
  text-align: center;
}

.col-name,
.col-contact,
.col-email,
.col-phone,
.col-docs {
  overflow: hidden;
}

.client-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.client-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.client-avatar--company {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
}

.client-avatar--person {
  background: color-mix(in srgb, #2080f0 14%, transparent);
  color: #2080f0;
}

.client-name__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.client-name__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.client-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.col-contact span,
.col-email span,
.col-docs span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ltr {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: right;
}

.phone-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.phone-stack span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.phone-stack__mobile {
  font-weight: 500;
  color: var(--text-muted);
}

.muted {
  color: var(--text-muted);
  font-weight: 500;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  padding: 2px;
  min-width: 28px;
  min-height: 28px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

.clients-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 64px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  text-align: center;
}

.clients-empty__icon {
  color: var(--brand-color);
  opacity: 0.7;
  margin-bottom: 4px;
}

.clients-empty__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.clients-empty__desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.clients-foot {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.client-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.client-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .col-contact {
    display: none;
  }

  .col-name {
    width: 40%;
  }

  .col-email {
    width: 28%;
  }

  .col-phone {
    width: 18%;
  }

  .col-docs {
    width: 14%;
  }
}

@media (max-width: 640px) {
  .clients-actions,
  .clients-actions .btn {
    width: 100%;
  }

  .clients-toolbar__search {
    max-width: none;
    flex-basis: 100%;
  }

  .client-form__grid {
    grid-template-columns: 1fr;
  }

  .col-email,
  .col-phone {
    display: none;
  }

  .col-name {
    width: auto;
  }

  .col-docs {
    width: 72px;
  }
}
</style>
