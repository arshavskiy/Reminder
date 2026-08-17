<template>
  <div>
    <div
      :class="{
        'drop-strip--active': isDragging,
        'drop-strip--uploading': isUploading,
      }"
      class="drop-strip"
      @dragover.prevent="!isUploading && (isDragging = true)"
      @dragleave.prevent="isDragging = false"
      @click="!isUploading && fileInput?.click()"
      @drop.prevent="!isUploading && onStripDrop($event)"
    >
      <div class="drop-strip__icon">
        <n-icon :component="CloudUploadOutline" :size="30" />
      </div>
      <div class="drop-strip__copy">
        <strong>{{ isDragging ? "שחרר כאן והייבוא יתחיל" : "גרור מסמכים לכאן" }}</strong>
        <span>גרירה או לחיצה מעלות מיד</span>
      </div>
    </div>
    <input
      ref="fileInput"
      class="hidden-file-input"
      multiple
      type="file"
      @change="onFileInputChange"
    />

    <!-- ── Missing fields after OCR ─────────────────────────────────── -->
    <MissingFieldsModal
      v-if="missingFieldsTarget"
      v-model:show="showMissingFieldsModal"
      :document-id="missingFieldsTarget.documentId"
      :file-name="missingFieldsTarget.fileName"
      :missing="missingFieldsTarget.missing"
      :initial-values="missingFieldsTarget.initialValues"
      @saved="onMissingFieldsSaved"
    />

    <!-- ── Upload results modal ───────────────────────────────────────── -->
    <n-modal v-model:show="showUploadResults" :mask-closable="!uploadResultsLoading" style="width: min(780px, 96vw)">
      <n-card :title="`תוצאות העלאה — ${uploadResultRows.length} קבצים`" :bordered="false" size="medium" role="dialog" style="max-height:80vh;display:flex;flex-direction:column">
        <n-spin :show="uploadResultsLoading" description="מעבד מסמכים..." style="flex:1;overflow:hidden">
          <n-data-table
            :columns="uploadResultColumns"
            :data="uploadResultRows"
            :bordered="false"
            :pagination="false"
            size="small"
            :max-height="420"
            virtual-scroll
            style="min-height: 120px; direction: rtl"
          />
        </n-spin>
        <template #footer>
          <div style="display:flex; justify-content:flex-end; gap:8px">
            <n-button :disabled="uploadResultsLoading" @click="showUploadResults = false">סגור</n-button>
            <n-button type="primary" @click="goToDocuments">עבור למסמכים</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, h, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { NButton, NCard, NDataTable, NIcon, NModal, NSpin, NTag, useMessage } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { CloudUploadOutline } from "@vicons/ionicons5";
import { api } from "../services/apiService";
import MissingFieldsModal from "./MissingFieldsModal.vue";
import {
  listMissingDocumentFields,
  missingFieldsBlockReminders,
  type MissingFieldItem,
} from "@shared/missingDocumentFields.js";
import { resolveMissingFieldInitialValue } from "@shared/documentDates.js";

interface UploadResultRow {
  id?: string;
  fileName: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  duplicate: boolean;
  client: string;
  date: string;
  docType: string;
  contractNumber: string;
  licenseNumber: string;
  email: string;
  remindersCreated: number | null;
}

const emit = defineEmits<{ (e: "uploaded"): void }>();

const router = useRouter();
const message = useMessage();

const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const showUploadResults = ref(false);
const uploadResultsLoading = ref(false);
const uploadResultRows = ref<UploadResultRow[]>([]);
const showMissingFieldsModal = ref(false);
const missingFieldsTarget = ref<{
  documentId: string;
  fileName: string;
  missing: MissingFieldItem[];
  initialValues: Record<string, string>;
} | null>(null);

const isUploading = computed(() =>
  uploadResultRows.value.some((r) => r.status === "pending" || r.status === "uploading"),
);

function goToDocuments() {
  showUploadResults.value = false;
  router.push("/documents");
}

const uploadResultColumns: DataTableColumns<UploadResultRow> = [
  {
    title: "קובץ",
    key: "fileName",
    align: "right",
    ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.fileName),
  },
  {
    title: "סטטוס",
    key: "status",
    align: "right",
    width: 130,
    render: (row) => {
      const map: Record<string, { type: "success"|"warning"|"error"|"info"|"default"; label: string }> = {
        pending:    { type: "default", label: "ממתין" },
        uploading:  { type: "info",    label: "מעלה..." },
        done:       { type: "success", label: "הושלם" },
        processing: { type: "warning", label: "מעבד..." },
        error:      { type: "error",   label: "שגיאה" },
      };
      const { type, label } = map[row.status] ?? map.pending;
      const tags = [h(NTag, { type, size: "small", round: true }, { default: () => label })];
      if (row.duplicate) tags.push(h(NTag, { type: "default", size: "small", round: true, style: "margin-right:4px; opacity:0.7" }, { default: () => "כפול" }));
      return h("div", { style: "display:flex; gap:4px; justify-content:flex-end; flex-wrap:wrap" }, tags);
    },
  },
  {
    title: "לקוח",
    key: "client",
    align: "right",
    ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.client || "—"),
  },
  {
    title: "אימייל",
    key: "email",
    align: "right",
    ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.email || "—"),
  },
  {
    title: "תזכורות",
    key: "remindersCreated",
    align: "right",
    width: 90,
    render: (row) => {
      if (row.status !== "done") return h("span", { style: "font-size:12px;color:var(--n-text-color-3)" }, "—");
      if (row.remindersCreated === null) return h("span", { style: "font-size:12px;color:var(--n-text-color-3)" }, "—");
      return h(NTag, {
        type: row.remindersCreated > 0 ? "success" : "default",
        size: "small", round: true,
      }, { default: () => row.remindersCreated! > 0 ? `✓ ${row.remindersCreated}` : "אין" });
    },
  },
  {
    title: "תאריך",
    key: "date",
    align: "right",
    width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, row.date || "—"),
  },
];

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  uploadFiles(files);
}

