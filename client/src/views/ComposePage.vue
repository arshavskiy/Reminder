<template>
  <div class="compose-page">
    <!-- Template picker (shown until a template is selected) -->
    <template v-if="!selected">
      <n-space align="center" justify="space-between" style="margin-bottom:20px">
        <span style="font-size:16px;font-weight:600">בחר תבנית להדפסה</span>
      </n-space>
      <n-alert v-if="loadError" style="margin-bottom:16px" type="error">{{ loadError }}</n-alert>
      <n-spin :show="loading">
        <n-grid v-if="templates.length" :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="t in templates" :key="t._id">
            <n-card :title="t.name" hoverable style="cursor:pointer" @click="select(t)">
              <template #header-extra><n-tag size="small">{{ t.page }}</n-tag></template>
              <p style="font-size:13px;color:var(--text-secondary);margin:0">
                {{ t.cells.filter(c => c.type === 'field').length }} שדות למילוי
              </p>
            </n-card>
          </n-gi>
        </n-grid>
        <n-empty v-else-if="!loading && !loadError" description="אין תבניות הדפסה. עבור לדף תבניות הדפסה וצור תבנית קודם." style="margin-top:60px" />
      </n-spin>
    </template>

    <!-- Composer (fullscreen feel: preview left, form right) -->
    <template v-else>
      <n-space align="center" justify="space-between" style="margin-bottom:16px">
        <n-space align="center">
          <n-button text @click="selected = null">← בחר תבנית אחרת</n-button>
          <span style="font-size:15px;font-weight:600">{{ selected.name }}</span>
        </n-space>
        <n-button :loading="printing" type="primary" @click="printPdf">🖨 הדפס PDF</n-button>
      </n-space>

      <div class="composer-body">
        <!-- Live preview (A4-proportioned) -->
        <div class="preview-pane">
          <div class="preview-label">תצוגה מקדימה</div>
          <div class="preview-scroll">
            <div :style="{ width: totalWidth + 'px' }" class="preview-paper">
              <table :style="{ direction: selected.dir, width: totalWidth + 'px' }" class="render-table">
                <colgroup>
                  <col v-for="(col, ci) in selected.cols" :key="ci" :style="{ width: col.w + 'px' }" />
                </colgroup>
                <tbody>
                  <tr v-for="(row, ri) in selected.rows" :key="ri" :style="{ height: row.h + 'px' }">
                    <template v-for="ci in selected.cols.length" :key="ci - 1">
                      <td
                        v-if="!isMasked(ri, ci - 1)"
                        :colspan="getCell(ri, ci - 1)?.colSpan ?? 1"
                        :rowspan="getCell(ri, ci - 1)?.rowSpan ?? 1"
                        :style="cellStyle(ri, ci - 1)"
                      >{{ cellValue(ri, ci - 1) }}</td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Field form -->
        <div class="field-pane">
          <div class="field-pane-label">שדות למילוי</div>
          <div class="field-pane-scroll">
            <n-form :show-feedback="false" label-placement="top" size="small" style="padding:16px">
              <n-empty v-if="!fields.length" description="אין שדות בתבנית זו" size="small" />
              <n-form-item v-for="f in fields" :key="f.bind" :label="f.label">
                <n-input
                  v-model:value="data[f.bind]"
                  :placeholder="f.bind"
                  clearable
                />
              </n-form-item>
            </n-form>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {computed, ref} from "vue";
import {useMessage} from "naive-ui";
import {api} from "../services/apiService.js";
import type {PrintTemplate, PrintTemplateCell} from "@shared/types.js";

const message = useMessage();

const loading = ref(false);
const loadError = ref<string | null>(null);
const templates = ref<PrintTemplate[]>([]);
const selected = ref<PrintTemplate | null>(null);
const data = ref<Record<string, string>>({});
const printing = ref(false);

loadTemplates();

async function loadTemplates() {
  loading.value = true;
  loadError.value = null;
  try {
    templates.value = await api.printTemplates.list();
  } catch (e: any) {
    loadError.value = e.message;
  } finally {
    loading.value = false;
  }
}

function select(t: PrintTemplate) {
  selected.value = JSON.parse(JSON.stringify(t));
  data.value = {};
  for (const f of fields.value) data.value[f.bind] = "";
}

// Unique field cells in template order
const fields = computed(() => {
  if (!selected.value) return [];
  const seen = new Set<string>();
  return selected.value.cells
    .filter(c => c.type === "field" && c.bind && !seen.has(c.bind) && seen.add(c.bind!))
    .map(c => ({ bind: c.bind!, label: c.bind! }));
});

const totalWidth = computed(() =>
  selected.value?.cols.reduce((s, c) => s + c.w, 0) ?? 0
);

function getCell(r: number, c: number): PrintTemplateCell | undefined {
  return selected.value?.cells.find(cell => cell.r === r && cell.c === c);
}

function isMasked(r: number, c: number): boolean {
  if (!selected.value) return false;
  return selected.value.cells.some(cell => {
    if (cell.r === r && cell.c === c) return false;
    return r >= cell.r && r < cell.r + (cell.rowSpan ?? 1) &&
           c >= cell.c && c < cell.c + (cell.colSpan ?? 1);
  });
}

function cellValue(r: number, c: number): string {
  const cell = getCell(r, c);
  if (!cell) return "";
  if (cell.type === "label") return cell.text ?? "";
  return cell.bind ? (data.value[cell.bind] ?? "") : "";
}

function cellStyle(r: number, c: number): Record<string, string> {
  const cell = getCell(r, c);
  return {
    textAlign: cell?.align ?? "right",
    fontWeight: cell?.bold ? "700" : "400",
    padding: "2px 4px",
    border: "1px solid #000",
    verticalAlign: "middle",
    fontSize: "12px",
    fontFamily: "Arial, sans-serif",
  };
}

async function printPdf() {
  if (!selected.value?._id) return;
  printing.value = true;
  try {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.value)) payload[k] = v;
    const blob = await api.printTemplates.renderPdf(selected.value._id, payload);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e: any) {
    message.error(e.message);
  } finally {
    printing.value = false;
  }
}
</script>

<style scoped>
.compose-page {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.composer-body {
  display: flex;
  gap: 0;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

/* Preview pane */
.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--border-color);
}

.preview-label,
.field-pane-label {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.preview-scroll {
  flex: 1;
  overflow: auto;
  background: #f5f5f5;
  padding: 24px;
  display: flex;
  justify-content: center;
}

.preview-paper {
  background: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  min-height: 400px;
}

.render-table {
  border-collapse: collapse;
  table-layout: fixed;
}

/* Field pane */
.field-pane {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}

.field-pane-scroll {
  flex: 1;
  overflow-y: auto;
}
</style>
