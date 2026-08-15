<template>
  <div class="layout-preview" dir="rtl">
    <section
        v-for="(section, si) in layout.sections"
        :key="si"
        class="block"
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
            <tr v-for="(row, ri) in fieldsRows(section.fields)" :key="ri">
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
        <div class="sig-line">חתימת הבודק:</div>
        <div class="sig-area"></div>
      </template>
    </section>
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import type {PrintTemplateLayout, PrintTemplateSectionField} from "@shared/printTemplateLayout.js";

const props = defineProps<{
  layout: PrintTemplateLayout;
  data?: Record<string, string>;
}>();

function val(bind: string): string {
  return props.data?.[bind] ?? "";
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

function fieldsRows(fields: PrintTemplateSectionField[]): (PrintTemplateSectionField | null)[][] {
  const cols = 3;
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
.sig-line { font-weight: 600; margin-bottom: 6px; }
.sig-area { height: 40px; }
</style>
