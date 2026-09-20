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
        <strong>{{ isDragging ? l.dashboard.dropActive : l.dashboard.dropTitle }}</strong>
        <span>{{ l.dashboard.dropHint }}</span>
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
    <n-modal
      v-model:show="showUploadResults"
      :mask-closable="!uploadResultsLoading"
      class="upload-results-modal"
      preset="card"
      role="dialog"
      style="width: min(1200px, 98vw)"
    >
      <template #header>
        <div class="ur-head">
          <span class="ur-head__icon" aria-hidden="true">
            <n-icon :component="CloudUploadOutline" :size="20"/>
          </span>
          <div class="ur-head__text">
            <h2 class="ur-head__title">{{ l.documents.uploadResults.title }}</h2>
            <p class="ur-head__sub">{{ uploadProgressLabel }}</p>
          </div>
        </div>
      </template>

      <div class="ur">
        <div v-if="uploadResultsLoading" class="ur-progress" role="status">
          <div class="ur-progress__bar">
            <span class="ur-progress__fill" :style="{ width: `${uploadProgress.pct}%` }"/>
          </div>
          <p class="ur-progress__label">{{ t("documents.uploadResults.processingFiles", {done: uploadProgress.done, total: uploadProgress.total}) }}</p>
        </div>

        <div class="ur-table-wrap">
          <table class="ur-table">
            <thead>
              <tr>
                <th>{{ l.documents.uploadResults.colFile }}</th>
                <th>{{ l.documents.uploadResults.colStatus }}</th>
                <th>{{ l.documents.uploadResults.colClient }}</th>
                <th>{{ l.documents.uploadResults.colEmail }}</th>
                <th>{{ l.documents.uploadResults.colReminders }}</th>
                <th>{{ l.documents.uploadResults.colDate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in uploadResultRows"
                :key="row.id ?? `${row.fileName}-${i}`"
                :class="[`ur-row--${row.status}`, { 'ur-row--dup': row.duplicate }]"
              >
                <td>
                  <div class="ur-file">
                    <span :class="['ur-file__icon', `ur-file__icon--${fileKind(row.fileName)}`]" aria-hidden="true">
                      <n-icon :component="fileIcon(row.fileName)" :size="16"/>
                    </span>
                    <span class="ur-file__name" :title="row.fileName">{{ row.fileName }}</span>
                  </div>
                </td>
                <td>
                  <div class="ur-status">
                    <span v-if="!row.duplicate" :class="['ur-badge', `ur-badge--${row.status}`]">{{ statusLabel(row.status) }}</span>
                    <span v-if="row.duplicate" class="ur-badge ur-badge--dup">{{ l.documents.uploadResults.duplicate }}</span>
                  </div>
                </td>
                <td>
                  <span :class="['ur-cell', { 'ur-cell--empty': !row.client }]" :title="row.client || undefined">{{ row.client || "—" }}</span>
                </td>
                <td>
                  <span v-if="row.email" class="ur-cell ur-cell--email" dir="ltr" :title="row.email">{{ row.email }}</span>
                  <span v-else class="ur-cell ur-cell--empty">—</span>
                </td>
                <td>
                  <span v-if="row.status !== 'done' || row.remindersCreated === null" class="ur-cell ur-cell--empty">—</span>
                  <span
                    v-else
                    :class="['ur-badge', row.remindersCreated > 0 ? 'ur-badge--done' : 'ur-badge--muted']"
                  >
                    {{ row.remindersCreated > 0 ? t("documents.uploadResults.remindersCount", {n: row.remindersCreated}) : l.documents.uploadResults.noReminders }}
                  </span>
                </td>
                <td>
                  <span :class="['ur-cell', 'ur-cell--date', { 'ur-cell--empty': !row.date }]">{{ formatDate(row.date) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template #footer>
        <div class="ur-actions">
          <n-button :disabled="uploadResultsLoading" @click="showUploadResults = false">{{ l.common.close }}</n-button>
          <n-button type="primary" @click="goToDocuments">{{ l.documents.uploadResults.goToDocuments }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import { NButton, NIcon, NModal, useMessage } from "naive-ui";
import { CloudUploadOutline, DocumentOutline, DocumentTextOutline, GridOutline, ImageOutline } from "@vicons/ionicons5";
import { api } from "../services/apiService";
import {useI18n} from "../composables/useI18n.js";
import MissingFieldsModal from "./MissingFieldsModal.vue";
import {
  listMissingDocumentFields,
  missingFieldsBlockReminders,
  templateUsesReminders,
  isPayslipLikeTemplate,
  isPayslipLikeExtraction,
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

const emit = defineEmits<{ (e: "uploaded"): void; (e: "quota-reached"): void }>();

const router = useRouter();
const {l, t, href, locale} = useI18n();
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
  router.push(href("/documents"));
}

const uploadProgress = computed(() => {
  const total = uploadResultRows.value.length;
  const done = uploadResultRows.value.filter((r) => r.status === "done" || r.status === "error").length;
  return {
    total,
    done,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
});

const uploadProgressLabel = computed(() => {
  const total = uploadResultRows.value.length;
  const u = l.value.documents.uploadResults;
  if (!total) return u.noFiles;
  if (uploadResultsLoading.value) return t("documents.uploadResults.processingNow", {n: total});
  const errors = uploadResultRows.value.filter((r) => r.status === "error").length;
  if (errors) return t("documents.uploadResults.someFailed", {n: total, errors});
  return t("documents.uploadResults.completed", {n: total});
});

function statusLabel(status: UploadResultRow["status"]): string {
  return l.value.documents.uploadResults[status];
}

function fileKind(name: string): "pdf" | "image" | "sheet" | "doc" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "tif", "tiff", "webp"].includes(ext)) return "image";
  if (["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  return "doc";
}

function fileIcon(name: string): Component {
  const kind = fileKind(name);
  if (kind === "pdf") return DocumentTextOutline;
  if (kind === "image") return ImageOutline;
  if (kind === "sheet") return GridOutline;
  return DocumentOutline;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }
  return value;
}

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
      const e = err as any;
      const quotaReached = e.remaining != null
        || String(e.message ?? "").includes("limit_reached")
        || String(e.message ?? "").includes("quota_exceeded");
      // Quota is account-wide: once it is hit every remaining file fails the same
      // way, so stop here and surface one upgrade prompt instead of N toasts.
      if (quotaReached) {
        uploadResultRows.value = uploadResultRows.value.map((r, idx) =>
          idx >= i ? { ...r, status: "error" } : r,
        );
        emit("quota-reached");
        break;
      }
      uploadResultRows.value = uploadResultRows.value.map((r, idx) =>
        idx === i ? { ...r, status: "error" } : r,
      );
      if (e.status === 401 || e.status === 403) {
        message.error(e.message ?? l.value.documents.uploadResults.uploadFailed);
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
      if (
        !templateUsesReminders(template) ||
        isPayslipLikeTemplate(template) ||
        isPayslipLikeExtraction(fields)
      ) {
        continue;
      }
      const missing = listMissingDocumentFields(template, fields, locale.value);
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
  text-align: start;
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

.ur-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ur-head__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(24, 160, 88, 0.12);
  color: var(--brand-color);
}

.ur-head__text {
  min-width: 0;
}

.ur-head__title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-primary);
}

.ur-head__sub {
  margin: 2px 0 0;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.ur {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.ur-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ur-progress__bar {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-elevated);
}

.ur-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand-color);
  transition: width 0.3s ease;
}

.ur-progress__label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-color);
}

