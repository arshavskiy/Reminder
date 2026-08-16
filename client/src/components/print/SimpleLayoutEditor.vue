<template>
  <div class="layout-editor">
    <div class="layout-editor__toolbar">
      <n-form-item label="שם תבנית" label-placement="left" :show-feedback="false" class="layout-editor__name">
        <n-input :value="name" placeholder="שם התבנית" @update:value="$emit('update:name', $event)" />
      </n-form-item>
      <n-form-item label="צבע מסגרת" label-placement="left" :show-feedback="false">
        <n-select
            :value="layout.styles.borderColor"
            :options="borderColorOptions"
            style="width: 140px"
            @update:value="setBorderColor"
        />
      </n-form-item>
      <n-form-item label="עובי מסגרת" label-placement="left" :show-feedback="false">
        <n-select
            :value="layout.styles.borderWidth"
            :options="borderWidthOptions"
            style="width: 120px"
            @update:value="setBorderWidth"
        />
      </n-form-item>
      <n-form-item :show-feedback="false" label="הוסף סעיף" label-placement="left">
        <n-select
            v-model:value="newSectionType"
            :options="sectionTypeOptions"
            placeholder="בחר סוג"
            style="width: 140px"
            @update:value="addNewSection"
        />
      </n-form-item>
    </div>

    <div class="layout-editor__body">
      <div class="layout-editor__sections">
        <article v-for="(section, si) in layout.sections" :key="si" class="section-card">
          <header class="section-card__head">
            <span class="section-card__type">{{ sectionTypeLabel(section) }}</span>
            <div class="section-card__actions">
              <button
                  v-if="si > 0"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  title="העבר למעלה"
                  @click="moveSection(si, -1)"
              >↑</button>
              <button
                  v-if="si < layout.sections.length - 1"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  title="העבר למטה"
                  @click="moveSection(si, 1)"
              >↓</button>
              <button
                  v-if="section.type === 'fields' || section.type === 'header'"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  @click="addField(si)"
              >+ שדה</button>
              <button
                  v-if="section.type === 'equipment_table'"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  @click="addEquipmentColumn(si)"
              >+ עמודה</button>
              <button
                  v-if="section.type === 'findings'"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  @click="addFindingRow(si)"
              >+ שורה</button>
              <button
                  class="btn btn--xs btn--danger"
                  type="button"
                  title="הסר סעיף"
                  @click="removeSection(si)"
              >הסר</button>
            </div>
          </header>
          <div class="section-card__opts">
            <n-checkbox
                :checked="!!section.style?.noBorder"
                @update:checked="toggleNoBorder(si, $event)"
            >ללא מסגרת</n-checkbox>
          </div>

          <template v-if="section.type === 'header'">
            <div class="heading-row">
              <n-input v-model:value="section.title" placeholder="כותרת" size="small" />
              <n-select
                  :value="section.titleSize ?? 'normal'"
                  :options="headingSizeOptions"
                  size="small"
                  style="width: 88px"
                  @update:value="setHeaderTextStyle(si, 'titleSize', $event)"
              />
              <button
                  :class="{ 'btn--ghost-active': section.titleBold !== false }"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  title="מודגש"
                  @click="toggleHeaderBold(si, 'title')"
              >B</button>
            </div>
            <div class="heading-row" style="margin-top:6px">
              <n-input v-model:value="section.subtitle" placeholder="כותרת משנה" size="small" />
              <n-select
                  :value="section.subtitleSize ?? 'normal'"
                  :options="headingSizeOptions"
                  size="small"
                  style="width: 88px"
                  @update:value="setHeaderTextStyle(si, 'subtitleSize', $event)"
              />
              <button
                  :class="{ 'btn--ghost-active': !!section.subtitleBold }"
                  class="btn btn--xs btn--ghost"
                  type="button"
                  title="מודגש"
                  @click="toggleHeaderBold(si, 'subtitle')"
              >B</button>
            </div>
            <div class="field-list">
              <div v-for="(field, fi) in section.fields" :key="fi" class="field-row field-row--style">
                <n-input v-model:value="field.label" placeholder="תווית" size="small" />
                <n-select
                    v-model:value="field.bind"
                    :options="bindOptions"
                    filterable
                    tag
                    placeholder="bind"
                    size="small"
                />
                <button
                    :class="{ 'btn--ghost-active': field.size === 'small' }"
                    class="btn btn--xs btn--ghost"
                    type="button"
                    title="טקסט קטן"
                    @click="toggleFieldSize(si, fi)"
                >קטן</button>
                <button
                    :class="{ 'btn--ghost-active': field.bold }"
                    class="btn btn--xs btn--ghost"
                    type="button"
                    title="מודגש"
                    @click="toggleFieldBold(si, fi)"
                >B</button>
                <button class="btn btn--xs btn--danger" type="button" @click="removeField(si, fi)">×</button>
              </div>
            </div>
          </template>

          <template v-else-if="section.type === 'fields'">
            <div class="field-row" style="margin-bottom:6px">
              <n-input v-model:value="section.title" placeholder="כותרת סעיף" size="small" />
              <n-form-item label="עמודות" :show-feedback="false" label-placement="left">
                <n-select
                    :value="section.columns ?? 3"
                    :options="columnsOptions"
                    size="small"
                    style="width: 70px"
                    @update:value="setFieldsColumns(si, $event)"
                />
              </n-form-item>
            </div>
            <div class="field-list">
              <div v-for="(field, fi) in section.fields" :key="fi" class="field-row field-row--style">
                <n-input v-model:value="field.label" placeholder="תווית" size="small" />
                <n-select
                    v-model:value="field.bind"
                    :options="bindOptions"
                    filterable
                    tag
                    placeholder="bind"
                    size="small"
                />
                <button
                    :class="{ 'btn--ghost-active': field.size === 'small' }"
                    class="btn btn--xs btn--ghost"
                    type="button"
                    title="טקסט קטן"
                    @click="toggleFieldSize(si, fi)"
                >קטן</button>
                <button
                    :class="{ 'btn--ghost-active': field.bold }"
                    class="btn btn--xs btn--ghost"
                    type="button"
                    title="מודגש"
                    @click="toggleFieldBold(si, fi)"
                >B</button>
                <button class="btn btn--xs btn--danger" type="button" @click="removeField(si, fi)">×</button>
              </div>
            </div>
          </template>

          <template v-else-if="section.type === 'equipment_table'">
            <n-input v-model:value="section.title" placeholder="כותרת טבלה" size="small" />
            <p class="section-card__hint">עמודות ציוד — לחצו + עמודה להוסיף, × למחוק</p>
            <div class="field-list">
              <div v-for="(col, ci) in section.columns" :key="ci" class="field-row">
                <n-input v-model:value="col.label" placeholder="עמודה" size="small" />
                <n-input v-model:value="col.bind" placeholder="bind" size="small" />
                <button class="btn btn--xs btn--danger" type="button" @click="removeEquipmentColumn(si, ci)">×</button>
              </div>
            </div>
          </template>

          <template v-else-if="section.type === 'findings'">
            <n-input v-model:value="section.title" placeholder="כותרת סעיף" size="small" />
            <p class="section-card__hint">לחצו + שורה להוסיף ליקוי, × למחוק</p>
            <div class="field-list">
              <div v-for="(row, ri) in section.rows" :key="ri" class="field-row field-row--4">
                <n-input v-model:value="row.number" placeholder="מס׳" size="small" />
                <n-input v-model:value="row.subjectLabel" placeholder="נושא" size="small" />
                <n-input v-model:value="row.bind" placeholder="bind" size="small" />
                <button class="btn btn--xs btn--danger" type="button" @click="removeFindingRow(si, ri)">×</button>
              </div>
            </div>
          </template>

          <template v-else-if="section.type === 'static_text'">
            <n-input v-model:value="section.title" placeholder="כותרת סעיף" size="small" />
            <n-input
                v-model:value="section.text"
                type="textarea"
                :rows="5"
                placeholder="טקסט קבוע"
                size="small"
                style="margin-top:6px"
            />
          </template>

          <template v-else-if="section.type === 'signature'">
            <n-checkbox v-model:checked="section.enabled">הצג אזור חתימה</n-checkbox>
            <template v-if="section.enabled">
              <n-form-item :show-feedback="false" label="תמונת חתימה/חותמת" style="margin-top:8px">
                <div class="sig-upload">
                  <img v-if="section.imageSrc" :src="section.imageSrc" alt="חתימה" class="sig-upload__preview">
                  <button
                      :disabled="uploadingSignature"
                      class="btn btn--xs btn--ghost"
                      type="button"
                      @click="triggerSignatureUpload(si)"
                  >
                    {{ uploadingSignature ? "מעלה..." : (section.imageSrc ? "החלף חתימה" : "העלה חתימה") }}
                  </button>
                </div>
              </n-form-item>
              <n-form-item :show-feedback="false" label="פסקת אישור">
                <n-input
                    :rows="4"
                    :value="section.certificationText ?? defaultCertification"
                    type="textarea"
                    size="small"
                    @update:value="updateSignatureField(si, 'certificationText', $event)"
                />
              </n-form-item>
              <n-form-item :show-feedback="false" label="יישור חתימה">
                <n-select
                    :options="alignOptions"
                    :value="section.align ?? 'left'"
                    size="small"
                    @update:value="updateSignatureField(si, 'align', $event)"
                />
              </n-form-item>
            </template>
          </template>

          <template v-else-if="section.type === 'image'">
            <n-input v-model:value="section.title" placeholder="כותרת (אופציונלי)" size="small" />
            <n-form-item label="כתובת תמונה" :show-feedback="false" style="margin-top:6px">
              <n-input
                  :value="section.src"
                  placeholder="https://... או data:image/..."
                  size="small"
                  @update:value="updateImageField(si, 'src', $event)"
              />
            </n-form-item>
            <div class="field-row" style="margin-top:6px">
              <n-form-item label="רוחב" :show-feedback="false">
                <n-input-number :value="section.width" size="small" :min="0" @update:value="updateImageField(si, 'width', $event)" />
              </n-form-item>
              <n-form-item label="גובה" :show-feedback="false">
                <n-input-number :value="section.height" size="small" :min="0" @update:value="updateImageField(si, 'height', $event)" />
              </n-form-item>
              <n-form-item label="יישור" :show-feedback="false">
                <n-select
                    :value="section.align ?? 'center'"
                    :options="alignOptions"
                    size="small"
                    @update:value="updateImageField(si, 'align', $event)"
                />
              </n-form-item>
            </div>
          </template>

          <template v-else-if="section.type === 'footer'">
            <n-checkbox v-model:checked="section.enabled">הצג כותרת תחתונה</n-checkbox>
            <template v-if="section.enabled">
              <div class="field-row" style="margin-top:8px">
                <n-form-item :show-feedback="false" label="עמודה שמאלית">
                  <n-input
                      :value="section.leftLabel ?? ''"
                      placeholder="תווית (למשל: דואר אלקטרוני:)"
                      size="small"
                      @update:value="updateFooterField(si, 'leftLabel', $event)"
                  />
                </n-form-item>
                <n-select
                    :options="bindOptions"
                    :value="section.leftBind ?? ''"
                    clearable
                    filterable
                    placeholder="bind"
                    size="small"
                    tag
                    @update:value="updateFooterField(si, 'leftBind', $event)"
                />
              </div>
              <div class="field-row">
                <n-form-item :show-feedback="false" label="עמודה מרכזית">
                  <n-input
                      :value="section.centerLabel ?? ''"
                      placeholder="תווית (אופציונלי)"
                      size="small"
                      @update:value="updateFooterField(si, 'centerLabel', $event)"
                  />
                </n-form-item>
                <n-select
                    :options="bindOptions"
                    :value="section.centerBind ?? ''"
                    clearable
                    filterable
                    placeholder="bind"
                    size="small"
                    tag
                    @update:value="updateFooterField(si, 'centerBind', $event)"
                />
              </div>
              <div class="field-row">
                <n-form-item :show-feedback="false" label="עמודה ימנית">
                  <n-input
                      :value="section.rightLabel ?? ''"
                      placeholder="תווית (למשל: נייד:)"
                      size="small"
                      @update:value="updateFooterField(si, 'rightLabel', $event)"
                  />
                </n-form-item>
                <n-select
                    :options="bindOptions"
                    :value="section.rightBind ?? ''"
                    clearable
                    filterable
                    placeholder="bind"
                    size="small"
                    tag
                    @update:value="updateFooterField(si, 'rightBind', $event)"
                />
              </div>
            </template>
          </template>
        </article>
      </div>

      <aside class="layout-editor__preview">
        <div class="layout-editor__preview-label">תצוגה מקדימה</div>
        <LayoutPreviewFrame :layout="layout" :data="previewData" />
      </aside>
    </div>
    <input
        ref="signatureFileInput"
        accept="image/*"
        class="sig-upload__input"
        type="file"
        @change="onSignatureFileChange"
    />
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref} from "vue";
import {NCheckbox, NFormItem, NInput, NInputNumber, NSelect, useMessage} from "naive-ui";
import LayoutPreviewFrame from "./LayoutPreviewFrame.vue";
import {api} from "../../services/apiService.js";
import {useEngineerStore} from "../../stores/engineer.js";
import {
  clonePrintTemplateLayout,
  createDefaultFooterSection,
  DEFAULT_SIGNATURE_CERTIFICATION,
  LAYOUT_BORDER_COLORS,
  LAYOUT_FIELD_PRESETS,
  type PrintTemplateLayout,
  type PrintTemplateSection,
  type PrintTemplateTextSize,
} from "@shared/printTemplateLayout.js";

