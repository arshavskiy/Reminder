<template>
  <Teleport to="body">
    <div v-if="panelOpen" class="dev-modals-panel" dir="ltr">
      <header class="dev-modals-panel__head">
        <strong>DEV modals</strong>
        <span class="dev-modals-panel__hint">Ctrl+Shift+M · window.__remindocr.modals</span>
        <button type="button" class="dev-modals-panel__close" @click="panelOpen = false">Close</button>
      </header>
      <div class="dev-modals-panel__actions">
        <button type="button" @click="api?.openAll()">Open all</button>
        <button type="button" @click="api?.closeAll()">Close all</button>
      </div>
      <ul class="dev-modals-panel__list">
        <li v-for="item in items" :key="item.id">
          <button type="button" @click="api?.open(item.id)">{{ item.id }}</button>
        </li>
      </ul>
    </div>
  </Teleport>

  <MonthlyReportModal v-model:show="showMonthlyReport" />
  <QuoteCreateModal v-model:show="showQuoteCreate" />
  <CreateQuoteModal v-model:show="showCreateQuote" :row="null" />
  <EquipmentQuickAddModal v-model:show="showEquipmentAdd" client-id="dev" />
  <XlsxImportModal v-model="showXlsxImport" />
  <UploadModal v-model="showUpload" :uploading="false" />
  <MissingFieldsModal
    v-model="showMissingFields"
    document-id="dev"
    file-name="preview.pdf"
    :missing="missingFieldsStub"
  />
  <ReminderPreviewModal v-model:show="showReminderPreview" :reminder-id="null" reminder-title="DEV preview" />
  <AdminReportModal v-model:show="showAdminReport" user-id="dev" user-name="DEV" />
  <HydraulicCheckModal v-model:show="showHydraulic" />
  <ReminderTableImport class="dev-modals-host__hidden" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {useDevModal} from "../composables/useDevModal.js";
import {useWalkthrough} from "../composables/useWalkthrough.js";
import {installDevModalsWindow, catalogTick, panelOpen as panelState, registerDevModal} from "./devModals.js";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import QuoteCreateModal from "../components/QuoteCreateModal.vue";
import CreateQuoteModal from "../components/documents/CreateQuoteModal.vue";
import EquipmentQuickAddModal from "../components/EquipmentQuickAddModal.vue";
import XlsxImportModal from "../components/XlsxImportModal.vue";
import UploadModal from "../components/UploadModal.vue";
import MissingFieldsModal from "../components/MissingFieldsModal.vue";
import ReminderPreviewModal from "../components/modals/ReminderPreviewModal.vue";
import AdminReportModal from "../components/AdminReportModal.vue";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import ReminderTableImport from "../components/ReminderTableImport.vue";
import type {MissingFieldItem} from "../shared/missingDocumentFields.js";

const panelOpen = panelState;
const api = computed(() => (typeof window !== "undefined" ? window.__remindocr?.modals : undefined));
const items = computed(() => {
  catalogTick.value;
  return api.value?.entries() ?? [];
});

const showMonthlyReport = ref(false);
const showQuoteCreate = ref(false);
const showCreateQuote = ref(false);
const showEquipmentAdd = ref(false);
const showXlsxImport = ref(false);
const showUpload = ref(false);
const showMissingFields = ref(false);
const showReminderPreview = ref(false);
const showAdminReport = ref(false);
const showHydraulic = ref(false);

const missingFieldsStub: MissingFieldItem[] = [
  {key: "client_name", label: "Client name", type: "text", critical: false},
  {key: "expiry_date", label: "Expiry", type: "date", critical: true},
];

useDevModal("monthlyReport", showMonthlyReport);
useDevModal("quoteCreate", showQuoteCreate);
useDevModal("createQuoteFromDocument", showCreateQuote);
useDevModal("equipmentQuickAdd", showEquipmentAdd);
useDevModal("xlsxImport", showXlsxImport);
useDevModal("upload", showUpload);
useDevModal("missingFields", showMissingFields);
useDevModal("reminderPreview", showReminderPreview);
useDevModal("adminReport", showAdminReport);
useDevModal("hydraulicInspection", showHydraulic);

const walkthrough = useWalkthrough();
const walkthroughIds = ["main", "documents", "contracts", "reminders", "clients", "reports"] as const;
let unregWalkthrough: Array<() => void> = [];

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
    e.preventDefault();
    panelOpen.value = !panelOpen.value;
  }
}

onMounted(() => {
  unregWalkthrough = walkthroughIds.map((id) =>
    registerDevModal({
      id: `walkthrough.${id}`,
      label: `walkthrough.${id}`,
      open: () => walkthrough.startTour(id),
      close: () => walkthrough.skipTour(),
    }),
  );
  installDevModalsWindow();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  unregWalkthrough.forEach((fn) => fn());
  window.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.dev-modals-host__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.dev-modals-panel {
  position: fixed;
  z-index: 4000;
  inset-inline-start: 12px;
  bottom: 12px;
  width: min(320px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 8px 28px color-mix(in srgb, #000 35%, transparent);
  font-family: var(--font-ui);
  font-size: 12px;
}
.dev-modals-panel__head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  margin-bottom: 8px;
}
.dev-modals-panel__hint {
  flex: 1;
  color: var(--text-secondary);
  font-size: 11px;
}
.dev-modals-panel__close,
.dev-modals-panel__actions button,
.dev-modals-panel__list button {
  border: 1px solid var(--border-color);
  background: var(--bg-elevated, transparent);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font: inherit;
}
.dev-modals-panel__actions {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.dev-modals-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dev-modals-panel__list button {
  width: 100%;
  text-align: start;
}
</style>
