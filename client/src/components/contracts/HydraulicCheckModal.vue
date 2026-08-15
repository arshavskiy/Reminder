<template>
  <n-modal
      v-model:show="visible"
      :show-icon="false"
      :title="modalTitle"
      class="hydraulic-modal"
      preset="dialog"
      style="width: 860px; max-width: 92vw"
  >
    <n-spin :show="loading" style="min-height: 200px">
      <transition name="hydraulic-fade">
        <n-form v-if="hydraulicForm && !loading" class="hydraulic-compact-form" label-placement="top" size="small">
          <n-grid :cols="gridCols" :x-gap="10" :y-gap="2">
            <n-gi>
              <n-form-item label="מספר תסקיר">
                <n-input
                    :value="hydraulicForm.contract_number"
                    inputmode="numeric"
                    placeholder="הזן מספר"
                    @update:value="setContractNumberInput"
                >
                  <template v-if="currentInspectorNumber()" #prefix>
                    {{ currentInspectorNumber() }}/
                  </template>
                </n-input>
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="מספר תסקיר קודם">
                <n-input v-model:value="prevReportNumber" placeholder="אופציונלי"/>
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="תבנית הדפסה">
                <n-select
                    v-model:value="templateId"
                    :loading="loadingTemplates"
                    :options="templateOptions"
                    :virtual-scroll="false"
                    filterable
                    placeholder="בחר תבנית לפתיחה עם הנתונים"
                    @update:value="selectTemplate"
                />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="לקוח קיים">
                <n-select
                    v-model:value="clientId"
                    :loading="loadingClients"
                    :options="clientOptions"
                    clearable
                    filterable
                    placeholder="בחר לקוח קיים, או השאר ריק ליצירת עסק חדש"
                />
              </n-form-item>
            </n-gi>
          </n-grid>
          <template v-if="!clientId">
            <n-form-item label="שם העסק" required>
              <n-input v-model:value="hydraulicForm.business.display_name" placeholder="לדוגמה: מפעל דן בע&quot;מ"/>
            </n-form-item>
            <n-grid :cols="gridCols" :x-gap="10" :y-gap="2">
              <n-gi>
                <n-form-item label="ח.פ / ת.ז">
                  <n-input v-model:value="hydraulicForm.business.id_number"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="איש קשר">
                  <n-input v-model:value="hydraulicForm.business.contact_person" placeholder="שם איש קשר"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="טלפון">
                  <n-input v-model:value="hydraulicForm.business.phone"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="אימייל">
                  <n-input v-model:value="hydraulicForm.business.email" placeholder="office@example.com"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="כתובת">
                  <n-input v-model:value="hydraulicForm.business.address"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="ת.ד">
                  <n-input v-model:value="hydraulicForm.business.po_box"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="מיקוד">
                  <n-input v-model:value="hydraulicForm.business.client_zipcode"/>
                </n-form-item>
              </n-gi>
            </n-grid>
          </template>
          <template v-else>
            <n-grid :cols="gridCols" :x-gap="10" :y-gap="2">
              <n-gi>
                <n-form-item label="איש קשר">
                  <n-input v-model:value="hydraulicForm.business.contact_person" placeholder="אם שונה מפרטי הלקוח"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="אימייל לתזכורות">
                  <n-input v-model:value="hydraulicForm.business.email" placeholder="אם שונה מפרטי הלקוח"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="טלפון">
                  <n-input v-model:value="hydraulicForm.business.phone" placeholder="אם שונה מפרטי הלקוח"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="כתובת">
                  <n-input v-model:value="hydraulicForm.business.address" placeholder="אם שונה מפרטי הלקוח"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="ת.ד">
                  <n-input v-model:value="hydraulicForm.business.po_box"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="מיקוד">
                  <n-input v-model:value="hydraulicForm.business.client_zipcode"/>
                </n-form-item>
              </n-gi>
            </n-grid>
          </template>

          <div class="hydraulic-section-head">
            <n-h4 style="margin: 16px 0 4px">ציוד נבדק</n-h4>
            <n-button size="small" @click="addEquipment">+ מכונה נוספת</n-button>
          </div>
          <div v-for="(equipment, index) in equipmentRows" :key="equipment.id" class="hydraulic-equipment-card">
            <div class="hydraulic-equipment-card__head">
              <strong>מכונה {{ index + 1 }}</strong>
              <n-button v-if="equipmentRows.length > 1" size="tiny" text type="error"
                        @click="removeEquipment(index)">מחק
              </n-button>
            </div>
            <n-grid :cols="gridCols" :x-gap="10" :y-gap="2">
              <n-gi :span="2">
                <n-form-item label="ציוד קיים ללקוח">
                  <n-select
                      v-model:value="equipment.selected_equipment_id"
                      :disabled="!clientId"
                      :loading="loadingEquipment"
                      :options="equipmentOptions"
                      :virtual-scroll="false"
                      clearable
                      filterable
                      placeholder="חפש לפי שם / יצרן / דגם / מספר סידורי"
                      @update:value="(id) => selectEquipment(index, id)"
                  />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="סוג ציוד" required>
                  <n-select
                      v-model:value="equipment.category"
                      :options="categoryOptions"
                      :virtual-scroll="false"
                      filterable
                      placeholder="בחר או הקלד סוג ציוד"
                      tag
                  />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="שם הציוד">
                  <n-input v-model:value="equipment.name" placeholder="לדוגמה: מלגזה חשמלית / במת הרמה / עגורן"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="יצרן">
                  <n-input v-model:value="equipment.manufacturer"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="דגם">
                  <n-input v-model:value="equipment.model"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="מספר סידורי">
                  <n-input
                      :value="equipment.serial_number"
                      inputmode="numeric"
                      @update:value="(value) => setNumericField(equipment, 'serial_number', value)"
                  />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="מספר רישוי">
                  <n-input
                      v-model:value="equipment.license_number" placeholder="לדוגמה: פנימי 123"
                  />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="עומס עבודה">
                  <n-input v-model:value="equipment.load_capacity_work" placeholder="לדוגמה: 3 טון"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="עומס בדיקה">
                  <n-input v-model:value="equipment.load_capacity_test" placeholder="לדוגמה: 3.75 טון"/>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="רדיוס / טווח">
                  <n-input v-model:value="equipment.load_radius"/>
                </n-form-item>
              </n-gi>
              <n-gi :span="gridCols">
                <n-form-item label="תיאור ציוד">
                  <n-input v-model:value="equipment.description" :rows="1" type="textarea"/>
                </n-form-item>
              </n-gi>
            </n-grid>
          </div>

          <n-divider/>
          <n-form-item label="מועד התזכורת הבאה">
            <n-select v-model:value="reminderMode" :options="reminderModeOptions"/>
          </n-form-item>
          <n-form-item v-if="reminderMode === 'months'" label="בעוד כמה חודשים">
            <n-select v-model:value="intervalMonths" :options="intervalOptions"/>
          </n-form-item>
          <n-form-item v-else label="תאריך תזכורת מותאם אישית" required>
            <n-date-picker
                v-model:value="reminderDateMs"
                :is-date-disabled="disablePastDates"
                style="width: 100%"
                type="date"
            />
          </n-form-item>
          <template v-if="templateExtraFields.length">
            <n-divider/>
            <n-h4 style="margin: 0 0 4px">שדות נוספים מהתבנית</n-h4>
            <n-grid :cols="gridCols" :x-gap="10" :y-gap="2">
              <n-gi v-for="field in templateExtraFields" :key="field">
                <n-form-item :label="field">
                  <n-input v-model:value="templateValues[field]" :placeholder="field"/>
                </n-form-item>
              </n-gi>
            </n-grid>
          </template>
        </n-form>
      </transition>
    </n-spin>
    <template #action>
      <n-button
          v-if="draftStore.hasDraft"
          secondary
          @click="editSavedDraft"
      >
        ערוך טיוטה שמורה{{ draftSavedAtLabel ? ` (${draftSavedAtLabel})` : "" }}
      </n-button>
      <n-button @click="visible = false">ביטול</n-button>
      <n-button
          v-if="updatingContractId"
          :loading="creating"
          @click="doCreate"
      >עדכן
      </n-button>
      <n-button :loading="savingDraft" type="primary" @click="saveDraftAndPreview">שמור טיוטה ופתח
        תצוגה
      </n-button>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {
  NButton,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NH4,
  NInput,
  NModal,
  NSelect,
  NSpin,
  useMessage,
} from "naive-ui";
import {useContractsStore} from "../../stores/contracts.js";
import {useHydraulicCheckDraftStore} from "../../stores/hydraulicCheckDraft.js";
import type {HydraulicCheckRequest} from "../../services/apiService.js";
import {api} from "../../services/apiService.js";
import type {Equipment, PrintTemplate} from "@shared/types.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const emit = defineEmits<{
  (e: "created"): void;
  (e: "updated"): void;
}>();

