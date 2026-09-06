<template>
  <n-modal
      v-model:show="visible"
      :show-icon="false"
      class="hydraulic-modal"
      :style="{ width: showLayoutPreview ? 'min(1340px, 96vw)' : 'min(900px, 96vw)', maxWidth: '96vw' }"
      preset="card"
  >
    <template #header>
      <div class="hm-header">
        <button class="hm-header__close" title="סגור" @click="visible = false">
          <n-icon :component="CloseOutline" :size="18"/>
        </button>
        <div class="hm-header__title">
          <n-icon :component="DocumentTextOutline" :size="22"/>
          <span>{{ modalTitle }}</span>
        </div>
        <div v-if="draftStore.hasDraft" class="hm-header__draft">
          <div class="hm-draft-pill" @click="editSavedDraft">
            <n-icon :component="TimeOutline" :size="14"/>
            <span>טיוטה שמורה{{ draftSavedAtLabel ? ` (${draftSavedAtLabel})` : "" }}</span>
            <button class="hm-draft-pill__close" title="מחק טיוטה" @click.stop="clearDraft">
              <n-icon :component="CloseOutline" :size="12"/>
            </button>
          </div>
        </div>
      </div>
    </template>

    <div :class="{ 'hm-shell--preview': showLayoutPreview }" class="hm-shell">
      <div class="hm-main">
        <n-spin :show="loading" style="min-height: 200px">
          <transition name="hydraulic-fade">
            <div v-if="hydraulicForm && !loading">
              <!-- Step indicators -->
              <div class="hm-steps">
                <button
                    v-for="(step, i) in steps"
                    :key="step.key"
                    :class="['hm-step', { 'hm-step--active': activeStep === step.key, 'hm-step--done': i < stepIndex }]"
                    @click="activeStep = step.key"
                >
                  <span class="hm-step__num">{{ i + 1 }}</span>
                  <span class="hm-step__label">{{ step.label }}</span>
                </button>
              </div>

              <!-- Step: Basic -->
              <section v-show="activeStep === 'basic'" class="hm-section">
                <div class="hm-section__grid hm-section__grid--4">
                  <div class="hm-field hm-field--span2">
                    <label class="required">סוג תסקיר</label>
                    <n-select
                        v-model:value="reportType"
                        :options="reportTypeOptions"
                        :virtual-scroll="false"
                        filterable
                        placeholder="בחר סוג תסקיר"
                        @update:value="applyReportType"
                    />
                  </div>
                  <div class="hm-field">
                    <label>מספר תסקיר</label>
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
                  </div>
                  <div class="hm-field">
                    <label>תסקיר קודם</label>
                    <n-input v-model:value="prevReportNumber" placeholder="אופציונלי"/>
                  </div>
                  <div class="hm-field">
                    <label>תבנית הדפסה</label>
                    <div class="hm-field__row">
                      <n-select
                          v-model:value="templateId"
                          :consistent-menu-width="false"
                          :loading="loadingTemplates"
                          :menu-props="{style: 'width:100px!important;max-width:100px!important'}"
                          :options="templateOptions"
                          :virtual-scroll="false"
                          filterable
                          placeholder="בחר תבנית"
                          style="width:100px;flex:none"
                          @update:value="(id) => selectTemplate(id, {syncReportType: true})"
                      />
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <button
                              type="button"
                              class="btn btn--ghost btn--xs icon-btn"
                              aria-label="ערוך תבנית"
                              :disabled="!templateId"
                              @click="openEditPrintTemplate"
                          >
                            <n-icon :component="CreateOutline" :size="16"/>
                          </button>
                        </template>
                        ערוך תבנית
                      </n-tooltip>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <button
                              type="button"
                              class="btn btn--ghost btn--xs icon-btn"
                              aria-label="תבנית חדשה"
                              @click="openCreatePrintTemplate"
                          >
                            <n-icon :component="AddCircleOutline" :size="16"/>
                          </button>
                        </template>
                        תבנית חדשה
                      </n-tooltip>
                    </div>
                  </div>
                  <div class="hm-field">
                    <label>לקוח קיים</label>
                    <n-select
                        v-model:value="clientId"
                        :loading="loadingClients"
                        :options="clientOptions"
                        clearable
                        filterable
                        placeholder="בחר או צור חדש"
                    />
                  </div>
                  <div class="hm-field">
                    <label class="required">תאריך בדיקה</label>
                    <n-date-picker
                        v-model:value="checkDateMs"
                        style="width: 100%"
                        type="date"
                        @update:value="calculateExpiryFromCheckDate"
                    />
                  </div>
                  <div class="hm-field">
                    <label>מרווח בדיקות</label>
                    <n-select
                        v-model:value="intervalMonths"
                        :options="intervalOptions"
                        @update:value="calculateExpiryFromCheckDate"
                    />
                  </div>
                  <div class="hm-field">
                    <label class="required">בתוקף עד</label>
                    <n-date-picker
                        v-model:value="expiryDateMs"
                        :disabled="!updatingContractId"
                        style="width: 100%"
                        type="date"
                    />
                  </div>
                  <div class="hm-field">
                    <label>סוג בדיקה</label>
                    <n-select
                        v-model:value="hydraulicForm.inspection_type"
                        :options="inspectionTypeOptions"
                        :virtual-scroll="false"
                        filterable
                        tag
                        placeholder="תקופתית"
                    />
                  </div>
                  <div class="hm-field">
                    <label>מקום הבדיקה</label>
                    <n-input v-model:value="hydraulicForm.inspection_location" placeholder="יישוב / אתר"/>
                  </div>
                </div>
              </section>

              <!-- Step: Business -->
              <section v-show="activeStep === 'business'" class="hm-section">
                <div class="hm-section__card">
                  <div class="hm-section__card-head">
                    <n-icon :component="BusinessOutline" :size="18"/>
                    <span>{{ clientId ? 'פרטי קשר (לתסקיר זה)' : 'פרטי עסק חדש' }}</span>
                  </div>
                  <div class="hm-section__grid hm-section__grid--3">
                    <div v-if="!clientId" class="hm-field hm-field--full">
                      <label class="required">שם העסק</label>
                      <n-input v-model:value="hydraulicForm.business.display_name" placeholder="לדוגמה: מפעל דן בע״מ"/>
                    </div>
                    <div v-if="!clientId" class="hm-field">
                      <label>ח.פ / ת.ז</label>
                      <n-input v-model:value="hydraulicForm.business.id_number"/>
                    </div>
                    <div class="hm-field">
                      <label>איש קשר</label>
                      <n-input v-model:value="hydraulicForm.business.contact_person" placeholder="שם מלא"/>
                    </div>
                    <div class="hm-field">
                      <label>טלפון</label>
                      <n-input v-model:value="hydraulicForm.business.phone" dir="ltr"/>
                    </div>
                    <div class="hm-field">
                      <label>נייד</label>
                      <n-input v-model:value="hydraulicForm.business.mobile" dir="ltr"/>
                    </div>
                    <div class="hm-field">
                      <label>פקס</label>
                      <n-input v-model:value="hydraulicForm.business.fax" dir="ltr"/>
                    </div>
                    <div class="hm-field">
                      <label>אימייל</label>
                      <n-input v-model:value="hydraulicForm.business.email" dir="ltr" placeholder="office@example.com"/>
                    </div>
                    <div class="hm-field">
                      <label>כתובת</label>
                      <n-input v-model:value="hydraulicForm.business.address"/>
                    </div>
                    <div class="hm-field">
                      <label>יישוב</label>
                      <n-input v-model:value="hydraulicForm.business.city"/>
                    </div>
                    <div class="hm-field">
                      <label>ת.ד</label>
                      <n-input v-model:value="hydraulicForm.business.po_box"/>
                    </div>
                    <div class="hm-field">
                      <label>מיקוד</label>
                      <n-input v-model:value="hydraulicForm.business.client_zipcode"/>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Step: Equipment -->
              <section v-show="activeStep === 'equipment'" class="hm-section">
                <div class="hm-section__toolbar">
                  <div class="hm-section__card-head hm-section__card-head--plain">
                    <n-icon :component="ConstructOutline" :size="18"/>
                    <span>ציוד שנבדק</span>
                  </div>
                  <button class="btn btn--primary btn--xs" type="button" @click="addEquipment">
                    <n-icon :component="AddCircleOutline" :size="16"/>
                    הוסף מכונה
                  </button>
                </div>
                <div v-for="(equipment, index) in equipmentRows" :key="equipment.id" class="hm-equipment">
                  <div class="hm-equipment__head">
                    <div class="hm-equipment__title">
                      <n-icon :component="ConstructOutline" :size="18"/>
                      <span>{{ equipment.name?.trim() || `מכונה ${index + 1}` }}</span>
                    </div>
                    <button
                        v-if="equipmentRows.length > 1"
                        class="btn btn--xs btn--danger"
                        type="button"
                        @click="removeEquipment(index)"
                    >
                      <n-icon :component="TrashOutline" :size="14"/>
                    </button>
                  </div>
                  <div class="hm-section__grid hm-section__grid--4">
                    <div class="hm-field hm-field--span2">
                      <label>ציוד קיים ללקוח</label>
                      <n-select
                          v-model:value="equipment.selected_equipment_id"
                          :disabled="!clientId"
                          :loading="loadingEquipment"
                          :options="equipmentOptions"
                          :virtual-scroll="false"
                          clearable
                          filterable
                          placeholder="חפש לפי שם / יצרן / דגם"
                          @update:value="(id) => selectEquipment(index, id)"
                      />
                    </div>
                    <div class="hm-field">
                      <label class="required">סוג ציוד</label>
                      <div class="hm-field__row">
                        <n-select
                            v-model:value="equipment.category"
                            :options="categoryOptions"
                            :virtual-scroll="false"
                            filterable
                            placeholder="בחר סוג ציוד"
                            style="flex:1"
                        />
                        <button class="btn btn--xs btn--outline" title="הוסף סוג חדש" @click="promptNewCategory(index)">
                          +
                        </button>
                      </div>
                    </div>
                    <div class="hm-field">
                      <label>שם הציוד</label>
                      <n-input v-model:value="equipment.name" :placeholder="selectedReportType.equipmentPlaceholder"/>
                    </div>
                    <div class="hm-field">
                      <label>יצרן</label>
                      <n-input v-model:value="equipment.manufacturer" placeholder="יצרן"/>
                    </div>
                    <div class="hm-field">
                      <label>מספר רישוי</label>
                      <n-input v-model:value="equipment.license_number" placeholder="פנימי 123"/>
                    </div>
                    <div class="hm-field hm-field--span2">
                      <label>דגם</label>
                      <n-dynamic-tags v-model:value="equipment.models" input-placeholder="הוסף דגם"/>
                    </div>
                    <div class="hm-field hm-field--span2">
                      <label>מס׳ סידורי</label>
                      <n-dynamic-tags v-model:value="equipment.serial_numbers" input-placeholder="הוסף מספר סידורי"/>
                    </div>
                    <template v-if="isPressureType">
                      <div class="hm-field">
                        <label>מיקום</label>
                        <n-input v-model:value="equipment.equipment_location" placeholder="מיקום המתקן"/>
                      </div>
                      <div class="hm-field">
                        <label>נפח (ליטר)</label>
                        <n-input v-model:value="equipment.volume_liters" placeholder="נפח"/>
                      </div>
                      <div class="hm-field">
                        <label>קוטר (מ״מ)</label>
                        <n-input v-model:value="equipment.diameter_mm" placeholder="קוטר"/>
                      </div>
                      <div class="hm-field">
                        <label>חומר</label>
                        <n-input v-model:value="equipment.material" placeholder="חומר"/>
                      </div>
                      <div class="hm-field">
                        <label>מבנה</label>
                        <n-input v-model:value="equipment.construction_type" placeholder="מבנה"/>
                      </div>
                      <div class="hm-field">
                        <label>עובי דופן (מ״מ)</label>
                        <n-input v-model:value="equipment.wall_thickness_mm" placeholder="עובי דופן"/>
                      </div>
                      <div class="hm-field">
                        <label>עובי כיפות (מ״מ)</label>
                        <n-input v-model:value="equipment.cap_thickness_mm" placeholder="עובי כיפות"/>
                      </div>
                      <div class="hm-field">
                        <label>פתחי בקרה וניקוי</label>
                        <n-input v-model:value="equipment.access_openings" placeholder="פתחי בקרה וניקוי"/>
                      </div>
                      <div class="hm-field">
                        <label>פקק</label>
                        <n-input v-model:value="equipment.plug_present" placeholder="פקק"/>
                      </div>
                      <div class="hm-field">
                        <label>כווה</label>
                        <n-input v-model:value="equipment.corrosion_present" placeholder="כווה"/>
                      </div>
                      <div class="hm-field">
                        <label>קוטר שסתום בטחון (מ״מ)</label>
                        <n-input v-model:value="equipment.safety_valve_diameter_mm" placeholder="קוטר שסתום בטחון"/>
                      </div>
                    </template>
                    <template v-else>
                      <div class="hm-field hm-field--span2">
                        <label>עומס עבודה בטוח (ק״ג)</label>
                        <n-dynamic-tags v-model:value="equipment.load_capacity_work" input-placeholder="הוסף עומס"/>
                      </div>
                      <div class="hm-field hm-field--span2">
                        <label>עומס מבחן (ק״ג)</label>
                        <n-dynamic-tags v-model:value="equipment.load_capacity_test" input-placeholder="הוסף עומס"/>
                      </div>
                      <div class="hm-field hm-field--span2">
                        <label>רדיוס עומס (מטר)</label>
                        <n-dynamic-tags v-model:value="equipment.load_radius" input-placeholder="הוסף רדיוס"/>
                      </div>
                    </template>
                    <div class="hm-field hm-field--full">
                      <label>תיאור ציוד</label>
                      <n-input
                          v-model:value="equipment.description"
                          :rows="2"
                          type="textarea"
                          :placeholder="selectedReportType.descriptionPlaceholder"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <!-- Step: Reminder -->
              <section v-show="activeStep === 'reminder'" class="hm-section">
                <div class="hm-section__card">
                  <div class="hm-section__card-head">
                    <n-icon :component="CalendarOutline" :size="18"/>
                    <span>מועד התזכורת הבאה</span>
                  </div>
                  <div class="hm-section__grid hm-section__grid--2">
                    <div class="hm-field">
                      <label>תזכורת לפני תוקף</label>
                      <n-select v-model:value="reminderDaysBefore" :options="reminderDaysOptions"/>
                    </div>
                    <div class="hm-field">
                      <label>תאריך תזכורת</label>
                      <div class="hm-reminder-preview">
                        {{ computedReminderDate }}
                      </div>
                    </div>
                  </div>
                  <div v-if="!expiryDateMs" class="hm-warning">
                    יש להזין תאריך תוקף בשלב הראשון
                  </div>
                </div>
                <div v-if="templateExtraFields.length" class="hm-section__card hm-findings">
                  <div class="hm-section__card-head">
                    <n-icon :component="ListOutline" :size="18"/>
                    <span>{{ extraFieldsTitle }}</span>
                  </div>
                  <div class="hm-findings__list">
                    <div
                        v-for="field in templateExtraFields"
                        :key="field.bind"
                        :class="['hm-field', { 'hm-field--deadline': field.bind === 'findings_deadline' }]"
                    >
                      <label>{{ field.label }}</label>
                      <n-input
                          v-model:value="templateValues[field.bind]"
                          :placeholder="field.placeholder"
                          :rows="field.multiline ? 3 : 1"
                          :type="field.multiline ? 'textarea' : 'text'"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </transition>
        </n-spin>
      </div>
      <aside v-if="previewLayout" class="compose-preview hm-preview">
        <div class="compose-preview__label">תצוגה מקדימה</div>
        <LayoutPreviewFrame
            :data="previewData"
            :layout="previewLayout"
        />
      </aside>
    </div>

    <template #footer>
      <div class="hm-footer">
        <div class="hm-footer__actions">
          <button class="btn btn--ghost" @click="visible = false">ביטול</button>
          <button
              v-if="updatingContractId"
              :class="['btn', 'btn--primary', { 'btn--loading': creating }]"
              :disabled="creating"
              @click="doCreate"
          >עדכן תסקיר
          </button>
        </div>
        <div class="hm-footer__nav">
          <button v-if="stepIndex > 0" class="btn btn--ghost" @click="prevStep">
            הקודם
            <n-icon :component="ChevronForwardOutline" :size="16"/>
          </button>
          <button v-if="stepIndex < steps.length - 1" class="btn btn--primary" @click="nextStep">
            <n-icon :component="ChevronBackOutline" :size="16"/>
            הבא
          </button>
        </div>
        <button
            :class="['btn', 'btn--primary', 'hm-footer__save', { 'btn--loading': savingDraft }]"
            :disabled="savingDraft || stepIndex < steps.length - 1"
            @click="saveDraftAndPreview"
        >
          <n-icon :component="SaveOutline" :size="16"/>
          שמור ופתח תצוגה
        </button>
      </div>
    </template>
  </n-modal>

  <n-modal
      v-model:show="showErrorModal"
      :class="confirmDialogClass"
      :positive-button-props="confirmActionButtonProps('error')"
      :show-icon="false"
      :z-index="4000"
      positive-text="אישור"
      preset="dialog"
      type="error"
      @positive-click="showErrorModal = false"
  >
    <template #header>
      <ConfirmDialogHead title="שגיאה"/>
    </template>
    <p class="hm-error-text" dir="rtl">
      <template v-if="saveErrorDuplicateNumber">
        מספר התסקיר
        <bdi class="hm-error-text__id" dir="ltr">{{ saveErrorDuplicateNumber }}</bdi>
        כבר קיים במערכת.
      </template>
      <template v-else>{{ formattedSaveError }}</template>
    </p>
  </n-modal>
