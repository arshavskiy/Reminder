<template>
  <div class="layout-preview" dir="rtl">
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
              <td class="hdr-side hdr-right">
                <div v-for="f in section.fields.slice(2, 4)" :key="f.bind" class="hdr-field">
                  <span class="hdr-lbl">{{ f.label }}:</span>
                  <span class="hdr-val">{{ val(f.bind) }}</span>
                </div>
              </td>
              <td class="hdr-center">
                <div class="hdr-title">{{ section.title }}</div>
                <div v-if="section.subtitle" class="hdr-sub">{{ section.subtitle }}</div>
              </td>
              <td class="hdr-side hdr-left">
                <div v-for="f in section.fields.slice(0, 2)" :key="f.bind" class="hdr-field">
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
        <div class="sec-title">{{ section.title }}</div>
        <table class="fields-grid">
          <tbody>
            <tr v-for="(row, ri) in fieldsRows(section.fields, section.columns ?? 3)" :key="ri">
              <template v-for="(f, fi) in row" :key="fi">
                <td class="lbl">{{ f?.label }}:</td>
                <td class="val">{{ f ? val(f.bind) : '' }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Equipment table -->
      <template v-else-if="section.type === 'equipment_table'">
        <div class="sec-title">{{ section.title }}</div>
        <table class="data equip">
          <thead>
            <tr><th v-for="c in section.columns" :key="c.bind">{{ c.label }}</th></tr>
          </thead>
          <tbody>
            <tr><td v-for="c in section.columns" :key="c.bind">{{ val(c.bind) }}</td></tr>
          </tbody>
        </table>
      </template>

      <!-- Findings -->
      <template v-else-if="section.type === 'findings'">
        <div class="sec-title">{{ section.title }}</div>
        <table class="data findings">
          <thead>
            <tr><th style="width:40px">מס׳</th><th style="width:80px">נושא</th><th colspan="2">פירוט</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in section.rows" :key="row.bind">
              <td class="num">{{ row.number }}</td>
              <td class="subj">{{ row.subjectLabel }}</td>
              <td colspan="2" class="detail">{{ val(row.bind) }}</td>
            </tr>
            <tr v-if="section.deadlineBind">
              <td class="num">{{ section.deadlineLabel ?? "תוך" }}</td>
              <td class="detail">{{ val(section.deadlineBind) }}</td>
              <td colspan="2" class="detail">{{ section.deadlineSuffix ?? "" }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Static text -->
      <template v-else-if="section.type === 'static_text'">
        <div class="sec-title">{{ section.title }}</div>
        <p class="static">{{ section.text }}</p>
      </template>

      <!-- Signature -->
      <template v-else-if="section.type === 'signature' && section.enabled">
        <div v-if="certLines(section).length" class="sig-cert">
          <div v-for="(line, li) in certLines(section)" :key="li" class="sig-cert-line">{{ line }}</div>
        </div>
        <div :class="['sig-mark', `sig-align-${section.align ?? 'right'}`]">
          <div class="sig-label">חתימת הבודק:</div>
          <div class="sig-content">
            <div v-if="section.imageSrc" class="sig-image">
              <img :src="section.imageSrc" alt="חתימה">
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
  PrintTemplateLayoutSignatureSection,
  PrintTemplateSectionField
} from "@shared/printTemplateLayout.js";
import {fillLayoutPlaceholders, signatureCertificationText} from "@shared/printTemplateLayout.js";

const props = defineProps<{
  layout: PrintTemplateLayout;
  data?: Record<string, string>;
}>();

function val(bind: string): string {
  return props.data?.[bind] ?? "";
}

function certLines(section: PrintTemplateLayoutSignatureSection): string[] {
  const template = signatureCertificationText(section);
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
</script>

<style scoped>
.layout-preview {
  width: 100%;
  padding: 10px;
  font-size: 10px;
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
.sec-title { font-size: 10px; font-weight: 700; margin-bottom: 4px; }

/* Header */
.header-table { width: 100%; border-collapse: collapse; }
.header-table td { vertical-align: top; }
.hdr-side { width: 28%; }
.hdr-center { width: 44%; text-align: center; vertical-align: middle; }
.hdr-title { font-size: 12px; font-weight: 700; margin-bottom: 3px; }
.hdr-sub { font-size: 8px; line-height: 1.3; }
.hdr-field { margin-bottom: 2px; font-size: 9px; }
.hdr-lbl { font-weight: 600; }
.hdr-val { margin-right: 3px; }
.hdr-right { text-align: right; }
.hdr-left { text-align: left; }

/* Fields grid */
.fields-grid { width: 100%; border-collapse: collapse; }
.fields-grid td { padding: 2px 3px; vertical-align: top; font-size: 9px; }
.fields-grid td.lbl { font-weight: 600; white-space: nowrap; width: 55px; text-align: right; }
.fields-grid td.val { border-bottom: 1px solid #ccc; min-width: 50px; }

/* Data tables */
table.data { width: 100%; border-collapse: collapse; }
table.data th, table.data td { border: 1px solid currentColor; padding: 3px 4px; text-align: center; font-size: 9px; }
table.data th { font-weight: 700; background: #f5f5f5; }
table.equip td { min-height: 30px; }
table.findings td.num { width: 30px; }
table.findings td.subj { width: 60px; font-weight: 600; text-align: right; }
table.findings td.detail { text-align: right; }

/* Static */
.static { line-height: 1.35; font-size: 9px; text-align: justify; margin: 0; white-space: pre-wrap; }

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
  font-size: 9px;
  line-height: 1.4;
  margin-bottom: 6px;
  text-align: right;
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
.sig-details { font-size: 8px; line-height: 1.3; }
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
  font-size: 9px;
}

.ftr-center {
  text-align: center;
  font-weight: 600;
}

.ftr-lbl {
  margin-left: 3px;
}
</style>