const visible = defineModel<boolean>("show", {default: false});

const store = useContractsStore();
const draftStore = useHydraulicCheckDraftStore();
const router = useRouter();
const message = useMessage();

const isMobile = ref(window.innerWidth <= 720);

function updateViewport() {
  isMobile.value = window.innerWidth <= 720;
}

onMounted(() => window.addEventListener("resize", updateViewport));
onBeforeUnmount(() => window.removeEventListener("resize", updateViewport));

const gridCols = computed(() => isMobile.value ? 1 : 4);

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const creating = ref(false);
const savingDraft = ref(false);
const hydraulicForm = ref<HydraulicCheckRequest | null>(null);
const clientId = ref<string | null>(null);
const prevReportNumber = ref("");

type EquipmentRow = {
  id: string;
  selected_equipment_id: string | null;
  category: string;
  name: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  license_number: string;
  load_capacity_work: string;
  load_capacity_test: string;
  load_radius: string;
  description: string;
};

const equipmentRows = ref<EquipmentRow[]>([]);
const clientEquipment = ref<Equipment[]>([]);
const loadingEquipment = ref(false);
let equipmentLoadSeq = 0;
const templates = ref<PrintTemplate[]>([]);
const templateId = ref<string | null>(null);
const template = ref<PrintTemplate | null>(null);
const templateValues = ref<Record<string, string>>({});
const loadingTemplates = ref(false);
const hydratingDraft = ref(false);
const clearDraftOnClose = ref(false);
const updatingContractId = ref<string | null>(null);
const updateReturnTo = ref("");
const modalTitle = computed(() => updatingContractId.value ? "עדכון תסקיר" : "תסקיר חדש");

