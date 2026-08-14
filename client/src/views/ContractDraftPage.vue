<template>
  <div class="contract-draft">
    <PageHeader :title="draftTitle">
      <template #breadcrumb>
        <router-link to="/contracts">תסקירים</router-link>
        <span class="sep">/</span>
        <span>{{ template?.name ?? "טיוטה" }}</span>
      </template>
      <template #actions>
        <button class="xl-btn" @click="editContractFromDraft">ערוך</button>
        <button :disabled="draftSaving" :class="{ 'xl-btn--loading': draftSaving }" class="xl-btn" @click="saveComposeDraft">
          <span v-if="draftSaving" class="xl-loader" aria-hidden="true"></span>
          <span>שמור טיוטה</span>
        </button>
        <button :disabled="printing" :class="{ 'xl-btn--loading': printing }" class="xl-btn xl-btn--primary" @click="printPdf">
          <span v-if="printing" class="xl-loader" aria-hidden="true"></span>
          <span>🖨 הדפס</span>
        </button>
        <button :disabled="savingPdf" :class="{ 'xl-btn--loading': savingPdf }" class="xl-btn xl-btn--primary" @click="savePdf">
          <span v-if="savingPdf" class="xl-loader" aria-hidden="true"></span>
          <span>הורד</span>
        </button>
      </template>
    </PageHeader>

    <n-alert v-if="loadError" style="margin-bottom:16px" type="error">{{ loadError }}</n-alert>

    <div v-if="loading" class="route-draft-loading">
      <n-spin :show="true" size="large">
        <div class="route-draft-loading__text">טוען טיוטת תסקיר...</div>
      </n-spin>
    </div>

    <div v-else-if="template" class="compose-wrap">
      <div class="compose-preview">
        <div class="pane-label pane-label--with-status">
          <span>תצוגה מקדימה</span>
          <span v-if="draftSavedAt" class="compose-draft-status">טיוטה נשמרה {{ formatDraftTime(draftSavedAt) }}</span>
        </div>
        <div class="compose-scroll">
          <div :style="{ width: Math.max(composeTotalWidth, 780) + 'px' }" class="doc-paper">
            <table :style="{ direction: template.dir, width: composeTotalWidth + 'px' }" class="render-table">
              <colgroup>
                <col v-for="(col, ci) in template.cols" :key="ci" :style="{ width: col.w + 'px' }" />
              </colgroup>
              <tbody>
                <tr v-for="(row, ri) in template.rows" :key="ri" :style="{ height: row.h + 'px' }">
                  <template v-for="ci in template.cols.length" :key="ci - 1">
                    <td
                      v-if="!isComposeMasked(ri, ci - 1)"
                      :colspan="getComposeCell(ri, ci - 1)?.colSpan ?? 1"
                      :rowspan="getComposeCell(ri, ci - 1)?.rowSpan ?? 1"
                      :style="composeCellStyle(ri, ci - 1)"
                    >
                      <template v-if="isComposeFieldCell(ri, ci - 1)">
                        <textarea
                          v-if="isComposeFieldMultiline(ri, ci - 1)"
                          :value="composeData[composeCellBind(ri, ci - 1)] ?? ''"
                          :placeholder="composeCellBind(ri, ci - 1)"
                          :class="{ 'compose-cell-input--invalid': composeFieldError(composeCellBind(ri, ci - 1)) }"
                          :title="composeFieldError(composeCellBind(ri, ci - 1))"
                          class="compose-cell-input compose-cell-input--textarea"
                          @input="setComposeValue(composeCellBind(ri, ci - 1), ($event.target as HTMLTextAreaElement).value)"
                          @mousedown.stop
                          @click.stop
                        />
                        <input
                          v-else
                          :value="composeData[composeCellBind(ri, ci - 1)] ?? ''"
                          :placeholder="composeCellBind(ri, ci - 1)"
                          :type="composeFieldInputType(composeCellBind(ri, ci - 1))"
                          :inputmode="composeFieldInputMode(composeCellBind(ri, ci - 1))"
                          :class="{ 'compose-cell-input--invalid': composeFieldError(composeCellBind(ri, ci - 1)) }"
                          :title="composeFieldError(composeCellBind(ri, ci - 1))"
                          class="compose-cell-input"
                          @input="setComposeValue(composeCellBind(ri, ci - 1), ($event.target as HTMLInputElement).value)"
                          @mousedown.stop
                          @click.stop
                        />
                      </template>
                      <span v-else v-html="composeCellHtml(ri, ci - 1)" />
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="compose-form">
        <div class="pane-label">שדות למילוי</div>
        <div class="compose-fields">
          <div
            v-for="f in composeFields"
            :key="f.bind"
            :class="{ 'compose-field-row--filled': f.value && !f.error, 'compose-field-row--invalid': f.error }"
            class="compose-field-row"
          >
            <label class="compose-field-label">
              <span>{{ f.label }}<b v-if="f.required" class="compose-required">*</b></span>
              <span v-if="f.value" class="compose-field-current">{{ composeDisplayValue(f.bind) }}</span>
            </label>
            <textarea
              v-if="f.multiline"
              :value="composeData[f.bind] ?? ''"
              :placeholder="f.bind"
              :class="{ 'compose-field-input--invalid': f.error }"
              class="compose-field-textarea"
              rows="2"
              @input="setComposeValue(f.bind, ($event.target as HTMLTextAreaElement).value)"
              @mousedown.stop
              @click.stop
            />
            <input
              v-else
              :value="composeData[f.bind] ?? ''"
              :placeholder="f.bind"
              :type="f.inputType"
              :inputmode="f.inputMode"
              :class="{ 'compose-field-input--invalid': f.error }"
              class="compose-field-input"
              @input="setComposeValue(f.bind, ($event.target as HTMLInputElement).value)"
              @mousedown.stop
              @click.stop
            />
            <div v-if="f.error" class="compose-field-error">{{ f.error }}</div>
            <div v-else class="compose-field-hint">{{ f.hint }}</div>
          </div>
          <div v-if="!composeFields.length" class="compose-empty">אין שדות</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {RouterLink, useRoute, useRouter} from "vue-router";