.ur-table-wrap {
  max-height: min(72vh, 760px);
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.ur-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.ur-table th,
.ur-table td {
  padding: 14px 14px;
  text-align: start;
  vertical-align: middle;
}

.ur-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  border-bottom: 1px solid var(--border-color);
}

.ur-table td {
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-primary);
}

.ur-table tbody tr:last-child td {
  border-bottom: 0;
}

.ur-table tbody tr:hover td {
  background: var(--bg-hover, rgba(24, 160, 88, 0.04));
}

.ur-table th:nth-child(1),
.ur-table td:nth-child(1) { width: 34%; }
.ur-table th:nth-child(2),
.ur-table td:nth-child(2) { width: 14%; }
.ur-table th:nth-child(3),
.ur-table td:nth-child(3) { width: 18%; }
.ur-table th:nth-child(4),
.ur-table td:nth-child(4) { width: 16%; }
.ur-table th:nth-child(5),
.ur-table td:nth-child(5) { width: 10%; }
.ur-table th:nth-child(6),
.ur-table td:nth-child(6) { width: 8%; white-space: nowrap; }

.ur-row--processing td,
.ur-row--uploading td {
  background: rgba(240, 160, 32, 0.04);
}

.ur-row--error td {
  background: rgba(208, 48, 80, 0.05);
}