const clientOptions = ref<{ label: string; value: string }[]>([]);
const clientsMap = ref<Map<string, import("@shared/types.js").Client>>(new Map());
const loadingClients = ref(false);
const engineerProfile = ref<{
  inspector_number?: string;
  inspector_id_start?: string;
  next_inspection_seq?: number | null;
} | null>(null);

const knownCategories = ref<string[]>([]);
const categoryDefaults: { label: string; value: string }[] = [
  {label: "מכונות הרמה", value: "lift"},
  {label: "פיגומים", value: "scaffold"},
  {label: "מעליות", value: "ladder"},
];
const categoryOptions = computed(() => {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const opt of categoryDefaults) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    options.push(opt);
  }
  for (const cat of knownCategories.value) {
    const value = cat.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({label: value, value});
  }
  return options;
});

const reminderMode = ref<"months" | "date">("months");
const reminderDateMs = ref<number | null>(null);
const intervalMonths = ref<4 | 6 | 12 | 14>(4);
const reminderModeOptions = [
  {label: "בעוד מספר חודשים מהיום", value: "months"},
  {label: "בתאריך מותאם אישית", value: "date"},
];
const intervalOptions = [
  {label: "4 חודשים", value: 4},
  {label: "6 חודשים", value: 6},
  {label: "12 חודשים", value: 12},
  {label: "14 חודשים", value: 14},
];

const HYDRAULIC_PRINT_TEMPLATE_ID = "6a7cfbee5e95a7b2e1e4b606";

const templateOptions = computed(() =>
    templates.value.map((t) => ({
      label: `${t.name} (${t.cells.filter((cell) => cell.type === "field").length} שדות)`,
      value: t._id,
    }))
);

const equipmentOptions = computed(() =>
    clientEquipment.value.map((eq) => ({
      label: [eq.name, eq.manufacturer, eq.model, eq.serial_number ? `מס׳ ${eq.serial_number}` : null].filter(Boolean).join(" · "),
      value: String(eq.id),
    }))
);

const templateKnownFields = new Set([
  "document_number", "contract_number", "report_number", "prev_report_number",
  "start_date", "inspection_date", "check_date", "expiry_date", "next_inspection_date",
  "valid_until", "inspection_type", "client_name", "client_company", "client_phone",
  "client_email", "client_address", "client_id", "zip_code", "contact_person",
  "po_box", "chassis", "name", "manufacturer", "model", "serial_number", "license_number",
  "load_radius", "load_capacity_test", "load_capacity_work", "equipment_description",
  "checked_equipment",
]);

const templateExtraFields = computed(() => {
  if (!template.value) return [];
  const seen = new Set<string>();
  return template.value.cells
      .filter((cell) => cell.type === "field" && cell.bind && !seen.has(cell.bind) && seen.add(cell.bind))
      .map((cell) => cell.bind!)
      .filter((bind) => !templateKnownFields.has(bind) && !bind.match(/_\d+$/));
});