</template>

<script lang="ts" setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {NDatePicker, NDynamicTags, NIcon, NInput, NModal, NSelect, NSpin, NTooltip, useMessage} from "naive-ui";
import {
  AddCircleOutline,
  BusinessOutline,
  CalendarOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  ConstructOutline,
  CreateOutline,
  DocumentTextOutline,
  ListOutline,
  SaveOutline,
  TimeOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {storeToRefs} from "pinia";
import {useContractsStore} from "../../stores/contracts.js";
import {useHydraulicCheckDraftStore} from "../../stores/hydraulicCheckDraft.js";
import {useEngineerStore} from "../../stores/engineer.js";
import type {HydraulicCheckRequest} from "../../services/apiService.js";
import {api} from "../../services/apiService.js";
import {
  confirmActionButtonProps,
  CONFIRM_DIALOG_CLASS,
  useConfirm,
} from "../../composables/useConfirm.js";
import ConfirmDialogHead from "../ConfirmDialogHead.vue";
import type {Equipment, PrintTemplate} from "@shared/types.js";
import LayoutPreviewFrame from "../print/LayoutPreviewFrame.vue";
import {
  extractLayoutFieldBinds,
  INSPECTION_PRINT_TEMPLATE_PRESETS,
  joinStackedValues,
  LAYOUT_FIELD_PRESETS,
  type PrintTemplateLayout
} from "@shared/printTemplateLayout.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const emit = defineEmits<{
  (e: "created"): void;
  (e: "updated"): void;
}>();

