<template>
  <div class="clients-page" :dir="dir">
    <PageHeader
      :count="store.total"
      :title="l.clients.title"
      :subtitle="l.clients.subtitle"
    >
      <template #actions>
        <div class="clients-actions">
          <button :disabled="store.loading" class="btn btn--ghost" type="button" @click="refresh">
            <n-icon :class="{ 'spin': store.loading }" :component="RefreshOutline" class="btn-icon" />
            {{ l.common.refresh }}
          </button>
          <button
            class="btn btn--ghost"
            :class="{ 'btn--ghost-active': bulkMode }"
            type="button"
            @click="toggleBulkMode"
          >
            <n-icon :component="CheckboxOutline" class="btn-icon" />
            {{ l.common.select }}
          </button>
          <button class="btn btn--primary" type="button" @click="openCreate">
            <n-icon :component="AddOutline" class="btn-icon" />
            {{ l.clients.newClient }}
          </button>
          <n-tooltip v-if="canCreateInspection" :disabled="writesAllowed">
            <template #trigger>
              <span class="locked-action" @click="!writesAllowed && goToSubscription()">
                <button :disabled="!writesAllowed" class="btn btn--ghost" type="button" @click="openReportClientPicker">
                  <n-icon :component="DocumentTextOutline" class="btn-icon"/>
                  {{ l.clients.newInspection }}
                </button>
              </span>
            </template>
            {{ l.profile.upgradePlan }}
          </n-tooltip>
        </div>
      </template>
    </PageHeader>

    <n-modal
      v-model:show="showReportClientPicker"
      preset="dialog"
      :title="l.clients.newInspection"
      :positive-text="l.common.continue"
      :negative-text="l.common.cancel"
      :positive-button-props="{disabled: !reportClientId}"
      @positive-click="confirmReportClient"
      @negative-click="showReportClientPicker = false"
    >
      <n-select
        v-model:value="reportClientId"
        :options="reportClientOptions"
        filterable
        clearable
        :placeholder="l.clients.pickClient"
      />
    </n-modal>

    <!-- Filters -->
    <div class="clients-toolbar">
      <n-input
        v-model:value="search"
        clearable
        class="clients-toolbar__search"
        :placeholder="l.clients.searchPlaceholder"
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
        {{ l.clients.merge }}
      </button>
    </div>

    <!-- Bulk bar -->
    <div v-if="bulkMode && selectedClientKeys.length" class="bulk-bar">
      <span class="bulk-bar__label">{{ t("common.selectedCount", {n: selectedClientKeys.length}) }}</span>
      <button
        v-if="selectedClientKeys.length >= 2"
        class="btn btn--ghost btn--xs"
        type="button"
        @click="openClientMergeModal"
      >
        <n-icon :component="BriefcaseOutline" :size="14" class="btn-icon" />
        {{ l.common.mergeSelected }}
      </button>
      <button class="btn btn--danger-ghost btn--xs" type="button" @click="bulkDeleteSelected">
        <n-icon :component="TrashOutline" :size="14" class="btn-icon" />
        {{ l.common.deleteSelected }}
      </button>
      <button class="btn btn--ghost btn--xs" type="button" @click="selectedClientKeys = []">
        {{ l.common.clearSelection }}
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
                  {{ l.common.clientName }}
                  <n-icon :component="sortIcon('display_name')" :size="13" :title="sortTitle('display_name')" class="th-sort__mark" />
                </button>
              </th>
              <th class="col-contact">
                <button class="th-sort" type="button" @click="toggleSort('contact_person')">
                  {{ l.common.contact }}
                  <n-icon :component="sortIcon('contact_person')" :size="13" :title="sortTitle('contact_person')" class="th-sort__mark" />
                </button>
              </th>
              <th class="col-email">
                <button class="th-sort" type="button" @click="toggleSort('email')">
                  {{ l.common.email }}
                  <n-icon :component="sortIcon('email')" :size="13" :title="sortTitle('email')" class="th-sort__mark" />
                </button>
              </th>
              <th class="col-phone">
                <button class="th-sort" type="button" @click="toggleSort('phone')">
                  {{ l.common.phone }}
                  <n-icon :component="sortIcon('phone')" :size="13" :title="sortTitle('phone')" class="th-sort__mark" />
                </button>
              </th>
              <th class="col-docs">
                <button class="th-sort" type="button" @click="toggleSort('doc_count')">
                  {{ l.search.documents }}
                  <n-icon :component="sortIcon('doc_count')" :size="13" :title="sortTitle('doc_count')" class="th-sort__mark" />
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
                    <span class="client-type">{{ row.entity_type === 'company' ? l.common.company : l.common.person }}</span>
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
        <h3 class="clients-empty__title">{{ search || entityFilter !== 'all' ? l.clients.emptyFiltered : l.clients.emptyNone }}</h3>
        <p class="clients-empty__desc">
          {{ search || entityFilter !== 'all' ? l.clients.emptyFilteredHint : l.clients.emptyHint }}
        </p>
        <button v-if="!search && entityFilter === 'all'" class="btn btn--primary" type="button" @click="openCreate">
          <n-icon :component="AddOutline" class="btn-icon" />
          {{ l.clientsMsg.createFirst }}
        </button>
      </div>
    </n-spin>

    <div v-if="filteredRows.length" class="clients-foot">
      <span>{{ t("clientsMsg.showing", {shown: filteredRows.length, total: store.total}) }}</span>
      <span class="clients-foot__sum">{{ l.clientsMsg.totalDocs }} <b class="ltr">{{ visibleDocumentTotal }}</b></span>
    </div>

    <!-- Create / Edit -->
    <n-modal
      v-model:show="showForm"
      preset="card"
      :title="editingId ? l.clients.editClient : l.clients.newClient"
      class="client-form-modal"
      style="width: min(560px, 94vw)"
      :mask-closable="!saving"
    >
      <n-form label-placement="top" class="client-form">
        <n-form-item :label="l.clients.form.fullName" required>
          <n-input v-model:value="form.display_name" :placeholder="l.clients.form.fullNamePlaceholder" />
        </n-form-item>
        <n-form-item :label="l.clients.form.type">
          <n-radio-group v-model:value="form.entity_type">
            <n-radio-button value="person">{{ l.clients.form.typePerson }}</n-radio-button>
            <n-radio-button value="company">{{ l.clients.form.typeCompany }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <div class="client-form__grid">
          <n-form-item :label="l.clients.form.contactPerson">
            <n-input v-model:value="form.contact_person" :placeholder="l.clients.form.contactPersonPlaceholder" />
          </n-form-item>
          <n-form-item :label="l.clients.form.idNumber">
            <n-input v-model:value="form.id_number" dir="ltr" />
          </n-form-item>
          <n-form-item :label="l.clients.form.email">
            <n-input v-model:value="form.email" dir="ltr" placeholder="israel@example.com" />
          </n-form-item>
          <n-form-item :label="l.clients.form.phone">
            <n-input v-model:value="form.phone" placeholder="02-0000000" />
          </n-form-item>
          <n-form-item :label="l.clients.form.mobile">
            <n-input v-model:value="form.mobile" placeholder="050-0000000" />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div class="client-form__footer">
          <n-button :disabled="saving" @click="showForm = false">{{ l.common.cancel }}</n-button>
          <n-button :loading="saving" type="primary" @click="doSave">
            {{ editingId ? l.clients.form.saveChanges : l.clients.form.createClient }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="mergeModal.show"
      preset="card"
      :title="l.clients.merge"
      class="client-merge-modal"
      :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="client-merge-form" :dir="dir">
        <label class="client-merge-label">
          {{ l.clients.mergeModal.sourceLabel }}
          <n-select
            v-model:value="mergeModal.sourceIds"
            :options="clientMergeOptions"
            clearable
            filterable
            multiple
            max-tag-count="responsive"
            :placeholder="l.clients.mergeModal.sourcePlaceholder"
          />
        </label>
        <label class="client-merge-label">
          {{ l.clients.mergeModal.canonicalLabel }}
          <n-select
            v-model:value="mergeModal.canonicalId"
            :options="canonicalMergeOptions"
            clearable
            filterable
            :placeholder="l.clients.mergeModal.canonicalPlaceholder"
          />
        </label>
        <p class="client-merge-hint">
          {{ l.clients.mergeModal.hint }}
        </p>
        <div class="client-merge-actions">
          <n-button @click="mergeModal.show = false">{{ l.common.cancel }}</n-button>
          <n-button
            type="primary"
            :loading="mergeModal.saving"
            :disabled="mergeModal.sourceIds.length < 2 || !mergeModal.canonicalId"
            @click="saveClientMerge"
          >
            {{ l.clients.mergeModal.confirm }}
          </n-button>
        </div>
      </div>
    </n-modal>

    <HydraulicCheckModal ref="hydraulicModalRef" v-model:show="showHydraulicModal" />
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
  NTooltip,
  useMessage,
  type SelectOption,
} from "naive-ui";
import {
  AddOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  BriefcaseOutline,
  BusinessOutline,
  CheckboxOutline,
  DocumentTextOutline,
  PeopleOutline,
  PersonOutline,
  RefreshOutline,
  SearchOutline,
  SwapVerticalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { useClientsStore } from "../stores/clients.js";
import { useConfirm } from "../composables/useConfirm.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";
import {useAuthStore} from "../stores/auth.js";
import {resolveUserPlan} from "../shared/pricingPlans.js";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import { api } from "../services/apiService.js";
import type { Client } from "@shared/types.js";

const store = useClientsStore();
const {l, dir, t, href, canCreateInspection} = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const writesAllowed = computed(() => resolveUserPlan(authStore.user) !== "expired");

function goToSubscription() {
  router.push({path: href("/profile"), query: {section: "subscription"}});
}
const hydraulicModalRef = ref<InstanceType<typeof HydraulicCheckModal> | null>(null);
const showHydraulicModal = ref(false);
const showReportClientPicker = ref(false);
useDevModal("clients.reportPicker", showReportClientPicker);
const reportClientId = ref<string | null>(null);
const reportClientOptions = computed(() =>
  store.rows.map((row) => ({label: displayClientName(row.display_name), value: row.id}))
);

function openReportClientPicker() {
  if (!writesAllowed.value) return;
  reportClientId.value = null;
  showReportClientPicker.value = true;
}

function confirmReportClient() {
  if (!reportClientId.value) return;
  showReportClientPicker.value = false;
  hydraulicModalRef.value?.open({clientId: reportClientId.value});
}
const message = useMessage();
const { confirm } = useConfirm();

const search = ref("");
let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.fetch({ q: search.value || undefined, limit: 200, withCounts: 1 }), 300);
}
function refresh() {
  return store.fetch({ q: search.value || undefined, limit: 200, withCounts: 1 }, true);
}

