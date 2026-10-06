<template>
  <div class="ptp">

    <template v-if="routeDraftLoading">
      <div class="route-draft-loading">
        <n-spin :show="true" size="large">
          <div class="route-draft-loading__text">{{ l.printTemplates.loadingDraft }}</div>
        </n-spin>
      </div>
    </template>

    <!-- ── LIST ──────────────────────────────────────────────────────────────── -->
    <template v-else-if="mode === 'list'">
      <PageHeader
        :title="l.printTemplates.title"
        :subtitle="l.printTemplates.subtitle"
        :count="templates.length"
      >
        <template #breadcrumb>
          <router-link :to="href('/print-templates')">{{ l.printTemplates.title }}</router-link>
          <span class="sep">/</span>
          <span>{{ l.printTemplates.excelEditor }}</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" @click="router.push(href('/print-templates/layout'))">{{ l.printTemplates.layoutEditor }}</button>
          <button class="btn btn--primary" @click="newTemplate">+ {{ l.printTemplates.newTemplate }}</button>
        </template>
      </PageHeader>

      <n-alert v-if="loadError" style="margin-bottom:16px" type="error">{{ loadError }}</n-alert>

      <n-spin :show="loading">
        <div v-if="templates.length" class="pt-grid">
          <article
            v-for="t in templates"
            :key="t._id"
            class="pt-card"
            @click="openCompose(t)"
          >
            <div class="pt-card__head">
              <h3 class="pt-card__name">{{ t.name }}</h3>
              <span class="tag tag--neutral">{{ t.page }}</span>
              <span v-if="t.is_shared" class="tag tag--neutral">משותף</span>
            </div>

            <div class="pt-card__stats">
              <span class="pt-stat"><strong>{{ t.cols.length }}</strong> עמודות</span>
              <span class="pt-stat"><strong>{{ t.rows.length }}</strong> שורות</span>
              <span class="pt-stat"><strong>{{ t.cells.filter(c => c.type==='field').length }}</strong> שדות</span>
            </div>

            <div class="pt-card__actions">
              <button class="btn btn--xs btn--primary" @click.stop="openCompose(t)">
                <n-icon :component="CreateOutline"/>
                מלא ושלח
              </button>
              <button v-if="canMutateTemplate(t)" class="btn btn--xs btn--ghost" @click.stop="editTemplate(t)">
                <n-icon :component="BrushOutline"/>
                עצב
              </button>
              <button v-if="canDeleteTemplate(t)" class="btn btn--xs btn--danger" @click.stop="deleteTemplate(t._id)">
                <n-icon :component="TrashOutline"/>
                מחק
              </button>
            </div>
          </article>
        </div>
        <n-empty v-else-if="!loading && !loadError" description="אין תבניות. צור תבנית חדשה." style="margin-top:60px">
          <template #extra>
            <button class="btn btn--primary" @click="newTemplate">+ תבנית חדשה</button>
          </template>
        </n-empty>
      </n-spin>
    </template>

    <!-- ── COMPOSE ───────────────────────────────────────────────────────────── -->
    <template v-else-if="mode === 'compose' && composing">
      <PageHeader :title="`${composing.name} — מילוי שדות`">
        <template #breadcrumb>
          <template v-if="routeContractId">
            <a href="#" @click.prevent="goBackFromCompose">תסקירים</a>
            <span class="sep">/</span>
            <span>{{ composing.name }}</span>
          </template>
          <template v-else>
            <router-link to="/print-templates">תבניות הדפסה</router-link>
            <span class="sep">/</span>
            <a href="#" @click.prevent="goList">עורך Excel</a>
            <span class="sep">/</span>
            <span>{{ composing.name }}</span>
          </template>
        </template>
        <template #actions>
          <button v-if="routeContractId" class="xl-btn" @click="editContractFromDraft">
            ערוך
          </button>
          <button :disabled="draftSaving" :class="{ 'xl-btn--loading': draftSaving }" class="xl-btn" @click="saveComposeDraft">
            <span v-if="draftSaving" class="xl-loader" aria-hidden="true"></span>
            <span>שמור טיוטה</span>
          </button>
          <button
            v-if="!routeContractId"
            :disabled="creatingContract"
            :class="{ 'xl-btn--loading': creatingContract }"
            class="xl-btn"
            @click="createContractFromCompose"
          >
            <span v-if="creatingContract" class="xl-loader" aria-hidden="true"></span>
            <span>צור חוזה</span>
          </button>
          <button :disabled="!exportAllowed || printing" :class="{ 'xl-btn--loading': printing }" class="xl-btn xl-btn--primary" @click="printPdf">
            <span v-if="printing" class="xl-loader" aria-hidden="true"></span>
            <n-icon :component="PrintOutline"/>
            <span>הדפס</span>
          </button>
          <button :disabled="!exportAllowed || savingPdf" :class="{ 'xl-btn--loading': savingPdf }" class="xl-btn xl-btn--primary" @click="savePdf">
            <span v-if="savingPdf" class="xl-loader" aria-hidden="true"></span>
            <span>הורד</span>
          </button>
        </template>
      </PageHeader>
      <div class="compose-wrap">
        <div class="compose-preview">
          <div class="pane-label pane-label--with-status">
            <span>תצוגה מקדימה</span>
            <span v-if="draftSavedAt" class="compose-draft-status">טיוטה נשמרה {{ formatDraftTime(draftSavedAt) }}</span>
          </div>
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
                          dir="auto"
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
            <div v-if="!composeFields.length" style="padding:16px;color:#999;font-size:13px">אין שדות</div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── DESIGN ────────────────────────────────────────────────────────────── -->
    <template v-else-if="mode === 'design' && editing">
      <nav aria-label="breadcrumb" class="pt-breadcrumb">
        <router-link to="/print-templates">תבניות הדפסה</router-link>
        <span class="sep">/</span>
        <a href="#" @click.prevent="goList">עורך Excel</a>
        <span class="sep">/</span>
        <span>{{ editing.name || "תבנית חדשה" }}</span>
      </nav>
      <div class="xl-shell">

        <!-- Excel green title bar -->
        <div class="xl-titlebar">
          <span class="xl-titlebar-logo">M.A.D</span>
          <input v-model="editing.name" class="xl-titlebar-name" />
          <div style="flex:1"/>
          <button :class="{ 'xl-tbtn--loading': saving }" :disabled="saving || !canMutateEditing"
                  class="xl-tbtn xl-tbtn--save" @click="saveTemplate">
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
          <!-- Borders (Excel-style dropdown) -->
          <div class="xl-ribbon-group xl-border-group">
            <button
              :class="{ active: showBorderMenu }"
              class="xl-rbtn xl-border-btn"
              title="מסגרות"
              @click.stop="showBorderMenu = !showBorderMenu"
            >⊞ מסגרות ▾</button>
            <div v-if="showBorderMenu" class="xl-border-menu" @click.stop>
              <div class="xl-border-menu__label">סוג קו</div>
              <div class="xl-border-pens">
                <button
                  v-for="pen in borderPens"
                  :key="pen.value"
                  :class="{ active: borderPen === pen.value }"
                  class="xl-border-pen"
                  :title="pen.label"
                  @click="borderPen = pen.value"
                >
                  <span class="xl-border-pen__preview" :data-pen="pen.value"></span>
                  <span>{{ pen.label }}</span>
                </button>
              </div>
              <div class="xl-border-menu__label">החל על</div>
              <div class="xl-border-actions">
                <button class="xl-border-act" title="כל הגבולות" @click="applyBorder('all')">
                  <span class="xl-bico xl-bico--all"></span>הכל
                </button>
                <button class="xl-border-act" title="מסגרת חיצונית" @click="applyBorder('outer')">
                  <span class="xl-bico xl-bico--outer"></span>חיצוני
                </button>
                <button class="xl-border-act" title="קווים פנימיים" @click="applyBorder('inner')">
                  <span class="xl-bico xl-bico--inner"></span>פנימי
                </button>
                <button class="xl-border-act" title="ללא מסגרת" @click="applyBorder('none')">
                  <span class="xl-bico xl-bico--none"></span>ללא
                </button>
                <button class="xl-border-act" title="גבול עליון" @click="applyBorder('top')">
                  <span class="xl-bico xl-bico--top"></span>עליון
                </button>
                <button class="xl-border-act" title="גבול תחתון" @click="applyBorder('bottom')">
                  <span class="xl-bico xl-bico--bottom"></span>תחתון
                </button>
                <button class="xl-border-act" title="גבול ימני" @click="applyBorder('right')">
                  <span class="xl-bico xl-bico--right"></span>ימין
                </button>
                <button class="xl-border-act" title="גבול שמאלי" @click="applyBorder('left')">
                  <span class="xl-bico xl-bico--left"></span>שמאל
                </button>
              </div>
            </div>
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
                          dir="auto"
                          @mousedown.stop
                          @blur="commitInline"
                          @keydown.enter="onInlineEnter"
                          @keydown.escape="inlineEdit=null"
                        />
                      </template>
                      <template v-else>
                        <span
                          dir="auto"
                          :style="{ color: getCell(ri,ci-1)?.type==='field' && !getCell(ri,ci-1)?.bind ? '#bbb' : 'inherit' }"
                          v-html="cellHtml(ri,ci-1)"
                        />
                      </template>
                      <span class="xl-cell-resize" @mousedown.prevent.stop="startCellResize($event,ri,ci-1)"/>
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

              <div class="xl-inspector-section">מסגרת</div>
              <div class="xl-inspector-hint">בחר צד וסגנון מסרגל ה⊞ מסגרות למעלה</div>

              <div class="xl-inspector-section">גודל טקסט</div>
              <div class="xl-fontsize-row">
                <button class="xl-type-btn" title="הקטן" @click="nudgeCellFontSize(-1)">−</button>
                <input
                  :value="activeCellData.fontSize ?? DEFAULT_CELL_FONT_SIZE"
                  class="xl-inspector-input xl-fontsize-input"
                  type="number"
                  min="6"
                  max="48"
                  @change="setCellFontSize(Number(($event.target as HTMLInputElement).value))"
                />
                <span class="xl-fontsize-unit">px</span>
                <button class="xl-type-btn" title="הגדל" @click="nudgeCellFontSize(1)">+</button>
              </div>

              <div class="xl-inspector-section" style="margin-top:16px">גודל</div>
              <div class="xl-inspector-hint">
                גובה שורה: {{ editing.rows[selRange.r1]?.h ?? '—' }}px<br/>
                רוחב עמ׳: {{ editing.cols[selRange.c1]?.w ?? '—' }}px
              </div>

              <div class="xl-inspector-section" style="margin-top:8px">רוחב תא</div>
              <div class="xl-fontsize-row">
                <input
                    :value="activeCellData.cellWidth ?? ''"
                    class="xl-inspector-input xl-fontsize-input"
                    min="40"
                    placeholder="אוטו׳"
                    type="number"
                    @change="setCellWidth(Number(($event.target as HTMLInputElement).value) || undefined)"
                />
                <span class="xl-fontsize-unit">px</span>
                <button class="xl-type-btn" title="אפס" @click="setCellWidth(undefined)">✕</button>
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
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NAlert, NEmpty, NIcon, NSpin, useMessage,} from "naive-ui";
import {BrushOutline, CreateOutline, PrintOutline, TrashOutline} from "@vicons/ionicons5";
import {storeToRefs} from "pinia";
import {api} from "../services/apiService.js";
import {useAuthStore} from "../stores/auth.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";
import {useConfirm} from "../composables/useConfirm.js";
import {featureFlagsForUser, resolveUserPlan} from "../shared/pricingPlans.js";
import type {PrintCellBorderSides, PrintCellBorderStyle, PrintTemplate, PrintTemplateCell} from "@shared/types.js";