const visible = defineModel<boolean>("show", {default: false});

const store = useContractsStore();
const draftStore = useHydraulicCheckDraftStore();
const engineerStore = useEngineerStore();
const {profile: engineerProfile} = storeToRefs(engineerStore);
const router = useRouter();
const message = useMessage();
const {confirm} = useConfirm();
const confirmDialogClass = CONFIRM_DIALOG_CLASS;

const isMobile = ref(window.innerWidth <= 720);

// Step navigation
type StepKey = "basic" | "business" | "equipment" | "reminder";
const steps: { key: StepKey; label: string }[] = [
  {key: "basic", label: "פרטים"},
  {key: "business", label: "עסק"},
  {key: "equipment", label: "ציוד"},
  {key: "reminder", label: "תזכורת"},
];
const activeStep = ref<StepKey>("basic");
const stepIndex = computed(() => steps.findIndex((s) => s.key === activeStep.value));

function nextStep() {
  const idx = stepIndex.value;
  if (idx < steps.length - 1) activeStep.value = steps[idx + 1].key;
}

function prevStep() {
  const idx = stepIndex.value;
  if (idx > 0) activeStep.value = steps[idx - 1].key;
}

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
const saveError = ref<string | null>(null);
const showErrorModal = computed({
  get: () => saveError.value !== null,
  set: (v: boolean) => {
    if (!v) saveError.value = null;
  },
});
const saveErrorDuplicateNumber = computed(() => {
  const match = saveError.value?.match(/Contract number already exists:\s*(.+)/i);
  return match?.[1]?.trim() ?? null;
});
const formattedSaveError = computed(() => {
  const raw = saveError.value?.trim() ?? "";
  if (!raw) return "";
  if (raw === "חסר לקוח") return "יש לבחור לקוח קיים או להזין שם עסק";
  if (raw === "חסר תאריך תזכורת") return "יש לבחור תאריך תזכורת";
  if (raw === "הטופס לא מוכן") return "יש למלא את פרטי התסקיר לפני השמירה";
  return raw;
});
const hydraulicForm = ref<HydraulicCheckRequest | null>(null);
const clientId = ref<string | null>(null);
const prevReportNumber = ref("");

type EquipmentRow = {
  id: string;
  selected_equipment_id: string | null;
  category: string;
  name: string;
  manufacturer: string;
  models: string[];
  serial_numbers: string[];
  license_number: string;
  load_capacity_work: string[];
  load_capacity_test: string[];
  load_radius: string[];
  description: string;
  equipment_location: string;
  volume_liters: string;
  diameter_mm: string;
  material: string;
  construction_type: string;
  wall_thickness_mm: string;
  cap_thickness_mm: string;
  access_openings: string;
  plug_present: string;
  corrosion_present: string;
  safety_valve_diameter_mm: string;
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
const knownCategories = ref<{ id?: string; value: string; label: string }[]>([]);
const categoryDefaults: { label: string; value: string }[] = [
  {label: "מכונות הרמה", value: "lift"},
  {label: "אביזרי הרמה", value: "accessory"},
  {label: "פיגום ממוכן", value: "powered_scaffold"},
  {label: "עגורן צריח", value: "tower_crane"},
  {label: "במת הרמה", value: "work_platform"},
  {label: "מעליות", value: "elevator"},
  {label: "דרגנועים", value: "escalator"},
  {label: "דוד קיטור", value: "steam_boiler"},
  {label: "קולט קיטור", value: "steam_receiver"},
  {label: "קולט אוויר / קומפרסור", value: "air_receiver"},
  {label: "כלי לחץ", value: "pressure_vessel"},
  {label: "אחר", value: "other"},
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
    const value = cat.value.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({label: cat.label, value});
  }
  return options;
});