import {NAlert, NSpin, useMessage} from "naive-ui";
import PageHeader from "../components/PageHeader.vue";
import {api} from "../services/apiService.js";
import type {PrintTemplate, PrintTemplateCell} from "@shared/types.js";

type ComposeFieldKind = "text" | "multiline" | "date" | "email" | "phone" | "number" | "integer" | "report_number";
type ComposeFieldMeta = {
  label: string;
  kind: ComposeFieldKind;
  required: boolean;
  multiline: boolean;
  inputType: string;
  inputMode: "text" | "email" | "tel" | "numeric" | "decimal";
  hint: string;
};

const route = useRoute();
const router = useRouter();
const message = useMessage();
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const loading = ref(true);
const loadError = ref<string | null>(null);
const template = ref<PrintTemplate | null>(null);
const composeData = ref<Record<string, string>>({});
const draftMeta = ref<Record<string, unknown>>({});
const draftSavedAt = ref<string | null>(null);
const engineerProfile = ref<{ inspector_number?: string | null } | null>(null);
const printing = ref(false);
const savingPdf = ref(false);
const draftSaving = ref(false);

const routeContractId = computed(() => typeof route.params.contractId === "string" ? route.params.contractId : "");
const draftTitle = computed(() => `${template.value?.name ?? "תסקיר"} — מילוי שדות`);
const composeTotalWidth = computed(() => template.value?.cols.reduce((sum, col) => sum + col.w, 0) ?? 0);

const composeFields = computed(() => {
  if (!template.value) return [];
  const seen = new Set<string>();
  const priority = new Map([["document_number", 0], ["expiry_date", 1], ["start_date", 2]]);
  return template.value.cells
    .filter((cell) => cell.type === "field" && cell.bind && !seen.has(cell.bind) && seen.add(cell.bind))
    .map((cell, index) => {
      const bind = cell.bind!;
      const meta = composeFieldMeta(bind);
      const value = composeData.value[bind] ?? "";
      return { bind, value, index, ...meta, error: validateComposeField(bind, value) };
    })
    .sort((a, b) => (priority.get(a.bind) ?? 999) - (priority.get(b.bind) ?? 999) || a.index - b.index);
});

onMounted(loadDraft);

