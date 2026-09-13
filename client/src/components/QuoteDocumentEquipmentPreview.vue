<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NDataTable, NSpin } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/services/apiService";
import { parseDocumentExtractedFields } from "@/shared/rowIssues";

type EquipmentRow = Record<string, unknown>;

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const props = defineProps<{
  documentId: string | null;
}>();

const emit = defineEmits<{
  loaded: [items: { name: string; manufacturer?: string; model?: string; serial_number?: string }[]];
}>();

const loading = ref(false);
const loadError = ref("");
const rows = ref<EquipmentRow[]>([]);
let loadSeq = 0;

const COLUMN_DEFS: { key: string; title: string; minWidth?: number }[] = [
  { key: "name", title: "תיאור", minWidth: 160 },
  { key: "manufacturer", title: "יצרן", minWidth: 90 },
  { key: "model", title: "דגם", minWidth: 90 },
  { key: "serial_number", title: 'מ"ס סידורי', minWidth: 110 },
  { key: "load_capacity_work", title: "עומס עבודה", minWidth: 110 },
  { key: "load_capacity_test", title: "עומס מבחן", minWidth: 110 },
  { key: "load_radius", title: "רדיוס", minWidth: 80 },
];

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return String(value);
}

function extractEquipment(fields: Record<string, unknown>): EquipmentRow[] {
  const list = fields._equipment;
  if (!Array.isArray(list)) return [];
  const extracted = list
    .filter((item) => item && typeof item === "object" && String((item as EquipmentRow).name || "").trim())
    .map((item) => ({ ...(item as EquipmentRow) }));
  if (extracted.length === 1) {
    const row = extracted[0];
    if (!row.serial_number && fields.serial_number) row.serial_number = fields.serial_number;
    if ((!row.load_capacity_work || (Array.isArray(row.load_capacity_work) && !row.load_capacity_work.length)) && fields.load_capacity) {
      row.load_capacity_work = [fields.load_capacity];
    }
  }
  return extracted;
}

function extractionFields(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  return (payload as { fields?: unknown }).fields;
}

const visibleColumns = computed(() => {
  const withData = COLUMN_DEFS.filter((col) =>
    rows.value.some((row) => formatCell(row[col.key]).trim()),
  );
  return withData.length ? withData : COLUMN_DEFS.filter((col) => col.key === "name");
});

const tableColumns = computed<DataTableColumns<EquipmentRow>>(() =>
  visibleColumns.value.map((col) => ({
    title: col.title,
    key: col.key,
    minWidth: col.minWidth,
    ellipsis: { tooltip: true },
    render: (row) => formatCell(row[col.key]) || "—",
  })),
);

async function load(id: string | null) {
  const seq = ++loadSeq;
  rows.value = [];
  loadError.value = "";
  if (!id) {
    loading.value = false;
    emit("loaded", []);
    return;
  }
  loading.value = true;
  try {
    const [docResult, extractionResult] = await Promise.allSettled([
      api.documents.get(id),
      fetch(`${SERVER}/api/documents/${id}/extractions`, { credentials: "include" }).then(async (r) => {
        if (!r.ok) throw new Error(`extractions ${r.status}`);
        return r.json();
      }),
    ]);
    if (seq !== loadSeq) return;
    const doc = docResult.status === "fulfilled" ? docResult.value : null;
    const extractionPayload = extractionResult.status === "fulfilled" ? extractionResult.value : null;
    const fromExtraction = extractEquipment(parseDocumentExtractedFields(extractionFields(extractionPayload)));
    const nextRows = fromExtraction.length
      ? fromExtraction
      : extractEquipment(parseDocumentExtractedFields(doc?.extracted_fields));
    rows.value = nextRows;
    if (!nextRows.length && docResult.status === "rejected" && extractionResult.status === "rejected") {
      loadError.value = "לא ניתן לטעון את טבלת הציוד מהמסמך.";
    }
    emit("loaded", nextRows.map((row) => ({
      name: formatCell(row.name).trim(),
      manufacturer: formatCell(row.manufacturer).trim() || undefined,
      model: formatCell(row.model).trim() || undefined,
      serial_number: formatCell(row.serial_number).trim() || undefined,
    })).filter((row) => row.name));
  } catch {
    if (seq !== loadSeq) return;
    rows.value = [];
    loadError.value = "לא ניתן לטעון את טבלת הציוד מהמסמך.";
    emit("loaded", []);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

watch(() => props.documentId, (id) => { void load(id); }, { immediate: true });
</script>

<template>
  <section v-if="documentId" class="eq-preview">
    <div class="eq-preview__head">
      <h3>ציוד שנבדק במסמך</h3>
      <span class="eq-preview__meta">{{ loading ? "טוען…" : `${rows.length} פריטים` }}</span>
    </div>
    <NSpin :show="loading">
      <NDataTable
        v-if="rows.length"
        :columns="tableColumns"
        :data="rows"
        :bordered="false"
        :single-line="false"
        size="small"
        :scroll-x="Math.max(640, visibleColumns.length * 140)"
      />
      <p v-else-if="!loading" class="eq-preview__empty">{{ loadError || "לא נמצאה טבלת ציוד במסמך שנבחר." }}</p>
    </NSpin>
  </section>
</template>

<style scoped>
.eq-preview {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.eq-preview__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.eq-preview__head h3 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
}

.eq-preview__meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.eq-preview__empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.eq-preview :deep(.n-data-table) {
  --n-th-padding: 8px 10px;
  --n-td-padding: 8px 10px;
  font-size: 0.8rem;
}

.eq-preview :deep(.n-data-table-th) {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}
</style>