const checkDateMs = ref<number>(Date.now());
const expiryDateMs = ref<number | null>(null);
const reminderDaysBefore = ref<number>(30);
const reminderDateMs = ref<number | null>(null);
const DEFAULT_REPORT_TYPE = "lifting_machine";
// Not a hardcoded literal: the initial interval must match DEFAULT_REPORT_TYPE's
// legal interval, or the modal opens showing a type/interval pair that was never
// legally correct together (this previously defaulted to 4 months while
// lifting_machine's actual interval is 14).
const intervalMonths = ref<number>(
    INSPECTION_PRINT_TEMPLATE_PRESETS.find((p) => p.key === DEFAULT_REPORT_TYPE)?.intervalMonths ?? 4,
);
const reportType = ref(DEFAULT_REPORT_TYPE);
type ReportTypePreset = {
  value: string;
  label: string;
  contractType: string;
  category: string;
  intervalMonths: number;
  equipmentPlaceholder: string;
  descriptionPlaceholder: string;
};
// The legal/statutory data (contract type, category, interval) comes from
// INSPECTION_PRINT_TEMPLATE_PRESETS — the same source the print template uses — so
// an interval or contract-type change only has to happen in one place instead of
// drifting between the modal and the generated document. Only the form's own
// placeholder copy stays local, since the shared preset has no use for it.
const REPORT_TYPE_FORM_TEXT: Record<string, { equipmentPlaceholder: string; descriptionPlaceholder: string }> = {
  lifting_machine: {
    equipmentPlaceholder: "מלגזה / מנוף משאית / כננת / במה",
    descriptionPlaceholder: "תיאור מכונת ההרמה, מיקום, מספר פנימי וממצאים",
  },
  lifting_accessory: {
    equipmentPlaceholder: "שרשרת / רצועה / שאקל / אונקל / מענב",
    descriptionPlaceholder: "רשימת האביזרים, עומס עבודה בטוח, זיהוי פריט וממצאים",
  },
  elevator: {
    equipmentPlaceholder: "מעלית נוסעים / מעלית משא",
    descriptionPlaceholder: "פרטי המעלית, פיר, חדר מכונות, דלתות ומערכות בטיחות",
  },
  escalator: {
    equipmentPlaceholder: "דרגנוע / מסוע נוסעים",
    descriptionPlaceholder: "פרטי הדרגנוע, מערכות עצירה, מדרגות, מעקות וממצאים",
  },
  tower_crane: {
    equipmentPlaceholder: "עגורן צריח",
    descriptionPlaceholder: "פרטי העגורן, תא מפעיל, מנגנוני סיבוב, בלמים, חשמל וממצאים",
  },
  work_platform: {
    equipmentPlaceholder: "במת הרמה",
    descriptionPlaceholder: "פרטי הבמה, מערכת הרמה, מעקות, בלמים וממצאים",
  },
  powered_scaffold: {
    equipmentPlaceholder: "פיגום ממוכן",
    descriptionPlaceholder: "פרטי הפיגום, עיגון, מנגנון הרמה, בלמים וממצאים",
  },
  air_receiver: {
    equipmentPlaceholder: "קולט אוויר / קומפרסור",
    descriptionPlaceholder: "פרטי קולט האוויר, נפח, לחץ עבודה מותר, שסתומים וממצאים",
  },
  steam_receiver: {
    equipmentPlaceholder: "קולט קיטור",
    descriptionPlaceholder: "פרטי קולט הקיטור, לחץ עבודה מותר, אבזרים וניסויים",
  },
  steam_boiler: {
    equipmentPlaceholder: "דוד קיטור",
    descriptionPlaceholder: "פרטי דוד הקיטור, בדיקה קרה/בלחץ, שסתומים ולחץ עבודה מותר",
  },
  pressure_vessel: {
    equipmentPlaceholder: "כלי לחץ",
    descriptionPlaceholder: "פרטי מתקן הלחץ, לחץ עבודה מותר, ניסוי הידרולי וממצאים",
  },
};
const FALLBACK_FORM_TEXT = {equipmentPlaceholder: "", descriptionPlaceholder: ""};
const reportTypePresets: ReportTypePreset[] = INSPECTION_PRINT_TEMPLATE_PRESETS.map((preset) => ({
  value: preset.key,
  label: preset.name,
  contractType: preset.contractType,
  category: preset.category,
  intervalMonths: preset.intervalMonths,
  ...(REPORT_TYPE_FORM_TEXT[preset.key] ?? FALLBACK_FORM_TEXT),
}));
const reportTypeOptions = reportTypePresets.map((preset) => ({label: preset.label, value: preset.value}));
const selectedReportType = computed(() =>
    reportTypePresets.find((preset) => preset.value === reportType.value) ?? reportTypePresets[0],
);
const PRESSURE_TYPE_KEYS = new Set(["air_receiver", "steam_receiver", "steam_boiler", "pressure_vessel"]);
const isPressureType = computed(() => PRESSURE_TYPE_KEYS.has(reportType.value));
const reminderDaysOptions = [
  {label: "7 ימים לפני", value: 7},
  {label: "14 ימים לפני", value: 14},
  {label: "30 ימים לפני (ברירת מחדל)", value: 30},
  {label: "60 ימים לפני", value: 60},
  {label: "90 ימים לפני", value: 90},
];
const inspectionTypeOptions = [
  {label: "תקופתית", value: "תקופתית"},
  {label: "ראשונית", value: "ראשונית"},
  {label: "חוזרת", value: "חוזרת"},
  {label: "לאחר תיקון", value: "לאחר תיקון"},
];
const intervalOptions = Array.from({length: 26}, (_, i) => {
  const months = i + 1;
  return {
    label: months === 1 ? "חודש אחד" : `${months} חודשים`,
    value: months,
  };
});

function clampIntervalMonths(value: unknown): number {
  const months = Math.round(Number(value));
  if (!Number.isFinite(months) || months < 1) return selectedReportType.value.intervalMonths;
  return Math.min(26, months);
}

function calculateExpiryFromCheckDate() {
  if (!checkDateMs.value) return;
  const checkDate = new Date(checkDateMs.value);
  checkDate.setMonth(checkDate.getMonth() + intervalMonths.value);
  checkDate.setDate(checkDate.getDate() - 1);
  expiryDateMs.value = checkDate.getTime();
}

// For a new report, expiry is defined entirely by report type + check date — the
// field above is disabled and there is no manual override, so it must always track
// this pair. Editing an existing contract keeps the value that was actually saved
// (set once in openForUpdate below): a real record's expiry may not match this
// formula, e.g. an inspector-granted extension, and opening it for editing must not
// silently rewrite it.
watch([checkDateMs, intervalMonths], () => {
  if (checkDateMs.value && !updatingContractId.value) {
    calculateExpiryFromCheckDate();
  }
});

const computedReminderDate = computed(() => {
  if (!expiryDateMs.value) return "—";
  const expiry = new Date(expiryDateMs.value);
  expiry.setDate(expiry.getDate() - reminderDaysBefore.value);
  return expiry.toLocaleDateString("he-IL");
});

const HYDRAULIC_PRINT_TEMPLATE_ID = "6a7cfbee5e95a7b2e1e4b606";

const templateOptions = computed(() =>
    templates.value.map((t) => ({
      label: `${t.name} (${t.editorType === "sections" ? "פריסה" : "Excel"})`,
      value: t._id,
    }))
);

const equipmentOptions = computed(() => {
    const seen = new Set<string>();
    return clientEquipment.value
        .map((eq) => ({
          label: [eq.name, eq.manufacturer, eq.model, eq.serial_number ? `מס׳ ${eq.serial_number}` : null].filter(Boolean).join(" · "),
          value: String(eq.id),
        }))
        .filter((opt) => {
          if (seen.has(opt.label)) return false;
          seen.add(opt.label);
          return true;
        });
});

const templateKnownFields = new Set([
  "document_number", "contract_number", "report_number", "prev_report_number",
  "start_date", "inspection_date", "check_date", "expiry_date",
  "valid_until", "inspection_type", "inspection_location", "inspection_interval_months", "report_type",
  "client_name", "client_company", "client_phone",
  "client_mobile", "client_fax", "client_email", "client_address", "client_city", "client_id", "zip_code", "contact_person",
  "po_box", "chassis", "name", "manufacturer", "model", "serial_number", "license_number",
  "lisence_number", "load_radius", "load_capacity_test", "load_capacity_work",
  "description", "equipment_description", "checked_equipment",
  "inspector_number", "company_name", "company_registration",
  "engineer_company", "engineer_email", "engineer_phone", "engineer_name", "engineer_address",
]);

const EXTRA_FIELD_LABELS: Record<string, string> = {
  findings_general: "כללי",
  findings_remedy: "ליקוי",
  findings_deadline: "תוך (ימים)",
  findings_note: "הערה נוספת",
};

function extraFieldLabel(bind: string, layoutLabel?: string): string {
  if (bind === "findings_deadline") return EXTRA_FIELD_LABELS.findings_deadline;
  const cleaned = layoutLabel?.replace(/:$/, "").trim() ?? "";
  if (cleaned && /[\u0590-\u05FF]/.test(cleaned)) return cleaned;
  if (EXTRA_FIELD_LABELS[bind]) return EXTRA_FIELD_LABELS[bind];
  const preset = LAYOUT_FIELD_PRESETS.find((field) => field.bind === bind);
  if (preset?.label) return preset.label;
  return bind;
}

const templateExtraFields = computed(() => {
  if (!template.value) return [];
  const seen = new Set<string>();
  const binds: string[] = [];
  const layoutLabels = new Map<string, string>();
  for (const cell of template.value.cells) {
    if (cell.type === "field" && cell.bind && !seen.has(cell.bind)) {
      seen.add(cell.bind);
      binds.push(cell.bind);
    }
  }
  if (template.value.layout) {
    for (const field of extractLayoutFieldBinds(template.value.layout)) {
      layoutLabels.set(field.bind, field.label);
      if (!seen.has(field.bind)) {
        seen.add(field.bind);
        binds.push(field.bind);
      }
    }
  }
  return binds
      .filter((bind) => !templateKnownFields.has(bind) && !bind.match(/_\d+$/))
      .map((bind) => {
        const label = extraFieldLabel(bind, layoutLabels.get(bind));
        const multiline = bind.startsWith("findings_") && bind !== "findings_deadline";
        return {bind, label, multiline, placeholder: label};
      });
});

