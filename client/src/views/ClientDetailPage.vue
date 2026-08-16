<template>
  <n-spin :show="store.loading && !store.active">
    <n-space v-if="store.active" vertical size="large" class="client-detail" dir="rtl">
      <PageHeader :title="store.active.display_name">
        <template #breadcrumb>
          <router-link to="/clients">לקוחות</router-link>
          <span class="sep">/</span>
          <span>{{ store.active.display_name }}</span>
        </template>
        <template #actions>
          <n-tag type="info">{{ store.active.entity_type === "company" ? "חברה" : "אדם פרטי" }}</n-tag>
          <n-button size="small" @click="router.back()">
            <template #icon><n-icon :component="ArrowBackOutline" /></template>
            חזרה
          </n-button>
          <n-button size="small" @click="showEdit = true">
            <template #icon>
              <n-icon :component="CreateOutline"/>
            </template>
            עריכה
          </n-button>
        </template>
      </PageHeader>

      <n-grid :cols="3" :x-gap="16" responsive="screen">
        <n-gi v-for="stat in clientStats" :key="stat.key">
          <n-card><n-statistic :label="stat.label" :value="stat.value" /></n-card>
        </n-gi>
      </n-grid>

      <n-card title="פרטי לקוח">
        <n-descriptions class="client-details-table" :column="3" bordered label-placement="top">
          <n-descriptions-item
            v-for="detail in clientDetails"
            :key="detail.key"
            :label="detail.label"
            :span="detail.span"
          >
            <n-text :depth="detail.empty ? 3 : undefined">{{ detail.value }}</n-text>
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <n-tabs type="line" animated>
        <n-tab-pane name="docs" tab="מסמכים">
          <n-data-table
            v-if="store.activeDocuments.length"
            :bordered="false"
            :columns="documentColumns"
            :data="store.activeDocuments"
            :pagination="false"
            :row-key="(doc: ClientDocumentRow) => String(doc.id)"
            :row-props="documentRowProps"
            class="detail-table"
            dir="rtl"
          />
          <n-empty v-else description="אין מסמכים" />
        </n-tab-pane>

        <n-tab-pane name="equipment" tab="ציוד">
          <n-spin :show="loadingEquipment">
            <n-data-table
              v-if="equipment.length"
              :bordered="false"
              :columns="equipmentColumns"
              :data="equipment"
              :pagination="false"
              :row-key="(row: Equipment) => String(row.id)"
              class="detail-table"
              dir="rtl"
            />
            <n-empty v-else description="אין ציוד משויך ללקוח זה" />
          </n-spin>
        </n-tab-pane>

        <n-tab-pane name="timeline" tab="ציר זמן">
          <n-timeline v-if="store.activeTimeline.length">
            <n-timeline-item
              v-for="event in store.activeTimeline"
              :key="event.id"
              :title="event.title"
              :time="formatDate(event.event_date)"
              :type="eventType(event.event_type)"
            >
              {{ event.description }}
            </n-timeline-item>
          </n-timeline>
          <n-empty v-else description="אין אירועים" />
        </n-tab-pane>
      </n-tabs>

      <n-modal v-model:show="showEdit" title="עריכת לקוח" :show-icon="false" preset="dialog" style="width: 480px">
        <n-form v-if="editForm" label-placement="top">
          <n-form-item label="שם"><n-input v-model:value="editForm.display_name" /></n-form-item>
          <n-form-item label="איש קשר"><n-input v-model:value="editForm.contact_person" /></n-form-item>
          <n-form-item label="אימייל"><n-input v-model:value="editForm.email" class="email-ltr" dir="ltr" /></n-form-item>
          <n-form-item label="טלפון"><n-input v-model:value="editForm.phone" /></n-form-item>
          <n-form-item label="הערות"><n-input v-model:value="editForm.notes" type="textarea" :rows="3" /></n-form-item>
        </n-form>
        <template #action>
          <n-button @click="showEdit = false">ביטול</n-button>
          <n-button type="primary" :loading="saving" @click="doSave">שמור</n-button>
        </template>
      </n-modal>
    </n-space>
  </n-spin>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {
  type DataTableColumns,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NIcon,
  NInput,
  NModal,
  NSpace,
  NSpin,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NTimeline,
  NTimelineItem,
  useMessage,
} from "naive-ui";
import {ArrowBackOutline, CreateOutline, DocumentTextOutline, OpenOutline,} from "@vicons/ionicons5";
import {useClientsStore} from "../stores/clients.js";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import type {Document, Equipment, EventType} from "@shared/types.js";