type BorderSide = "top" | "right" | "bottom" | "left";

function borderSideCss(style: PrintCellBorderStyle | undefined): string {
  switch (style) {
    case "medium": return "2px solid #000";
    case "thick":  return "3px solid #000";
    case "double": return "3px double #000";
    case "thin":   return "1px solid #000";
    default:       return "none";
  }
}

// Normalize any border value (legacy string / "none" / per-side object) into
// an explicit 4-side map. Unset (undefined) => classic thin box on all sides.
function resolveBorderSides(border: PrintTemplateCell["border"]): Required<PrintCellBorderSides> {
  if (border === undefined) {
    return { top: "thin", right: "thin", bottom: "thin", left: "thin" };
  }
  if (border === "none") {
    return { top: undefined, right: undefined, bottom: undefined, left: undefined } as Required<PrintCellBorderSides>;
  }
  if (typeof border === "string") {
    return { top: border, right: border, bottom: border, left: border };
  }
  return {
    top: border.top,
    right: border.right,
    bottom: border.bottom,
    left: border.left,
  } as Required<PrintCellBorderSides>;
}

const message = useMessage();
const {l, t, href} = useI18n();
const {confirm} = useConfirm();
const route = useRoute();
const router = useRouter();
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const authStore = useAuthStore();
const {user: engineerProfile} = storeToRefs(authStore);
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);