const extraFieldsTitle = computed(() => {
  const fields = templateExtraFields.value;
  if (fields.length && fields.every((field) => field.bind.startsWith("findings_"))) {
    return "תיאור ליקויים, השיפורים ואמצעים לתיקונים";
  }
  return "שדות נוספים מהתבנית";
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
  d.setDate(d.getDate() - 1);
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

// Mirrors resolveInspectorNumber on the server (reminders.ts): an inspector may
// hold a separate certificate per inspection type, overriding the general
// inspector_number for that type only — falls back to it when the selected type
// has no override, same as the number the server will actually allocate.
function currentInspectorNumber(): string {
  const byType = (engineerProfile.value as any)?.inspector_numbers_by_type;
  const typed = byType && typeof byType === "object" ? byType[reportType.value] : undefined;
  return String(typed ?? engineerProfile.value?.inspector_number ?? "").trim();
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
    category: selectedReportType.value.category,
    name: "",
    manufacturer: "",
    models: [],
    serial_numbers: [],
    license_number: "",
    load_capacity_work: [],
    load_capacity_test: [],
    load_radius: [],
    description: "",
    equipment_location: "",
    volume_liters: "",
    diameter_mm: "",
    material: "",
    construction_type: "",
    wall_thickness_mm: "",
    cap_thickness_mm: "",
    access_openings: "",
    plug_present: "",
    corrosion_present: "",
    safety_valve_diameter_mm: "",
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
      mobile: "",
      fax: "",
      address: "",
      city: "",
      po_box: "",
      client_zipcode: "",
    },
    inspection_type: "תקופתית",
    inspection_location: "",
    equipment: {
      category: selectedReportType.value.category,
      name: "",
      manufacturer: "",
      model: "",
      serial_number: "",
      load_capacity_work: "",
      load_capacity_test: "",
      load_radius: "",
      description: "",
    },
    contract_type: selectedReportType.value.contractType,
    interval_months: selectedReportType.value.intervalMonths,
  };
}

function applyReportType(value?: string, options: { syncTemplate?: boolean } = {}) {
  const preset = reportTypePresets.find((item) => item.value === (value ?? reportType.value)) ?? reportTypePresets[0];
  reportType.value = preset.value;
  intervalMonths.value = preset.intervalMonths;
  if (hydraulicForm.value) {
    hydraulicForm.value.contract_type = preset.contractType;
    hydraulicForm.value.equipment.category = preset.category as HydraulicCheckRequest["equipment"]["category"];
  }
  equipmentRows.value = equipmentRows.value.map((row) => ({
    ...row,
    category: preset.category,
  }));
  // Not calculateExpiryFromCheckDate() directly: setting intervalMonths above
  // already runs it through the watch(), which is what gates on updatingContractId
  // so an edit-in-progress doesn't get its saved expiry silently rewritten.
  //
  // syncTemplate defaults on for the report-type dropdown's own change handler, but
  // selectTemplate() calls this with it off when the causality runs the other way
  // (picking a template that names its own report type) — without that, picking a
  // template would re-select a template and the two selectors would fight.
  if (options.syncTemplate ?? true) {
    const matchingTemplateId = defaultTemplateId();
    if (matchingTemplateId) selectTemplate(matchingTemplateId);
  }
}

function inferReportTypeValue(contractType?: string | null, category?: string | null): string {
  const contract = String(contractType ?? "");
  const byContract = reportTypePresets.find((preset) => preset.contractType === contract || contract.includes(preset.label.replace(/^תסקיר\s+/, "")));
  if (byContract) return byContract.value;
  const byCategory = reportTypePresets.find((preset) => preset.category === category);
  return byCategory?.value ?? "lifting_machine";
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
  await engineerStore.load();
}

async function loadCategories() {
  try {
    const categories = await api.equipment.categories();
    knownCategories.value = categories ?? [];
  } catch {
    knownCategories.value = [];
  }
}

function promptNewCategory(index: number) {
  const label = window.prompt("שם סוג ציוד חדש:")?.trim();
  if (!label || label.length < 2) return;
  if (!knownCategories.value.some((cat) => cat.value === label || cat.label === label)) {
    knownCategories.value = [...knownCategories.value, {value: label, label}];
  }
  const row = equipmentRows.value[index];
  if (row) row.category = label;
  api.equipment.createCategory(label, label).then(() => loadCategories()).catch(() => {
  });
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
  const hadTemplates = templates.value.length > 0;
  const previousTemplateId = templateId.value;
  loadingTemplates.value = !hadTemplates;
  try {
    templates.value = await api.printTemplates.list();
    selectTemplate(previousTemplateId ?? defaultTemplateId());
  } catch {
    if (!hadTemplates) {
      templates.value = [];
      templateId.value = null;
      template.value = null;
    }
  } finally {
    loadingTemplates.value = false;
  }
}

function defaultTemplateId(): string | null {
  const selected = selectedReportType.value;
  const exact = templates.value.find((t) => t.editorType === "sections" && t.reportTypeKey === selected.value);
  if (exact) return exact._id;
  const byContractType = templates.value.find((t) => t.editorType === "sections" && t.contractType === selected.contractType);
  if (byContractType) return byContractType._id;
  const bySystemKey = templates.value.find((t) => t.editorType === "sections" && t.system_key === `inspection:${selected.value}`);
  if (bySystemKey) return bySystemKey._id;
  return templates.value.find((t) => t.editorType === "sections")?._id
      ?? (templates.value.some((t) => t._id === HYDRAULIC_PRINT_TEMPLATE_ID)
          ? HYDRAULIC_PRINT_TEMPLATE_ID
          : templates.value[0]?._id ?? null);
}

function selectTemplate(id: string | null, options: { syncReportType?: boolean } = {}) {
  templateId.value = id;
  template.value = templates.value.find((t) => t._id === id) ?? null;
  if (!template.value) {
    templateValues.value = {};
    return;
  }
  const nextValues: Record<string, string> = {};
  for (const field of templateExtraFields.value) {
    const defaultValue = field.bind === "findings_general" ? "אין" : "";
    nextValues[field.bind] = templateValues.value[field.bind] || defaultValue;
  }
  templateValues.value = nextValues;

  // syncReportType is off when applyReportType() itself called this (the type
  // already drove the pick, deriving it back would be a no-op at best) and on when
  // the user picked a template directly — a template that names its own report
  // type via reportTypeKey should drive the type selector, not just sit next to it
  // showing the wrong one. A template with no reportTypeKey (a custom layout) is
  // left alone: it isn't tied to one legal report type, so there's nothing to sync.
  if ((options.syncReportType ?? false) && template.value.reportTypeKey) {
    const preset = reportTypePresets.find((p) => p.value === template.value?.reportTypeKey);
    if (preset && preset.value !== reportType.value) {
      applyReportType(preset.value, {syncTemplate: false});
    }
  }
}

function openCreatePrintTemplate() {
  visible.value = false;
  void router.push({path: "/print-templates/layout", query: {create: "1"}});
}

function openEditPrintTemplate() {
  if (!templateId.value) {
    message.warning("בחר תבנית לעריכה");
    return;
  }
  visible.value = false;
  void router.push({path: "/print-templates/layout", query: {edit: templateId.value}});
}

// ── Equipment actions ────────────────────────────────────────────────────────

function addEquipment() {
  equipmentRows.value.push(emptyEquipmentRow());
}

function removeEquipment(index: number) {
  if (equipmentRows.value.length <= 1) return;
  const row = equipmentRows.value[index];
  const label = row?.name?.trim() || `מכונה ${index + 1}`;
  confirm({
    title: "מחיקת מכונה",
    content: `להסיר את "${label}" מהתסקיר?`,
    confirmText: "מחק",
    onConfirm: () => {
      equipmentRows.value.splice(index, 1);
    },
  });
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
  row.models = splitMultiValue(eq.model);
  row.serial_numbers = splitMultiValue(eq.serial_number).map(digitsOnly);
  row.license_number = digitsOnly((eq as any).license_number ?? "");
  row.load_capacity_work = splitMultiValue(eq.capacity);
  row.load_capacity_test = splitMultiValue((eq as any).load_capacity_test);
  row.load_radius = splitMultiValue((eq as any).load_radius);
  row.description = eq.description ?? "";
}