const props = defineProps<{
  name: string;
  layout: PrintTemplateLayout;
}>();

const emit = defineEmits<{
  "update:name": [value: string];
  "update:layout": [value: PrintTemplateLayout];
}>();

const borderColorOptions = LAYOUT_BORDER_COLORS.map((c) => ({ label: c.label, value: c.value }));
const borderWidthOptions = [
  { label: "דק", value: "thin" },
  { label: "בינוני", value: "medium" },
  { label: "עבה", value: "thick" },
];

const columnsOptions = [
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
];
const headingSizeOptions = [
  { label: "קטן", value: "small" },
  { label: "רגיל", value: "normal" },
  { label: "גדול", value: "large" },
];
const alignOptions = [
  {label: "ימין", value: "right"},
  {label: "מרכז", value: "center"},
  {label: "שמאל", value: "left"},
];

const newSectionType = ref<string | null>(null);
const sectionTypeOptions = [
  {label: "כותרת", value: "header"},
  {label: "שדות", value: "fields"},
  {label: "טבלת ציוד", value: "equipment_table"},
  {label: "ליקויים", value: "findings"},
  {label: "טקסט קבוע", value: "static_text"},
  {label: "חתימה", value: "signature"},
  {label: "תמונה", value: "image"},
  {label: "כותרת תחתונה", value: "footer"},
];