type ClientDocumentRow = Document & {
  inspection_date?: string | null;
  next_inspection_date?: string | null;
  document_type?: string | null;
};

type ClientDetailItem = {
  key: string;
  label: string;
  value: string;
  span?: number;
  empty?: boolean;
};

const route = useRoute();
const router = useRouter();
const store = useClientsStore();
const message = useMessage();

const showEdit = ref(false);
const saving = ref(false);
const editForm = ref<{ display_name: string; contact_person: string; email: string; phone: string; notes: string } | null>(null);
const equipment = ref<Equipment[]>([]);
const loadingEquipment = ref(false);

const clientStats = computed(() => {
  const client = store.active;
  return [
    { key: "documents", label: "מסמכים", value: client?.doc_count ?? client?.document_count ?? 0 },
    { key: "contracts", label: "חוזים", value: client?.contract_count ?? 0 },
    { key: "reminders", label: "תזכורות פתוחות", value: client?.open_reminder_count ?? 0 },
  ];
});

const clientDetails = computed<ClientDetailItem[]>(() => {
  const client = store.active;
  if (!client) return [];

  const notes = cleanNotes(client.notes, client.contact_person);
  const details: ClientDetailItem[] = [
    detailItem("display_name", "שם לקוח", client.display_name),
    detailItem("entity_type", "סוג לקוח", entityLabel(client.entity_type)),
    detailItem("contact_person", "איש קשר", client.contact_person),
    detailItem("email", "אימייל", client.email),
    detailItem("phone", "טלפון", client.phone),
    detailItem("id_number", "מספר ת.ז / ח.פ", client.id_number),
    detailItem("created_at", "נוצר", formatDate(client.created_at)),
    detailItem("updated_at", "עודכן", formatDate(client.updated_at)),
  ];

  if (notes) {
    details.push({ key: "notes", label: "הערות", value: notes, span: 3 });
  }

  return details;
});

const CATEGORY_LABELS: Record<string, string> = {
  lift: "מכונות הרמה",
  accessory: "אביזרי הרמה",
  scaffold: "פיגומים",
  ladder: "מעליות",
  balloon: "מעלונים",
  intake: "קולטי אוויר",
  extractor: "קולטי קיטור",
  other: "אחר",
};

const documentColumns: DataTableColumns<ClientDocumentRow> = [
  {
    title: "מסמך",
    key: "file_name",
    align: "right",
    titleAlign: "right",
    render(doc) {
      return h(NSpace, { align: "center", size: 8 }, {
        default: () => [
          h(NIcon, { component: DocumentTextOutline }),
          h(NButton, { text: true, type: "primary", onClick: (event: MouseEvent) => openDocument(doc, event) }, {
            default: () => doc.file_name,
          }),
        ],
      });
    },
  },
  {
    title: "סוג",
    key: "document_type",
    align: "right",
    titleAlign: "right",
    render: (doc) => doc.document_type || "-",
  },
  {
    title: "סטטוס",
    key: "processing_status",
    align: "right",
    titleAlign: "right",
    render: (doc) => h(StatusBadge, { status: doc.processing_status }),
  },
  {
    title: "תאריך בדיקה",
    key: "inspection_date",
    align: "right",
    titleAlign: "right",
    render: (doc) => formatDate(doc.inspection_date),
  },
  {
    title: "בדיקה הבאה",
    key: "next_inspection_date",
    align: "right",
    titleAlign: "right",
    render: (doc) => formatDate(doc.next_inspection_date),
  },
  {
    title: "ייבוא",
    key: "import_date",
    align: "right",
    titleAlign: "right",
    render: (doc) => formatDate(doc.import_date),
  },
  {
    title: "",
    key: "open",
    align: "left",
    titleAlign: "left",
    width: 72,
    render: (doc) => h(NButton, { size: "small", quaternary: true, onClick: (event: MouseEvent) => openDocument(doc, event) }, {
      icon: () => h(NIcon, { component: OpenOutline }),
    }),
  },
];

