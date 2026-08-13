<template>
  <div class="ptp">

    <!-- ── LIST ──────────────────────────────────────────────────────────────── -->
    <template v-if="mode === 'list'">
      <div class="ptp-header">
        <span class="ptp-title">תבניות הדפסה</span>
        <button class="xl-btn xl-btn--primary" @click="newTemplate">+ תבנית חדשה</button>
      </div>
      <n-alert v-if="loadError" style="margin-bottom:16px" type="error">{{ loadError }}</n-alert>
      <n-spin :show="loading">
        <n-grid v-if="templates.length" :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="t in templates" :key="t._id">
            <n-card :title="t.name" hoverable style="cursor:pointer">
              <template #header-extra><n-tag size="small">{{ t.page }}</n-tag></template>
              <p style="font-size:13px;color:var(--text-secondary);margin:0">
                {{ t.cols.length }} עמודות · {{ t.rows.length }} שורות · {{ t.cells.filter(c => c.type==='field').length }} שדות
              </p>
              <template #footer>
                <n-space size="small">
                  <n-button size="small" type="primary" @click.stop="openCompose(t)">✏️ מלא ושלח</n-button>
                  <n-button size="small" text @click.stop="editTemplate(t)">עצב</n-button>
                  <n-button size="small" text type="error" @click.stop="deleteTemplate(t._id)">מחק</n-button>
                </n-space>
              </template>
            </n-card>
          </n-gi>
        </n-grid>
        <n-empty v-else-if="!loading && !loadError" description="אין תבניות. צור תבנית חדשה." style="margin-top:60px" />
      </n-spin>
    </template>

    <!-- ── COMPOSE ───────────────────────────────────────────────────────────── -->
    <template v-else-if="mode === 'compose' && composing">
      <div class="ptp-header">
        <button class="xl-btn" @click="goList">← חזור</button>
        <span class="ptp-title">{{ composing.name }} — מילוי שדות</span>
        <span v-if="draftSavedAt" class="compose-draft-status">טיוטה נשמרה {{ formatDraftTime(draftSavedAt) }}</span>
        <button :disabled="draftSaving" :class="{ 'xl-btn--loading': draftSaving }" class="xl-btn" @click="saveComposeDraft">
          <span v-if="draftSaving" class="xl-loader" aria-hidden="true"></span>
          <span>שמור טיוטה</span>
        </button>
        <button :disabled="creatingContract" :class="{ 'xl-btn--loading': creatingContract }" class="xl-btn" @click="createContractFromCompose">
          <span v-if="creatingContract" class="xl-loader" aria-hidden="true"></span>
          <span>צור חוזה + תזכורת</span>
        </button>
        <button :disabled="printing" :class="{ 'xl-btn--loading': printing }" class="xl-btn xl-btn--primary" @click="printPdf">
          <span v-if="printing" class="xl-loader" aria-hidden="true"></span>
          <span>🖨 הדפס PDF</span>
        </button>
        <button :disabled="savingPdf" :class="{ 'xl-btn--loading': savingPdf }" class="xl-btn xl-btn--primary" @click="savePdf">
          <span v-if="savingPdf" class="xl-loader" aria-hidden="true"></span>
          <span>שמור PDF</span>
        </button>
      </div>
      <div class="compose-wrap">
        <div class="compose-preview">
          <div class="pane-label">תצוגה מקדימה</div>
          <div class="compose-scroll">
            <div :style="{ width: Math.max(composeTotalWidth,780)+'px' }" class="doc-paper">
              <table :style="{ direction: composing.dir, width: composeTotalWidth + 'px' }" class="render-table">
                <colgroup>
                  <col v-for="(col,ci) in composing.cols" :key="ci" :style="{ width: col.w+'px' }" />
                </colgroup>
                <tbody>
                  <tr v-for="(row,ri) in composing.rows" :key="ri" :style="{ height: row.h+'px' }">
                    <template v-for="ci in composing.cols.length" :key="ci-1">
                      <td v-if="!isComposeMasked(ri,ci-1)"
                          :colspan="getComposeCell(ri,ci-1)?.colSpan??1"
                          :rowspan="getComposeCell(ri,ci-1)?.rowSpan??1"
                          :style="composeCellStyle(ri,ci-1)">
                        <template v-if="isComposeFieldCell(ri,ci-1)">
                          <textarea
                            v-if="isComposeFieldMultiline(ri,ci-1)"
                            :value="composeData[composeCellBind(ri,ci-1)] ?? ''"
                            :placeholder="composeCellBind(ri,ci-1)"
                            :class="{ 'compose-cell-input--invalid': composeFieldError(composeCellBind(ri,ci-1)) }"
                            :title="composeFieldError(composeCellBind(ri,ci-1))"
                            class="compose-cell-input compose-cell-input--textarea"
                            @input="setComposeValue(composeCellBind(ri,ci-1), ($event.target as HTMLTextAreaElement).value)"
                            @mousedown.stop
                            @click.stop
                          />
                          <input
                            v-else
                            :value="composeData[composeCellBind(ri,ci-1)] ?? ''"
                            :placeholder="composeCellBind(ri,ci-1)"
                            :type="composeFieldInputType(composeCellBind(ri,ci-1))"
                            :inputmode="composeFieldInputMode(composeCellBind(ri,ci-1))"
                            :class="{ 'compose-cell-input--invalid': composeFieldError(composeCellBind(ri,ci-1)) }"
                            :title="composeFieldError(composeCellBind(ri,ci-1))"
                            class="compose-cell-input"
                            @input="setComposeValue(composeCellBind(ri,ci-1), ($event.target as HTMLInputElement).value)"
                            @mousedown.stop
                            @click.stop
                          />
                        </template>
                        <span v-else v-html="composeCellHtml(ri,ci-1)" />
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
                <span v-if="f.value" class="compose-field-current">{{ f.value }}</span>
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
            <div v-if="!composeFields.length" style="padding:16px;color:#999;font-size:13px">אין שדות</div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── DESIGN ────────────────────────────────────────────────────────────── -->
    <template v-else-if="mode === 'design' && editing">
      <div class="xl-shell">

        <!-- Excel green title bar -->
        <div class="xl-titlebar">
          <span class="xl-titlebar-logo">M.A.D</span>
          <input v-model="editing.name" class="xl-titlebar-name" />
          <div style="flex:1"/>
          <button :disabled="saving" :class="{ 'xl-tbtn--loading': saving }" class="xl-tbtn xl-tbtn--save" @click="saveTemplate">
            <span v-if="saving" class="xl-loader" aria-hidden="true"></span>
            <span>שמור</span>
          </button>
          <button v-if="editing._id" :disabled="previewing" :class="{ 'xl-tbtn--loading': previewing }" class="xl-tbtn" @click="previewPdf">
            <span v-if="previewing" class="xl-loader" aria-hidden="true"></span>
            <span>PDF</span>
          </button>
          <button class="xl-tbtn" @click="goList">✕ סגור</button>
        </div>

        <!-- Ribbon toolbar -->
        <div class="xl-ribbon">
          <!-- Row/col ops -->
          <div class="xl-ribbon-group">
            <button class="xl-rbtn" @click="addRow">+ שורה</button>
            <button class="xl-rbtn" @click="addCol">+ עמ׳</button>
            <button :disabled="selRange.r1 < 0" class="xl-rbtn" @click="delSelRows">− שורה</button>
            <button :disabled="selRange.c1 < 0" class="xl-rbtn" @click="delSelCols">− עמ׳</button>
          </div>
          <div class="xl-ribbon-sep"/>
          <!-- Merge -->
          <div class="xl-ribbon-group">
            <button :disabled="!canMerge" class="xl-rbtn" @click="mergeCells">מזג</button>
            <button :disabled="!canUnmerge" class="xl-rbtn" @click="unmergeCells">בטל מיזוג</button>
          </div>
          <div class="xl-ribbon-sep"/>
          <!-- Formatting -->
          <div class="xl-ribbon-group">
            <button :class="{ active: selBold }" class="xl-rbtn xl-rbtn--bold" @mousedown.prevent="toggleBold">B</button>
            <button
              v-for="color in richTextColors"
              :key="color"
              :style="{ background: color }"
              class="xl-color-btn"
              :title="color"
              @mousedown.prevent="setRichColor(color)"
            />
            <button :class="{ active: selAlign==='right' }" class="xl-rbtn" @click="setAlign('right')">→</button>
            <button :class="{ active: selAlign==='center' }" class="xl-rbtn" @click="setAlign('center')">↔</button>
            <button :class="{ active: selAlign==='left' }" class="xl-rbtn" @click="setAlign('left')">←</button>
          </div>
          <div class="xl-ribbon-sep"/>
          <!-- Vertical align -->
          <div class="xl-ribbon-group">
            <button :class="{ active: selValign==='top' }" class="xl-rbtn" @click="setValign('top')">⬆</button>
            <button :class="{ active: selValign==='middle' }" class="xl-rbtn" @click="setValign('middle')">↕</button>
            <button :class="{ active: selValign==='bottom' }" class="xl-rbtn" @click="setValign('bottom')">⬇</button>
          </div>
          <div class="xl-ribbon-sep"/>
          <!-- Type toggle -->
          <div class="xl-ribbon-group">
            <button class="xl-rbtn xl-rbtn--field" @click="toggleType">תווית ⇄ שדה</button>
            <button class="xl-rbtn" @click="triggerImageUpload">תמונה</button>
            <button class="xl-rbtn" @click="setImageFromUrl">URL תמונה</button>
            <input ref="imageInputEl" accept="image/*" class="xl-hidden-input" type="file" @change="onImageFileChange" />
          </div>
          <div class="xl-ribbon-sep"/>
          <!-- Page -->
          <div class="xl-ribbon-group">
            <button :class="{ active: editing.page==='A4' }" class="xl-rbtn" @click="editing.page='A4'">A4</button>
            <button :class="{ active: editing.page==='A3' }" class="xl-rbtn" @click="editing.page='A3'">A3</button>
          </div>
        </div>

        <!-- Formula / name bar -->
        <div class="xl-namebar">
          <div class="xl-cellref">{{ activeCellRef }}</div>
          <div class="xl-namebar-sep"/>
          <input
            :value="activeCellFormula"
            class="xl-formula-input"
            :placeholder="activeFormulaPlaceholder"
            @change="commitFormulaEdit(($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
        </div>

        <!-- Grid + inspector -->
        <div class="xl-workspace">
          <!-- Sheet grid -->
          <div ref="gridWrap" class="xl-grid-wrap">
            <table :style="{ direction:'rtl', width: (40+editing.cols.reduce((s,c)=>s+c.w,0))+'px' }" class="xl-table" @mouseup="onMouseUp">
              <colgroup>
                <col class="xl-row-num-col" />
                <col v-for="(col,ci) in editing.cols" :key="ci" :style="{ width: col.w+'px' }" />
              </colgroup>
              <thead>
                <tr>
                  <th class="xl-corner"></th>
                  <th v-for="(col,ci) in editing.cols" :key="ci"
                      :class="{ 'xl-ch--hot': isColHot(ci) }"
                      :style="{ width: col.w+'px', minWidth: col.w+'px' }"
                      class="xl-ch">
                    {{ colLabel(ci) }}
                    <!-- resize handle on the LEFT edge (RTL: left = column end) -->
                    <span class="xl-col-resize" @mousedown.prevent.stop="startColResize($event,ci)"/>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row,ri) in editing.rows" :key="ri" :style="{ height: row.h+'px' }">
                  <th :class="{ 'xl-rh--hot': isRowHot(ri) }" class="xl-rh">
                    {{ ri+1 }}
                    <span class="xl-row-resize" @mousedown.prevent.stop="startRowResize($event,ri)"/>
                  </th>
                  <template v-for="ci in editing.cols.length" :key="ci-1">
                    <td v-if="!isMasked(ri,ci-1)"
                        :class="{
                          'xl-cell--sel':    isInSel(ri,ci-1) && !isActive(ri,ci-1),
                          'xl-cell--active': isActive(ri,ci-1),
                          'xl-cell--field':  getCell(ri,ci-1)?.type==='field',
                          'xl-cell--image':  getCell(ri,ci-1)?.type==='image',
                        }"
                        :colspan="getCell(ri,ci-1)?.colSpan??1"
                        :rowspan="getCell(ri,ci-1)?.rowSpan??1"
                        :style="cellStyle(ri,ci-1)"
                        class="xl-cell"
                        @dblclick="startInlineEdit(ri,ci-1)"
                        @mouseover="onCellOver(ri,ci-1)"
                        @mousedown.prevent="onCellDown($event,ri,ci-1)">
                      <template v-if="inlineEdit?.r===ri && inlineEdit?.c===ci-1">
                        <div
                          ref="inlineEl"
                          class="xl-inline"
                          contenteditable="true"
                          :dir="editing.dir"
                          v-html="inlineVal"
                          @input="onInlineInput"
                          @mousedown.stop
                          @blur="commitInline"
                          @keydown.enter.exact.prevent="commitInline"
                          @keydown.escape="inlineEdit=null"
                        />
                      </template>
                      <template v-else>
                        <span
                          :style="{ color: getCell(ri,ci-1)?.type==='field' && !getCell(ri,ci-1)?.bind ? '#bbb' : 'inherit' }"
                          v-html="cellHtml(ri,ci-1)"
                        />
                      </template>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Inspector panel -->
          <div :class="{ 'xl-inspector--collapsed': inspectorCollapsed }" class="xl-inspector">
            <div class="xl-inspector-title">
              <span v-if="!inspectorCollapsed">תא נבחר</span>
              <button class="xl-inspector-collapse" @click="inspectorCollapsed=!inspectorCollapsed">
                {{ inspectorCollapsed ? '⟨' : '⟩' }}
              </button>
            </div>
            <template v-if="inspectorCollapsed"></template>
            <template v-else-if="singleSel && activeCellData">
              <div class="xl-inspector-ref">{{ activeCellRef }}</div>

              <div class="xl-inspector-section">סוג</div>
              <div class="xl-type-btns">
                <button :class="{ active: activeCellData.type==='label' }" class="xl-type-btn"
                  @click="setCellType('label')">תווית</button>
                <button :class="{ active: activeCellData.type==='field' }" class="xl-type-btn"
                  @click="setCellType('field')">שדה</button>
                <button :class="{ active: activeCellData.type==='image' }" class="xl-type-btn"
                  @click="setCellType('image')">תמונה</button>
              </div>

              <template v-if="activeCellData.type==='label'">
                <div class="xl-inspector-section">טקסט</div>
                <input v-model="activeCellData.text" class="xl-inspector-input" placeholder="טקסט קבוע" />
              </template>
              <template v-else-if="activeCellData.type==='field'">
                <div class="xl-inspector-section">שם שדה (bind)</div>
                <input v-model="activeCellData.bind" class="xl-inspector-input" placeholder="serial, swl …" style="font-family:monospace" />
                <div class="xl-inspector-hint">נשמר ב-Mongo — לא צריך OCR</div>
              </template>
              <template v-else>
                <div class="xl-inspector-section">תמונה</div>
                <input v-model="activeCellData.src" class="xl-inspector-input" placeholder="https://... או data:image/..." style="direction:ltr;text-align:left" />
                <button class="xl-type-btn" style="margin-top:6px" @click="triggerImageUpload">בחר קובץ</button>
              </template>

              <div class="xl-inspector-section">יישור אופקי</div>
              <div class="xl-type-btns">
                <button :class="{ active: activeCellData.align==='right'  }" class="xl-type-btn" @click="activeCellData.align='right'">ימין</button>
                <button :class="{ active: activeCellData.align==='center' }" class="xl-type-btn" @click="activeCellData.align='center'">מרכז</button>
                <button :class="{ active: activeCellData.align==='left'   }" class="xl-type-btn" @click="activeCellData.align='left'">שמאל</button>
              </div>

              <div class="xl-inspector-section">יישור אנכי</div>
              <div class="xl-type-btns">
                <button :class="{ active: activeCellData.valign==='top'    }" class="xl-type-btn" @click="activeCellData.valign='top'">עליון</button>
                <button :class="{ active: activeCellData.valign==='middle' }" class="xl-type-btn" @click="activeCellData.valign='middle'">אמצע</button>
                <button :class="{ active: activeCellData.valign==='bottom' }" class="xl-type-btn" @click="activeCellData.valign='bottom'">תחתון</button>
              </div>

              <div class="xl-inspector-section">מודגש</div>
              <button :class="{ active: activeCellData.bold }" class="xl-type-btn" @click="activeCellData.bold = !activeCellData.bold">
                <b>B</b>
              </button>

              <div class="xl-inspector-section" style="margin-top:16px">גודל</div>
              <div class="xl-inspector-hint">
                גובה שורה: {{ editing.rows[selRange.r1]?.h ?? '—' }}px<br/>
                רוחב עמ׳: {{ editing.cols[selRange.c1]?.w ?? '—' }}px
              </div>
            </template>
            <template v-else-if="!singleSel">
              <div class="xl-inspector-hint">
                טווח נבחר {{ selRange.r2-selRange.r1+1 }}×{{ selRange.c2-selRange.c1+1 }}<br/>
                פעולות הסרגל חלות על כולם.
              </div>
            </template>
            <template v-else>
              <div class="xl-inspector-hint">לחץ על תא לעריכה</div>
            </template>
          </div>
        </div>

        <!-- Status bar -->
        <div class="xl-statusbar">
          <span>{{ editing.cols.length }} עמ׳ · {{ editing.rows.length }} שורות · {{ editing.cells.filter(c=>c.type==='field').length }} שדות</span>
          <span>לחיצה כפולה לעריכה · סמן טקסט בתא ואז B/צבע · Shift+לחיצה לטווח</span>
        </div>
      </div>
    </template>

  </div>