async function loadDraft() {
  if (!routeContractId.value) {
    loadError.value = "חסר מזהה חוזה";
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    const draft = await api.printTemplates.getContractDraft(routeContractId.value);
    const [loadedTemplate] = await Promise.all([
      api.printTemplates.get(draft.template_id),
      loadEngineerProfile().catch(() => {}),
    ]);
    template.value = normalizeLegacyTemplateBindings(loadedTemplate);
    composeData.value = {};
    for (const field of composeFields.value) composeData.value[field.bind] = "";
    applyComposeDraft(draft);
  } catch (error: any) {
    loadError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
}

async function loadEngineerProfile() {
  if (engineerProfile.value) return;
  const res = await fetch(`${SERVER}/api/profile/engineer`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load engineer profile: ${res.status}`);
  engineerProfile.value = await res.json();
}

function applyComposeDraft(draft: {
  data: Record<string, string>;
  meta?: Record<string, unknown>;
  client_id?: string | null;
  contract_id?: string | null;
  updated_at: string | null;
}) {
  composeData.value = normalizeComposeData({ ...composeData.value, ...stringRecord(draft.data) });
  draftMeta.value = {
    ...(draft.meta && typeof draft.meta === "object" && !Array.isArray(draft.meta) ? draft.meta : {}),
    ...(draft.client_id ? { client_id: draft.client_id } : {}),
    ...(draft.contract_id ? { contract_id: draft.contract_id } : { contract_id: routeContractId.value }),
  };
  draftSavedAt.value = draft.updated_at;
}

function normalizeLegacyTemplateBindings(rawTemplate: PrintTemplate): PrintTemplate {
  const copy = JSON.parse(JSON.stringify(rawTemplate)) as PrintTemplate;
  const licenseRows = new Set(
    copy.cells
      .filter((cell) => cell.type === "label" && legacyCellText(cell).includes("מספר רישוי"))
      .map((cell) => cell.r)
  );
  for (const cell of copy.cells) {
    if (cell.type === "field" && cell.bind === "client_id" && licenseRows.has(cell.r)) {
      cell.bind = "license_number";
    }
  }
  return copy;
}

function legacyCellText(cell: PrintTemplateCell): string {
  return `${cell.text ?? ""} ${cell.html?.replace(/<[^>]*>/g, " ") ?? ""}`;
}

function composeFieldMeta(bind: string): ComposeFieldMeta {
  const base = baseComposeBind(bind);
  const kind = composeFieldKind(base);
  return {
    label: composeFieldLabels[base] ?? base,
    kind,
    required: composeRequiredFields.has(base),
    multiline: kind === "multiline",
    inputType: composeFieldInputType(base),
    inputMode: composeFieldInputMode(base),
    hint: composeFieldHint(kind),
  };
}

const composeFieldLabels: Record<string, string> = {
  document_number: "מספר תסקיר",
  contract_number: "מספר חוזה",
  report_number: "מספר תסקיר",
  prev_report_number: "מספר תסקיר קודם",
  start_date: "תאריך בדיקה",
  expiry_date: "בתוקף עד",
  contact_person: "איש קשר",
  client_name: "שם לקוח",
  client_company: "שם הלקוח/תופש",
  inspection_type: "סוג בדיקה",
  client_phone: "טלפון",
  client_email: "מייל",
  client_address: "יישוב",
  zip_code: "מיקוד",
  client_id: "מספר רישוי",
  license_number: "מספר רישוי",
  lisence_number: "מספר רישוי",
  serial_number: "מס׳ סידורי",
};

const composeRequiredFields = new Set([
  "document_number",
  "report_number",
  "contract_number",
  "start_date",
  "expiry_date",
  "contact_person",
  "client_company",
  "client_name",
  "inspection_type",
  "client_phone",
]);

function baseComposeBind(bind: string): string {
  return bind.replace(/_\d+$/, "");
}

function composeFieldKind(bind: string): ComposeFieldKind {
  if (bind.startsWith("findings_") || bind.includes("description") || bind === "checked_equipment") return "multiline";
  if (bind.includes("email")) return "email";
  if (bind.includes("phone") || bind === "contact_phone") return "phone";
  if (bind.includes("date") || bind === "expiry_date" || bind === "valid_until" || bind === "start_date" || bind === "check_date") return "date";
  if (["document_number", "report_number", "prev_report_number", "contract_number"].includes(bind)) return "report_number";
  if (["zip_code", "client_id", "license_number", "lisence_number", "serial_number"].includes(bind)) return "integer";
  if (bind.includes("amount") || bind.includes("load_capacity") || bind.includes("load_radius")) return "number";
  return "text";
}

function composeFieldInputType(bind: string): string {
  const kind = composeFieldKind(baseComposeBind(bind));
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  return "text";
}

function composeFieldInputMode(bind: string): "text" | "email" | "tel" | "numeric" | "decimal" {
  const kind = composeFieldKind(baseComposeBind(bind));
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  if (kind === "integer" || kind === "report_number") return "numeric";
  if (kind === "number") return "decimal";
  return "text";
}

function composeFieldHint(kind: ComposeFieldKind): string {
  if (kind === "date") return "DD/MM/YYYY";
  if (kind === "email") return "name@example.com";
  if (kind === "phone") return "ספרות, רווחים, + או -";
  if (kind === "report_number") return "ספרות או מספר מפקח/מספר";
  if (kind === "integer") return "ספרות בלבד";
  if (kind === "number") return "מספר, אפשר עם יחידה";
  return "";
}

function validateComposeField(bind: string, value: string): string {
  const base = baseComposeBind(bind);
  const meta = composeFieldMeta(base);
  const raw = value.trim();
  if (!raw) return meta.required ? "שדה חובה" : "";
  if (meta.kind === "date" && !isValidComposeDate(raw)) return "תאריך לא תקין";
  if (meta.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return "אימייל לא תקין";
  if (meta.kind === "phone" && !/^\+?[\d\s().-]{7,}$/.test(raw)) return "טלפון לא תקין";
  if (meta.kind === "report_number" && !/^\d+(?:\/\d+)?$/.test(raw)) return "יש להזין ספרות או מספר מפקח/מספר";
  if (meta.kind === "integer" && !/^\d+$/.test(raw)) return "יש להזין ספרות בלבד";
  if (meta.kind === "number" && !/^\d+(?:[.,]\d+)?(?:\s*\S+)?$/.test(raw)) return "מספר לא תקין";
  return "";
}

function validateComposeBeforeAction(actionLabel: string): boolean {
  const errors = composeFields.value.filter((field) => field.error);
  if (!errors.length) return true;
  const names = errors.slice(0, 3).map((field) => field.label).join(", ");
  message.error(`אי אפשר ${actionLabel}: יש לתקן ${names}${errors.length > 3 ? "..." : ""}`);
  return false;
}

function isValidComposeDate(value: string): boolean {
  return Boolean(normalizeDateForContract(value));
}

function setComposeValue(bind: string, value: string) {
  const base = baseComposeBind(bind);
  const kind = composeFieldKind(base);
  let next = value;
  if (kind === "integer") next = value.replace(/\D/g, "");
  if (kind === "report_number") next = sanitizeComposeReportNumber(value);
  composeData.value = { ...composeData.value, [bind]: next };
}

function composeFieldError(bind: string): string {
  return validateComposeField(bind, composeData.value[bind] ?? "");
}

function getComposeCell(r: number, c: number) {
  return template.value?.cells.find((cell) => cell.r === r && cell.c === c);
}

function composeCellBind(r: number, c: number): string {
  const cell = getComposeCell(r, c);
  return cell?.type === "field" ? (cell.bind ?? "") : "";
}

function isComposeFieldCell(r: number, c: number): boolean {
  return Boolean(composeCellBind(r, c));
}

function isComposeFieldMultiline(r: number, c: number): boolean {
  const bind = composeCellBind(r, c);
  const rowHeight = template.value?.rows[r]?.h ?? 0;
  const cell = getComposeCell(r, c);
  return bind.startsWith("findings_") || rowHeight >= 44 || (cell?.rowSpan ?? 1) > 1;
}

function isComposeMasked(r: number, c: number) {
  if (!template.value) return false;
  return template.value.cells.some((cell) => {
    if (cell.r === r && cell.c === c) return false;
    return r >= cell.r && r < cell.r + (cell.rowSpan ?? 1) && c >= cell.c && c < cell.c + (cell.colSpan ?? 1);
  });
}

function composeCellHtml(r: number, c: number) {
  const cell = getComposeCell(r, c);
  if (!cell) return "";
  if (cell.type === "image") return imageHtml(cell);
  return cell.type === "label"
    ? richCellHtml(cell)
    : escHtml(cell.bind ? composeDisplayValue(cell.bind) : "");
}

function composeCellStyle(r: number, c: number) {
  const cell = getComposeCell(r, c);
  return {
    textAlign: cell?.align ?? "right",
    fontWeight: cell?.bold ? "700" : "400",
    color: cell?.color ?? "inherit",
    padding: "2px 4px",
    border: "1px solid #000",
    verticalAlign: cell?.valign ?? "middle",
    fontSize: "12px",
  };
}

function collectComposeData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(composeData.value)) {
    const base = baseComposeBind(key);
    const kind = composeFieldKind(base);
    if (kind === "date") data[key] = normalizeDateForDisplay(value);
    else if (kind === "report_number") data[key] = formatComposeReportNumber(value, base);
    else data[key] = value;
  }
  return data;
}

function normalizeComposeData(data: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const base = baseComposeBind(key);
    const kind = composeFieldKind(base);
    if (kind === "integer") normalized[key] = value.replace(/\D/g, "");
    else if (kind === "report_number") normalized[key] = sanitizeComposeReportNumber(value);
    else if (kind === "date") normalized[key] = normalizeDateForDisplay(value);
    else normalized[key] = value;
  }
  return normalized;
}

function stringRecord(raw: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) data[key] = value == null ? "" : String(value);
  return data;
}

function composeDisplayValue(bind: string): string {
  const base = baseComposeBind(bind);
  const value = composeData.value[bind] ?? "";
  return composeFieldKind(base) === "report_number" ? formatComposeReportNumber(value, base) : value;
}

function sanitizeComposeReportNumber(value: string): string {
  return value.trim().replace(/[^\d/]/g, "").replace(/\/{2,}/g, "/");
}

function formatComposeReportNumber(value: string, base: string): string {
  const raw = sanitizeComposeReportNumber(value);
  if (!raw || base === "prev_report_number") return raw;
  const inspectorNumber = engineerProfile.value?.inspector_number?.trim();
  if (!inspectorNumber) return raw;
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    if (parts[0] === inspectorNumber) {
      const suffix = parts.slice(1).join("").replace(/\D/g, "");
      return suffix ? `${inspectorNumber}/${suffix}` : inspectorNumber;
    }
    return raw;
  }
  return `${inspectorNumber}/${parts[0]}`;
}

async function saveComposeDraft() {
  if (!template.value?._id) return;
  draftSaving.value = true;
  try {
    const saved = await api.printTemplates.saveDraft(template.value._id, stringRecord(collectComposeData()), draftMeta.value);
    draftMeta.value = saved.meta ?? draftMeta.value;
    draftSavedAt.value = saved.updated_at;
    message.success("הטיוטה נשמרה");
  } catch (error: any) {
    message.error(error.message ?? String(error));
  } finally {
    draftSaving.value = false;
  }
}

async function printPdf() {
  if (!template.value?._id) return;
  if (!validateComposeBeforeAction("להדפיס PDF")) return;
  printing.value = true;
  try {
    const blob = await api.printTemplates.renderPdf(template.value._id, collectComposeData());
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error: any) {
    message.error(error.message ?? String(error));
  } finally {
    printing.value = false;
  }
}

async function savePdf() {
  if (!template.value?._id) return;
  if (!validateComposeBeforeAction("לשמור PDF")) return;
  savingPdf.value = true;
  try {
    const data = collectComposeData();
    const blob = await api.printTemplates.savePdf(template.value._id, data, {
      ...draftMeta.value,
      client_id: draftClientId(),
      contract_id: routeContractId.value,
    });
    downloadBlob(blob, generatedPdfFileName(data, template.value.name));
    message.success("PDF נשמר במסמכים והורד");
  } catch (error: any) {
    message.error(error.message ?? String(error));
  } finally {
    savingPdf.value = false;
  }
}

async function editContractFromDraft() {
  if (!routeContractId.value) return;
  await router.push({
    path: "/contracts",
    query: {
      edit: routeContractId.value,
      returnTo: route.fullPath,
    },
  });
}

function draftClientId(): string | null {
  const value = draftMeta.value.client_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDateForContract(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDateParts(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (match) {
    const dayNumber = Number(match[1]);
    const monthNumber = Number(match[2]);
    const day = String(dayNumber).padStart(2, "0");
    const month = String(monthNumber).padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    if (!isValidDateParts(Number(year), monthNumber, dayNumber)) return null;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function normalizeDateForDisplay(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const iso = normalizeDateForContract(raw);
  if (!iso) return value;
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function generatedPdfFileName(data: Record<string, unknown>, fallback: string): string {
  const parts = [
    pickFirstString(data, ["equipment_type", "inspection_type", "contract_type", "type", "checked_equipment"]),
    pickFirstString(data, ["license_number", "lisence_number"]),
    pickFirstString(data, ["client_company", "client_name", "company", "counterparty"]),
    pickFirstString(data, ["contract_number", "document_number", "report_number"]),
  ].filter(Boolean);
  return `${safeFileName(parts.join(" ") || fallback)}.pdf`;
}

function pickFirstString(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function safeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "template";
}

function formatDraftTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

function richCellHtml(cell: PrintTemplateCell): string {
  if (cell.html) return sanitizeRichHtml(cell.html);
  return escHtml(cell.text ?? "");
}

function imageHtml(cell: PrintTemplateCell): string {
  const src = safeImageSrc(cell.src ?? "");
  if (!src) return "";
  return `<img class="xl-cell-img" src="${escAttr(src)}" alt="${escAttr(cell.alt ?? "")}">`;
}

function safeImageSrc(src: string): string {
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return "";
}

function sanitizeRichHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  function clean(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escHtml(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const children = Array.from(el.childNodes).map(clean).join("");
    if (["B", "STRONG"].includes(el.tagName)) return `<strong>${children}</strong>`;
    if (["BR"].includes(el.tagName)) return "<br>";
    if (["SPAN", "FONT"].includes(el.tagName)) {
      const style = [];
      const color = el.style.color || el.getAttribute("color");
      if (color) style.push(`color:${escAttr(color)}`);
      return style.length ? `<span style="${style.join(";")}">${children}</span>` : children;
    }
    if (["DIV", "P"].includes(el.tagName)) return `${children}<br>`;
    return children;
  }
  return Array.from(doc.body.firstElementChild?.childNodes ?? []).map(clean).join("");
}

function escHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]!));
}

function escAttr(value: string): string {
  return escHtml(value).replace(/`/g, "&#096;");
}
</script>

<style scoped>
.contract-draft {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.route-draft-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
}
.route-draft-loading__text {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}
.xl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 4px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  color: #222;
}
.xl-btn--primary { background: #217346; color: #fff; border-color: #217346; }
.xl-btn:hover { background: #f0f0f0; }
.xl-btn--primary:hover { background: #185c38; }
.xl-btn--loading { cursor: wait; opacity: .78; }
.xl-loader {
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  flex: 0 0 auto;
  animation: xl-spin .7s linear infinite;
}
@keyframes xl-spin { to { transform: rotate(360deg); } }
.compose-wrap {
  display: flex;
  gap: 0;
  flex: 1;
  overflow: hidden;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.compose-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #ccc;
}
.pane-label {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
  background: #f3f3f3;
  border-bottom: 1px solid #ccc;
}
.pane-label--with-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.compose-draft-status {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.compose-scroll {
  flex: 1;
  overflow: auto;
  background: #eee;
  padding: 20px;
}
.doc-paper {
  margin: 0 auto;
  background: #fff;
}
.render-table {
  border-collapse: collapse;
  table-layout: fixed;
  font-family: Arial, sans-serif;
}
.render-table :deep(.xl-cell-img) {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
  object-fit: contain;
}
.compose-form {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}
.compose-fields {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.compose-field-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  border-radius: 4px;
}
.compose-field-row--filled { background: #eef8f1; }
.compose-field-row--invalid { background: #fff1f2; }
.compose-field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #555;
}
.compose-required { color: #d03050; margin-inline-start: 3px; }
.compose-field-current {
  min-width: 0;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #217346;
  font-weight: 500;
  direction: rtl;
}
.compose-field-input,
.compose-field-textarea,
.compose-cell-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cfd5dd;
  border-radius: 3px;
  padding: 6px 8px;
  font: 400 12px Arial, sans-serif;
  color: #0f172a;
  background: #fff;
  direction: rtl;
}
.compose-field-input:focus,
.compose-field-textarea:focus,
.compose-cell-input:focus {
  border-color: #217346;
  outline: none;
}
.compose-field-input--invalid,
.compose-cell-input--invalid {
  border-color: #e11d48;
}
.compose-field-error,
.compose-field-hint {
  font-size: 11px;
  line-height: 1.25;
}
.compose-field-error { color: #e11d48; }
.compose-field-hint { color: #94a3b8; }
.compose-field-textarea,
.compose-cell-input--textarea {
  resize: vertical;
  min-height: 44px;
}
.compose-cell-input {
  height: 100%;
  min-height: 24px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: inherit;
  padding: 2px 4px;
}
.compose-cell-input:focus {
  background: rgba(33, 115, 70, 0.06);
  box-shadow: inset 0 0 0 1px #217346;
}
.compose-empty {
  padding: 16px;
  color: #999;
  font-size: 13px;
}
@media (max-width: 900px) {
  .contract-draft { padding: 16px; }
  .compose-wrap {
    flex-direction: column;
    overflow: visible;
  }
  .compose-preview {
    border-left: 0;
    border-bottom: 1px solid #ccc;
    min-height: 520px;
  }
  .compose-form {
    width: 100%;
    max-height: none;
  }
}
</style>
