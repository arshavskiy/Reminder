<template>
  <n-modal v-model:show="visible" :mask-closable="false" preset="card" style="width: 680px" :title="l.xlsxImportModal.title">
    <!-- Step 1: Upload -->
    <template v-if="step === 'upload'">
      <div
        :class="{ 'drop-zone--over': dragOver }"
        class="drop-zone"
        @click="fileInput?.click()"
        @dragleave="dragOver = false"
        @dragover.prevent="dragOver = true"
        @drop.prevent="onDrop"
      >
        <input ref="fileInput" accept=".xlsx,.xls" style="display:none" type="file" @change="onFileChange" />
        <n-icon :component="DocumentOutline" :size="36" style="color: var(--text-muted)" />
        <p style="margin: 8px 0 4px; font-weight: 600;">{{ l.xlsxImportModal.dropMain }}</p>
        <p style="color: var(--text-muted); font-size: 13px;">{{ l.xlsxImportModal.dropHint }}</p>
      </div>
    </template>

    <!-- Step 2: Column mapping -->
    <template v-else-if="step === 'mapping'">
      <p style="margin: 0 0 12px; font-size: 13px; color: var(--text-secondary)">
        {{ t('xlsxImportModal.foundRows', { n: total }) }}
      </p>

      <div class="mapping-grid" :dir="dir">
        <template v-for="f in FIELDS" :key="f.key">
          <label class="mapping-label">{{ f.label }}<span v-if="f.required" style="color:#d03050"> *</span></label>
          <n-select
            v-model:value="mapping[f.key]"
            :options="columnOptions"
            :placeholder="l.xlsxImportModal.columnPlaceholder"
            :virtual-scroll="false"
            clearable
            size="small"
          />
        </template>
      </div>

      <div v-if="preview.length" style="margin-top: 16px">
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px">{{ l.xlsxImportModal.previewLabel }}</p>
        <div class="preview-table-wrap">
          <table class="preview-table">
            <thead>
              <tr>
                <th v-for="f in mappedFields" :key="f.key">{{ f.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in preview" :key="i">
                <td v-for="f in mappedFields" :key="f.key">{{ mapping[f.key] ? row[mapping[f.key]] : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Step 3: Result -->
    <template v-else-if="step === 'done'">
      <div class="done-screen">
        <n-icon :component="CheckmarkCircleOutline" :size="48" style="color: var(--brand-color)" />
        <p class="done-screen__title">{{ l.xlsxImportModal.importComplete }}</p>
        <p class="done-screen__sub">{{ t('xlsxImportModal.importSummary', { created: result?.created ?? 0, skipped: result?.skipped ?? 0 }) }}</p>
      </div>
    </template>

    <template #footer>
      <n-space justify="end">
        <n-button v-if="step !== 'done'" @click="close">{{ l.xlsxImportModal.cancel }}</n-button>
        <n-button v-if="step === 'done'" type="primary" @click="close">{{ l.xlsxImportModal.close }}</n-button>
        <n-button v-if="step === 'mapping'" :disabled="!mapping.name" :loading="importing" type="primary" @click="confirm">
          {{ t('xlsxImportModal.importN', { n: total }) }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {computed, ref} from "vue";
import {NButton, NIcon, NModal, NSelect, NSpace, useMessage} from "naive-ui";
import {CheckmarkCircleOutline, DocumentOutline} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";

const emit = defineEmits<{ (e: "imported"): void }>();
const visible = defineModel<boolean>({ required: true });

const {l, t, dir} = useI18n();
const message = useMessage();
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const step = ref<"upload" | "mapping" | "done">("upload");
const file = ref<File | null>(null);
const headers = ref<string[]>([]);
const total = ref(0);
const preview = ref<Record<string, string>[]>([]);
const importing = ref(false);
const result = ref<{ created: number; skipped: number } | null>(null);

const FIELDS = computed(() => [
  { key: "name",                label: l.value.xlsxImportModal.fieldName,             required: true },
  { key: "serial_number",       label: l.value.xlsxImportModal.fieldSerialNumber,     required: false },
  { key: "category",            label: l.value.xlsxImportModal.fieldCategory,         required: false },
  { key: "manufacturer",        label: l.value.xlsxImportModal.fieldManufacturer,     required: false },
  { key: "model",               label: l.value.xlsxImportModal.fieldModel,            required: false },
  { key: "capacity",            label: l.value.xlsxImportModal.fieldCapacity,         required: false },
  { key: "load_capacity_test",  label: l.value.xlsxImportModal.fieldLoadCapacityTest, required: false },
  { key: "load_radius",         label: l.value.xlsxImportModal.fieldLoadRadius,       required: false },
  { key: "expiry_date",         label: l.value.xlsxImportModal.fieldExpiryDate,       required: false },
  { key: "description",         label: l.value.xlsxImportModal.fieldDescription,      required: false },
  { key: "notes",               label: l.value.xlsxImportModal.fieldNotes,            required: false },
]);

const mapping = ref<Record<string, string>>(Object.fromEntries(FIELDS.value.map(f => [f.key, ""])));

const columnOptions = computed(() =>
  headers.value.map(h => ({ label: h, value: h }))
);

const mappedFields = computed(() =>
  FIELDS.value.filter(f => mapping.value[f.key])
);

function close() {
  visible.value = false;
  step.value = "upload";
  file.value = null;
  headers.value = [];
  preview.value = [];
  result.value = null;
  mapping.value = Object.fromEntries(FIELDS.value.map(f => [f.key, ""]));
}

async function loadFile(f: File) {
  file.value = f;
  try {
    const data = await api.equipment.importPreview(f);
    headers.value = data.headers;
    total.value = data.total;
    preview.value = data.preview;
    // Auto-map headers with obvious matches
    for (const field of FIELDS.value) {
      const match = data.headers.find(h =>
        h.toLowerCase().includes(field.key.replace(/_/g, " ")) ||
        h.includes(field.label.split("(")[0].trim())
      );
      if (match) mapping.value[field.key] = match;
    }
    step.value = "mapping";
  } catch (e) {
    message.error(String(e));
  }
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
}

async function confirm() {
  if (!file.value || !mapping.value.name) return;
  importing.value = true;
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping.value)) {
      if (v) clean[k] = v;
    }
    result.value = await api.equipment.importConfirm(file.value, clean);
    step.value = "done";
    emit("imported");
  } catch (e) {
    message.error(String(e));
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 14px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.drop-zone:hover,
.drop-zone--over {
  border-color: var(--brand-color);
  background: rgba(99, 226, 183, 0.05);
}

.mapping-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  align-items: center;
}
.mapping-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.preview-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.preview-table th,
.preview-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
  text-align: right;
}
.preview-table th {
  background: var(--bg-elevated);
  font-weight: 600;
  color: var(--text-secondary);
}
.preview-table tr:last-child td { border-bottom: none; }

.done-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0 16px;
  gap: 8px;
}
.done-screen__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.done-screen__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