const bindOptions = LAYOUT_FIELD_PRESETS.map((f) => ({ label: `${f.label} (${f.bind})`, value: f.bind }));
const message = useMessage();
const engineerStore = useEngineerStore();
const signatureFileInput = ref<HTMLInputElement | null>(null);
const signatureUploadIndex = ref<number | null>(null);
const uploadingSignature = ref(false);
const engineerPreview = ref<Record<string, string>>({});
const defaultCertification = DEFAULT_SIGNATURE_CERTIFICATION;

const previewData = computed(() => {
  const sample: Record<string, string> = {};
  for (const f of LAYOUT_FIELD_PRESETS) sample[f.bind] = `[${f.label}]`;
  sample.name = "מלגזה";
  sample.manufacturer = "יALE";
  sample.model = "ERP20";
  sample.serial_number = "12345";
  sample.load_radius = "2.5";
  sample.load_capacity_test = "2500";
  sample.load_capacity_work = "2000";
  sample.engineer_name = "ישראל ישראלי";
  sample.engineer_phone = "050-1234567";
  sample.engineer_email = "engineer@example.com";
  sample.engineer_company = "הנדסה ובדיקות בע״מ";
  sample.inspector_number = "12345";
  sample.company_name = "הנדסה ובדיקות בע״מ";
  sample.company_registration = "514123456";
  sample.engineer_address = "רח׳ העצמאות 36 אשדוד";
  const filled = Object.fromEntries(
      Object.entries(engineerPreview.value).filter(([, value]) => value),
  );
  return {...sample, ...filled};
});

