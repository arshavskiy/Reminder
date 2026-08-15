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
            </div>
          </header>
          <div class="section-card__opts">
            <n-checkbox
                :checked="!!section.style?.noBorder"
                @update:checked="toggleNoBorder(si, $event)"
            >ללא מסגרת</n-checkbox>
          </div>

          <template v-if="section.type === 'header'">
            <n-input v-model:value="section.title" placeholder="כותרת" size="small" />
            <n-input v-model:value="section.subtitle" placeholder="כותרת משנה" size="small" style="margin-top:6px" />
            <div class="field-list">
              <div v-for="(field, fi) in section.fields" :key="fi" class="field-row">
                <n-input v-model:value="field.label" placeholder="תווית" size="small" />
                <n-select
                    v-model:value="field.bind"
                    :options="bindOptions"
                    filterable
                    tag
                    placeholder="bind"
                    size="small"
                />
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
              <div v-for="(field, fi) in section.fields" :key="fi" class="field-row">
                <n-input v-model:value="field.label" placeholder="תווית" size="small" />
                <n-select
                    v-model:value="field.bind"
                    :options="bindOptions"
                    filterable
                    tag
                    placeholder="bind"
                    size="small"
                />
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
              <n-form-item label="תמונת חתימה/חותמת (URL)" :show-feedback="false" style="margin-top:8px">
                <n-input
                    :value="section.imageSrc ?? ''"
                    placeholder="https://... או data:image/..."
                    size="small"
                    @update:value="updateSignatureField(si, 'imageSrc', $event)"
                />
              </n-form-item>
              <n-form-item label="פרטי בודק" :show-feedback="false">
                <n-input
                    :value="section.inspectorText ?? ''"
                    placeholder="שם, מס׳ תעודה, טלפון"
                    size="small"
                    @update:value="updateSignatureField(si, 'inspectorText', $event)"
                />
              </n-form-item>
              <n-form-item label="שם חברה" :show-feedback="false">
                <n-input
                    :value="section.companyName ?? ''"
                    placeholder="הנדסה וניהול בע״מ"
                    size="small"
                    @update:value="updateSignatureField(si, 'companyName', $event)"
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
                    :options="[{ label: 'ימין', value: 'right' }, { label: 'מרכז', value: 'center' }, { label: 'שמאל', value: 'left' }]"
                    size="small"
                    @update:value="updateImageField(si, 'align', $event)"
                />
              </n-form-item>
            </div>
          </template>
        </article>
      </div>

      <aside class="layout-editor__preview">
        <div class="layout-editor__preview-label">תצוגה מקדימה</div>
        <LayoutPreviewFrame :layout="layout" :data="previewData" />
      </aside>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NCheckbox, NFormItem, NInput, NInputNumber, NSelect} from "naive-ui";
import LayoutPreviewFrame from "./LayoutPreviewFrame.vue";
import {
  clonePrintTemplateLayout,
  LAYOUT_BORDER_COLORS,
  LAYOUT_FIELD_PRESETS,
  type PrintTemplateLayout,
  type PrintTemplateSection,
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

const bindOptions = LAYOUT_FIELD_PRESETS.map((f) => ({ label: `${f.label} (${f.bind})`, value: f.bind }));

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
  return sample;
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

function sectionTypeLabel(section: PrintTemplateSection): string {
  const map: Record<string, string> = {
    header: "כותרת",
    fields: "שדות",
    equipment_table: "טבלת ציוד",
    findings: "ליקויים",
    static_text: "טקסט קבוע",
    signature: "חתימה",
    image: "תמונה",
  };
  return map[section.type] ?? section.type;
}

function updateSignatureField(sectionIndex: number, field: "imageSrc" | "inspectorText" | "companyName", value: string) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "signature") {
      target[field] = value || undefined;
    }
  });
}

function updateImageField(sectionIndex: number, field: string, value: unknown) {
  patchLayout((l) => {
    const target = l.sections[sectionIndex];
    if (target?.type === "image") {
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
  grid-template-columns: 1fr 360px;
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
@media (max-width: 960px) {
  .layout-editor__body { grid-template-columns: 1fr; }
  .layout-editor__preview { position: static; }
}
</style>