function setNumericField(row: EquipmentRow, field: "license_number", value: string) {
  row[field] = digitsOnly(value);
}

function splitMultiValue(value: unknown): string[] {
  if (value == null || value === "") return [];
  const s = String(value).trim();
  if (!s) return [];
  return s.split(/\s*\/\s*/)
      .map((v) => v.trim())
      .filter((v) => v && !/^\d{1,2}$/.test(v));
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
      mobile: "",
      fax: "",
      address: "",
      city: "",
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
    mobile: client.mobile ?? "",
    fax: client.fax ?? "",
    address: client.address ?? "",
    city: client.city ?? "",
    po_box: client.po_box ?? "",
    client_zipcode: client.client_zipcode ?? "",
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
    checkDateMs: checkDateMs.value,
    expiryDateMs: expiryDateMs.value,
    reminderDaysBefore: reminderDaysBefore.value,
    intervalMonths: intervalMonths.value,
    reportType: reportType.value,
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

function clearDraft() {
  confirm({
    title: "מחיקת טיוטה",
    content: "למחוק את הטיוטה השמורה? פעולה זו אינה הפיכה.",
    confirmText: "מחק",
    onConfirm: () => {
      draftStore.clear();
      message.success("הטיוטה נמחקה");
    },
  });
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
  checkDateMs.value = draft?.checkDateMs ?? Date.now();
  expiryDateMs.value = draft?.expiryDateMs ?? null;
  reminderDaysBefore.value = draft?.reminderDaysBefore ?? 30;
  reportType.value = draft?.reportType ?? inferReportTypeValue(draft?.form?.contract_type, draft?.equipmentRows?.[0]?.category);
  intervalMonths.value = clampIntervalMonths(draft?.intervalMonths ?? selectedReportType.value.intervalMonths);
  prevReportNumber.value = draft?.prevReportNumber ?? "";
  equipmentRows.value = draft?.equipmentRows?.length
      ? draft.equipmentRows.map((row: any) => ({
        ...row,
        id: row.id || crypto.randomUUID(),
        models: row.models ?? (row.model ? [row.model] : []),
        serial_numbers: row.serial_numbers ?? (row.serial_number ? [row.serial_number] : []),
        load_capacity_work: Array.isArray(row.load_capacity_work) ? row.load_capacity_work : row.load_capacity_work ? [row.load_capacity_work] : [],
        load_capacity_test: Array.isArray(row.load_capacity_test) ? row.load_capacity_test : row.load_capacity_test ? [row.load_capacity_test] : [],
        load_radius: Array.isArray(row.load_radius) ? row.load_radius : row.load_radius ? [row.load_radius] : [],
      }))
      : [emptyEquipmentRow()];
  clientEquipment.value = [];
  templateValues.value = {...(draft?.templateValues ?? {})};
  hydraulicForm.value = draft?.form ? {
    ...draft.form,
    contract_type: draft.form.contract_type ?? selectedReportType.value.contractType,
    business: {...draft.form.business},
    equipment: {...draft.form.equipment}
  } : defaultForm();
  if (!expiryDateMs.value) calculateExpiryFromCheckDate();
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
    model: first.models[0] ?? "",
    serial_number: first.serial_numbers[0] ?? "",
    load_capacity_work: first.load_capacity_work[0] ?? "",
    load_capacity_test: first.load_capacity_test[0] ?? "",
    load_radius: first.load_radius[0] ?? "",
    description: first.description,
  };
}

function buildTemplateDraft(): Record<string, string> {
  const form = hydraulicForm.value!;
  const contractNumber = formatContractNumber(form.contract_number?.trim() || suggestedContractNumber.value);
  const checkDate = checkDateMs.value ? formatLocalDate(checkDateMs.value) : todayIso();
  const expiryDate = expiryDateMs.value ? formatLocalDate(expiryDateMs.value) : addMonthsToLocalDate(checkDateMs.value ?? Date.now(), intervalMonths.value);
  const business = form.business;
  const firstEquipment = equipmentRows.value[0] ?? emptyEquipmentRow();
  const data: Record<string, string> = {
    document_number: contractNumber,
    contract_number: contractNumber,
    report_number: contractNumber,
    prev_report_number: prevReportNumber.value,
    start_date: checkDate,
    inspection_date: checkDate,
    check_date: checkDate,
    expiry_date: expiryDate,
    valid_until: expiryDate,
    contract_type: selectedReportType.value.contractType,
    report_type: selectedReportType.value.label,
    inspection_interval_months: String(intervalMonths.value),
    inspection_type: form.inspection_type || "תקופתית",
    inspection_location: form.inspection_location ?? "",
    client_name: business.contact_person ?? "",
    contact_person: business.contact_person ?? "",
    client_company: business.display_name ?? "",
    client_phone: business.phone ?? "",
    client_mobile: business.mobile ?? "",
    client_fax: business.fax ?? "",
    client_email: business.email ?? "",
    client_address: business.address ?? "",
    client_city: business.city ?? "",
    client_id: business.id_number ?? "",
    zip_code: business.client_zipcode ?? "",
    po_box: business.po_box ?? "",
    license_number: firstEquipment.license_number,
    inspector_number: currentInspectorNumber(),
    company_name: engineerProfile.value?.company_name ?? "",
    company_registration: engineerProfile.value?.company_registration ?? "",
    engineer_company: engineerProfile.value?.company_name ?? "",
    engineer_email: engineerProfile.value?.company_email ?? "",
    engineer_phone: engineerProfile.value?.company_phone ?? "",
    engineer_name: engineerProfile.value?.full_name ?? "",
    engineer_address: engineerProfile.value?.address ?? "",
  };

  equipmentRows.value.forEach((eq, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    data[`name${suffix}`] = eq.name;
    data[`manufacturer${suffix}`] = eq.manufacturer;
    data[`model${suffix}`] = joinStackedValues(eq.models);
    data[`serial_number${suffix}`] = joinStackedValues(eq.serial_numbers);
    data[`license_number${suffix}`] = eq.license_number;
    data[`lisence_number${suffix}`] = eq.license_number;
    data[`load_radius${suffix}`] = joinStackedValues(eq.load_radius);
    data[`load_capacity_test${suffix}`] = joinStackedValues(eq.load_capacity_test);
    data[`load_capacity_work${suffix}`] = joinStackedValues(eq.load_capacity_work);
    data[`description${suffix}`] = eq.description;
    data[`equipment_description${suffix}`] = eq.description;
    data[`checked_equipment${suffix}`] = eq.name;
    data[`chassis${suffix}`] = joinStackedValues(eq.serial_numbers);
    data[`quantity${suffix}`] = String(Math.max(eq.serial_numbers.length, 1));
    data[`equipment_location${suffix}`] = eq.equipment_location;
    data[`volume_liters${suffix}`] = eq.volume_liters;
    data[`diameter_mm${suffix}`] = eq.diameter_mm;
    data[`material${suffix}`] = eq.material;
    data[`construction_type${suffix}`] = eq.construction_type;
    data[`wall_thickness_mm${suffix}`] = eq.wall_thickness_mm;
    data[`cap_thickness_mm${suffix}`] = eq.cap_thickness_mm;
    data[`access_openings${suffix}`] = eq.access_openings;
    data[`plug_present${suffix}`] = eq.plug_present;
    data[`corrosion_present${suffix}`] = eq.corrosion_present;
    data[`safety_valve_diameter_mm${suffix}`] = eq.safety_valve_diameter_mm;
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

const previewLayout = computed<PrintTemplateLayout | null>(() =>
    template.value?.editorType === "sections" ? template.value.layout ?? null : null,
);

const showLayoutPreview = computed(() => Boolean(previewLayout.value));

const previewData = computed<Record<string, string>>(() => {
  if (!hydraulicForm.value) return {};
  return buildTemplateDraft();
});

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
    throw new Error("יש לבחור לקוח קיים או להזין שם עסק");
  }
  if (!expiryDateMs.value) {
    throw new Error("יש להזין תאריך תוקף");
  }
  const contractNumber = formatContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedContractNumber.value,
  );
  syncPrimaryEquipment();
  const expiryDate = formatLocalDate(expiryDateMs.value);
  const reminderDate = new Date(expiryDateMs.value);
  reminderDate.setDate(reminderDate.getDate() - reminderDaysBefore.value);
  const editorType = template.value?.editorType === "sections" ? "sections" : "grid";
  const payload: HydraulicCheckRequest = {
    ...hydraulicForm.value,
    contract_number: contractNumber || undefined,
    contract_type: selectedReportType.value.contractType,
    client_id: clientId.value ?? undefined,
    interval_months: intervalMonths.value,
    skip_reminders: false,
    check_date: checkDateMs.value ? formatLocalDate(checkDateMs.value) : undefined,
    expiry_date: expiryDate,
    editor_type: editorType,
    print_template_id: templateId.value ?? undefined,
  };
  return api.reminders.createHydraulicCheck(payload);
}