onMounted(async () => {
  const profile = await engineerStore.load();
  if (!profile) return;
  const companyName = profile.company_name ?? "";
  engineerPreview.value = {
    inspector_number: profile.inspector_number ?? "",
    company_name: companyName,
    company_registration: profile.company_registration ?? "",
    engineer_company: companyName,
    engineer_email: profile.company_email ?? "",
    engineer_phone: profile.company_phone ?? "",
    engineer_name: profile.full_name ?? "",
    engineer_address: profile.address ?? "",
  };
});

function patchLayout(mutator: (layout: PrintTemplateLayout) => void) {
  const copy = clonePrintTemplateLayout(props.layout);
  mutator(copy);
  emit("update:layout", copy);
}

function setBorderColor(value: string) {
  patchLayout((l) => { l.styles.borderColor = value; });
}

function setBorderWidth(value: "thin" | "medium" | "thick") {
  patchLayout((l) => { l.styles.borderWidth = value; });
}

function addNewSection(type: string | null) {
  if (!type) return;
  newSectionType.value = null;

  let newSection: PrintTemplateSection;
  switch (type) {
    case "header":
      newSection = {type: "header", title: "", subtitle: "", fields: []};
      break;
    case "fields":
      newSection = {type: "fields", title: "", fields: [], columns: 3};
      break;
    case "equipment_table":
      newSection = {type: "equipment_table", title: "", columns: []};
      break;
    case "findings":
      newSection = {type: "findings", title: "", rows: []};
      break;
    case "static_text":
      newSection = {type: "static_text", title: "", text: ""};
      break;
    case "signature":
      newSection = {type: "signature", enabled: true, align: "left"};
      break;
    case "image":
      newSection = {type: "image", src: ""};
      break;
    case "footer":
      newSection = createDefaultFooterSection();
      break;
    default:
      return;
  }

  patchLayout((l) => {
    l.sections.push(newSection);
  });
}

