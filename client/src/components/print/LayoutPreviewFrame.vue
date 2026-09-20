<template>
  <div class="layout-preview" :dir="dir">
    <section
        v-for="(section, si) in layout.sections"
        :key="si"
        :class="['block', { 'no-border': section.style?.noBorder }]"
        :style="blockStyle"
    >
      <!-- Header -->
      <template v-if="section.type === 'header'">
        <table class="header-table">
          <tbody>
            <tr>
              <td class="hdr-side hdr-start">
                <div v-for="f in headerStartFields(section.fields)" :key="f.bind" :class="fieldTextClass(f)" class="hdr-field">
                  <span class="hdr-lbl">{{ f.label }}:</span>
                  <span class="hdr-val">{{ val(f.bind) }}</span>
                </div>
              </td>
              <td class="hdr-center">
                <div :class="['hdr-title', headingTextClass(section, 'title')]">{{ section.title }}</div>
                <div v-if="section.subtitle" :class="['hdr-sub', headingTextClass(section, 'subtitle')]">{{ section.subtitle }}</div>
              </td>
              <td class="hdr-side hdr-end">
                <div v-for="f in headerEndFields(section.fields)" :key="f.bind" :class="fieldTextClass(f)" class="hdr-field">
                  <span class="hdr-lbl">{{ f.label }}:</span>
                  <span class="hdr-val">{{ val(f.bind) }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Fields (multi-column grid) -->
      <template v-else-if="section.type === 'fields'">
        <div v-if="section.title" class="sec-title">{{ section.title }}</div>
        <table class="fields-grid">
          <tbody>
            <tr v-for="(row, ri) in fieldsRows(section.fields, section.columns ?? 3)" :key="ri">
              <template v-for="(f, fi) in row" :key="fi">
                <td :class="['lbl', ...fieldTextClass(f)]">{{ f?.label }}:</td>
                <td :class="['val', ...fieldTextClass(f)]">{{ f ? val(f.bind) : '' }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Equipment table -->
      <template v-else-if="section.type === 'equipment_table'">
        <div v-if="section.title" class="sec-title">{{ section.title }}</div>
        <table class="data equip">
          <thead>
            <tr><th v-for="c in section.columns" :key="c.bind">{{ c.label }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="ri in equipmentRowIndexes(section)" :key="ri">
              <td
                  v-for="(c, ci) in section.columns"
                  :key="c.bind"
                  :class="{ 'stack-td': stackedParts(section, c, ci, ri).length > 1 }"
              >
                <div v-if="stackedParts(section, c, ci, ri).length > 1" class="stack">
                  <div v-for="(part, pi) in stackedParts(section, c, ci, ri)" :key="pi" class="stack__item">{{ part }}</div>
                </div>
                <template v-else>{{ stackedParts(section, c, ci, ri)[0] }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Findings -->
      <template v-else-if="section.type === 'findings'">
        <div class="sec-title">{{ section.title }}</div>
        <table class="data findings">
          <thead>
            <tr>
              <th style="width:40px">{{ dir === "ltr" ? "No." : "מס׳" }}</th>
              <th style="width:80px">{{ dir === "ltr" ? "Subject" : "נושא" }}</th>
              <th colspan="2">{{ dir === "ltr" ? "Details" : "פירוט" }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in section.rows" :key="row.bind">
              <tr v-if="val(row.bind).trim()">
                <td class="num">{{ row.number }}</td>
                <td class="subj">{{ row.subjectLabel }}</td>
                <td colspan="2" class="detail">{{ val(row.bind) }}</td>
              </tr>
            </template>
            <tr v-if="section.deadlineBind && val(section.deadlineBind).trim()">
              <td class="num">{{ section.deadlineLabel ?? (dir === "ltr" ? "Within" : "תוך") }}</td>
              <td class="detail">{{ val(section.deadlineBind) }}</td>
              <td colspan="2" class="detail">{{ section.deadlineSuffix ?? "" }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Checklist -->
      <template v-else-if="section.type === 'checklist'">
        <div v-if="section.title" class="sec-title">{{ section.title }}</div>
        <div v-if="section.codeLegend" class="checklist-legend">{{ section.codeLegend }}</div>
        <template v-for="(group, gi) in section.groups" :key="gi">
          <div v-if="group.title" class="checklist-group-title">{{ group.title }}</div>
          <table class="data checklist">
            <tbody>
              <tr v-for="(row, ri) in checklistRows(group.items, section.columns ?? 2)" :key="ri">
                <template v-for="(item, ii) in row" :key="ii">
                  <td v-if="item" class="checklist-cell">
                    <span class="checklist-num">{{ item.number }}.</span>
                    <span v-if="item.reference" class="checklist-ref">{{ item.reference }}</span>
                    <span class="checklist-label">{{ item.label }}</span>
                    <span v-if="section.markStyle === 'acceptable_na'" class="cl-marks">
                      <span :class="['cl-box', { on: isAcceptableMark(item.bind) }]">A</span>
                      <span :class="['cl-box', { on: isNaMark(item.bind) }]">NA</span>
                    </span>
                    <span v-else class="checklist-code">{{ val(item.bind) }}</span>
                  </td>
                  <td v-else class="checklist-cell checklist-cell--empty"></td>
                </template>
              </tr>
            </tbody>
          </table>
        </template>
      </template>

      <!-- Static text -->
      <template v-else-if="section.type === 'static_text'">
        <div v-if="section.title" class="sec-title">{{ section.title }}</div>
        <p class="static">{{ section.text }}</p>
      </template>

      <!-- Signature -->
      <template v-else-if="section.type === 'signature' && section.enabled">
        <div v-if="certLines(section).length" class="sig-cert">
          <div v-for="(line, li) in certLines(section)" :key="li" class="sig-cert-line">{{ line }}</div>
        </div>
        <div :class="['sig-mark', `sig-align-${section.align ?? 'left'}`]">
          <div class="sig-label">{{ dir === "ltr" ? "Inspector signature:" : "חתימת הבודק:" }}</div>
          <div class="sig-content">
            <div v-if="section.imageSrc || userSignatureUrl" class="sig-image">
              <img :src="section.imageSrc || userSignatureUrl" :alt="dir === 'ltr' ? 'Signature' : 'חתימה'">
            </div>
          </div>
        </div>
      </template>

      <!-- Image -->
      <template v-else-if="section.type === 'image'">
        <div v-if="section.title" class="sec-title">{{ section.title }}</div>
        <div :style="{ textAlign: section.align ?? 'center' }">
          <img
              :src="section.src"
              :alt="section.alt ?? ''"
              :width="section.width"
              :height="section.height"
              class="section-img"
          >
        </div>
      </template>

      <!-- Footer -->
      <template v-else-if="section.type === 'footer' && section.enabled">
        <div class="ftr-row">
          <div v-if="section.leftBind" class="ftr-col">
            <span v-if="section.leftLabel" class="ftr-lbl">{{ section.leftLabel }}</span>
            <span class="ftr-val">{{ val(section.leftBind) }}</span>
          </div>
          <div v-if="section.centerBind" class="ftr-col ftr-center">
            <span class="ftr-val">{{ val(section.centerBind) }}</span>
          </div>
          <div v-if="section.rightBind" class="ftr-col">
            <span v-if="section.rightLabel" class="ftr-lbl">{{ section.rightLabel }}</span>
            <span class="ftr-val">{{ val(section.rightBind) }}</span>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import type {
  PrintTemplateLayout,
  PrintTemplateLayoutHeaderSection,
  PrintTemplateLayoutSignatureSection,
  PrintTemplateLayoutChecklistItem,
  PrintTemplateLayoutEquipmentSection,
  PrintTemplateSectionField
} from "@shared/printTemplateLayout.js";
import {fillLayoutPlaceholders, signatureCertificationText, splitStackedCellValue, equipmentTableRowCount, equipmentTableCellKey, equipmentTableMinRows} from "@shared/printTemplateLayout.js";
import {useAuthStore} from "../../stores/auth.js";

const props = withDefaults(defineProps<{
  layout: PrintTemplateLayout;
  data?: Record<string, string>;
  dir?: "rtl" | "ltr";
}>(), {
  dir: "rtl",
});

function headerStartFields(fields: PrintTemplateSectionField[]) {
  return props.dir === "ltr" ? fields.slice(0, 2) : fields.slice(2, 4);
}

function headerEndFields(fields: PrintTemplateSectionField[]) {
  return props.dir === "ltr" ? fields.slice(2, 4) : fields.slice(0, 2);
}

// Mirrors the server renderer: a section without its own imageSrc falls back to
// the signature stored on the user, so the preview shows what the PDF will.
const authStore = useAuthStore();
const userSignatureUrl = computed(
  () => props.data?.user_signature_url || authStore.user?.signature_url || "");

function val(bind: string): string {
  const raw = props.data?.[bind] ?? "";
  if (props.dir === "ltr" && raw.trim() === "אין") return "None";
  return raw;
}

function fieldTextClass(field: PrintTemplateSectionField | null | undefined): string[] {
  if (!field) return [];
  return [
    field.size === "small" ? "field-text--small" : "",
    field.bold ? "field-text--bold" : "",
  ].filter(Boolean);
}

function headingTextClass(section: PrintTemplateLayoutHeaderSection, which: "title" | "subtitle"): string[] {
  const size = which === "title" ? section.titleSize : section.subtitleSize;
  const bold = which === "title" ? section.titleBold !== false : !!section.subtitleBold;
  return [
    size === "small" ? `hdr-${which}--small` : "",
    size === "large" ? `hdr-${which}--large` : "",
    which === "title" && !bold ? "hdr-title--regular" : "",
    which === "subtitle" && bold ? "hdr-sub--bold" : "",
  ].filter(Boolean);
}

function certLines(section: PrintTemplateLayoutSignatureSection): string[] {
  const template = signatureCertificationText(section, props.dir);
  if (!template) return [];
  const filled = fillLayoutPlaceholders(template, props.data ?? {});
  return filled.split(/\r?\n/).filter((line) => line.length > 0);
}

function borderWidthPx(width: string): number {
  if (width === "thick") return 3;
  if (width === "medium") return 2;
  return 1;
}

const blockStyle = computed(() => ({
  borderWidth: `${borderWidthPx(props.layout.styles.borderWidth)}px`,
  borderColor: props.layout.styles.borderColor || "#111",
}));

function equipmentRowIndexes(section: PrintTemplateLayoutEquipmentSection): number[] {
  const count = equipmentTableRowCount(section.columns, props.data, equipmentTableMinRows(section));
  return Array.from({length: count}, (_, index) => index);
}

function stackedParts(
  section: PrintTemplateLayoutEquipmentSection,
  column: {bind: string},
  columnIndex: number,
  rowIndex: number,
): string[] {
  const raw = val(equipmentTableCellKey(column.bind, rowIndex));
  if (!raw.trim() && columnIndex === 0 && section.fixedRows?.[rowIndex]) {
    return [section.fixedRows[rowIndex]];
  }
  return splitStackedCellValue(raw);
}

function isAcceptableMark(bind: string): boolean {
  return /^(A|OK|Acceptable|Yes)$/i.test(val(bind).trim());
}

function isNaMark(bind: string): boolean {
  return /^(N|NA|N-A|N\/A|Not Applicable)$/i.test(val(bind).trim());
}

function fieldsRows(fields: PrintTemplateSectionField[], cols: number = 3): (PrintTemplateSectionField | null)[][] {
  const rows: (PrintTemplateSectionField | null)[][] = [];
  for (let i = 0; i < fields.length; i += cols) {
    const row: (PrintTemplateSectionField | null)[] = [];
    for (let j = 0; j < cols; j++) {
      row.push(fields[i + j] ?? null);
    }
    rows.push(row);
  }
  return rows;
}

function checklistRows(items: PrintTemplateLayoutChecklistItem[], cols: number): (PrintTemplateLayoutChecklistItem | null)[][] {
  const rows: (PrintTemplateLayoutChecklistItem | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row: (PrintTemplateLayoutChecklistItem | null)[] = [];
    for (let j = 0; j < cols; j++) {
      row.push(items[i + j] ?? null);
    }
    rows.push(row);
  }
  return rows;
}
</script>

<style scoped>
.layout-preview {
  width: 100%;
  padding: 20px;
  font-size: 8px;
  color: #111;
  background: #fff;
  max-height: 70vh;
  overflow: auto;
}
.block {
  border-style: solid;
  margin-bottom: 5px;
  padding: 6px 8px;
}
.block.no-border { border: none; }
.sec-title { font-size: 8px; font-weight: 700; margin-bottom: 3px; }
.sec-title:empty { display: none; margin: 0; }

/* Header */
.header-table { width: 100%; border-collapse: collapse; }
.header-table td { vertical-align: top; }
.hdr-side { width: 28%; }
.hdr-center { width: 44%; text-align: center; vertical-align: middle; }

.hdr-title {
  font-size: 7px;
  font-weight: 700;
  margin-bottom: 2px;
}

.hdr-title--small {
  font-size: 6px;
}

.hdr-title--large {
  font-size: 7px;
}
.hdr-title--regular { font-weight: 400; }
.hdr-sub { font-size: 7px; line-height: 1.3; }
.hdr-sub--small { font-size: 6px; }
.hdr-sub--large { font-size: 8px; }
.hdr-sub--bold { font-weight: 700; }
.hdr-field { margin-bottom: 2px; font-size: 7px; }
.hdr-lbl { font-weight: inherit; }
.hdr-val { margin-inline-start: 3px; }
.field-text--small { font-size: 6px; }
.field-text--bold { font-weight: 700; }
.hdr-start { text-align: start; }
.hdr-end { text-align: end; }

/* Fields grid */
.fields-grid { width: 100%; border-collapse: collapse; }
.fields-grid td { padding: 2px 3px; vertical-align: top; font-size: 7px; }
.fields-grid td.lbl { font-weight: inherit; white-space: nowrap; width: 55px; text-align: start; }
.fields-grid td.val { border-bottom: 1px solid #ccc; min-width: 50px; }

/* Data tables */
table.data { width: 100%; border-collapse: collapse; }
table.data th, table.data td { border: 1px solid currentColor; padding: 2px 3px; text-align: center; font-size: 7px; }
table.data th { font-weight: 700; background: #f5f5f5; }
table.equip td { min-height: 30px; vertical-align: middle; }
table.equip td.stack-td { padding: 0; vertical-align: stretch; }
.stack {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.stack__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px 4px;
  border-bottom: 1px solid currentColor;
}
.stack__item:last-child { border-bottom: none; }
table.findings td.num { width: 30px; }
table.findings td.subj { width: 60px; font-weight: 600; text-align: start; }
table.findings td.detail { text-align: start; }

/* Checklist */
.checklist-legend { font-size: 6px; font-style: italic; margin-bottom: 3px; }
.checklist-group-title { font-size: 7px; font-weight: 700; background: #f0f0f0; padding: 2px 4px; margin-top: 3px; }
table.checklist { margin-bottom: 1px; }
table.checklist td.checklist-cell { text-align: start; vertical-align: top; padding: 2px 4px; }
table.checklist td.checklist-cell--empty { border: none; }
.checklist-num { font-weight: 700; margin-inline-end: 2px; }
.checklist-ref { display: block; font-size: 6px; color: #555; }
.checklist-label { margin-inline-end: 3px; }
.checklist-code { float: inline-end; font-weight: 700; border-bottom: 1px solid #999; min-width: 18px; text-align: center; display: inline-block; }
.cl-marks { float: inline-end; display: inline-flex; gap: 3px; }
.cl-box { min-width: 16px; padding: 0 2px; border: 1px solid #999; font-size: 6px; font-weight: 700; text-align: center; }
.cl-box.on { background: #111; color: #fff; }

/* Static */
.static { line-height: 1.35; font-size: 7px; text-align: justify; margin: 0; white-space: pre-wrap; }

/* Signature */
.sig-mark {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

.sig-label {
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}

.sig-cert {
  font-size: 7px;
  line-height: 1.4;
  margin-bottom: 6px;
  text-align: start;
}

.sig-cert-line {
  margin-bottom: 1px;
}

.sig-cert-line:last-child {
  font-weight: 700;
  margin-top: 2px;
}

.sig-content {
  display: flex;
  gap: 12px;
  align-items: center;
}

.sig-align-right {
  justify-content: right;
}

.sig-align-center {
  justify-content: center;
}

.sig-align-left {
  justify-content: left;
}
.sig-image img { max-width: 100px; max-height: 60px; }
.sig-details { font-size: 7px; line-height: 1.3; }
.sig-inspector { font-weight: 600; }
.sig-company { margin-top: 2px; }

/* Image section */
.section-img { max-width: 100%; height: auto; }

/* Footer */
.ftr-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.ftr-col {
  font-size: 7px;
}

.ftr-center {
  text-align: center;
  font-weight: 600;
}

.ftr-lbl {
  margin-inline-end: 3px;
}
</style>