const draftSavedAtLabel = computed(() => {
  const savedAt = draftStore.draft?.savedAt;
  if (!savedAt) return "";
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("he-IL", {dateStyle: "short", timeStyle: "short"});
});

const suggestedContractNumber = computed(() => {
  const inspectorNumber = currentInspectorNumber();
  if (!inspectorNumber) return "";
  const parsedSeed = parseInt(engineerProfile.value?.inspector_id_start ?? "", 10);
  const seed = Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : null;
  const maxFromRows = store.rows.reduce((max, row) => {
    const seq = extractInspectionSequence(row.contract_number, inspectorNumber);
    return seq && seq > max ? seq : max;
  }, seed ? seed - 1 : 0);
  const storedSeq = Number.isFinite(Number(engineerProfile.value?.next_inspection_seq))
      ? Number(engineerProfile.value?.next_inspection_seq)
      : seed ? seed - 1 : 0;
  if (!seed && maxFromRows <= 0 && storedSeq <= 0) return "";
  const nextSeq = Math.max(seed ?? 1, maxFromRows + 1, storedSeq + 1);
  return `${inspectorNumber}/${nextSeq}`;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function formatLocalDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function todayIso(): string {
  return formatLocalDate(Date.now());
}

function addMonthsToLocalDate(ms: number, months: number): string {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return formatLocalDate(d.getTime());
}

function extractInspectionSequence(contractNumber: string | null | undefined, inspectorNumber: string): number | null {
  if (!contractNumber) return null;
  const [left, right] = contractNumber.split("/").map((part) => part.trim());
  if (!left || !right) return null;
  if (left === inspectorNumber && /^\d+$/.test(right)) return parseInt(right, 10);
  if (right === inspectorNumber && /^\d+$/.test(left)) return parseInt(left, 10);
  return null;
}

function currentInspectorNumber(): string {
  return engineerProfile.value?.inspector_number?.trim() ?? "";
}

function formatContractNumber(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const inspectorNumber = currentInspectorNumber();
  if (!inspectorNumber) return raw.replace(/\D/g, "");
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  const sequence = parts.length > 1
      ? (parts[0] === inspectorNumber ? parts[1] : parts[parts.length - 1])
      : parts[0];
  const digits = String(sequence ?? "").replace(/\D/g, "");
  return digits ? `${inspectorNumber}/${digits}` : "";
}

function contractNumberInputValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const inspectorNumber = currentInspectorNumber();
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts[0] === inspectorNumber) return parts[1]?.replace(/\D/g, "") ?? "";
  return parts.at(-1)?.replace(/\D/g, "") ?? "";
}

function setContractNumberInput(value: string) {
  if (!hydraulicForm.value) return;
  hydraulicForm.value.contract_number = digitsOnly(value);
}

function disablePastDates(ts: number): boolean {
  return startOfLocalDay(ts) < startOfLocalDay(Date.now());
}

function emptyEquipmentRow(): EquipmentRow {
  return {
    id: crypto.randomUUID(),
    selected_equipment_id: null,
    category: "lift",
    name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    license_number: "",
    load_capacity_work: "",
    load_capacity_test: "",
    load_radius: "",
    description: "",
  };
}