function removeSection(sectionIndex: number) {
  patchLayout((l) => {
    l.sections.splice(sectionIndex, 1);
  });
}

function sectionTypeLabel(section: PrintTemplateSection): string {
  const map: Record<string, string> = {
    header: "כותרת",
    fields: "שדות",
    equipment_table: "טבלת ציוד",
    findings: "ליקויים",
    static_text: "טקסט קבוע",
    signature: "חתימה",
    image: "תמונה",
    footer: "כותרת תחתונה",
  };
  return map[section.type] ?? section.type;
}

function updateSignatureField(
    sectionIndex: number,
    field: "imageSrc" | "inspectorText" | "companyName" | "certificationText" | "align",
    value: string,
) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "signature") {
      target[field] = value || undefined;
    }
  });
}

function triggerSignatureUpload(sectionIndex: number) {
  signatureUploadIndex.value = sectionIndex;
  signatureFileInput.value?.click();
}

async function onSignatureFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const sectionIndex = signatureUploadIndex.value;
  input.value = "";
  if (!file || sectionIndex == null) return;
  uploadingSignature.value = true;
  try {
    const uploaded = await api.assets.uploadUserAsset(file, "signature");
    updateSignatureField(sectionIndex, "imageSrc", uploaded.url);
    message.success("החתימה הועלתה");
  } catch (e) {
    message.error(e instanceof Error ? e.message : "העלאת החתימה נכשלה");
  } finally {
    uploadingSignature.value = false;
    signatureUploadIndex.value = null;
  }
}

function updateImageField(sectionIndex: number, field: string, value: unknown) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "image") {
      (target as Record<string, unknown>)[field] = value;
    }
  });
}

function updateFooterField(sectionIndex: number, field: string, value: unknown) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "footer") {
      (target as Record<string, unknown>)[field] = value;
    }
  });
}