</template>

<script lang="ts" setup>
import {computed, nextTick, ref} from "vue";
import {useRoute} from "vue-router";
import {NAlert, NButton, NCard, NEmpty, NGi, NGrid, NSpace, NSpin, NTag, useDialog, useMessage,} from "naive-ui";
import {api} from "../services/apiService.js";
import type {PrintTemplate, PrintTemplateCell} from "@shared/types.js";

const message = useMessage();
const dialog  = useDialog();
const route = useRoute();

// ── Mode ──────────────────────────────────────────────────────────────────────
type Mode = "list" | "compose" | "design";
const mode = ref<Mode>("list");
function goList() { mode.value="list"; editing.value=null; composing.value=null; sel.value={r1:-1,c1:-1,r2:-1,c2:-1}; }

// ── List ──────────────────────────────────────────────────────────────────────
const loading   = ref(false);
const loadError = ref<string|null>(null);
const templates = ref<PrintTemplate[]>([]);
loadTemplates();

async function loadTemplates() {
  loading.value = true; loadError.value = null;
  try {
    templates.value = (await api.printTemplates.list()).map(normalizeLegacyTemplateBindings);
    if (!templates.value.length) newTemplate();
    else await openRouteDraftIfRequested();
  } catch(e:any) { loadError.value = e.message; }
  finally { loading.value = false; }
}