function canMutateTemplate(_t: PrintTemplate) {
  return true;
}

function canDeleteTemplate(t: PrintTemplate) {
  return authStore.isAdmin || t.user_id === authStore.user?.id;
}
const routeDraftLoading = ref(isDraftRoute());

// ── Mode ──────────────────────────────────────────────────────────────────────
type Mode = "list" | "compose" | "design";
const mode = ref<Mode>("list");
function goList() { mode.value="list"; editing.value=null; composing.value=null; sel.value={r1:-1,c1:-1,r2:-1,c2:-1}; }
async function goBackFromCompose() {
  if (routeContractId.value) {
    await router.push("/contracts");
    return;
  }
  goList();
}

// ── List ──────────────────────────────────────────────────────────────────────
const loading   = ref(false);
const loadError = ref<string|null>(null);
const templates = ref<PrintTemplate[]>([]);
loadTemplates();

function isDraftRoute(): boolean {
  return typeof route.params.contractId === "string" || typeof route.params.templateId === "string";
}

async function loadTemplates() {
  loading.value = true; loadError.value = null;
  try {
    templates.value = (await api.printTemplates.list())
      .filter((t) => t.editorType !== "sections")
      .map(normalizeLegacyTemplateBindings);
    if (!templates.value.length && !isDraftRoute()) newTemplate();
    else await openRouteDraftIfRequested();
  } catch(e:any) { loadError.value = e.message; }
  finally {
    loading.value = false;
    routeDraftLoading.value = false;
  }
}

async function openRouteDraftIfRequested() {
  const contractId = route.params.contractId;
  if (typeof contractId === "string") {
    await loadEngineerProfile().catch(() => {});
    try {
      const draft = await api.printTemplates.getContractDraft(contractId);
      const template = templates.value.find((t) => t._id === draft.template_id);
      if (!template) {
        message.error("תבנית הטיוטה לא נמצאה");
        return;
      }
      await openCompose(template, draft);
    } catch(e:any) {
      if(e?.status !== 404) message.error(e.message ?? String(e));
    }
    return;
  }
  const templateId = route.params.templateId;
  if (typeof templateId !== "string") return;
  await loadEngineerProfile().catch(() => {});
  let template = templates.value.find((t) => t._id === templateId);
  if (!template) {
    try {
      template = await api.printTemplates.get(templateId);
    } catch { /* handled below */ }
  }
  if (template?.editorType === "sections") {
    await router.replace(`/print-templates/layout/${templateId}/compose`);
    return;
  }
  if (template) await openCompose(template);
}

async function loadEngineerProfile() {
  await authStore.fetchMe();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
const saving    = ref(false);
const previewing = ref(false);
const editing   = ref<PrintTemplate|null>(null);
const canMutateEditing = computed(() => !editing.value?._id || canMutateTemplate(editing.value));
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
  const source = defaultNewTemplateSource();
  if (source) {
    const clone = cloneTemplateForCreate(source);
    editing.value = {
      ...clone,
      name: clone.name || "תסקיר",
    };
    sel.value = { r1:0, c1:0, r2:0, c2:0 };
    mode.value = "design";
    return;
  }

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

function defaultNewTemplateSource(): PrintTemplate | null {
  const inspectionTemplates = templates.value.filter((template) => template.name.trim().includes("תסקיר"));
  if (!inspectionTemplates.length) return null;
  return [...inspectionTemplates].sort((a,b) => {
    const exactDiff = Number(b.name.trim() === "תסקיר") - Number(a.name.trim() === "תסקיר");
    if (exactDiff) return exactDiff;
    return Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || "");
  })[0] ?? null;
}