async function updateContract(contractId: string) {
  if (!hydraulicForm.value) throw new Error("הטופס לא מוכן");
  if (!expiryDateMs.value) {
    throw new Error("יש להזין תאריך תוקף");
  }
  const contractNumber = formatContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedContractNumber.value,
  );
  syncPrimaryEquipment();
  const checkDate = checkDateMs.value ? formatLocalDate(checkDateMs.value) : todayIso();
  const expiryDate = formatLocalDate(expiryDateMs.value);
  const editorType = template.value?.editorType === "sections" ? "sections" : "grid";
  const data = buildTemplateDraft();
  await api.contracts.update(contractId, {
    client_id: clientId.value ?? undefined,
    contract_number: contractNumber || undefined,
    contract_type: selectedReportType.value.contractType,
    start_date: checkDate,
    expiry_date: expiryDate,
    summary: data.equipment_description || data.checked_equipment || data.name || undefined,
    editor_type: editorType,
    print_template_id: templateId.value ?? null,
    manual_fields: {
      ...data,
      inspection_interval_months: intervalMonths.value,
      contract_type: selectedReportType.value.contractType,
      report_type: selectedReportType.value.label,
      _equipment: equipmentRows.value.map((eq) => ({
        name: eq.name,
        manufacturer: eq.manufacturer,
        models: eq.models,
        model: eq.models[0] ?? null,
        serial_numbers: eq.serial_numbers,
        serial_number: eq.serial_numbers[0] ?? null,
        quantity: Math.max(eq.serial_numbers.length, 1),
        load_capacity_work: eq.load_capacity_work,
        load_capacity_test: eq.load_capacity_test,
        load_radius: eq.load_radius,
        category: eq.category,
        license_number: eq.license_number,
        description: eq.description,
        equipment_location: eq.equipment_location,
        volume_liters: eq.volume_liters,
        diameter_mm: eq.diameter_mm,
        material: eq.material,
        construction_type: eq.construction_type,
        wall_thickness_mm: eq.wall_thickness_mm,
        cap_thickness_mm: eq.cap_thickness_mm,
        access_openings: eq.access_openings,
        plug_present: eq.plug_present,
        corrosion_present: eq.corrosion_present,
        safety_valve_diameter_mm: eq.safety_valve_diameter_mm,
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
  saveError.value = null;
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
  } catch (e: any) {
    saveError.value = e?.message ?? String(e);
  } finally {
    creating.value = false;
  }
}

async function saveDraftAndPreview() {
  if (!hydraulicForm.value) return;
  if (!templateId.value) {
    saveError.value = "בחר תבנית הדפסה";
    return;
  }
  saveError.value = null;
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
    if (template.value?.editorType === "sections" && templateId.value) {
      await router.push(`/print-templates/layout/${templateId.value}/compose?contractId=${encodeURIComponent(contractIdValue)}`);
    } else {
      await router.push(`/contracts/${contractIdValue}/draft`);
    }
  } catch (e: any) {
    saveError.value = e?.message ?? String(e);
  } finally {
    savingDraft.value = false;
  }
}

// ── Helpers for openForUpdate ─────────────────────────────────────────────────
function plainStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function firstArrayValue(value: string[] | null | undefined): string {
  if (!value || !Array.isArray(value)) return "";
  return value[0] ?? "";
}

// ── Open for editing existing contract ────────────────────────────────────────
async function openForUpdate(contractId: string, returnTo?: string) {
  visible.value = true;
  loading.value = true;
  updateReturnTo.value = returnTo ?? "";
  if (!engineerProfile.value) {
    await loadEngineerProfile().catch(() => {
    });
  }
  const row = await api.contracts.get(contractId);
  const manual = plainStringMap(row.manual_fields);
  const firstEquipment = row._equipment?.[0] ?? null;

  updatingContractId.value = String(row.id);
  hydratingDraft.value = true;
  clientId.value = row.client_id ? String(row.client_id) : null;
  prevReportNumber.value = manual.prev_report_number ?? "";
  checkDateMs.value = row.start_date ? new Date(dateOnly(row.start_date)).getTime() : Date.now();
  expiryDateMs.value = row.expiry_date ? new Date(dateOnly(row.expiry_date)).getTime() : null;
  reminderDaysBefore.value = 30;
  reportType.value = inferReportTypeValue(row.contract_type, firstEquipment?.category);
  intervalMonths.value = clampIntervalMonths((row as any).inspection_interval_months ?? manual.inspection_interval_months ?? selectedReportType.value.intervalMonths);
  hydraulicForm.value = {
    contract_number: contractNumberInputValue(row.contract_number),
    business: {
      display_name: String(row.client_name ?? row.counterparty ?? manual.client_company ?? ""),
      id_number: manual.client_id ?? "",
      contact_person: String(row.contact_person ?? manual.contact_person ?? manual.client_name ?? ""),
      email: String(row.contact_email ?? manual.contact_email ?? manual.client_email ?? ""),
      phone: String(row.contact_phone ?? manual.contact_phone ?? manual.client_phone ?? ""),
      mobile: String(manual.client_mobile ?? manual.mobile ?? ""),
      fax: String(manual.client_fax ?? manual.fax ?? ""),
      address: String(row.client_address ?? manual.client_address ?? ""),
      city: String(manual.client_city ?? manual.city ?? ""),
      po_box: String(row.po_box ?? manual.po_box ?? ""),
      client_zipcode: String(row.client_zipcode ?? manual.zip_code ?? ""),
    },
    inspection_type: manual.inspection_type || "תקופתית",
    inspection_location: manual.inspection_location ?? "",
    contract_type: row.contract_type ?? selectedReportType.value.contractType,
    equipment: {
      category: (firstEquipment?.category ?? selectedReportType.value.category) as HydraulicCheckRequest["equipment"]["category"],
      name: String(firstEquipment?.name ?? manual.name ?? manual.checked_equipment ?? ""),
      manufacturer: String(firstEquipment?.manufacturer ?? manual.manufacturer ?? ""),
      model: String(firstEquipment?.model ?? manual.model ?? ""),
      serial_number: String(firstEquipment?.serial_number ?? manual.serial_number ?? ""),
      load_capacity_work: manual.load_capacity_work ?? firstArrayValue(firstEquipment?.load_capacity_work),
      load_capacity_test: manual.load_capacity_test ?? firstArrayValue(firstEquipment?.load_capacity_test),
      load_radius: manual.load_radius ?? firstArrayValue(firstEquipment?.load_radius),
      description: String(row.equipment_description ?? manual.equipment_description ?? ""),
    },
    interval_months: intervalMonths.value,
  };
  equipmentRows.value = (row._equipment?.length ? row._equipment : [firstEquipment].filter(Boolean)).map((eq: any) => ({
    id: crypto.randomUUID(),
    selected_equipment_id: null,
    category: eq?.category ?? selectedReportType.value.category,
    name: String(eq?.name ?? manual.name ?? manual.checked_equipment ?? ""),
    manufacturer: String(eq?.manufacturer ?? manual.manufacturer ?? ""),
    models: eq?.models?.length ? eq.models : eq?.model ? [String(eq.model)] : [],
    serial_numbers: eq?.serial_numbers?.length ? eq.serial_numbers : eq?.serial_number ? [String(eq.serial_number)] : [],
    license_number: String(eq?.license_number ?? manual.license_number ?? ""),
    load_capacity_work: Array.isArray(eq?.load_capacity_work) ? eq.load_capacity_work.map(String) : manual.load_capacity_work ? [manual.load_capacity_work] : [],
    load_capacity_test: Array.isArray(eq?.load_capacity_test) ? eq.load_capacity_test.map(String) : manual.load_capacity_test ? [manual.load_capacity_test] : [],
    load_radius: Array.isArray(eq?.load_radius) ? eq.load_radius.map(String) : manual.load_radius ? [manual.load_radius] : [],
    description: String(eq?.description ?? row.equipment_description ?? manual.equipment_description ?? ""),
    equipment_location: String(eq?.equipment_location ?? manual.equipment_location ?? ""),
    volume_liters: String(eq?.volume_liters ?? manual.volume_liters ?? ""),
    diameter_mm: String(eq?.diameter_mm ?? manual.diameter_mm ?? ""),
    material: String(eq?.material ?? manual.material ?? ""),
    construction_type: String(eq?.construction_type ?? manual.construction_type ?? ""),
    wall_thickness_mm: String(eq?.wall_thickness_mm ?? manual.wall_thickness_mm ?? ""),
    cap_thickness_mm: String(eq?.cap_thickness_mm ?? manual.cap_thickness_mm ?? ""),
    access_openings: String(eq?.access_openings ?? manual.access_openings ?? ""),
    plug_present: String(eq?.plug_present ?? manual.plug_present ?? ""),
    corrosion_present: String(eq?.corrosion_present ?? manual.corrosion_present ?? ""),
    safety_valve_diameter_mm: String(eq?.safety_valve_diameter_mm ?? manual.safety_valve_diameter_mm ?? ""),
  }));
  if (!equipmentRows.value.length) equipmentRows.value = [emptyEquipmentRow()];
  templateValues.value = {};
  hydratingDraft.value = false;
  loading.value = false;
  await loadClients();
  if (clientId.value) {
    const freshClient = clientsMap.value.get(String(clientId.value));
    if (freshClient) {
      hydraulicForm.value.business.email = freshClient.email || hydraulicForm.value.business.email;
      hydraulicForm.value.business.phone = freshClient.phone || hydraulicForm.value.business.phone;
      hydraulicForm.value.business.mobile = freshClient.mobile || hydraulicForm.value.business.mobile;
    }
  }
  void loadPrintTemplates().then(() => {
    selectTemplate(templateId.value ?? defaultTemplateId());
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
defineExpose({open, openForUpdate});
</script>

<style scoped>
/* Modal overrides */
:global(.hydraulic-modal.n-card),
:global(.n-modal.hydraulic-modal) {
  direction: rtl;
  width: min(1260px, 96vw) !important;
  max-width: 96vw !important;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  font-family: var(--font-base) !important;
  border: none;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

:global(.hydraulic-modal .n-card-header) {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

:global(.hydraulic-modal .n-card-header__main) {
  flex: 1;
}

:global(.hydraulic-modal .n-card__content) {
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

:global(.hydraulic-modal .n-card__footer) {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
}

:global(.hydraulic-modal .n-card-header__close) {
  display: none;
}

/* Header */
.hm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hm-error-text {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--text-primary);
}

.hm-error-text__id {
  font-weight: 700;
  unicode-bidi: isolate;
}

.hm-header__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
}

.hm-header__title .n-icon {
  color: var(--brand-color);
}

.hm-header__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.hm-header__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Draft pill */
.hm-draft-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-radius: 20px;
  background: var(--bg-hover);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}

.hm-draft-pill:hover {
  background: var(--border-color);
}

.hm-draft-pill .n-icon {
  color: var(--color-warning);
}

.hm-draft-pill__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.hm-draft-pill__close:hover {
  background: var(--color-error);
  color: #fff;
}

/* RTL: first column is visual-right (form). Preview is the second column = visual left. */
.hm-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px;
  width: 100%;
  box-sizing: border-box;
}

.hm-shell--preview {
  grid-template-columns: minmax(0, 1fr) 440px;
}

.hm-preview,
.compose-preview {
  width: 440px;
  flex: none;
  position: sticky;
  top: 0;
  max-height: 70vh;
  overflow: auto;
  box-sizing: border-box;
}

.compose-preview {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: #fff;
}

.hm-main {
  min-width: 0;
}

.compose-preview__label {
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}

.hm-preview-empty {
  padding: 24px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

/* Steps */
.hm-steps {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 12px 20px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}

.hm-step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 0 auto;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}

.hm-step__label {
  white-space: nowrap;
}

.hm-step:hover {
  background: var(--bg-hover);
}

.hm-step--active {
  background: var(--brand-color);
  color: var(--text-inverse, #fff);
}

.hm-step--done .hm-step__num {
  background: var(--color-success);
  color: #fff;
}

.hm-step__num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-hover);
  font-size: 11px;
  font-weight: 700;
}

.hm-step--active .hm-step__num {
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
}

/* Section */
.hm-section {
  padding: 16px 20px;
}

.hm-section__actions {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 12px;
}

.hm-section__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.hm-section__card-head--plain {
  margin: 0;
  padding: 0;
  border: none;
}

.hm-section__card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  background: var(--bg-elevated);
}

.hm-section__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.hm-section__card-head .n-icon {
  color: var(--brand-color);
}

.hm-section__grid {
  display: grid;
  gap: 10px;
}

.hm-section__grid--2 {
  grid-template-columns: repeat(2, 1fr);
}

.hm-section__grid--3 {
  grid-template-columns: repeat(3, 1fr);
}

.hm-section__card + .hm-section__card {
  margin-top: 12px;
}

.hm-findings__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hm-field--deadline {
  max-width: 280px;
}

.hm-section__grid--4 {
  grid-template-columns: repeat(4, 1fr);
}

/* Field */
.hm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hm-field--full {
  grid-column: 1 / -1;
}

.hm-field--span2 {
  grid-column: span 2;
}

.hm-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.hm-field__hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.hm-field__row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.hm-field__row .icon-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hm-field__row .icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hm-field label.required::after {
  content: " *";
  color: var(--color-error);
}

.hm-field :deep(.n-input),
.hm-field :deep(.n-base-selection),
.hm-field :deep(.n-date-picker) {
  --n-border-radius: 8px;
  min-height: 36px;
}

.hm-field :deep(.n-input .n-input-wrapper),
.hm-field :deep(.n-base-selection .n-base-selection-label) {
  min-height: 36px;
  background: var(--bg-card);
}

.hm-field :deep(.n-input:hover),
.hm-field :deep(.n-base-selection:hover) {
  box-shadow: 0 0 0 3px rgba(99, 226, 183, 0.1);
}

.hm-field :deep(.n-input--focus),
.hm-field :deep(.n-base-selection--active) {
  box-shadow: 0 0 0 3px rgba(99, 226, 183, 0.2);
}

.hm-field :deep(.n-input__input-el),
.hm-field :deep(.n-base-selection-input),
.hm-field :deep(.n-base-selection-label) {
  font-size: 13px;
}

/* Equipment card */
.hm-equipment {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  background: var(--bg-elevated);
}

.hm-equipment + .hm-equipment {
  margin-top: 12px;
}

.hm-equipment__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.hm-equipment__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.hm-equipment__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hm-equipment__title .n-icon {
  color: var(--brand-color);
  flex-shrink: 0;
}

.hm-field :deep(.n-dynamic-tags) {
  min-height: 36px;
  align-items: center;
}

/* Footer */
.hm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hm-footer__nav {
  display: flex;
  gap: 8px;
  margin: 0 10px;
}

.hm-footer__actions {
  display: flex;
  gap: 8px;
  flex: 1;
}

/* Transition */
.hydraulic-fade-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.hydraulic-fade-leave-active {
  transition: opacity 0.1s ease;
}

.hydraulic-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.hydraulic-fade-leave-to {
  opacity: 0;
}

/* Interval & Reminder preview */
.hm-interval-display,
.hm-reminder-preview {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--bg-hover);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.hm-warning {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(250, 173, 20, 0.1);
  color: #d4811a;
  font-size: 13px;
}

@media (max-width: 920px) {
  .hm-shell,
  .hm-shell--preview {
    grid-template-columns: minmax(0, 1fr);
  }

  .hm-preview,
  .compose-preview {
    width: min(440px, 100%);
    max-height: 40vh;
    justify-self: center;
    position: static;
  }
}

@media (max-width: 720px) {
  .hm-steps {
    flex-wrap: wrap;
  }

  .hm-section__grid--2,
  .hm-section__grid--3,
  .hm-section__grid--4 {
    grid-template-columns: 1fr;
  }

  .hm-field--span2 {
    grid-column: span 1;
  }

  .hm-footer {
    flex-direction: column;
    gap: 10px;
  }

  .hm-footer__nav,
  .hm-footer__actions,
  .hm-footer__save {
    width: 100%;
    justify-content: center;
  }
}
</style>