.ur-row--done td {
  background: rgba(24, 160, 88, 0.03);
}

.ur-file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.ur-file__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.ur-file__icon--pdf { color: #3d5a80; background: rgba(61, 90, 128, 0.1); }
.ur-file__icon--image { color: #2080f0; background: rgba(32, 128, 240, 0.1); }
.ur-file__icon--sheet { color: #18a058; background: rgba(24, 160, 88, 0.12); }

.ur-file__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.ur-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ur-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.ur-badge--pending {
  background: rgba(148, 163, 184, 0.16);
  color: var(--text-secondary);
}

.ur-badge--uploading {
  background: rgba(32, 128, 240, 0.12);
  color: #2080f0;
}

.ur-badge--processing {
  background: rgba(240, 160, 32, 0.16);
  color: #b27a02;
}

.ur-badge--done {
  background: rgba(24, 160, 88, 0.14);
  color: #18a058;
}

.ur-badge--error {
  background: rgba(208, 48, 80, 0.12);
  color: var(--color-error, #d03050);
}

.ur-badge--dup,
.ur-badge--muted {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.ur-cell {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ur-cell--empty {
  color: var(--text-muted);
  font-weight: 500;
}

.ur-cell--email {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}

.ur-cell--date {
  direction: ltr;
  unicode-bidi: isolate;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.ur-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

@media (max-width: 720px) {
  .ur-table {
    table-layout: auto;
  }

  .ur-table th:nth-child(3),
  .ur-table td:nth-child(3),
  .ur-table th:nth-child(4),
  .ur-table td:nth-child(4) {
    display: none;
  }
}
</style>

<style>
html[dir="rtl"] .upload-results-modal.n-card,
html[dir="rtl"] .n-modal.upload-results-modal .n-card,
html[dir="ltr"] .upload-results-modal.n-card,
html[dir="ltr"] .n-modal.upload-results-modal .n-card {
  direction: inherit;
  overflow: hidden;
  border-radius: 12px;
  font-family: var(--font-ui);
  max-height: calc(100vh - 32px);
}

.upload-results-modal .n-card-header,
.n-modal.upload-results-modal .n-card-header {
  padding: 18px 20px 12px;
  padding-inline-end: 48px;
  font-family: var(--font-ui) !important;
}

.upload-results-modal .n-card-header__main,
.n-modal.upload-results-modal .n-card-header__main {
  font-family: var(--font-ui) !important;
}

.upload-results-modal .n-card__content,
.n-modal.upload-results-modal .n-card__content {
  padding: 4px 20px 12px;
}

.upload-results-modal .n-card__footer,
.n-modal.upload-results-modal .n-card__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-color);
}

.upload-results-modal .n-base-close,
.n-modal.upload-results-modal .n-base-close {
  top: 14px;
  inset-inline-end: 14px;
  inset-inline-start: auto;
}
</style>