function addField(sectionIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target && (target.type === "header" || target.type === "fields")) {
      target.fields.push({ label: "שדה חדש", bind: `custom_${Date.now()}` });
    }
  });
}

function removeField(sectionIndex: number, fieldIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target && (target.type === "header" || target.type === "fields")) {
      target.fields.splice(fieldIndex, 1);
    }
  });
}

function toggleFieldBold(sectionIndex: number, fieldIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target && (target.type === "header" || target.type === "fields")) {
      const field = target.fields[fieldIndex];
      if (field) field.bold = !field.bold;
    }
  });
}

function toggleFieldSize(sectionIndex: number, fieldIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target && (target.type === "header" || target.type === "fields")) {
      const field = target.fields[fieldIndex];
      if (field) field.size = field.size === "small" ? "normal" : "small";
    }
  });
}

function setHeaderTextStyle(sectionIndex: number, key: "titleSize" | "subtitleSize", value: PrintTemplateTextSize) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "header") target[key] = value;
  });
}

function toggleHeaderBold(sectionIndex: number, which: "title" | "subtitle") {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type !== "header") return;
    if (which === "title") target.titleBold = target.titleBold === false;
    else target.subtitleBold = !target.subtitleBold;
  });
}

function moveSection(sectionIndex: number, direction: -1 | 1) {
  patchLayout((l) => {
    const newIndex = sectionIndex + direction;
    if (newIndex >= 0 && newIndex < l.sections.length) {
      const [item] = l.sections.splice(sectionIndex, 1);
      l.sections.splice(newIndex, 0, item);
    }
  });
}

function toggleNoBorder(sectionIndex: number, checked: boolean) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target) {
      if (!target.style) target.style = {};
      target.style.noBorder = checked || undefined;
    }
  });
}

function setFieldsColumns(sectionIndex: number, cols: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "fields") {
      target.columns = cols;
    }
  });
}

function addEquipmentColumn(sectionIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "equipment_table") {
      target.columns.push({ label: "עמודה חדשה", bind: `custom_col_${Date.now()}` });
    }
  });
}

function removeEquipmentColumn(sectionIndex: number, colIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "equipment_table" && target.columns.length > 1) {
      target.columns.splice(colIndex, 1);
    }
  });
}

function addFindingRow(sectionIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "findings") {
      const num = (target.rows.length + 1).toString();
      target.rows.push({ number: num, subjectLabel: "נושא חדש", bind: `finding_${Date.now()}` });
    }
  });
}

function removeFindingRow(sectionIndex: number, rowIndex: number) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "findings" && target.rows.length > 1) {
      target.rows.splice(rowIndex, 1);
    }
  });
}
</script>

<style scoped>
.layout-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-bottom: 16px;
  align-items: center;
}
.layout-editor__name { min-width: 260px; }
.layout-editor__body {
  display: grid;
  grid-template-columns: 1fr 500px;
  gap: 16px;
  align-items: start;
}
.layout-editor__sections { display: flex; flex-direction: column; gap: 12px; }
.section-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-elevated);
}
.section-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.section-card__actions { display: flex; gap: 4px; }
.section-card__opts { margin-bottom: 8px; font-size: 13px; }
.section-card__type {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.section-card__hint {
  margin: 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.field-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 6px;
  align-items: center;
}
.field-row--style {
  grid-template-columns: 1fr 1fr auto auto auto;
}
.heading-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px;
  align-items: center;
}
.btn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}
.field-row--3 { grid-template-columns: 60px 1fr 1fr; }
.field-row--4 { grid-template-columns: 60px 1fr 1fr auto; }
.layout-editor__preview {
  position: sticky;
  top: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.layout-editor__preview-label {
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}

.sig-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sig-upload__preview {
  max-height: 56px;
  max-width: 140px;
  object-fit: contain;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #fff;
}

.sig-upload__input {
  display: none;
}
@media (max-width: 960px) {
  .layout-editor__body { grid-template-columns: 1fr; }
  .layout-editor__preview { position: static; }
}
</style>