function defaultForm(): HydraulicCheckRequest {
  return {
    contract_number: contractNumberInputValue(suggestedContractNumber.value),
    business: {
      display_name: "",
      id_number: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      po_box: "",
      client_zipcode: "",
    },
    equipment: {
      category: "lift",
      name: "",
      manufacturer: "",
      model: "",
      serial_number: "",
      load_capacity_work: "",
      load_capacity_test: "",
      load_radius: "",
      description: "",
    },
    interval_months: 4,
  };
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadClients(force = false) {
  if (clientOptions.value.length && !force) return;
  loadingClients.value = true;
  try {
    const r = await api.clients.list({limit: 500});
    clientOptions.value = r.rows.map((c) => ({label: c.display_name, value: String(c.id)}));
    clientsMap.value = new Map(r.rows.map((c) => [String(c.id), c]));
  } finally {
    loadingClients.value = false;
  }
}

async function loadEngineerProfile() {
  const res = await fetch(`${SERVER}/api/profile/engineer`, {credentials: "include"});
  if (!res.ok) throw new Error(`Failed to load engineer profile: ${res.status}`);
  engineerProfile.value = await res.json();
}

async function loadCategories() {
  try {
    const stats = await api.equipment.stats();
    knownCategories.value = Object.keys(stats ?? {}).filter((c) => c && c !== "all");
  } catch {
    knownCategories.value = [];
  }
}

async function loadClientEquipment(cid: string | null) {
  const seq = ++equipmentLoadSeq;
  clientEquipment.value = [];
  if (!cid) return;
  loadingEquipment.value = true;
  try {
    const rows = await api.equipment.list({client_id: cid}, true);
    if (seq === equipmentLoadSeq) clientEquipment.value = rows;
  } catch {
    if (seq === equipmentLoadSeq) clientEquipment.value = [];
  } finally {
    if (seq === equipmentLoadSeq) loadingEquipment.value = false;
  }
}

async function queueClientEquipmentLoad() {
  const cid = clientId.value;
  clientEquipment.value = [];
  if (!cid) return;
  if (!visible.value) return;
  await nextTick();
  void loadClientEquipment(cid);
}

async function loadPrintTemplates() {
  if (templates.value.length) {
    selectTemplate(templateId.value ?? defaultTemplateId());
    return;
  }
  loadingTemplates.value = true;
  try {
    templates.value = await api.printTemplates.list();
    selectTemplate(defaultTemplateId());
  } catch {
    templates.value = [];
    templateId.value = null;
    template.value = null;
  } finally {
    loadingTemplates.value = false;
  }
}

function defaultTemplateId(): string | null {
  return templates.value.some((t) => t._id === HYDRAULIC_PRINT_TEMPLATE_ID)
      ? HYDRAULIC_PRINT_TEMPLATE_ID
      : templates.value[0]?._id ?? null;
}

function selectTemplate(id: string | null) {
  templateId.value = id;
  template.value = templates.value.find((t) => t._id === id) ?? null;
  if (!template.value) {
    templateValues.value = {};
    return;
  }
  const nextValues: Record<string, string> = {};
  for (const bind of templateExtraFields.value) {
    nextValues[bind] = templateValues.value[bind] ?? "";
  }
  templateValues.value = nextValues;
}

// ── Equipment actions ────────────────────────────────────────────────────────

function addEquipment() {
  equipmentRows.value.push(emptyEquipmentRow());
}

function removeEquipment(index: number) {
  if (equipmentRows.value.length <= 1) return;
  equipmentRows.value.splice(index, 1);
}

function selectEquipment(index: number, id: string | null) {
  const row = equipmentRows.value[index];
  if (!row) return;
  row.selected_equipment_id = id;
  if (!id) return;
  const eq = clientEquipment.value.find((item) => String(item.id) === String(id));
  if (!eq) return;
  row.category = eq.category ?? row.category;
  row.name = eq.name ?? "";
  row.manufacturer = eq.manufacturer ?? "";
  row.model = eq.model ?? "";
  row.serial_number = digitsOnly(eq.serial_number ?? "");
  row.license_number = digitsOnly((eq as any).license_number ?? "");
  row.load_capacity_work = String(eq.capacity ?? "");
  row.load_capacity_test = String((eq as any).load_capacity_test ?? "");
  row.load_radius = String((eq as any).load_radius ?? "");
  row.description = eq.description ?? "";
}

function setNumericField(row: EquipmentRow, field: "serial_number" | "license_number", value: string) {
  row[field] = digitsOnly(value);
}

// ── Client watcher ───────────────────────────────────────────────────────────

async function applyClient(cid: string | null) {
  if (!hydraulicForm.value) return;
  if (hydratingDraft.value) return;
  equipmentRows.value = equipmentRows.value.map((row) => ({...row, selected_equipment_id: null}));

  if (!cid) {
    hydraulicForm.value.business = {
      display_name: "",
      id_number: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      po_box: "",
      client_zipcode: "",
    };
    clientEquipment.value = [];
    return;
  }

  const client = clientsMap.value.get(String(cid));
  if (!client) return;
  hydraulicForm.value.business = {
    ...hydraulicForm.value.business,
    display_name: client.display_name ?? "",
    id_number: client.id_number ?? "",
    contact_person: client.contact_person ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    po_box: (client as any).po_box ?? "",
    client_zipcode: (client as any).client_zipcode ?? "",
  };
  void queueClientEquipmentLoad();
}

watch(clientId, applyClient);
watch(visible, (isOpen) => {
  if (isOpen) void queueClientEquipmentLoad();
});
watch(visible, (isOpen, wasOpen) => {
  if (isOpen || !wasOpen) return;
  if (clearDraftOnClose.value) {
    draftStore.clear();
    clearDraftOnClose.value = false;
    return;
  }
  saveCurrentDraft();
});

// ── Draft ────────────────────────────────────────────────────────────────────

function saveCurrentDraft() {
  if (!hydraulicForm.value) return;
  draftStore.save({
    form: hydraulicForm.value,
    clientId: clientId.value,
    prevReportNumber: prevReportNumber.value,
    equipmentRows: equipmentRows.value,
    reminderMode: reminderMode.value,
    reminderDateMs: reminderDateMs.value,
    intervalMonths: intervalMonths.value,
    templateId: templateId.value,
    templateValues: templateValues.value,
  });
}

async function editSavedDraft() {
  if (!draftStore.draft) {
    message.info("אין טיוטה שמורה לעריכה");
    return;
  }
  await open();
}

// ── Open ─────────────────────────────────────────────────────────────────────

async function open() {
  visible.value = true;
  loading.value = true;
  updatingContractId.value = null;
  updateReturnTo.value = "";
  if (!engineerProfile.value) {
    await loadEngineerProfile().catch(() => {
    });
  }
  const draft = draftStore.draft;
  hydratingDraft.value = true;
  clientId.value = draft?.clientId ?? null;
  reminderMode.value = draft?.reminderMode ?? "months";
  reminderDateMs.value = draft?.reminderDateMs ?? null;
  intervalMonths.value = draft?.intervalMonths ?? 4;
  prevReportNumber.value = draft?.prevReportNumber ?? "";
  equipmentRows.value = draft?.equipmentRows?.length
      ? draft.equipmentRows.map((row) => ({...row, id: row.id || crypto.randomUUID()}))
      : [emptyEquipmentRow()];
  clientEquipment.value = [];
  templateValues.value = {...(draft?.templateValues ?? {})};
  hydraulicForm.value = draft?.form ? {
    ...draft.form,
    business: {...draft.form.business},
    equipment: {...draft.form.equipment}
  } : defaultForm();
  hydratingDraft.value = false;
  loading.value = false;
  void loadPrintTemplates().then(() => {
    if (draft?.templateId) {
      selectTemplate(draft.templateId);
      templateValues.value = {...(draft.templateValues ?? {})};
    }
  });
  if (draft?.templateId) {
    selectTemplate(draft.templateId);
    templateValues.value = {...(draft.templateValues ?? {})};
  }
  void loadClients();
  void loadCategories();
}

// ── Build template data ──────────────────────────────────────────────────────

function syncPrimaryEquipment() {
  if (!hydraulicForm.value) return;
  const first = equipmentRows.value[0] ?? emptyEquipmentRow();
  hydraulicForm.value.equipment = {
    category: first.category as HydraulicCheckRequest["equipment"]["category"],
    name: first.name,
    manufacturer: first.manufacturer,
    model: first.model,
    serial_number: first.serial_number,
    load_capacity_work: first.load_capacity_work,
    load_capacity_test: first.load_capacity_test,
    load_radius: first.load_radius,
    description: first.description,
  };
}

function buildTemplateDraft(): Record<string, string> {
  const form = hydraulicForm.value!;
  const contractNumber = formatContractNumber(form.contract_number?.trim() || suggestedContractNumber.value);
  const nextDate = reminderMode.value === "date" && reminderDateMs.value
      ? formatLocalDate(reminderDateMs.value)
      : addMonthsToLocalDate(Date.now(), intervalMonths.value);
  const today = todayIso();
  const business = form.business;
  const firstEquipment = equipmentRows.value[0] ?? emptyEquipmentRow();
  const data: Record<string, string> = {
    document_number: contractNumber,
    contract_number: contractNumber,
    report_number: contractNumber,
    prev_report_number: prevReportNumber.value,
    start_date: today,
    inspection_date: today,
    check_date: today,
    expiry_date: nextDate,
    next_inspection_date: nextDate,
    inspection_type: "בדיקה תקופתית",
    client_name: business.contact_person ?? "",
    client_company: business.display_name ?? "",
    client_phone: business.phone ?? "",
    client_email: business.email ?? "",
    client_address: business.address ?? "",
    client_id: business.id_number ?? "",
    zip_code: business.client_zipcode ?? "",
    po_box: business.po_box ?? "",
    license_number: firstEquipment.license_number,
  };

  equipmentRows.value.forEach((eq, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    data[`name${suffix}`] = eq.name;
    data[`manufacturer${suffix}`] = eq.manufacturer;
    data[`model${suffix}`] = eq.model;
    data[`serial_number${suffix}`] = eq.serial_number;
    data[`license_number${suffix}`] = eq.license_number;
    data[`lisence_number${suffix}`] = eq.license_number;
    data[`load_radius${suffix}`] = eq.load_radius;
    data[`load_capacity_test${suffix}`] = eq.load_capacity_test;
    data[`load_capacity_work${suffix}`] = eq.load_capacity_work;
    data[`equipment_description${suffix}`] = eq.description;
    data[`checked_equipment${suffix}`] = eq.name;
    data[`chassis${suffix}`] = eq.serial_number;
  });

  const templateBinds = new Set(template.value?.cells.map((cell) => cell.bind).filter(Boolean) ?? []);
  if (templateBinds.has("client_id") && !templateBinds.has("license_number") && firstEquipment.license_number) {
    data.client_id = firstEquipment.license_number;
  }

  for (const [key, value] of Object.entries(templateValues.value)) {
    data[key] = value ?? "";
  }
  return data;
}

function buildTemplateDraftMeta(): Record<string, unknown> {
  return {
    source: "hydraulic_check",
    client_id: clientId.value,
    template_id: templateId.value,
    equipment_ids: equipmentRows.value
        .map((eq) => eq.selected_equipment_id)
        .filter(Boolean),
    equipment_count: equipmentRows.value.length,
  };
}

// ── Create / Update ──────────────────────────────────────────────────────────

async function createContract() {
  if (!hydraulicForm.value) throw new Error("הטופס לא מוכן");
  if (!clientId.value && !hydraulicForm.value.business.display_name.trim()) {
    message.warning("יש לבחור לקוח קיים או להזין שם עסק");
    throw new Error("חסר לקוח");
  }
  if (reminderMode.value === "date" && !reminderDateMs.value) {
    message.warning("יש לבחור תאריך תזכורת");
    throw new Error("חסר תאריך תזכורת");
  }
  const contractNumber = formatContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedContractNumber.value,
  );
  syncPrimaryEquipment();
  const payload: HydraulicCheckRequest = {
    ...hydraulicForm.value,
    contract_number: contractNumber || undefined,
    client_id: clientId.value ?? undefined,
    interval_months: intervalMonths.value,
    skip_reminders: true,
    next_inspection_date: reminderMode.value === "date"
        ? formatLocalDate(reminderDateMs.value!)
        : undefined,
  };
  return api.reminders.createHydraulicCheck(payload);
}