function onStripDrop(e: DragEvent) {
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (!files.length) return;
  uploadFiles(files);
}

async function uploadFiles(
  files: File[],
  options: { doAi: boolean; doEntities: boolean; doReminders: boolean } = {
    doAi: true,
    doEntities: true,
    doReminders: true,
  },
) {
  // Seed all rows as pending and open modal immediately
  uploadResultRows.value = files.map((f) => ({
    fileName: f.name,
    status: "pending",
    duplicate: false,
    client: "",
    date: "",
    docType: "",
    contractNumber: "",
    licenseNumber: "",
    email: "",
    remindersCreated: null,
  }));
  uploadResultsLoading.value = true;
  showUploadResults.value = true;

  const allIds: (string | null)[] = new Array(files.length).fill(null);

  // Upload files one by one, updating each row's status live
  for (let i = 0; i < files.length; i++) {
    uploadResultRows.value = uploadResultRows.value.map((r, idx) =>
      idx === i ? { ...r, status: "uploading" } : r,
    );
    try {
      const { id, duplicate } = await api.documents.uploadOne(files[i], options);
      allIds[i] = id;
      uploadResultRows.value = uploadResultRows.value.map((r, idx) =>
        idx === i ? { ...r, id, duplicate, status: "processing" } : r,
      );
    } catch (err) {
      uploadResultRows.value = uploadResultRows.value.map((r, idx) =>
        idx === i ? { ...r, status: "error" } : r,
      );
      // Show error only for quota/auth failures (not per-file OCR errors)
      const e = err as any;
      if (e.remaining != null || e.status === 401 || e.status === 403) {
        message.error(e.message ?? "שגיאה בהעלאת הקבצים");
      }
    }
  }

  emit("uploaded");

  // For duplicate files: immediately fetch and apply the existing doc's data
  const dupIds = [...new Set(
    (allIds.filter(Boolean) as string[]).filter(
      (id) => uploadResultRows.value.find((r) => r.id === id)?.duplicate,
    )
  )];
  await Promise.all(dupIds.map(async (id) => {
    try {
      const doc = await api.documents.get(id);
      let fields: Record<string, any> = {};
      try { fields = doc.extracted_fields ? JSON.parse(doc.extracted_fields as string) : {}; } catch { /* ignore */ }
      const resolvedStatus = doc.processing_status === "done" ? "done" : doc.processing_status === "error" ? "error" : "processing";
      uploadResultRows.value = uploadResultRows.value.map((row) =>
        row.id === id && row.duplicate
          ? {
              ...row,
              status: resolvedStatus,
              client: fields.client_company ?? fields.client_name ?? "",
              date: fields.expiry_date ?? fields.start_date ?? "",
              docType: fields.document_type ?? fields.contract_type ?? (doc as any).document_type ?? "",
              contractNumber: fields.contract_number ?? fields.report_number ?? "",
              licenseNumber: fields.license_number ?? "",
              email: fields.client_email ?? fields.contact_email ?? "",
            }
          : row,
      );
    } catch { /* ignore */ }
  }));

  // Poll only genuinely new (non-duplicate) documents
  const pendingIds = [...new Set(
    (allIds.filter(Boolean) as string[]).filter(
      (id) => uploadResultRows.value.find((r) => r.id === id && !r.duplicate)?.status === "processing",
    )
  )];
  if (pendingIds.length) {
    await pollDocumentResults(pendingIds);
  } else {
    uploadResultsLoading.value = false;
  }
  await promptMissingFieldsForCompletedRows();
}