const equipmentColumns: DataTableColumns<Equipment> = [
  { title: "שם", key: "name", align: "right", titleAlign: "right" },
  { title: "קטגוריה", key: "category", align: "right", titleAlign: "right", render: (eq) => categoryLabel(eq.category) },
  { title: "יצרן", key: "manufacturer", align: "right", titleAlign: "right", render: (eq) => eq.manufacturer || "-" },
  { title: "דגם", key: "model", align: "right", titleAlign: "right", render: (eq) => eq.model || "-" },
  { title: "מספר סידורי", key: "serial_number", align: "right", titleAlign: "right", render: (eq) => eq.serial_number || "-" },
  { title: "עומס", key: "capacity", align: "right", titleAlign: "right", render: (eq) => eq.capacity || "-" },
  {
    title: "מסמך מקור",
    key: "document_id",
    align: "left",
    titleAlign: "left",
    render(eq) {
      if (!eq.document_id) return "-";
      return h(NButton, { text: true, type: "primary", onClick: () => router.push(`/documents/${eq.document_id}`) }, {
        default: () => eq.document_name || "מסמך מקור",
      });
    },
  },
];

function documentRowProps(doc: ClientDocumentRow) {
  return {
    class: "detail-table__row",
    onClick: () => router.push(`/documents/${doc.id}`),
  };
}

function openDocument(doc: ClientDocumentRow, event: MouseEvent) {
  event.stopPropagation();
  router.push(`/documents/${doc.id}`);
}

function categoryLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c;
}

function detailItem(key: string, label: string, value: string | null | undefined): ClientDetailItem {
  const text = displayValue(value);
  return { key, label, value: text, empty: text === "-" };
}

function displayValue(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : "-";
}

function entityLabel(entityType: string) {
  return entityType === "company" ? "חברה" : "אדם פרטי";
}

function cleanNotes(notes: string | null | undefined, contactPerson: string | null | undefined) {
  const value = notes?.trim();
  if (!value || !contactPerson?.trim()) return value ?? "";
  const contactLine = new RegExp(`^\\s*איש\\s+קשר\\s*[:：-]\\s*${escapeRegExp(contactPerson.trim())}\\s*$`, "m");
  return value.replace(contactLine, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("he-IL");
}

watch(showEdit, (open) => {
  if (open && store.active) {
    editForm.value = {
      display_name: store.active.display_name,
      contact_person: store.active.contact_person ?? "",
      email: store.active.email ?? "",
      phone: store.active.phone ?? "",
      notes: store.active.notes ?? "",
    };
  }
});

async function doSave() {
  if (!editForm.value || !store.active) return;
  saving.value = true;
  try {
    await store.update(store.active.id, editForm.value);
    message.success("פרטי הלקוח עודכנו");
    showEdit.value = false;
    store.fetchOne(store.active.id);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

function eventType(type: EventType): "default" | "success" | "warning" | "info" {
  if (type === "email_sent") return "success";
  if (type === "reminder_fired") return "warning";
  if (type === "document_added") return "info";
  return "default";
}

async function loadEquipment(clientId: string) {
  loadingEquipment.value = true;
  try {
    equipment.value = await api.equipment.list({ client_id: clientId });
  } finally {
    loadingEquipment.value = false;
  }
}

onMounted(() => {
  const id = route.params.id as string;
  store.fetchOne(id);
  loadEquipment(id);
});
</script>

<style scoped>
.client-detail {
  direction: rtl;
}

.client-details-table {
  direction: rtl;
}

.client-details-table :deep(table),
.client-details-table :deep(th),
.client-details-table :deep(td),
.client-details-table :deep(.n-descriptions-table-content),
.client-details-table :deep(.n-descriptions-table-header) {
  direction: rtl;
  text-align: right;
}

.detail-table {
  direction: rtl;
}

.detail-table :deep(.n-data-table-wrapper),
.detail-table :deep(.n-data-table-base-table),
.detail-table :deep(.n-data-table-table) {
  direction: rtl;
}

.detail-table :deep(th),
.detail-table :deep(td) {
  text-align: right;
}

.detail-table :deep(td:last-child) {
  text-align: left;
}

.detail-table :deep(.detail-table__row) {
  cursor: pointer;
}
</style>