async function updateContract(contractId: string) {
  if (!hydraulicForm.value) throw new Error("הטופס לא מוכן");
  const contractNumber = formatContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedContractNumber.value,
  );
  syncPrimaryEquipment();
  const nextDate = reminderMode.value === "date" && reminderDateMs.value
      ? formatLocalDate(reminderDateMs.value)
      : addMonthsToLocalDate(Date.now(), intervalMonths.value);
  const data = buildTemplateDraft();
  await api.contracts.update(contractId, {
    client_id: clientId.value ?? undefined,
    contract_number: contractNumber || undefined,
    contract_type: "בדיקה הידראולית",
    start_date: data.start_date,
    expiry_date: nextDate,
    summary: data.equipment_description || data.checked_equipment || data.name || undefined,
    manual_fields: {
      ...data,
      inspection_interval_months: intervalMonths.value,
      _equipment: equipmentRows.value.map((eq) => ({
        name: eq.name,
        manufacturer: eq.manufacturer,
        model: eq.model,
        serial_number: eq.serial_number,
        load_capacity_work: eq.load_capacity_work ? [eq.load_capacity_work] : [],
        load_capacity_test: eq.load_capacity_test ? [eq.load_capacity_test] : [],
        load_radius: eq.load_radius ? [eq.load_radius] : [],
        category: eq.category,
      })),
    },
    skip_reminders: true,
  } as any);
  if (templateId.value) {
    await api.printTemplates.saveDraft(
        templateId.value,
        data,
        {...buildTemplateDraftMeta(), contract_id: contractId},
    );
  }
}