async function pollDocumentResults(pendingIds: string[]) {
  const MAX_POLLS = 30;
  const INTERVAL = 2000;
  const settled = new Set<string>();

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await new Promise((r) => setTimeout(r, INTERVAL));

    await Promise.all(
      pendingIds
        .filter((id) => !settled.has(id))
        .map(async (id) => {
          try {
            const doc = await api.documents.get(id);
            if (doc.processing_status === "done" || doc.processing_status === "error") {
              settled.add(id);
              let fields: Record<string, any> = {};
              try { fields = doc.extracted_fields ? JSON.parse(doc.extracted_fields as string) : {}; } catch { /* ignore */ }
              let remindersCreated: number | null = null;
              if (doc.processing_status === "done") {
                try {
                  const rems = await api.reminders.list({ documentId: id, limit: 100 });
                  remindersCreated = rems.total ?? rems.rows?.length ?? 0;
                } catch { remindersCreated = 0; }
              }
              uploadResultRows.value = uploadResultRows.value.map((row) =>
                row.id === id
                  ? {
                      ...row,
                      status: doc.processing_status === "error" ? "error" : "done",
                      client: fields.client_company ?? fields.client_name ?? "",
                      date: fields.expiry_date ?? fields.start_date ?? "",
                      docType: fields.document_type ?? fields.contract_type ?? (doc as any).document_type ?? "",
                      contractNumber: fields.contract_number ?? fields.report_number ?? "",
                      licenseNumber: fields.license_number ?? "",
                      email: fields.client_email ?? fields.contact_email ?? "",
                      remindersCreated,
                    }
                  : row,
              );
            }
          } catch { /* ignore individual poll failures */ }
        }),
    );

    if (settled.size >= pendingIds.length) break;
  }

  // Mark any still-processing as error (timed out)
  uploadResultRows.value = uploadResultRows.value.map((row) =>
    row.status === "processing" ? { ...row, status: "error" } : row,
  );
  uploadResultsLoading.value = false;
  emit("uploaded");
}

function waitForModalClose(): Promise<void> {
  return new Promise((resolve) => {
    if (!showMissingFieldsModal.value) {
      resolve();
      return;
    }
    const stop = watch(showMissingFieldsModal, (open) => {
      if (!open) {
        stop();
        resolve();
      }
    });
  });
}

async function promptMissingFieldsForCompletedRows() {
  const candidates = uploadResultRows.value.filter(
    (row) => row.id && row.status === "done" && row.remindersCreated === 0,
  );
  for (const row of candidates) {
    try {
      const doc = await api.documents.get(row.id!);
      let fields: Record<string, unknown> = {};
      try {
        fields = doc.extracted_fields ? JSON.parse(doc.extracted_fields as string) : {};
      } catch { /* ignore */ }
      let template = null;
      if (doc.template_id) {
        try {
          template = await api.docTemplates.get(String(doc.template_id));
        } catch { /* ignore */ }
      }
      const missing = listMissingDocumentFields(template, fields);
      if (!missingFieldsBlockReminders(missing)) continue;
      missingFieldsTarget.value = {
        documentId: row.id!,
        fileName: row.fileName,
        missing,
        initialValues: Object.fromEntries(
          missing.map((field) => [field.key, resolveMissingFieldInitialValue(field.key, fields, template)]),
        ),
      };
      showMissingFieldsModal.value = true;
      await waitForModalClose();
    } catch { /* ignore */ }
  }
}

async function onMissingFieldsSaved() {
  const target = missingFieldsTarget.value;
  if (!target) return;
  try {
    const doc = await api.documents.get(target.documentId);
    let fields: Record<string, unknown> = {};
    try {
      fields = doc.extracted_fields ? JSON.parse(doc.extracted_fields as string) : {};
    } catch { /* ignore */ }
    const rems = await api.reminders.list({ documentId: target.documentId, limit: 100 });
    const remindersCreated = rems.total ?? rems.rows?.length ?? 0;
    uploadResultRows.value = uploadResultRows.value.map((row) =>
      row.id === target.documentId
        ? {
            ...row,
            date: String(fields.expiry_date ?? fields.start_date ?? row.date),
            email: String(fields.client_email ?? fields.contact_email ?? row.email),
            remindersCreated,
          }
        : row,
    );
  } catch { /* ignore */ }
  emit("uploaded");
}
</script>

<style scoped>
.drop-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 86px;
  margin: 0 0 20px;
  padding: 18px 22px;
  border: 2px dashed rgba(24, 160, 88, 0.72);
  border-radius: 12px;
  color: var(--text-primary);
  cursor: pointer;
  background:
    linear-gradient(135deg, rgba(24, 160, 88, 0.18), rgba(32, 128, 240, 0.1)),
    var(--bg-card);
  box-shadow:
    0 14px 36px rgba(24, 160, 88, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.38);
  transition:
    transform 0.15s,
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.drop-strip:hover,
.drop-strip--active {
  transform: translateY(-1px);
  border-color: var(--brand-color);
  background:
    linear-gradient(135deg, rgba(24, 160, 88, 0.25), rgba(32, 128, 240, 0.14)),
    var(--bg-card);
  box-shadow:
    0 18px 42px rgba(24, 160, 88, 0.18),
    inset 0 0 0 1px rgba(255, 255, 255, 0.46);
}

.drop-strip--uploading {
  cursor: progress;
  opacity: 0.78;
}

.drop-strip__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: #ffffff;
  background: var(--brand-color);
  box-shadow: 0 10px 24px rgba(24, 160, 88, 0.28);
  flex: 0 0 auto;
}

.drop-strip__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
}

.drop-strip__copy strong {
  font-size: 17px;
  line-height: 1.2;
}

.drop-strip__copy span {
  font-size: 13px;
  color: var(--text-secondary);
}

.hidden-file-input {
  display: none;
}
</style>