async function openRouteDraftIfRequested() {
  const templateId = route.params.templateId;
  if (typeof templateId !== "string") return;
  const template = templates.value.find((t) => t._id === templateId);
  if (template) await openCompose(template);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
const saving    = ref(false);
const previewing = ref(false);
const editing   = ref<PrintTemplate|null>(null);
const richTextColors = ["#111111", "#c2410c", "#1d4ed8", "#15803d", "#7c3aed"];
const imageInputEl = ref<HTMLInputElement | null>(null);

// Full תסקיר layout as ONE editable grid — header, client info, equipment table,
// findings and footer are all normal designer cells (no separate fixed HTML frame).
// "field" binds match ExtractionResult / equipment-extraction keys where the extractor
// actually produces them; the rest are manual (no extractor source yet).
const SEED_CELLS: PrintTemplateCell[] = [
  // Row 0 — title block
  { r:0,c:0, type:"field", bind:"document_number", bold:true, align:"right" },
  { r:0,c:2, type:"label", text:"תסקיר ניסוי ובדיקה של מכונות הרמה ואביזריהן", bold:true, align:"center", colSpan:3 },
  { r:0,c:5, type:"field", bind:"start_date", align:"left", colSpan:2 },
  // Row 1 — subtitle + dates labels
  { r:1,c:0, type:"label", text:"מספר תסקיר בדיקה:", align:"right" },
  { r:1,c:2, type:"label", text:'פקודת הבטיחות בעבודה (נוסח חדש) תש"ל-1970 סעיפים 75,76,81,86', align:"center", colSpan:3 },
  { r:1,c:5, type:"label", text:"תאריך בדיקה:", align:"left", colSpan:2 },
  // Row 2
  { r:2,c:0, type:"field", bind:"prev_report_number", align:"right" },
  { r:2,c:5, type:"field", bind:"expiry_date", align:"left", colSpan:2 },
  { r:2,c:1, type:"label", text:"מספר תסקיר קודם:", align:"right" },
  { r:2,c:2, type:"label", text:"בתוקף עד:", align:"left", colSpan:3 },

  // Section 1 — client info (title on its own full-width row, like section 2)
  { r:3,c:0, type:"label", text:"1. פרטי הלקוח/תופש:", bold:true, align:"right", colSpan:7 },
  { r:4,c:0, type:"label", text:"איש קשר:", align:"right" },
  { r:4,c:1, type:"field", bind:"client_name", align:"right", colSpan:5 },
  { r:5,c:0, type:"label", text:"שם הלקוח:", align:"right" },
  { r:5,c:1, type:"field", bind:"client_company", align:"right", colSpan:5 },
  { r:6,c:0, type:"label", text:"סוג בדיקה:", align:"right" },
  { r:6,c:1, type:"field", bind:"inspection_type", align:"right", colSpan:5 },
  { r:7,c:0, type:"label", text:"טלפון:", align:"right" },
  { r:7,c:1, type:"field", bind:"client_phone", align:"right", colSpan:2 },
  { r:7,c:3, type:"label", text:"מייל:", align:"right" },
  { r:7,c:4, type:"field", bind:"client_email", align:"right", colSpan:2 },
  { r:8,c:0, type:"label", text:"מיקוד:", align:"right" },
  { r:8,c:1, type:"field", bind:"zip_code", align:"right", colSpan:2 },
  { r:8,c:3, type:"label", text:"יישוב:", align:"right" },
  { r:8,c:4, type:"field", bind:"client_address", align:"right", colSpan:2 },
  { r:9,c:0, type:"label", text:"מספר רישוי:", align:"right" },
  { r:9,c:1, type:"field", bind:"license_number", align:"right", colSpan:2 },
  { r:9,c:3, type:"label", text:"שלדה:", align:"right" },
  { r:9,c:4, type:"field", bind:"chassis", align:"right", colSpan:2 },

  // Section 2 — crane/equipment table
  { r:10,c:0, type:"label", text:"2. תיאור מכונת הרמה", bold:true, align:"center", colSpan:7 },
  { r:11,c:0, type:"label", text:"תיאור",                  bold:true, align:"center" },
  { r:11,c:1, type:"label", text:"יצרן",                   bold:true, align:"center" },
  { r:11,c:2, type:"label", text:"דגם",                    bold:true, align:"center" },
  { r:11,c:3, type:"label", text:"מס׳ סידורי",             bold:true, align:"center" },
  { r:11,c:4, type:"label", text:"רדיוס עומס (מטר)",       bold:true, align:"center" },
  { r:11,c:5, type:"label", text:'עומס מבחן (ק"ג)',        bold:true, align:"center" },
  { r:11,c:6, type:"label", text:'עומס עבודה בטוח (ק"ג)', bold:true, align:"center" },
  { r:12,c:0, type:"field", bind:"name",                align:"right"  },
  { r:12,c:1, type:"field", bind:"manufacturer",         align:"center" },
  { r:12,c:2, type:"field", bind:"model",                align:"center" },
  { r:12,c:3, type:"field", bind:"serial_number",        align:"center" },
  { r:12,c:4, type:"field", bind:"load_radius",          align:"center" },
  { r:12,c:5, type:"field", bind:"load_capacity_test",   align:"center" },
  { r:12,c:6, type:"field", bind:"load_capacity_work",   align:"center" },

  // Section 3 — findings
  { r:13,c:0, type:"label", text:"3. תיאור ליקויים, השיפורים, ואמצעים לתיקונים", bold:true, align:"right", colSpan:7 },
  { r:14,c:0, type:"label", text:"מס׳", bold:true, align:"center" },
  { r:14,c:1, type:"label", text:"נושא", bold:true, align:"center", colSpan:2 },
  { r:14,c:3, type:"label", text:"פירוט", bold:true, align:"center", colSpan:4 },
  { r:15,c:0, type:"label", text:"1", align:"center" },
  { r:15,c:1, type:"label", text:"כללי:", bold:true, align:"right", colSpan:2 },
  { r:15,c:3, type:"field", bind:"findings_general", align:"right", colSpan:4 },
  { r:16,c:0, type:"label", text:"2", align:"center" },
  { r:16,c:1, type:"label", text:"ליקוי:", bold:true, align:"right", colSpan:2 },
  { r:16,c:3, type:"field", bind:"findings_remedy", align:"right", colSpan:4 },
  { r:17,c:0, type:"label", text:"תוך", align:"center" },
  { r:17,c:1, type:"field", bind:"findings_deadline", align:"center", colSpan:2 },
  { r:17,c:3, type:"label", text:"ימים — אסור לעבוד עם הפרק עד להסדרת הליקוי", align:"right", colSpan:4 },

  // Section 4 — static notes + signature
  { r:18,c:0, type:"label", text:"4. הערות נוספות:", bold:true, align:"right", colSpan:7 },
  { r:19,c:0, type:"label",
    text:'אישור זה מותנה בתנאי שמבצעים שימוש ותחזוקה במכונת הרמה על פי חוקים ותקנות, תקנים רשמיים והוראות יצרן, תסקיר זה מייצג מצב מכונת הרמה ביום הבדיקה. שימוש בציוד אסור במידה ואירע בו ליקוי או פג תוקפו של תסקיר זה. תסקיר זה אינו מהווה תעודת אחריות או ביטוח. יש לעבוד לפי טבלת העומסים של המנוף. לעבודה על קרקע יציבה בלבד. חובה לפתוח מייצבים מקסימאלי בכל עבודה. הפעלת המנוף מותרת למנופאי מוסמך בלבד.',
    align:"right", colSpan:7 },
  { r:20,c:0, type:"label",
    text:'אני: מיכאל פצ\'רסקי בעל תעודה מס\': 484590 — שהוסמכתי ע"י מפקח עבודה ראשי על פי סימן ז\' לפרק ג\' לפקודת הבטיחות בעבודה (נוסח חדש) תש"ל 1970, לעשות ניסויים ובדיקות, מאשר כי בדקתי את הציוד המתואר בתסקיר לעיל בהתאם לתקנות. פרטים מלאים: רח\' העצמאות 36ב אשדוד טלפון: 052-8195650',
    align:"right", colSpan:7 },
  { r:21,c:0, type:"label", text:"חתימת הבודק: __________________", bold:true, align:"right", colSpan:7 },
  { r:22,c:0, type:"label", text:"נייד: 052-8195650", bold:true, align:"right", colSpan:2 },
  { r:22,c:2, type:"label", text:'M.A.D הנדסה וניהול בע"מ', bold:true, align:"center", colSpan:3 },
  { r:22,c:5, type:"label", text:"דואר אלקטרוני: pechersky.m@gmail.com", bold:true, align:"left", colSpan:2 },
];

function newTemplate() {
  editing.value = {
    _id:"", name:"תבנית תסקיר חדשה", page:"A4", dir:"rtl",
    cols:[{w:150},{w:110},{w:80},{w:90},{w:90},{w:90},{w:120}],
    rows: Array.from({length:23}, (_,i)=>({h: i<=2?26 : i===10?30 : i===11?28 : i===12?70 : i===19?70 : i===20?60 : 28})),
    cells: SEED_CELLS.map(c=>({...c})),
    created_at:"", updated_at:"",
  };
  sel.value = { r1:0, c1:0, r2:0, c2:0 };
  mode.value = "design";
}

function editTemplate(t: PrintTemplate) {
  editing.value = normalizeLegacyTemplateBindings(t);
  sel.value = { r1:0, c1:0, r2:0, c2:0 };
  mode.value = "design";
}

async function saveTemplate() {
  if (!editing.value) return;
  saving.value = true;
  try {
    const { _id, created_at, updated_at, ...body } = editing.value;
    if (_id) {
      const u = await api.printTemplates.update(_id, body);
      const idx = templates.value.findIndex(t => t._id===_id);
      if (idx !== -1) templates.value[idx] = normalizeLegacyTemplateBindings(u);
      message.success("נשמר");
    } else {
      const c = await api.printTemplates.create(body);
      templates.value.push(normalizeLegacyTemplateBindings(c));
      editing.value._id = c._id;
      message.success("נוצר");
    }
  } catch(e:any) { message.error(e.message); }
  finally { saving.value = false; }
}

async function deleteTemplate(id: string) {
  dialog.warning({
    title:"מחיקת תבנית", content:"האם למחוק? פעולה זו אינה הפיכה.",
    positiveText:"מחק", negativeText:"ביטול",
    onPositiveClick: async () => {
      try { await api.printTemplates.delete(id); templates.value = templates.value.filter(t=>t._id!==id); message.success("נמחק"); }
      catch(e:any) { message.error(e.message); }
    },
  });
}

async function previewPdf() {
  if (!editing.value?._id) { message.warning("שמור קודם"); return; }
  previewing.value = true;
  try {
    const blob = await api.printTemplates.renderPdf(editing.value._id, {});
    const url = URL.createObjectURL(blob);
    window.open(url,"_blank");
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  } catch(e:any) { message.error(e.message); }
  finally { previewing.value = false; }
}

// ── Compose ───────────────────────────────────────────────────────────────────
const composing   = ref<PrintTemplate|null>(null);
const composeData = ref<Record<string,string>>({});
const printing    = ref(false);
const savingPdf = ref(false);
const draftSaving = ref(false);
const draftSavedAt = ref<string|null>(null);
const draftMeta = ref<Record<string, unknown>>({});
const creatingContract = ref(false);

const composeFields = computed(()=>{
  if (!composing.value) return [];
  const seen = new Set<string>();
  const priority = new Map([["document_number", 0], ["expiry_date", 1], ["start_date", 2]]);
  return composing.value.cells
    .filter(c=>c.type==="field"&&c.bind&&!seen.has(c.bind!)&&seen.add(c.bind!))
    .map((c,index)=>{
      const bind = c.bind!;
      const meta = composeFieldMeta(bind);
      const value = composeData.value[bind] ?? "";
      return {bind, value, index, ...meta, error: validateComposeField(bind, value)};
    })
    .sort((a,b)=>(priority.get(a.bind) ?? 999) - (priority.get(b.bind) ?? 999) || a.index - b.index);
});
const composeTotalWidth = computed(()=>composing.value?.cols.reduce((s,c)=>s+c.w,0)??0);

type ComposeFieldKind = "text" | "multiline" | "date" | "email" | "phone" | "number" | "integer";

type ComposeFieldMeta = {
  label: string;
  kind: ComposeFieldKind;
  required: boolean;
  multiline: boolean;
  inputType: string;
  inputMode: "text" | "email" | "tel" | "numeric" | "decimal";
  hint: string;
};

const composeFieldLabels: Record<string, string> = {
  document_number: "מספר תסקיר",
  contract_number: "מספר חוזה",
  report_number: "מספר תסקיר",
  prev_report_number: "מספר תסקיר קודם",
  start_date: "תאריך בדיקה",
  inspection_date: "תאריך בדיקה",
  check_date: "תאריך בדיקה",
  expiry_date: "בתוקף עד",
  next_inspection_date: "בדיקה הבאה",
  valid_until: "בתוקף עד",
  client_name: "איש קשר",
  contact_person: "איש קשר",
  client_company: "שם הלקוח/תופש",
  client_phone: "טלפון",
  contact_phone: "טלפון",
  client_email: "מייל",
  contact_email: "מייל",
  client_address: "כתובת/יישוב",
  zip_code: "מיקוד",
  client_id: "ח.פ / ת.ז לקוח",
  license_number: "מספר רישוי",
  lisence_number: "מספר רישוי",
  inspection_type: "סוג בדיקה",
  po_box: "ת.ד",
  chassis: "שלדה",
  name: "תיאור",
  checked_equipment: "ציוד שנבדק",
  manufacturer: "יצרן",
  model: "דגם",
  serial_number: "מס׳ סידורי",
  load_radius: "רדיוס עומס",
  load_capacity_test: "עומס מבחן",
  load_capacity_work: "עומס עבודה בטוח",
  equipment_description: "תיאור ציוד",
  findings_general: "כללי",
  findings_remedy: "ליקוי",
  findings_deadline: "תוך",
  findings_note: "הערה נוספת",
};

const requiredComposeFieldBases = new Set([
  "document_number",
  "report_number",
  "start_date",
  "inspection_date",
  "check_date",
  "expiry_date",
  "next_inspection_date",
  "valid_until",
  "client_company",
  "client_name",
  "client_phone",
  "inspection_type",
  "name",
]);

function composeFieldMeta(bind: string): ComposeFieldMeta {
  const base = baseComposeBind(bind);
  const kind = composeFieldKind(base);
  return {
    label: composeFieldLabels[base] ?? bind,
    kind,
    required: requiredComposeFieldBases.has(base),
    multiline: kind === "multiline",
    inputType: composeFieldInputType(bind),
    inputMode: composeFieldInputMode(bind),
    hint: composeFieldHint(kind),
  };
}

function baseComposeBind(bind: string): string {
  return bind.replace(/_\d+$/, "");
}

function composeFieldKind(bind: string): ComposeFieldKind {
  if (bind.includes("email")) return "email";
  if (bind.includes("phone") || bind === "contact_phone") return "phone";
  if (bind.includes("date") || bind === "expiry_date" || bind === "valid_until" || bind === "start_date" || bind === "check_date") return "date";
  if (["zip_code", "client_id", "license_number", "lisence_number", "serial_number", "document_number", "report_number", "prev_report_number", "contract_number"].includes(bind)) return "integer";
  if (bind.includes("amount") || bind.includes("load_capacity") || bind.includes("load_radius")) return "number";
  if (bind.startsWith("findings_") || bind.includes("description") || bind === "checked_equipment") return "multiline";
  return "text";
}

function composeFieldInputType(bind: string): string {
  const kind = composeFieldKind(baseComposeBind(bind));
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  if (kind === "number" || kind === "integer") return "text";
  return "text";
}

function composeFieldInputMode(bind: string): "text" | "email" | "tel" | "numeric" | "decimal" {
  const kind = composeFieldKind(baseComposeBind(bind));
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  if (kind === "integer") return "numeric";
  if (kind === "number") return "decimal";
  return "text";
}

function composeFieldHint(kind: ComposeFieldKind): string {
  if (kind === "date") return "YYYY-MM-DD";
  if (kind === "email") return "name@example.com";
  if (kind === "phone") return "ספרות, רווחים, + או -";
  if (kind === "integer") return "ספרות בלבד";
  if (kind === "number") return "מספר, אפשר עם יחידה";
  return "";
}

function composeFieldError(bind: string): string {
  return validateComposeField(bind, composeData.value[bind] ?? "");
}

function validateComposeField(bind: string, value: string): string {
  const base = baseComposeBind(bind);
  const meta = composeFieldMeta(base);
  const raw = value.trim();
  if (!raw) return meta.required ? "שדה חובה" : "";
  if (meta.kind === "date" && !isValidComposeDate(raw)) return "תאריך לא תקין";
  if (meta.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return "אימייל לא תקין";
  if (meta.kind === "phone" && !/^\+?[\d\s().-]{7,}$/.test(raw)) return "טלפון לא תקין";
  if (meta.kind === "integer" && !/^\d+$/.test(raw)) return "יש להזין ספרות בלבד";
  if (meta.kind === "number" && !/^\d+(?:[.,]\d+)?(?:\s*\S+)?$/.test(raw)) return "מספר לא תקין";
  return "";
}

function isValidComposeDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return Boolean(normalizeDateForContract(value));
}

function validateComposeBeforeAction(actionLabel: string): boolean {
  const errors = composeFields.value.filter((field) => field.error);
  if (!errors.length) return true;
  const names = errors.slice(0, 3).map((field) => field.label).join(", ");
  message.error(`אי אפשר ${actionLabel}: יש לתקן ${names}${errors.length > 3 ? "..." : ""}`);
  return false;
}

async function openCompose(t: PrintTemplate) {
  composing.value = normalizeLegacyTemplateBindings(t);
  composeData.value = {};
  for (const f of composeFields.value) composeData.value[f.bind]="";
  draftSavedAt.value = null;
  draftMeta.value = {};
  mode.value = "compose";
  await loadComposeDraft();
}

function normalizeLegacyTemplateBindings(template: PrintTemplate): PrintTemplate {
  const copy = JSON.parse(JSON.stringify(template)) as PrintTemplate;
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

function setComposeValue(bind: string, value: string) {
  const kind = composeFieldKind(baseComposeBind(bind));
  let next = value;
  if (kind === "integer") next = value.replace(/\D/g, "");
  if (kind === "date") next = normalizeDateForContract(value) ?? value;
  composeData.value = {...composeData.value, [bind]: next};
}

function getComposeCell(r:number,c:number){ return composing.value?.cells.find(cell=>cell.r===r&&cell.c===c); }
function composeCellBind(r:number,c:number): string {
  const cell = getComposeCell(r,c);
  return cell?.type === "field" ? (cell.bind ?? "") : "";
}
function isComposeFieldCell(r:number,c:number): boolean {
  return Boolean(composeCellBind(r,c));
}
function isComposeFieldMultiline(r:number,c:number): boolean {
  const bind = composeCellBind(r,c);
  const rowHeight = composing.value?.rows[r]?.h ?? 0;
  const cell = getComposeCell(r,c);
  return bind.startsWith("findings_") || rowHeight >= 44 || (cell?.rowSpan ?? 1) > 1;
}
function isComposeMasked(r:number,c:number){
  if(!composing.value) return false;
  return composing.value.cells.some(cell=>{
    if(cell.r===r&&cell.c===c) return false;
    return r>=cell.r&&r<cell.r+(cell.rowSpan??1)&&c>=cell.c&&c<cell.c+(cell.colSpan??1);
  });
}
function composeCellHtml(r:number,c:number){
  const cell=getComposeCell(r,c);
  if(!cell) return "";
  if(cell.type==="image") return imageHtml(cell);
  return cell.type==="label"
    ? richCellHtml(cell)
    : escHtml(cell.bind?(composeData.value[cell.bind]??""):"");
}
function composeCellStyle(r:number,c:number){
  const cell=getComposeCell(r,c);
  return { textAlign:cell?.align??"right", fontWeight:cell?.bold?"700":"400", color:cell?.color??"inherit", padding:"2px 4px", border:"1px solid #000", verticalAlign:cell?.valign??"middle", fontSize:"12px" };
}

async function printPdf() {
  if(!composing.value?._id) return;
  if(!validateComposeBeforeAction("להדפיס PDF")) return;
  printing.value=true;
  try {
    const blob=await api.printTemplates.renderPdf(composing.value._id,collectComposeData());
    const url=URL.createObjectURL(blob);
    window.open(url,"_blank");
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  } catch(e:any){ message.error(e.message); }
  finally { printing.value=false; }
}

async function savePdf() {
  if(!composing.value?._id) return;
  if(!validateComposeBeforeAction("לשמור PDF")) return;
  savingPdf.value=true;
  try {
    const blob=await api.printTemplates.renderPdf(composing.value._id,collectComposeData());
    downloadBlob(blob, `${safeFileName(composing.value.name)}.pdf`);
    message.success("PDF נשמר");
  } catch(e:any){ message.error(e.message); }
  finally { savingPdf.value=false; }
}

async function loadComposeDraft() {
  if(!composing.value?._id) return;
  try {
    const draft = await api.printTemplates.getDraft(composing.value._id);
    composeData.value = normalizeComposeData({...composeData.value, ...stringRecord(draft.data)});
    draftMeta.value = {
      ...(draft.meta && typeof draft.meta === "object" && !Array.isArray(draft.meta) ? draft.meta : {}),
      ...(draft.client_id ? {client_id: draft.client_id} : {}),
      ...(draft.contract_id ? {contract_id: draft.contract_id} : {}),
    };
    draftSavedAt.value = draft.updated_at;
    if(draft.updated_at) message.success("נטענה טיוטה שמורה");
  } catch(e:any) {
    if(e?.status !== 404) message.error(e.message ?? String(e));
  }
}

async function saveComposeDraft() {
  if(!composing.value?._id) return;
  draftSaving.value=true;
  try {
    const saved = await api.printTemplates.saveDraft(composing.value._id, stringRecord(composeData.value), draftMeta.value);
    draftMeta.value = saved.meta ?? draftMeta.value;
    draftSavedAt.value = saved.updated_at;
    message.success("הטיוטה נשמרה");
  } catch(e:any) {
    message.error(e.message ?? String(e));
  } finally {
    draftSaving.value=false;
  }
}

function collectComposeData(): Record<string, unknown> {
  const data:Record<string,unknown>={};
  for(const [k,v] of Object.entries(composeData.value)) {
    data[k]=composeFieldKind(baseComposeBind(k)) === "date" ? normalizeDateForContract(v) ?? v : v;
  }
  return data;
}

function stringRecord(raw: Record<string, unknown>): Record<string,string> {
  const data: Record<string,string> = {};
  for(const [key,value] of Object.entries(raw ?? {})) data[key]=value == null ? "" : String(value);
  return data;
}

function normalizeComposeData(data: Record<string,string>): Record<string,string> {
  const normalized: Record<string,string> = {};
  for (const [key, value] of Object.entries(data)) {
    const kind = composeFieldKind(baseComposeBind(key));
    if (kind === "integer") normalized[key] = value.replace(/\D/g, "");
    else if (kind === "date") normalized[key] = normalizeDateForContract(value) ?? value;
    else normalized[key] = value;
  }
  return normalized;
}

function downloadBlob(blob: Blob, filename: string) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

function safeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g,"-") || "template";
}

function formatDraftTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

async function createContractFromCompose() {
  if(!composing.value?._id) return;
  if(!validateComposeBeforeAction("ליצור חוזה ותזכורת")) return;
  const fields = {...composeData.value};
  const expiryDate = normalizeDateForContract(
    pickField(fields, ["expiry_date", "next_inspection_date", "valid_until", "בתוקף עד"])
  );
  if(!expiryDate) {
    message.error("חסר תאריך תוקף / בדיקה הבאה. מלא שדה expiry_date או next_inspection_date.");
    return;
  }
  const startDate = normalizeDateForContract(
    pickField(fields, ["start_date", "inspection_date", "check_date", "תאריך בדיקה"])
  );
  creatingContract.value = true;
  try {
    const contract = await api.contracts.create({
      client_id: draftClientId(),
      contract_number: pickField(fields, ["contract_number", "document_number", "report_number", "prev_report_number"]) || null,
      contract_type: pickField(fields, ["contract_type", "inspection_type"]) || "תסקיר בדיקה",
      start_date: startDate,
      expiry_date: expiryDate,
      counterparty: pickField(fields, ["client_company", "client_name"]) || null,
      summary: pickField(fields, ["equipment_description", "description", "name", "model"]) || composing.value.name,
      manual_fields: fields,
      confidence: "manual",
      status: "active",
    } as any);
    draftMeta.value = {
      ...draftMeta.value,
      client_id: draftClientId(),
      contract_id: String(contract.id ?? ""),
    };
    await api.printTemplates.saveDraft(composing.value._id, stringRecord(composeData.value), draftMeta.value);
    message.success(`נוצר חוזה ותזכורת עבור ${contract.contract_number ?? composing.value.name}`);
  } catch(e:any) {
    message.error(e.message ?? String(e));
  } finally {
    creatingContract.value = false;
  }
}