onMounted(() => {
  store.fetch({ limit: 200, withCounts: 1 }, true);
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

function sortIcon(key: ClientSortKey) {
  if (sortKey.value !== key) return SwapVerticalOutline;
  return sortDir.value === "asc" ? ArrowUpOutline : ArrowDownOutline;
}

function sortTitle(key: ClientSortKey): string {
  if (sortKey.value !== key) return l.value.clientsMsg.sort;
  if (key === "doc_count") return sortDir.value === "asc" ? "0-9" : "9-0";
  return sortDir.value === "asc" ? l.value.clientsMsg.sortAsc : l.value.clientsMsg.sortDesc;
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

const visibleDocumentTotal = computed(() =>
    filteredRows.value.reduce((sum, row) => sum + Number(row.doc_count ?? 0), 0),
);

const typeFilters = computed(() => {
  const person = store.rows.filter((r) => r.entity_type === "person").length;
  const company = store.rows.filter((r) => r.entity_type === "company").length;
  return [
    { value: "all" as const, label: l.value.common.all, count: store.rows.length },
    { value: "person" as const, label: l.value.common.person, count: person },
    { value: "company" as const, label: l.value.common.company, count: company },
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
useDevModal("clients.merge", mergeModal);

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
    await store.fetch({ limit: Math.max(store.total, 2000), withCounts: 1 });
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
    message.success(t("clients.mergeModal.success", {count: result.merged + 1, name: result.clientName || t("clients.mergeModal.defaultName")}));
    await refresh();
  } catch {
    message.error(t("clients.mergeModal.error"));
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
useDevModal("clients.form", showCreate);
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
    message.warning(l.value.clientsMsg.needName);
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await store.update(editingId.value, form.value);
      message.success(l.value.clientsMsg.updated);
    } else {
      const created = await store.create(form.value);
      message.success(t("clientsMsg.created", {name: created.display_name}));
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
    title: l.value.clientsMsg.deleteTitle,
    content: t("clientsMsg.deleteConfirm", {name: row.display_name}),
    confirmText: l.value.fieldPage.delete,
    onConfirm: async () => {
      try {
        await store.remove(String(row.id));
        message.success(l.value.clientsMsg.deleted);
        refresh();
      } catch {
        message.error(l.value.clientsMsg.deleteError);
      }
    },
  });
}

function bulkDeleteSelected() {
  const rows = selectedClients();
  const count = rows.length;
  if (!count) return;
  confirm({
    title: l.value.clientsMsg.deleteManyTitle,
    content: t("clientsMsg.deleteManyConfirm", {count}),
    confirmText: l.value.fieldPage.delete,
    onConfirm: async () => {
      try {
        await Promise.all(rows.map((row) => store.remove(String(row.id))));
        message.success(t("clientsMsg.deletedMany", {count}));
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
.locked-action {
  display: inline-flex;
}

.locked-action button:disabled {
  pointer-events: none;
}
.clients-page {
  margin: 0 auto;
  padding: 0 4px 32px;
}

.clients-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.clients-page[dir="rtl"] .clients-actions {
  margin-inline-start: auto;
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
  text-align: start;
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
  opacity: 0.45;
  transition: opacity 0.12s;
}

.th-sort:hover .th-sort__mark {
  opacity: 0.9;
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

.clients-page[dir="ltr"] .ltr {
  text-align: left;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.clients-foot__sum {
  color: var(--text-secondary);
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