function cloneTemplateForCreate(template: PrintTemplate): PrintTemplate {
  return {
    ...normalizeLegacyTemplateBindings(template),
    _id: "",
    cols: template.cols.map((col) => ({...col})),
    rows: template.rows.map((row) => ({...row})),
    cells: template.cells.map((cell) => ({...cell})),
    created_at: "",
    updated_at: "",
  };
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
  confirm({
    title: "מחיקת תבנית",
    content: "האם למחוק? פעולה זו אינה הפיכה.",
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await api.printTemplates.delete(id);
        templates.value = templates.value.filter(t => t._id !== id);
        message.success("נמחק");
      } catch (e: any) {
        message.error(e.message);
      }
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
const routeContractId = computed(() => typeof route.params.contractId === "string" ? route.params.contractId : "");

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

const composeFieldLabels: Record<string, string> = {
  document_number: "מספר תסקיר",
  contract_number: "מספר חוזה",
  report_number: "מספר תסקיר",
  prev_report_number: "מספר תסקיר קודם",
  start_date: "תאריך בדיקה",
  inspection_date: "תאריך בדיקה",
  check_date: "תאריך בדיקה",
  expiry_date: "בתוקף עד",
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
  "expiry_date",
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
  if (["document_number", "report_number", "prev_report_number", "contract_number"].includes(bind)) return "report_number";
  if (["zip_code", "client_id", "serial_number"].includes(bind)) return "integer";
  if (bind.includes("amount") || bind.includes("load_capacity") || bind.includes("load_radius")) return "number";
  if (bind.startsWith("findings_") || bind.includes("description") || bind === "checked_equipment") return "multiline";
  return "text";
}

function composeFieldInputType(bind: string): string {
  const kind = composeFieldKind(baseComposeBind(bind));
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  if (kind === "number" || kind === "integer" || kind === "report_number") return "text";
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
  if (meta.kind === "report_number" && !/^\d+(?:\/\d+)?$/.test(raw)) return "יש להזין ספרות או מספר מפקח/מספר";
  if (meta.kind === "integer" && !/^\d+$/.test(raw)) return "יש להזין ספרות בלבד";
  if (meta.kind === "number" && !/^\d+(?:[.,]\d+)?(?:\s*\S+)?$/.test(raw)) return "מספר לא תקין";
  return "";
}

function isValidComposeDate(value: string): boolean {
  return Boolean(normalizeDateForContract(value));
}

function validateComposeBeforeAction(actionLabel: string): boolean {
  const errors = composeFields.value.filter((field) => field.error);
  if (!errors.length) return true;
  const names = errors.slice(0, 3).map((field) => field.label).join(", ");
  message.error(`אי אפשר ${actionLabel}: יש לתקן ${names}${errors.length > 3 ? "..." : ""}`);
  return false;
}

type ComposeDraftPayload = {
  data: Record<string, string>;
  meta?: Record<string, unknown>;
  client_id?: string | null;
  contract_id?: string | null;
  updated_at: string | null;
};

async function openCompose(t: PrintTemplate, draft?: ComposeDraftPayload) {
  composing.value = normalizeLegacyTemplateBindings(t);
  composeData.value = {};
  for (const f of composeFields.value) composeData.value[f.bind]="";
  draftSavedAt.value = null;
  draftMeta.value = {};
  mode.value = "compose";
  if (draft) applyComposeDraft(draft);
  else await loadComposeDraft();
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
  const base = baseComposeBind(bind);
  const kind = composeFieldKind(base);
  let next = value;
  if (kind === "integer") next = value.replace(/\D/g, "");
  if (kind === "report_number") next = sanitizeComposeReportNumber(value);
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
    : escHtml(cell.bind ? composeDisplayValue(cell.bind) : "");
}
const DEFAULT_CELL_FONT_SIZE = 12;

function cellFontSizeCss(cell: PrintTemplateCell | undefined): string {
  const size = cell?.fontSize;
  return `${typeof size === "number" && size > 0 ? size : DEFAULT_CELL_FONT_SIZE}px`;
}

// Per-side border styles applied to a cell style object.
function cellBorderStyle(border: PrintTemplateCell["border"]): Record<string,string> {
  const sides = resolveBorderSides(border);
  return {
    borderTop: borderSideCss(sides.top),
    borderRight: borderSideCss(sides.right),
    borderBottom: borderSideCss(sides.bottom),
    borderLeft: borderSideCss(sides.left),
  };
}

function composeCellStyle(r:number,c:number){
  const cell=getComposeCell(r,c);
  return { textAlign:cell?.align??"right", fontWeight:cell?.bold?"700":"400", color:cell?.color??"inherit", padding:"2px 4px", ...cellBorderStyle(cell?.border), verticalAlign:cell?.valign??"middle", fontSize:cellFontSizeCss(cell) };
}

async function printPdf() {
  if(!composing.value?._id) return;
  if(!exportAllowed.value) {
    message.warning("ייצוא PDF זמין במסלולי בסיסי ועסקי בלבד");
    return;
  }
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
  if(!exportAllowed.value) {
    message.warning("ייצוא PDF זמין במסלולי בסיסי ועסקי בלבד");
    return;
  }
  if(!validateComposeBeforeAction("לשמור PDF")) return;
  savingPdf.value=true;
  try {
    const saved=await api.printTemplates.savePdf(composing.value._id, collectComposeData(), {
      ...draftMeta.value,
      client_id: draftClientId(),
      contract_id: routeContractId.value || draftContractId(),
    });
    if(saved.documentId) draftMeta.value = {...draftMeta.value, document_id: saved.documentId};
    if (!(saved.blob instanceof Blob)) throw new Error("PDF save did not return a file");
    downloadBlob(saved.blob, generatedPdfFileName(collectComposeData(), composing.value.name));
    message.success(saved.savedToS3 ? "PDF נשמר ב-S3, קושר למסמכים והורד" : "PDF נשמר במסמכים והורד. S3 לא זמין או לא הוגדר");
  } catch(e:any){ message.error(e.message); }
  finally { savingPdf.value=false; }
}

async function loadComposeDraft() {
  if(!composing.value?._id) return;
  try {
    const contractId = route.params.contractId;
    const draft = typeof contractId === "string"
      ? await api.printTemplates.getDraftForContract(composing.value._id, contractId)
      : await api.printTemplates.getDraft(composing.value._id);
    applyComposeDraft(draft);
    if(draft.updated_at) message.success("נטענה טיוטה שמורה");
  } catch(e:any) {
    if(e?.status !== 404) message.error(e.message ?? String(e));
  }
}

function applyComposeDraft(draft: ComposeDraftPayload) {
  composeData.value = normalizeComposeData({...composeData.value, ...stringRecord(draft.data)});
  draftMeta.value = {
    ...(draft.meta && typeof draft.meta === "object" && !Array.isArray(draft.meta) ? draft.meta : {}),
    ...(draft.client_id ? {client_id: draft.client_id} : {}),
    ...(draft.contract_id ? {contract_id: draft.contract_id} : {}),
  };
  draftSavedAt.value = draft.updated_at;
}

async function saveComposeDraft() {
  if(!composing.value?._id) return;
  draftSaving.value=true;
  try {
    const saved = await api.printTemplates.saveDraft(composing.value._id, stringRecord(collectComposeData()), draftMeta.value);
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
    const base = baseComposeBind(k);
    const kind = composeFieldKind(base);
    if (kind === "date") data[k] = normalizeDateForDisplay(v);
    else if (kind === "report_number") data[k] = formatComposeReportNumber(v, base);
    else data[k] = v;
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
    const base = baseComposeBind(key);
    const kind = composeFieldKind(base);
    if (kind === "integer") normalized[key] = value.replace(/\D/g, "");
    else if (kind === "report_number") normalized[key] = sanitizeComposeReportNumber(value);
    else if (kind === "date") normalized[key] = normalizeDateForDisplay(value);
    else normalized[key] = value;
  }
  return normalized;
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

function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob)) throw new Error("PDF save did not return a file");
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

function generatedPdfFileName(data: Record<string, unknown>, fallback: string): string {
  const parts = [
    pickFirstString(data, ["equipment_type", "inspection_type", "contract_type", "type", "checked_equipment"]),
    pickFirstString(data, ["license_number"]),
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

function formatDraftTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

async function editContractFromDraft() {
  const contractId = routeContractId.value || draftContractId();
  if (!contractId) return;
  await router.push({
    path: "/contracts",
    query: {
      edit: contractId,
      returnTo: route.fullPath,
    },
  });
}

async function createContractFromCompose() {
  if(!composing.value?._id) return;
  if(!validateComposeBeforeAction("ליצור חוזה")) return;
  const existingContractId = routeContractId.value || draftContractId();
  if(existingContractId) {
    message.info("הטיוטה כבר מקושרת לחוזה קיים. אפשר לערוך אותה מכרטיס החוזה.");
    await router.replace(`/contracts/${existingContractId}/draft`);
    return;
  }
  const fields = stringRecord(collectComposeData());
  const expiryDate = normalizeDateForContract(
    pickField(fields, ["expiry_date", "valid_until", "בתוקף עד"])
  );
  if(!expiryDate) {
    message.error("חסר תאריך תוקף. מלא שדה expiry_date.");
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
      skip_reminders: false,
    } as any);
    draftMeta.value = {
      ...draftMeta.value,
      client_id: draftClientId(),
      contract_id: String(contract.id ?? ""),
    };
    await api.printTemplates.saveDraft(composing.value._id, stringRecord(collectComposeData()), draftMeta.value);
    message.success(`נוצר חוזה עבור ${contract.contract_number ?? composing.value.name}. ניתן ליצור תזכורת מכרטיס החוזה.`);
    if (contract.id) await router.replace(`/contracts/${contract.id}/draft`);
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

function draftContractId(): string | null {
  const value = draftMeta.value.contract_id;
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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDateParts(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if(match) {
    const dayNumber = Number(match[1]);
    const monthNumber = Number(match[2]);
    const day = String(dayNumber).padStart(2,"0");
    const month = String(monthNumber).padStart(2,"0");
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
  const style: Record<string,string> = { textAlign:cell.align??"right", fontWeight:cell.bold?"700":"400", color:cell.color??"inherit", verticalAlign:cell.valign??"middle", fontSize:cellFontSizeCss(cell) };
  if (cell.border !== undefined) Object.assign(style, cellBorderStyle(cell.border));
  if (cell.cellWidth) {
    style.width = cell.cellWidth + 'px';
    style.minWidth = cell.cellWidth + 'px';
  }
  return style;
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

// Clear the content of every selected cell (text/html/bind/image src) while
// keeping the cell's type, borders, alignment, and merge intact.
function clearSelectedCells(){
  if(!editing.value) return;
  const s=selRange.value;
  if(s.r1<0||s.c1<0) return;
  for(let r=s.r1;r<=s.r2;r++){
    for(let c=s.c1;c<=s.c2;c++){
      const cell=getCell(r,c);
      if(!cell) continue;
      delete cell.text; delete cell.html; delete cell.bind; delete cell.src; delete cell.alt;
      if(cell.type==="label") cell.text="";
    }
  }
}

function isEditableTarget(el: EventTarget | null): boolean {
  if(!(el instanceof HTMLElement)) return false;
  const tag=el.tagName;
  return tag==="INPUT" || tag==="TEXTAREA" || el.isContentEditable;
}

// ── Copy / paste selected cells ───────────────────────────────
// Clipboard holds a rectangular block of cell snapshots (r/c stripped). null =
// an empty/masked source slot, pasted as a cleared cell.
type CellSnapshot = Omit<PrintTemplateCell, "r" | "c"> | null;
const cellClipboard = ref<{ rows: number; cols: number; cells: CellSnapshot[][] } | null>(null);

function copySelectedCells(){
  if(!editing.value) return;
  const s=selRange.value;
  if(s.r1<0||s.c1<0) return;
  const rows=s.r2-s.r1+1, cols=s.c2-s.c1+1;
  const cells: CellSnapshot[][]=[];
  for(let r=s.r1;r<=s.r2;r++){
    const rowArr: CellSnapshot[]=[];
    for(let c=s.c1;c<=s.c2;c++){
      const cell=getCell(r,c);
      if(!cell || isMasked(r,c)){ rowArr.push(null); continue; }
      const {r:_r,c:_c,...rest}=cell;
      rowArr.push(JSON.parse(JSON.stringify(rest)));
    }
    cells.push(rowArr);
  }
  cellClipboard.value={rows,cols,cells};
}

function pasteCells(){
  if(!editing.value || !cellClipboard.value) return;
  const clip=cellClipboard.value;
  const startR=selRange.value.r1<0?0:selRange.value.r1;
  const startC=selRange.value.c1<0?0:selRange.value.c1;
  const maxR=editing.value.rows.length-1;
  const maxC=editing.value.cols.length-1;
  for(let dr=0;dr<clip.rows;dr++){
    for(let dc=0;dc<clip.cols;dc++){
      const tr=startR+dr, tc=startC+dc;
      if(tr>maxR||tc>maxC) continue; // don't grow the sheet; clip at edges
      const snap=clip.cells[dr][dc];
      // Remove any existing cell at the target (and unmask if it was merged).
      editing.value.cells=editing.value.cells.filter(x=>!(x.r===tr&&x.c===tc));
      if(snap===null) continue; // empty source => leave target empty
      const cloned=JSON.parse(JSON.stringify(snap)) as Omit<PrintTemplateCell,"r"|"c">;
      // Clamp spans so a pasted merge can't overflow the grid.
      if(cloned.colSpan && tc+cloned.colSpan-1>maxC) cloned.colSpan=maxC-tc+1;
      if(cloned.rowSpan && tr+cloned.rowSpan-1>maxR) cloned.rowSpan=maxR-tr+1;
      editing.value.cells.push({r:tr,c:tc,...cloned});
    }
  }
  // Select the pasted block.
  sel.value={r1:startR,c1:startC,r2:Math.min(startR+clip.rows-1,maxR),c2:Math.min(startC+clip.cols-1,maxC)};
}

function onGridKeydown(e: KeyboardEvent){
  if(inlineEdit.value) return;            // typing inside a cell
  if(isEditableTarget(e.target)) return;  // formula bar / inspector inputs
  const mod = e.ctrlKey || e.metaKey;
  if(mod && (e.key==="c"||e.key==="C")){
    if(selRange.value.r1<0) return;
    e.preventDefault(); copySelectedCells(); return;
  }
  if(mod && (e.key==="v"||e.key==="V")){
    if(!cellClipboard.value) return;
    e.preventDefault(); pasteCells(); return;
  }
  if(mod && (e.key==="x"||e.key==="X")){
    if(selRange.value.r1<0) return;
    e.preventDefault(); copySelectedCells(); clearSelectedCells(); return;
  }
  if(e.key==="Delete" || e.key==="Backspace"){
    if(selRange.value.r1<0) return;
    e.preventDefault(); clearSelectedCells();
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
// Excel-style border application. `borderPen` is the active width/style.
const borderPen = ref<PrintCellBorderStyle>("thin");
const showBorderMenu = ref(false);
const borderPens: { value: PrintCellBorderStyle; label: string }[] = [
  { value: "thin",   label: "דק" },
  { value: "medium", label: "בינוני" },
  { value: "thick",  label: "עבה" },
  { value: "double", label: "כפול" },
];

function closeBorderMenuOnOutside(){ showBorderMenu.value = false; }
watch(showBorderMenu, (open) => {
  if (open) document.addEventListener("click", closeBorderMenuOnOutside);
  else document.removeEventListener("click", closeBorderMenuOnOutside);
});
onBeforeUnmount(() => document.removeEventListener("click", closeBorderMenuOnOutside));

onMounted(() => window.addEventListener("keydown", onGridKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGridKeydown));

type BorderAction = "all" | "outer" | "inner" | "none" | BorderSide;

// Read a cell's current per-side map as a mutable object, normalizing legacy
// string/none forms so we can edit individual sides.
function cellBorderObject(cell: PrintTemplateCell): PrintCellBorderSides {
  const sides = resolveBorderSides(cell.border);
  const obj: PrintCellBorderSides = {};
  for (const side of ["top","right","bottom","left"] as BorderSide[]) {
    if (sides[side]) obj[side] = sides[side];
  }
  return obj;
}

function normalizeBorderValue(obj: PrintCellBorderSides): PrintTemplateCell["border"] {
  const sides = ["top","right","bottom","left"] as BorderSide[];
  const active = sides.filter((s) => obj[s]);
  if (active.length === 0) return "none";
  // Collapse to a shorthand string when all four sides share one style.
  if (active.length === 4) {
    const first = obj.top;
    if (first && sides.every((s) => obj[s] === first)) return first;
  }
  return { ...obj };
}

function findAnchorCell(r: number, c: number): PrintTemplateCell | undefined {
  if (!editing.value) return undefined;
  return editing.value.cells.find(cell =>
      r >= cell.r && r < cell.r + (cell.rowSpan ?? 1) &&
      c >= cell.c && c < cell.c + (cell.colSpan ?? 1)
  );
}

function resolveCell(r: number, c: number): PrintTemplateCell {
  if (isMasked(r, c)) {
    const anchor = findAnchorCell(r, c);
    if (anchor) return anchor;
  }
  let cell = getCell(r, c);
  if (!cell) {
    cell = {r, c, type: "label", text: "", align: "right"};
    editing.value!.cells.push(cell);
  }
  return cell;
}

function applyBorder(action: BorderAction){
  if(!editing.value) return;
  const s = selRange.value;
  if (s.r1 < 0 || s.c1 < 0) return;
  const pen = borderPen.value;

  if (action === "outer") {
    applyOuterBorder(s, pen);
    return;
  }

  const touched = new Set<PrintTemplateCell>();
  for(let r=s.r1;r<=s.r2;r++){
    for(let c=s.c1;c<=s.c2;c++){
      const cell = resolveCell(r, c);
      if (touched.has(cell)) continue;
      touched.add(cell);
      const cellR2 = cell.r + (cell.rowSpan ?? 1) - 1;
      const cellC2 = cell.c + (cell.colSpan ?? 1) - 1;
      const isTop = cell.r <= s.r1, isBottom = cellR2 >= s.r2;
      const isLeft = cell.c <= s.c1, isRight = cellC2 >= s.c2;

      const b = cellBorderObject(cell);
      switch(action){
        case "none": b.top=b.right=b.bottom=b.left=undefined; break;
        case "all": b.top=b.right=b.bottom=b.left=pen; break;
        case "inner":
          if(!isBottom) b.bottom=pen; if(!isTop) b.top=pen;
          if(!isRight) b.right=pen; if(!isLeft) b.left=pen;
          break;
        case "top": b.top=pen; break;
        case "bottom": b.bottom=pen; break;
        case "left": b.left=pen; break;
        case "right": b.right=pen; break;
      }
      cell.border = normalizeBorderValue(b);
    }
  }
}

function applyOuterBorder(s: { r1: number; r2: number; c1: number; c2: number }, pen: PrintCellBorderStyle) {
  const touched = new Set<PrintTemplateCell>();
  const isRtl = editing.value?.dir === "rtl";
  const startSide: BorderSide = isRtl ? "right" : "left";
  const endSide: BorderSide = isRtl ? "left" : "right";

  function apply(cell: PrintTemplateCell, side: BorderSide) {
    if (!touched.has(cell)) {
      touched.add(cell);
      (cell as any).__borderPatch = cellBorderObject(cell);
    }
    (cell as any).__borderPatch[side] = pen;
  }

  // Top edge: every column in the top row
  for (let c = s.c1; c <= s.c2; c++) {
    const cell = resolveCell(s.r1, c);
    apply(cell, "top");
    c = cell.c + (cell.colSpan ?? 1) - 1;
  }
  // Bottom edge: every column in the bottom row
  for (let c = s.c1; c <= s.c2; c++) {
    const cell = resolveCell(s.r2, c);
    apply(cell, "bottom");
    c = cell.c + (cell.colSpan ?? 1) - 1;
  }
  // Start edge (c1): rightmost column in RTL, leftmost in LTR
  for (let r = s.r1; r <= s.r2; r++) {
    const cell = resolveCell(r, s.c1);
    apply(cell, startSide);
    r = cell.r + (cell.rowSpan ?? 1) - 1;
  }
  // End edge (c2): leftmost column in RTL, rightmost in LTR
  for (let r = s.r1; r <= s.r2; r++) {
    const cell = resolveCell(r, s.c2);
    apply(cell, endSide);
    r = cell.r + (cell.rowSpan ?? 1) - 1;
  }

  // Write back
  for (const cell of touched) {
    cell.border = normalizeBorderValue((cell as any).__borderPatch);
    delete (cell as any).__borderPatch;
  }
}

function nudgeCellFontSize(delta:number){
  forEachSel(c=>({ fontSize: clampFontSize((c.fontSize ?? DEFAULT_CELL_FONT_SIZE) + delta) }));
}
function setCellFontSize(size:number){ forEachSel(()=>({ fontSize: clampFontSize(size) })); }

function setCellWidth(w: number | undefined) {
  forEachSel(() => ({cellWidth: w && w >= 40 ? w : undefined} as any));
}
function clampFontSize(size:number):number{ return Math.min(48, Math.max(6, Math.round(size))); }
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
  const initialHtml = cell.type==="label"?richCellHtml(cell):escHtml(cell.bind??"");
  inlineVal.value = initialHtml;
  // Set the content imperatively (uncontrolled). Binding v-html to a live
  // contenteditable fights the browser's caret and corrupts bidi/RTL order.
  nextTick(()=>{
    const el = inlineEl.value[0];
    if(!el) return;
    el.innerHTML = initialHtml;
    el.focus();
    // Put the caret at the end of the existing text.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

function onInlineEnter(e: KeyboardEvent){
  if(!inlineEdit.value) return;
  const cell=getCell(inlineEdit.value.r, inlineEdit.value.c);
  // Ctrl/Cmd/Shift+Enter always commits. Plain Enter commits for non-label
  // cells; for label cells it inserts a newline (multi-line labels).
  if(e.ctrlKey || e.metaKey || e.shiftKey){ e.preventDefault(); commitInline(); return; }
  if(cell?.type !== "label"){ e.preventDefault(); commitInline(); }
  // else: let the browser insert a line break inside the label.
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

// ── Resize individual cell width ─────────────────────────────────────────────
const resizeCell = ref<{ r: number, c: number, x: number, w: number } | null>(null);

function startCellResize(e: MouseEvent, r: number, c: number) {
  if (!editing.value) return;
  const cell = getCell(r, c);
  const colSpan = cell?.colSpan ?? 1;
  const baseW = cell?.cellWidth || editing.value.cols.slice(c, c + colSpan).reduce((s, col) => s + col.w, 0);
  resizeCell.value = {r, c, x: e.clientX, w: baseW};
  window.addEventListener("mousemove", onCellResizeMove);
  window.addEventListener("mouseup", stopCellResize);
}

function onCellResizeMove(e: MouseEvent) {
  if (!resizeCell.value || !editing.value) return;
  const dx = resizeCell.value.x - e.clientX; // RTL: drag left = wider
  const newW = Math.max(40, resizeCell.value.w + dx);
  let cell = getCell(resizeCell.value.r, resizeCell.value.c);
  if (!cell) {
    cell = {r: resizeCell.value.r, c: resizeCell.value.c, type: "label", text: "", align: "right"};
    editing.value!.cells.push(cell);
  }
  cell.cellWidth = newW;
}

function stopCellResize() {
  resizeCell.value = null;
  window.removeEventListener("mousemove", onCellResizeMove);
  window.removeEventListener("mouseup", stopCellResize);
}
</script>

<style scoped>
/* ── Page shell ───────────────────────────────────────────────────────────── */
.ptp { padding: 24px; height: 100%; display: flex; flex-direction: column; }

.pt-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.pt-breadcrumb a {
  color: var(--brand-color);
  text-decoration: none;
}

.pt-breadcrumb a:hover {
  opacity: 0.75;
}

.pt-breadcrumb .sep {
  color: var(--text-secondary);
  font-size: 16px;
}

.pt-breadcrumb span:last-child {
  color: var(--text-secondary);
}

/* ── Template list (app-themed cards) ─────────────────────────── */
.pt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.pt-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.pt-card:hover { border-color: var(--brand-color); box-shadow: var(--shadow-sm); }
.pt-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.pt-card__name {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.pt-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 12px 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}
.pt-stat { font-size: 13px; color: var(--text-secondary); }
.pt-stat strong { color: var(--text-primary); font-weight: 700; font-size: 15px; margin-inline-end: 3px; }
.pt-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* Buttons + tags mirrored from the app card style */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}
.btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--xs { padding: 4px 10px; font-size: 12px; }
.btn--ghost { background: transparent; font-weight: 600; }
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 700;
}
.btn--primary:hover { background: var(--brand-color-hover); border-color: var(--brand-color-hover); }
.btn--danger {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}
.btn--danger:hover { background: rgba(208, 48, 80, 0.08); }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.tag--neutral { background: var(--bg-elevated); color: var(--text-secondary); border-color: var(--border-color); }
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
.compose-draft-status {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
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
.pane-label--with-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
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
  position: relative;
  background: #fff;
}
.xl-cell:hover:not(.xl-cell--active) { background: #f5f5f5; }
.xl-cell--sel    { background: #c6efce !important; }
.xl-cell--active { border: 2px solid #217346 !important; background: #fff !important; padding: 1px 4px; }
.xl-cell--field  { background: #fff8e1; }
.xl-cell--image  { background: #eef6ff; }
.xl-cell--sel.xl-cell--field { background: #c6efce !important; }
.xl-cell--sel.xl-cell--image { background: #c6efce !important; }

.xl-cell-resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
  z-index: 6;
}

.xl-cell-resize:hover {
  background: #21734688;
}

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
.xl-type-btns--wrap { flex-wrap: wrap; }

/* ── Excel-style border dropdown ─────────────────────────────── */
.xl-border-group { position: relative; }
.xl-border-btn { white-space: nowrap; }
.xl-border-menu {
  position: absolute; top: calc(100% + 4px); inset-inline-start: 0;
  z-index: 50; width: 230px; padding: 10px;
  background: #fff; border: 1px solid #b0b0b0; border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.18); direction: rtl;
}
.xl-border-menu__label { font-size: 11px; color: #777; margin: 4px 2px 6px; font-weight: 600; }
.xl-border-pens { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px; }
.xl-border-pen {
  display: flex; align-items: center; gap: 6px; padding: 5px 7px;
  border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer;
  font-size: 12px; color: #333;
}
.xl-border-pen:hover { background: #eef6ef; border-color: #217346; }
.xl-border-pen.active { background: #217346; color: #fff; border-color: #217346; }
.xl-border-pen__preview { width: 34px; height: 0; flex: 0 0 auto; }
.xl-border-pen__preview[data-pen="thin"]   { border-top: 1px solid currentColor; }
.xl-border-pen__preview[data-pen="medium"] { border-top: 2px solid currentColor; }
.xl-border-pen__preview[data-pen="thick"]  { border-top: 3px solid currentColor; }
.xl-border-pen__preview[data-pen="double"] { border-top: 3px double currentColor; }
.xl-border-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.xl-border-act {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer;
  font-size: 12px; color: #333;
}
.xl-border-act:hover { background: #eef6ef; border-color: #217346; }
.xl-bico { width: 18px; height: 18px; flex: 0 0 auto; border: 1px dashed #bbb; box-sizing: border-box; }
.xl-bico--all    { border: 1px solid #333; box-shadow: inset 0 0 0 1px #333; }
.xl-bico--outer  { border: 2px solid #333; }
.xl-bico--inner  { border: 1px dashed #ccc; box-shadow: inset 0 0 0 6px #fff, inset 0 0 0 7px #333; }
.xl-bico--none   { border: 1px dashed #ddd; }
.xl-bico--top    { border: 1px dashed #ddd; border-top: 2px solid #333; }
.xl-bico--bottom { border: 1px dashed #ddd; border-bottom: 2px solid #333; }
.xl-bico--right  { border: 1px dashed #ddd; border-right: 2px solid #333; }
.xl-bico--left   { border: 1px dashed #ddd; border-left: 2px solid #333; }
.xl-fontsize-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.xl-fontsize-input { width: 56px; text-align: center; }
.xl-fontsize-unit { font-size: 12px; color: #666; }
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