function draftClientId(): string | null {
  const value = draftMeta.value.client_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickField(fields: Record<string,string>, names: string[]): string {
  for(const name of names) {
    const value = fields[name]?.trim();
    if(value) return value;
  }
  return "";
}

function normalizeDateForContract(value: string): string | null {
  const raw = value.trim();
  if(!raw) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if(match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const dayNumber = first > 12 ? first : second > 12 ? second : first;
    const monthNumber = first > 12 ? second : second > 12 ? first : second;
    const day = String(dayNumber).padStart(2,"0");
    const month = String(monthNumber).padStart(2,"0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== `${year}-${month}-${day}`) return null;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0,10);
}

// ── Designer — helpers ────────────────────────────────────────────────────────
const ALPHA="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function colLabel(i:number){
  let s=""; i+=1;
  while(i>0){ i--; s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26); }
  return s;
}

function getCell(r:number,c:number): PrintTemplateCell|undefined {
  return editing.value?.cells.find(cell=>cell.r===r&&cell.c===c);
}

function isMasked(r:number,c:number){
  if(!editing.value) return false;
  return editing.value.cells.some(cell=>{
    if(cell.r===r&&cell.c===c) return false;
    return r>=cell.r&&r<cell.r+(cell.rowSpan??1)&&c>=cell.c&&c<cell.c+(cell.colSpan??1);
  });
}

function cellHtml(r:number,c:number){
  const cell=getCell(r,c);
  if(!cell) return "";
  if(cell.type==="image") return imageHtml(cell);
  if(cell.type==="label") return richCellHtml(cell);
  return cell.bind?escHtml(`{{${cell.bind}}}`):"";
}

function cellStyle(r:number,c:number){
  const cell=getCell(r,c);
  if(!cell) return {};
  return { textAlign:cell.align??"right", fontWeight:cell.bold?"700":"400", color:cell.color??"inherit", verticalAlign:cell.valign??"middle" };
}

// ── Selection ─────────────────────────────────────────────────────────────────
const sel = ref({r1:-1,c1:-1,r2:-1,c2:-1});
const inspectorCollapsed = ref(false);
const dragging = ref(false);

const selRange = computed(()=>({
  r1:Math.min(sel.value.r1,sel.value.r2),
  r2:Math.max(sel.value.r1,sel.value.r2),
  c1:Math.min(sel.value.c1,sel.value.c2),
  c2:Math.max(sel.value.c1,sel.value.c2),
}));

const singleSel = computed(()=>selRange.value.r1===selRange.value.r2&&selRange.value.c1===selRange.value.c2);

function isInSel(r:number,c:number){
  const s=selRange.value;
  return r>=s.r1&&r<=s.r2&&c>=s.c1&&c<=s.c2;
}
function isActive(r:number,c:number){ return sel.value.r1===r&&sel.value.c1===c; }
function isColHot(c:number){ const s=selRange.value; return c>=s.c1&&c<=s.c2; }
function isRowHot(r:number){ const s=selRange.value; return r>=s.r1&&r<=s.r2; }

// Computed cell for inspector
const activeCellData = computed<PrintTemplateCell|null>(()=>{
  if(!editing.value||sel.value.r1<0) return null;
  let cell = getCell(sel.value.r1,sel.value.c1);
  if(!cell){
    // auto-create on first access so inspector can edit it
    cell={ r:sel.value.r1, c:sel.value.c1, type:"label", text:"", align:"right" };
    editing.value.cells.push(cell);
  }
  return cell;
});

const activeCellRef = computed(()=>{
  if(sel.value.r1<0) return "";
  if(singleSel.value) return `${colLabel(sel.value.c1)}${sel.value.r1+1}`;
  const s=selRange.value;
  return `${colLabel(s.c1)}${s.r1+1}:${colLabel(s.c2)}${s.r2+1}`;
});

const activeCellFormula = computed(()=>{
  const cell = singleSel.value ? getCell(sel.value.r1,sel.value.c1) : null;
  if(!cell) return "";
  if(cell.type==="label") return cell.text??"";
  if(cell.type==="image") return cell.src??"";
  return cell.bind?`=${cell.bind}`:"";
});

const activeFormulaPlaceholder = computed(()=>{
  const cell = singleSel.value ? getCell(sel.value.r1,sel.value.c1) : null;
  if(cell?.type === "field") return "=field_name";
  if(cell?.type === "image") return "Image URL";
  return "Cell text";
});

function onCellDown(e:MouseEvent,r:number,c:number){
  if(inlineEdit.value) commitInline();
  if(e.shiftKey){ sel.value={...sel.value,r2:r,c2:c}; }
  else { sel.value={r1:r,c1:c,r2:r,c2:c}; }
  dragging.value=true;
}
function onCellOver(r:number,c:number){ if(dragging.value) sel.value={...sel.value,r2:r,c2:c}; }
function onMouseUp(){ dragging.value=false; }

// ── Toolbar actions ───────────────────────────────────────────────────────────
const canMerge = computed(()=>{
  const s=selRange.value;
  return s.r1>=0&&(s.r2>s.r1||s.c2>s.c1);
});
const canUnmerge = computed(()=>{
  if(!singleSel.value||sel.value.r1<0) return false;
  const cell=getCell(sel.value.r1,sel.value.c1);
  return (cell?.colSpan??1)>1||(cell?.rowSpan??1)>1;
});

const selBold   = computed(()=> singleSel.value ? (getCell(sel.value.r1,sel.value.c1)?.bold??false) : false);
const selAlign  = computed(()=> singleSel.value ? (getCell(sel.value.r1,sel.value.c1)?.align??"right") : "");
const selValign = computed(()=> singleSel.value ? (getCell(sel.value.r1,sel.value.c1)?.valign??"middle") : "");

function forEachSel(fn:(cell:PrintTemplateCell)=>Partial<PrintTemplateCell>){
  if(!editing.value) return;
  const s=selRange.value;
  for(let r=s.r1;r<=s.r2;r++){
    for(let c=s.c1;c<=s.c2;c++){
      let cell=getCell(r,c);
      if(!cell){ cell={r,c,type:"label",text:"",align:"right"}; editing.value.cells.push(cell); }
      Object.assign(cell,fn(cell));
    }
  }
}

function toggleBold(){
  if(applyInlineCommand("bold")) return;
  forEachSel(c=>({bold:!c.bold}));
}
function setRichColor(color:string){
  if(applyInlineCommand("foreColor", color)) return;
  forEachSel(()=>({color}));
}
function setAlign(a:"right"|"center"|"left"){ forEachSel(()=>({align:a})); }
function setValign(v:"top"|"middle"|"bottom"){ forEachSel(()=>({valign:v})); }
function toggleType(){ forEachSel(c=>({type:c.type==="field"?"label":"field"})); }

function setCellType(type:"label"|"field"|"image"){
  const cell=activeCellData.value;
  if(!cell) return;
  cell.type=type;
  if(type==="label") { delete cell.bind; delete cell.src; delete cell.alt; }
  else if(type==="field") { delete cell.text; delete cell.html; delete cell.src; delete cell.alt; }
  else { delete cell.text; delete cell.html; delete cell.bind; }
}

function commitFormulaEdit(value:string){
  const cell=activeCellData.value;
  if(!cell) return;
  const next=value.trim();
  if(cell.type==="field"){
    cell.bind=next.replace(/^=/,"");
  } else if(cell.type==="image"){
    cell.src=next;
  } else {
    cell.text=value;
    delete cell.html;
  }
}

function triggerImageUpload(){
  if(!activeCellData.value) return;
  imageInputEl.value?.click();
}

async function onImageFileChange(event: Event){
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if(!file) return;
  const cell=activeCellData.value;
  if(!cell) return;
  try {
    const {url} = await api.emailTemplates.uploadAsset("poster", file);
    Object.assign(cell, {type:"image", src:url, alt:file.name});
    delete cell.text; delete cell.html; delete cell.bind;
  } catch(e:any) {
    message.error(e.message ?? String(e));
  }
}

function setImageFromUrl(){
  const cell=activeCellData.value;
  if(!cell) return;
  const url = window.prompt("Image URL", cell.type==="image" ? (cell.src ?? "") : "");
  if(url == null) return;
  Object.assign(cell, {type:"image", src:url.trim()});
  delete cell.text; delete cell.html; delete cell.bind;
}

function mergeCells(){
  if(!editing.value||!canMerge.value) return;
  const s=selRange.value;
  editing.value.cells=editing.value.cells.filter(cell=>{
    const inR=cell.r>=s.r1&&cell.r<=s.r2&&cell.c>=s.c1&&cell.c<=s.c2;
    return !inR||(cell.r===s.r1&&cell.c===s.c1);
  });
  let anchor=getCell(s.r1,s.c1);
  if(!anchor){ anchor={r:s.r1,c:s.c1,type:"label",text:""}; editing.value.cells.push(anchor); }
  anchor.colSpan=s.c2-s.c1+1;
  anchor.rowSpan=s.r2-s.r1+1;
  sel.value={r1:s.r1,c1:s.c1,r2:s.r1,c2:s.c1};
}

function unmergeCells(){
  const cell=activeCellData.value;
  if(!cell) return;
  delete cell.colSpan; delete cell.rowSpan;
}

// Add/del rows+cols
function addRow(){
  if(!editing.value) return;
  const sourceRow = selRange.value.r1 >= 0 ? selRange.value.r1 : editing.value.rows.length - 1;
  const insertAt = sourceRow + 1;
  const sourceHeight = editing.value.rows[sourceRow]?.h ?? 30;
  editing.value.rows.splice(insertAt, 0, {h: sourceHeight});
  const clonedCells: PrintTemplateCell[] = [];
  editing.value.cells = editing.value.cells.map(cell=>{
    if(cell.r === sourceRow) clonedCells.push(cloneRowCell(cell, insertAt));
    return cell.r >= insertAt ? {...cell, r: cell.r + 1} : cell;
  });
  editing.value.cells.push(...clonedCells);
  sel.value={r1:insertAt,c1:selRange.value.c1<0?0:selRange.value.c1,r2:insertAt,c2:selRange.value.c1<0?0:selRange.value.c1};
}
function addCol(){ editing.value?.cols.push({w:100}); }

function cloneRowCell(cell: PrintTemplateCell, row: number): PrintTemplateCell {
  const cloned = {...cell, r: row};
  if(cloned.type === "field" && cloned.bind) cloned.bind = nextClonedBind(cloned.bind);
  return cloned;
}

function nextClonedBind(bind: string): string {
  if(!editing.value) return bind;
  const base = bind.replace(/_\d+$/,"");
  const used = new Set(editing.value.cells.map((cell) => cell.bind).filter(Boolean));
  let index = 2;
  while(used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function delSelRows(){
  if(!editing.value||sel.value.r1<0) return;
  const s=selRange.value;
  const count=s.r2-s.r1+1;
  if(editing.value.rows.length<=count) return;
  editing.value.rows=editing.value.rows.filter((_,i)=>i<s.r1||i>s.r2);
  const cells:PrintTemplateCell[]=[];
  for(const cell of editing.value.cells){
    if(cell.r>=s.r1&&cell.r<=s.r2) continue;
    cells.push(cell.r>s.r2?{...cell,r:cell.r-count}:cell);
  }
  editing.value.cells=cells;
  sel.value={r1:0,c1:0,r2:0,c2:0};
}

function delSelCols(){
  if(!editing.value||sel.value.c1<0) return;
  const s=selRange.value;
  const count=s.c2-s.c1+1;
  if(editing.value.cols.length<=count) return;
  editing.value.cols=editing.value.cols.filter((_,i)=>i<s.c1||i>s.c2);
  const cells:PrintTemplateCell[]=[];
  for(const cell of editing.value.cells){
    if(cell.c>=s.c1&&cell.c<=s.c2) continue;
    cells.push(cell.c>s.c2?{...cell,c:cell.c-count}:cell);
  }
  editing.value.cells=cells;
  sel.value={r1:0,c1:0,r2:0,c2:0};
}

// ── Inline edit ───────────────────────────────────────────────────────────────
const inlineEdit = ref<{r:number,c:number}|null>(null);
const inlineVal  = ref("");
const inlineEl   = ref<HTMLDivElement[]>([]);

function startInlineEdit(r:number,c:number){
  if(!editing.value) return;
  let cell=getCell(r,c);
  if(!cell){ cell={r,c,type:"label",text:"",align:"right"}; editing.value.cells.push(cell); }
  if(cell.type==="image") return;
  inlineEdit.value={r,c};
  inlineVal.value=cell.type==="label"?richCellHtml(cell):escHtml(cell.bind??"");
  nextTick(()=>inlineEl.value[0]?.focus());
}

function onInlineInput(event: Event){
  inlineVal.value = (event.target as HTMLElement).innerHTML;
}

function commitInline(){
  if(!inlineEdit.value||!editing.value) return;
  const {r,c}=inlineEdit.value;
  let cell=getCell(r,c);
  if(!cell){ cell={r,c,type:"label"}; editing.value.cells.push(cell); }
  const editedHtml = inlineEl.value[0]?.innerHTML ?? inlineVal.value;
  if(cell.type==="label") {
    cell.html=sanitizeRichHtml(editedHtml);
    cell.text=plainTextFromHtml(cell.html);
    if(!cell.html || cell.html === escHtml(cell.text ?? "")) delete cell.html;
  } else {
    cell.bind=plainTextFromHtml(editedHtml).trim();
  }
  inlineEdit.value=null;
}

function applyInlineCommand(command: "bold"|"foreColor", value?: string): boolean {
  if(!inlineEdit.value) return false;
  const cell=getCell(inlineEdit.value.r, inlineEdit.value.c);
  if(cell?.type !== "label") return false;
  inlineEl.value[0]?.focus();
  document.execCommand(command, false, value);
  inlineVal.value = inlineEl.value[0]?.innerHTML ?? inlineVal.value;
  return true;
}

function richCellHtml(cell: PrintTemplateCell): string {
  if(cell.html) return sanitizeRichHtml(cell.html);
  return escHtml(cell.text ?? "");
}

function imageHtml(cell: PrintTemplateCell): string {
  const src = safeImageSrc(cell.src ?? "");
  if(!src) return "";
  return `<img class="xl-cell-img" src="${escAttr(src)}" alt="${escAttr(cell.alt ?? "")}">`;
}

function safeImageSrc(src: string): string {
  const value = src.trim();
  if(/^https?:\/\//i.test(value)) return value;
  if(/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value;
  if(value.startsWith("/")) return value;
  return "";
}

function sanitizeRichHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  function clean(node: Node): string {
    if(node.nodeType === Node.TEXT_NODE) return escHtml(node.textContent ?? "");
    if(node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const children = Array.from(el.childNodes).map(clean).join("");
    const tag = el.tagName.toLowerCase();
    if(tag === "b" || tag === "strong") return `<strong>${children}</strong>`;
    if(tag === "br") return "<br>";
    if(tag === "div" || tag === "p") return children ? `${children}<br>` : "";
    if(tag === "font") {
      const color = normalizeColor(el.getAttribute("color") ?? "");
      return color ? `<span style="color:${color}">${children}</span>` : children;
    }
    if(tag === "span") {
      const color = normalizeColor(el.style.color);
      const weight = el.style.fontWeight;
      let out = children;
      if(weight === "bold" || Number(weight) >= 600) out = `<strong>${out}</strong>`;
      return color ? `<span style="color:${color}">${out}</span>` : out;
    }
    return children;
  }
  return Array.from(doc.body.firstElementChild?.childNodes ?? []).map(clean).join("").replace(/(<br>)+$/,"");
}

function normalizeColor(color: string): string {
  const value = color.trim();
  if(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) return value;
  const rgb = value.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);
  if(!rgb) return "";
  const parts = rgb.slice(1).map((part) => Math.max(0, Math.min(255, Number(part))));
  return `#${parts.map((part) => part.toString(16).padStart(2,"0")).join("")}`;
}

function plainTextFromHtml(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

// ── Resize col (RTL: drag left = wider) ──────────────────────────────────────
const resizeCol = ref<{ci:number,x:number,w:number}|null>(null);
function startColResize(e:MouseEvent,ci:number){
  if(!editing.value) return;
  resizeCol.value={ci,x:e.clientX,w:editing.value.cols[ci].w};
  window.addEventListener("mousemove",onColMove);
  window.addEventListener("mouseup",stopColResize);
}
function onColMove(e:MouseEvent){
  if(!resizeCol.value||!editing.value) return;
  const dw=resizeCol.value.x-e.clientX; // RTL: drag left = wider
  editing.value.cols[resizeCol.value.ci].w=Math.max(40,resizeCol.value.w+dw);
}
function stopColResize(){ resizeCol.value=null; window.removeEventListener("mousemove",onColMove); window.removeEventListener("mouseup",stopColResize); }

// ── Resize row ────────────────────────────────────────────────────────────────
const resizeRow = ref<{ri:number,y:number,h:number}|null>(null);
function startRowResize(e:MouseEvent,ri:number){
  if(!editing.value) return;
  resizeRow.value={ri,y:e.clientY,h:editing.value.rows[ri].h};
  window.addEventListener("mousemove",onRowMove);
  window.addEventListener("mouseup",stopRowResize);
}
function onRowMove(e:MouseEvent){
  if(!resizeRow.value||!editing.value) return;
  editing.value.rows[resizeRow.value.ri].h=Math.max(22,resizeRow.value.h+(e.clientY-resizeRow.value.y));
}
function stopRowResize(){ resizeRow.value=null; window.removeEventListener("mousemove",onRowMove); window.removeEventListener("mouseup",stopRowResize); }
</script>

<style scoped>
/* ── Page shell ───────────────────────────────────────────────────────────── */
.ptp { padding: 24px; height: 100%; display: flex; flex-direction: column; }

.ptp-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
}
.ptp-title { font-size: 16px; font-weight: 600; flex: 1; }
.compose-draft-status {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.xl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 34px; padding: 6px 14px; font-size: 13px; border-radius: 4px;
  border: 1px solid #ccc; background: #fff; cursor: pointer; color: #222;
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

/* ── Compose ──────────────────────────────────────────────────────────────── */
.compose-wrap { display: flex; gap: 0; flex: 1; overflow: hidden; border: 1px solid #ccc; border-radius: 6px; }
.compose-preview { flex: 1; display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid #ccc; }
.pane-label { padding: 6px 12px; font-size: 12px; font-weight: 600; color: #555; background: #f3f3f3; border-bottom: 1px solid #ccc; }
.compose-scroll { flex: 1; overflow: auto; background: #eee; padding: 20px; }
.render-table { border-collapse: collapse; table-layout: fixed; font-family: Arial, sans-serif; }
.compose-form { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; background: #fafafa; }
.compose-fields { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.compose-field-row { display: flex; flex-direction: column; gap: 3px; padding: 4px; border-radius: 4px; }
.compose-field-row--filled { background: #eef8f1; }
.compose-field-row--invalid { background: #fff1f2; }
.compose-field-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 600; color: #555; }
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
.compose-field-input { padding: 5px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; }
.compose-field-textarea { padding: 5px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; font-family: inherit; resize: vertical; }
.compose-field-input--invalid {
  border-color: #d03050;
  background: #fff7f8;
}
.compose-field-error {
  color: #d03050;
  font-size: 11px;
  line-height: 1.3;
}
.compose-field-hint {
  color: #8a94a6;
  font-size: 10px;
  min-height: 13px;
}
.doc-paper { background: #fff; color: #000; margin: 0 auto; }
.compose-cell-input {
  width: 100%;
  height: 100%;
  min-height: 22px;
  box-sizing: border-box;
  border: 0;
  outline: 0;
  padding: 2px 4px;
  background: rgba(255,255,255,.7);
  color: inherit;
  font: inherit;
  font-weight: inherit;
  text-align: inherit;
  direction: inherit;
}
.compose-cell-input::placeholder { color: #9aa3ad; }
.compose-cell-input:focus {
  background: #fff;
  box-shadow: inset 0 0 0 2px #217346;
}
.compose-cell-input--invalid {
  background: #fff7f8;
  box-shadow: inset 0 0 0 1px #d03050;
}
.compose-cell-input--invalid:focus {
  box-shadow: inset 0 0 0 2px #d03050;
}
.compose-cell-input--textarea {
  display: block;
  resize: none;
  min-height: 100%;
  font-family: inherit;
}

/* ── Excel shell ──────────────────────────────────────────────────────────── */
.xl-shell {
  display: flex; flex-direction: column;
  height: calc(100vh - 100px);
  border: 1px solid #b0b0b0;
  border-radius: 4px;
  overflow: hidden;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  color: #222;
  background: #fff;
}

/* Title bar */
.xl-titlebar {
  display: flex; align-items: center; gap: 8px;
  background: #217346; color: #fff;
  padding: 6px 12px;
  flex-shrink: 0;
}
.xl-titlebar-logo { font-weight: 700; font-size: 14px; letter-spacing: .3px; white-space: nowrap; }
.xl-titlebar-name {
  flex: 1; max-width: 280px;
  background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3);
  color: #fff; border-radius: 3px; padding: 3px 8px; font-size: 13px;
}
.xl-titlebar-name::placeholder { color: rgba(255,255,255,.6); }
.xl-tbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 28px; padding: 4px 12px; font-size: 12px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,.5); background: transparent;
  color: #fff; cursor: pointer; white-space: nowrap;
}
.xl-tbtn:hover { background: rgba(255,255,255,.15); }
.xl-tbtn--save { background: rgba(255,255,255,.2); font-weight: 600; }
.xl-tbtn--loading { cursor: wait; opacity: .8; }

/* Ribbon */
.xl-ribbon {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px;
  background: #f3f3f3;
  border-bottom: 1px solid #d4d4d4;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.xl-ribbon-group { display: flex; gap: 3px; }
.xl-ribbon-sep { width: 1px; align-self: stretch; background: #d4d4d4; margin: 0 4px; }
.xl-rbtn {
  padding: 4px 10px; font-size: 12px; border-radius: 3px;
  border: 1px solid #ccc; background: #fff; cursor: pointer; color: #222;
  white-space: nowrap;
}
.xl-rbtn:hover { background: #d3e3d3; border-color: #217346; }
.xl-rbtn.active { background: #217346; color: #fff; border-color: #217346; }
.xl-rbtn--bold { font-weight: 700; }
.xl-color-btn {
  width: 22px;
  height: 22px;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
}
.xl-color-btn:hover { outline: 2px solid #217346; }
.xl-rbtn--field { border-color: #217346; color: #217346; }
.xl-rbtn--field:hover { background: #d3e3d3; }
.xl-rbtn:disabled { opacity: .4; cursor: default; }

/* Name bar */
.xl-namebar {
  display: flex; align-items: center;
  border-bottom: 1px solid #d4d4d4;
  background: #fff;
  flex-shrink: 0;
}
.xl-cellref {
  width: 80px; text-align: center; font-size: 12px; font-weight: 600;
  padding: 4px 8px; border-right: 1px solid #d4d4d4; color: #217346;
  font-family: monospace;
}
.xl-namebar-sep { width: 1px; background: #d4d4d4; }
.xl-formula { flex: 1; padding: 4px 10px; font-size: 12px; color: #444; font-family: monospace; }
.xl-formula-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: #222;
  font-family: monospace;
  background: #fff;
}

/* Workspace */
.xl-workspace { display: flex; flex: 1; overflow: hidden; }

/* Grid */
.xl-grid-wrap { flex: 1; overflow: auto; background: #fff; }

.xl-table {
  border-collapse: collapse;
  table-layout: fixed;
  font-family: Arial, sans-serif;
  font-size: 12px;
}

.xl-row-num-col { width: 40px; }

.xl-corner {
  position: sticky; top: 0; z-index: 4;
  background: #f3f3f3; border: 1px solid #d4d4d4;
  width: 40px; min-width: 40px;
}

/* Column headers */
.xl-ch {
  position: sticky; top: 0; z-index: 3;
  background: #f3f3f3; border: 1px solid #d4d4d4;
  text-align: center; font-size: 11px; font-weight: 600; color: #555;
  user-select: none; padding: 2px 4px;
  position: relative;
}
.xl-ch--hot { background: #d3e3d3 !important; color: #217346; }

.xl-col-resize {
  position: absolute;
  left: -3px; top: 0; bottom: 0;
  width: 6px; cursor: col-resize;
  background: transparent;
  z-index: 5;
}
.xl-col-resize:hover { background: #21734688; }

/* Row headers */
.xl-rh {
  position: sticky; right: 0; z-index: 2;
  background: #f3f3f3; border: 1px solid #d4d4d4;
  text-align: center; font-size: 11px; font-weight: 600; color: #555;
  width: 40px; min-width: 40px;
  user-select: none; padding: 2px 0;
  position: relative;
}
.xl-rh--hot { background: #d3e3d3 !important; color: #217346; }

.xl-row-resize {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 5px; cursor: row-resize; background: transparent;
}
.xl-row-resize:hover { background: #21734688; }

/* Data cells */
.xl-cell {
  border: 1px solid #d4d4d4;
  padding: 2px 5px;
  cursor: cell;
  user-select: none;
  overflow: hidden;
  vertical-align: middle;
  font-size: 12px;
  background: #fff;
}
.xl-cell:hover:not(.xl-cell--active) { background: #f5f5f5; }
.xl-cell--sel    { background: #c6efce !important; }
.xl-cell--active { border: 2px solid #217346 !important; background: #fff !important; padding: 1px 4px; }
.xl-cell--field  { background: #fff8e1; }
.xl-cell--image  { background: #eef6ff; }
.xl-cell--sel.xl-cell--field { background: #c6efce !important; }
.xl-cell--sel.xl-cell--image { background: #c6efce !important; }

.xl-hidden-input { display: none; }

.render-table :deep(.xl-cell-img),
.xl-table :deep(.xl-cell-img) {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
  object-fit: contain;
}

.xl-inline {
  width: 100%; height: 100%; min-height: 20px;
  border: none; outline: none;
  font: inherit; text-align: inherit;
  background: #fff; padding: 0;
  cursor: text;
  user-select: text;
  white-space: pre-wrap;
}

/* Inspector */
.xl-inspector {
  width: 220px; flex-shrink: 0;
  border-right: 1px solid #d4d4d4;
  background: #fafafa;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex; flex-direction: column; gap: 4px;
  transition: width .15s ease, padding .15s ease;
}
.xl-inspector--collapsed {
  width: 28px; padding: 12px 4px; overflow: hidden;
}
.xl-inspector-title { font-weight: 700; color: #217346; margin-bottom: 6px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; }
.xl-inspector-collapse {
  border: 1px solid #ccc; background: #fff; border-radius: 3px;
  width: 20px; height: 20px; line-height: 1; cursor: pointer;
  color: #217346; font-weight: 700; flex-shrink: 0;
}
.xl-inspector-collapse:hover { background: #d3e3d3; }
.xl-inspector-ref   { font-size: 12px; color: #555; font-family: monospace; margin-bottom: 8px; }
.xl-inspector-section { font-size: 11px; font-weight: 600; color: #888; margin-top: 10px; text-transform: uppercase; letter-spacing: .5px; }
.xl-inspector-input {
  width: 100%; padding: 5px 8px; border: 1px solid #ccc; border-radius: 3px;
  font-size: 12px; box-sizing: border-box; margin-top: 3px;
}
.xl-inspector-input:focus { outline: 2px solid #217346; border-color: #217346; }
.xl-inspector-hint { font-size: 11px; color: #999; margin-top: 3px; line-height: 1.4; }

.xl-type-btns { display: flex; gap: 4px; margin-top: 4px; }
.xl-type-btn {
  flex: 1; padding: 5px 8px; font-size: 12px; border-radius: 3px;
  border: 1px solid #ccc; background: #fff; cursor: pointer; color: #444;
}
.xl-type-btn:hover { background: #d3e3d3; border-color: #217346; }
.xl-type-btn.active { background: #217346; color: #fff; border-color: #217346; }

/* Status bar */
.xl-statusbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 12px; font-size: 11px; color: #666;
  background: #f3f3f3; border-top: 1px solid #d4d4d4;
  flex-shrink: 0;
}

@keyframes xl-spin {
  to { transform: rotate(360deg); }
}
</style>