async function doCreate() {
  creating.value = true;
  try {
    if (updatingContractId.value) {
      await updateContract(updatingContractId.value);
      message.success("התסקיר עודכן");
      emit("updated");
    } else {
      const result = await createContract();
      message.success(`התסקיר נשמר עבור ${result.client.display_name}. ניתן ליצור תזכורת מהכרטיס.`);
      emit("created");
    }
    clearDraftOnClose.value = true;
    visible.value = false;
    loadClients(true);
    if (updateReturnTo.value) await router.push(updateReturnTo.value);
  } catch (e) {
    message.error(String(e));
  } finally {
    creating.value = false;
  }
}

async function saveDraftAndPreview() {
  if (!hydraulicForm.value) return;
  if (!templateId.value) {
    message.warning("בחר תבנית הדפסה");
    return;
  }
  savingDraft.value = true;
  try {
    syncPrimaryEquipment();
    const data = buildTemplateDraft();
    let contractIdValue = updatingContractId.value ?? "";
    let clientIdValue = clientId.value ?? "";
    if (contractIdValue) {
      await updateContract(contractIdValue);
    } else {
      const result = await createContract();
      contractIdValue = String(result.contract.id ?? "");
      clientIdValue = String(result.client.id ?? clientIdValue);
    }
    await api.printTemplates.saveDraft(
        templateId.value,
        data,
        {...buildTemplateDraftMeta(), contract_id: contractIdValue, client_id: clientIdValue},
    );
    clearDraftOnClose.value = true;
    visible.value = false;
    loadClients(true);
    emit("created");
    await router.push(`/contracts/${contractIdValue}/draft`);
  } catch (e) {
    message.error(String(e));
  } finally {
    savingDraft.value = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
defineExpose({open});
</script>

<style scoped>
:global(.hydraulic-modal.n-dialog) {
  direction: rtl;
  border-radius: 8px;
  font-family: var(--font-base) !important;
  padding: 16px 20px 14px;
}

:global(.hydraulic-modal.n-dialog *),
:global(.hydraulic-modal .n-dialog__title),
:global(.hydraulic-modal .n-h),
:global(.hydraulic-modal .n-button),
:global(.hydraulic-modal .n-input),
:global(.hydraulic-modal .n-input__input-el),
:global(.hydraulic-modal .n-base-selection),
:global(.hydraulic-modal .n-base-selection-label),
:global(.hydraulic-modal .n-date-picker) {
  font-family: var(--font-base) !important;
}

:global(.hydraulic-modal .n-dialog__title) {
  color: var(--text-primary);
  font-size: 19px !important;
  font-weight: 700 !important;
  letter-spacing: -0.2px;
}

:global(.hydraulic-modal .n-dialog__close) {
  top: 10px;
  left: 10px;
  right: auto;
}

:global(.hydraulic-modal .n-dialog__content) {
  margin-top: 6px;
  padding: 8px 16px 12px;
  max-height: min(72vh, 760px);
  overflow: auto;
  scrollbar-gutter: stable;
}

:global(.hydraulic-modal .n-dialog__action) {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  gap: 6px;
}

.hydraulic-compact-form {
  padding: 0;
}

.hydraulic-compact-form :deep(.n-grid) {
  align-items: start;
}

.hydraulic-compact-form :deep(.n-form-item) {
  margin-bottom: 0;
}

.hydraulic-compact-form :deep(.n-form-item-label) {
  min-height: 16px;
  padding: 0 0 2px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1px;
}

.hydraulic-compact-form :deep(.n-form-item-label__asterisk) {
  color: var(--error-color, #d03050);
  font-weight: 800;
}

.hydraulic-compact-form :deep(.n-input),
.hydraulic-compact-form :deep(.n-base-selection),
.hydraulic-compact-form :deep(.n-date-picker) {
  --n-border-radius: 6px;
  min-height: 32px;
  font-family: inherit;
}

.hydraulic-compact-form :deep(.n-input .n-input-wrapper),
.hydraulic-compact-form :deep(.n-base-selection .n-base-selection-label) {
  min-height: 32px;
  background: var(--bg-card);
}

.hydraulic-compact-form :deep(.n-input:hover),
.hydraulic-compact-form :deep(.n-base-selection:hover) {
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.08);
}

.hydraulic-compact-form :deep(.n-input--focus),
.hydraulic-compact-form :deep(.n-base-selection--active) {
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.14);
}

.hydraulic-compact-form :deep(.n-input__input-el),
.hydraulic-compact-form :deep(.n-base-selection-input),
.hydraulic-compact-form :deep(.n-base-selection-placeholder),
.hydraulic-compact-form :deep(.n-base-selection-input__content) {
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
}

.hydraulic-compact-form :deep(.n-input__placeholder),
.hydraulic-compact-form :deep(.n-base-selection-placeholder) {
  color: var(--text-muted);
  font-weight: 400;
}

.hydraulic-compact-form :deep(.n-input__prefix) {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 400;
}

.hydraulic-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 6px 0 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.hydraulic-section-head :deep(.n-h) {
  margin: 0 !important;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.1px;
}

.hydraulic-equipment-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  margin-top: 6px;
  background: var(--bg-elevated);
}

.hydraulic-equipment-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.hydraulic-equipment-card__head strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
}

.hydraulic-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.hydraulic-fade-leave-active {
  transition: opacity 0.15s ease;
}

.hydraulic-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.hydraulic-fade-leave-to {
  opacity: 0;
}
</style>
