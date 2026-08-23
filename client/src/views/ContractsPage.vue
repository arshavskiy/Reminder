<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div>
        <h1 class="page__title">{{ kind === "inspection" ? "ניהול תסקירים" : "ניהול חוזים" }}</h1>
<!--        <p class="page__sub">-->
          צפייה, סינון וניהול של כל ה{{ kind === "inspection" ? "תסקירים" : "חוזים" }} במערכת
<!--        </p>-->
      </div>
      <div class="page__actions">
        <div class="page__actions-row page__actions-row--main">
          <button class="btn btn--primary" @click="openCreate">
            {{ kind === "inspection" ? "תסקיר חדש" : "חוזה חדש" }}
          </button>
          <button
              v-if="kind === 'inspection' && canOpenPrintTemplates"
              class="btn btn--ghost"
              @click="router.push('/print-templates')"
          >
            תבניות הדפסה
          </button>
          <div class="bulk-action-anchor">
            <button
                :class="{ 'btn--ghost-active': bulkMode }"
                class="btn btn--ghost"
                title="בחירה מרובה"
                @click="toggleBulkMode"
            >
              ☑ בחירה מרובה
              <span v-if="selectedIds.size">({{ selectedIds.size }})</span>
            </button>
            <button
                v-if="bulkMode && contractItems.length"
                class="btn btn--ghost"
                @click="selectAll"
            >
              {{ selectedIds.size === contractItems.length ? 'בטל הכל' : 'בחר הכל' }}
            </button>
            <div v-if="bulkMode && selectedIds.size > 0" class="bulk-action-anchor__actions">
              <button
                  :disabled="bulkSending"
                  class="bulk-action-item bulk-action-item--primary"
                  :class="{ 'bulk-action-item--loading': bulkSending }"
                  @click="bulkSendReminders"
              >
                <n-icon class="bulk-action-item__icon" :component="PaperPlaneOutline"/>
                <span class="bulk-action-item__text">שלח התראות</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
              <button
                  :disabled="bulkGeneratingReminders"
                  class="bulk-action-item bulk-action-item--primary"
                  :class="{ 'bulk-action-item--loading': bulkGeneratingReminders }"
                  title="צור תזכורת לכל התסקירים הנבחרים"
                  @click="bulkCreateRemindersForSelected"
              >
                <n-icon class="bulk-action-item__icon" :component="NotificationsOutline"/>
                <span class="bulk-action-item__text">צור תזכורת לנבחרים</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
              <button
                  :disabled="bulkDeleting"
                  class="bulk-action-item bulk-action-item--danger"
                  :class="{ 'bulk-action-item--loading': bulkDeleting }"
                  @click="bulkDelete"
              >
                <n-icon class="bulk-action-item__icon" :component="TrashOutline"/>
                <span class="bulk-action-item__text">מחק נבחרים</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
            </div>
          </div>
          <button class="btn btn--ghost" @click="openMonthlyReport" title="הורדת דוח חודשי">
            <n-icon :component="DocumentTextOutline" class="btn-icon"/>
            דוח חודשי
          </button>
          <button class="btn btn--ghost" @click="router.push('/documents')">
            <n-icon :component="ArchiveOutline" class="btn-icon"/>
            ארכיון
          </button>
          <button class="btn btn--ghost" :disabled="store.loading" @click="refresh" title="רענן">
            <n-icon :class="{ 'refresh-icon--spin': store.loading }" :component="RefreshOutline" class="btn-icon"/>
            רענן
          </button>
          <button
              v-if="contractsMissingReminder.length > 0"
              :disabled="bulkGeneratingReminders"
              class="btn btn--primary"
              :class="{ 'btn--loading': bulkGeneratingReminders }"
              title="יצירת תזכורת לכל התסקירים עם אימייל שאין להם תזכורת"
              @click="generateMissingReminders"
          >
            <n-icon :component="NotificationsOutline" class="btn-icon"/>
            צור תזכורות חסרות ({{ contractsMissingReminder.length }})
          </button>
          <button v-if="isAdmin && store.rows.length > 0" class="btn btn--danger-ghost"
                  @click="showDeleteAllConfirm = true">
            <n-icon :component="TrashOutline" class="btn-icon"/>
            מחק הכל
          </button>
        </div>
      </div>
    </header>

    <!-- ── Unified filter bar ─────────────────────────────────────────── -->
    <div class="filterbar filterbar--compact">
      <button
          v-for="f in combinedFilters"
          :key="f.key"
          class="pill pill--compact"
          :class="{ 'pill--active': activeFilterKey === f.key }"
          @click="applyFilter(f)"
      >
        {{ f.label }}
        <span class="pill__badge">{{ f.count }}</span>
      </button>
    </div>

    <!-- ── Secondary controls row ──────────────────────────────────────── -->
    <div class="toolbar">
      <input
          v-model="search"
          class="search"
          type="search"
          :placeholder="kind === 'inspection' ? 'חיפוש לפי לקוח, מספר תסקיר, ציוד...' : 'חיפוש לפי לקוח, מספר חוזה...'"
      />
      <div class="toolbar__right">
        <n-select
            v-model:value="filterClientId"
            :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]"
            :virtual-scroll="false"
            clearable
            filterable
            placeholder="סינון לפי לקוח"
            style="width: 200px"
            @update:value="() => {}"
        />
        <n-date-picker
            v-model:value="filterDateRange"
            clearable
            placeholder="סינון לפי תאריך תפוגה"
            style="width: 260px"
            type="daterange"
            @update:value="() => {}"
        />
      </div>
    </div>

    <!-- ── Card list ───────────────────────────────────────────────────── -->
    <n-spin :show="store.loading || draftsLoading">
      <n-virtual-list
          v-if="visibleItems.length"
          :item-size="280"
          :items="pagedItems"
          :item-resizable="true"
          class="cards-vlist"
          item-class="cards-vlist__item"
      >
        <template #default="{ item }">
          <div class="cards-vlist__pad">
            <ContractCard
                v-if="item.__type === 'contract'"
                :key="item.row.id"
                :bulk-mode="bulkMode"
                :kind="kind"
                :inspector-number="engineerProfile?.inspector_number"
                :reminders="remindersFor(String(item.row.id))"
                :row="item.row"
                :selected="selectedIds.has(String(item.row.id))"
                :creating-reminder="creatingReminderFor"
                :issues="contractIssues(item.row)"
                :sending-reminder="sendingReminder"
                @delete="confirmDelete"
                @edit="openEdit"
                @add-reminder="openAddReminder"
                @create-reminder="createContractReminder"
                @dismiss-reminder="dismissReminder"
                @delete-reminder="deleteReminderFromCard"
                @open-template="openContractInTemplate"
                @open-document="openDoc"
                @send-reminder="sendReminderNow"
                @send-card="sendFromCard"
                @toggle-select="toggleSelect"
            />
            <article v-else class="draft-card" @click="openDraftInTemplate(item.draft)">
              <div class="draft-card__row">
                <div>
                  <div class="draft-card__title">{{ item.draft.contract_number || item.draft.template_name }}</div>
                  <div class="draft-card__sub">{{ item.draft.contract_type || "טיוטת תסקיר" }}</div>
                </div>
                <span class="tag tag--info">טיוטה</span>
              </div>
              <div class="draft-card__body">
                <span class="kv"><strong>לקוח:</strong> {{
                    item.draft.client_name || draftField(item.draft, ["client_company", "client_name"]) || "-"
                  }}</span>
                <span class="kv"><strong>תבנית:</strong> {{ item.draft.template_name }}</span>
                <span class="kv"><strong>עודכן:</strong> {{ formatDraftDate(item.draft.updated_at) }}</span>
              </div>
              <div class="card__secondary-actions">
                <button class="btn btn--xs btn--ghost" @click.stop="openDraftInTemplate(item.draft)">
                  פתח בתבנית
                </button>
                <button
                    v-if="item.draft.contract_id && draftContractHasNoReminder(item.draft)"
                    :disabled="creatingReminderFor === item.draft.contract_id"
                    class="btn btn--xs btn--primary"
                    :class="{ 'btn--loading': creatingReminderFor === item.draft.contract_id }"
                    @click.stop="createDraftReminder(item.draft)"
                >
                  <n-icon :component="NotificationsOutline" class="btn-icon"/>
                  צור תזכורת
                </button>
                <button
                    :disabled="deletingDraftId === item.draft._id"
                    class="btn btn--xs btn--danger"
                    :class="{ 'btn--loading': deletingDraftId === item.draft._id }"
                    @click.stop="deleteDraft(item.draft)"
                >
                  <n-icon :component="TrashOutline" class="btn-icon"/>
                  מחק
                </button>
              </div>
            </article>
          </div>
        </template>
      </n-virtual-list>

      <div v-if="visibleItems.length" class="pagination-bar">
        <span class="pagination-summary">
          מציג {{ pageStart + 1 }}-{{ pageEnd }} מתוך {{ visibleItems.length }}
        </span>
        <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="visibleItems.length"
            :page-sizes="[5, 10, 20, 50]"
            show-size-picker
        />
      </div>

      <div v-if="!visibleItems.length" class="empty">
        <p>אין {{ activeFilterKey === "drafts" ? "טיוטות שמורות" : kind === "inspection" ? "תסקירים" : "חוזים" }}
          להצגה</p>
        <button class="btn btn--primary" style="margin-top:12px" @click="openCreate">
          + {{ kind === "inspection" ? "הוסף תסקיר ראשון" : "הוסף חוזה ראשון" }}
        </button>
      </div>
    </n-spin>

    <MonthlyReportModal v-model:show="showMonthlyReport" @open-export="openExportFromMonthlyReport"/>
    <!-- ── Export wizard modal ──────────────────────────────────────────── -->
    <n-modal v-model:show="showExport" preset="card" style="width:640px; max-width:95vw" :mask-closable="false">
      <template #header>
        <div class="export-header">
          <span>ייצוא חוזים ותסקירים</span>
          <div class="export-steps">
            <div v-for="(s, i) in exportSteps" :key="s.key" class="export-step"
                 :class="{ 'export-step--active': exportStep === i, 'export-step--done': exportStep > i }">
              <div class="export-step__dot">{{ exportStep > i ? '✓' : i + 1 }}</div>
              <span class="export-step__label">{{ s.label }}</span>
              <div v-if="i < exportSteps.length - 1" class="export-step__line"/>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 0: סינון -->
      <div v-if="exportStep === 0" class="export-body">
        <h3 class="export-section-title">&#x25BD; סינון בדיקות לייצוא</h3>
        <n-grid :cols="exportGridCols" :x-gap="16" :y-gap="12">
          <n-gi>
            <n-form-item label="לקוח">
              <n-select v-model:value="exportFilter.client_id"
                        :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]" :virtual-scroll="false"
                        clearable/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סטטוס">
              <n-select v-model:value="exportFilter.status"
                        :options="[{ label: 'כל הסטטוסים', value: null }, ...statusOptions]" :virtual-scroll="false"
                        clearable/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סוג בדיקה">
              <n-select v-model:value="exportFilter.contract_type"
                        :options="[{ label: 'כל הסוגים', value: null }, ...contractTypeOptions]" :virtual-scroll="false"
                        clearable/>
            </n-form-item>
          </n-gi>
          <n-gi :span="exportGridCols">
            <n-form-item label="טווח תאריכים">
              <n-date-picker v-model:value="exportFilter.dateRange" type="daterange" clearable style="width:100%"/>
            </n-form-item>
          </n-gi>
        </n-grid>
      </div>

      <!-- Step 1: עמודות -->
      <div v-if="exportStep === 1" class="export-body">
        <h3 class="export-section-title">בחר עמודות לייצוא</h3>
        <div class="col-grid">
          <label v-for="col in exportColumns" :key="col.key" class="col-check">
            <n-checkbox v-model:checked="col.selected"/>
            <span>{{ col.label }}</span>
          </label>
        </div>
      </div>

      <!-- Step 2: פורמט -->
      <div v-if="exportStep === 2" class="export-body">
        <h3 class="export-section-title">בחר פורמט ייצוא</h3>
        <div class="format-cards">
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'csv' }"
               @click="exportFormat = 'csv'">
            <div class="format-card__icon">🧾</div>
            <div class="format-card__name">CSV</div>
            <div class="format-card__desc">קובץ נתונים פשוט לפתיחה בכל מערכת</div>
          </div>
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'xlsx' }"
               @click="exportFormat = 'xlsx'">
            <div class="format-card__icon">📊</div>
            <div class="format-card__name">Excel (.xlsx)</div>
            <div class="format-card__desc">גיליון Excel עם כיוון מימין לשמאל</div>
          </div>
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'pdf' }"
               @click="exportFormat = 'pdf'">
            <div class="format-card__icon">📄</div>
            <div class="format-card__name">PDF</div>
            <div class="format-card__desc">דף מודפס בעברית</div>
          </div>
        </div>
      </div>

      <!-- Step 3: ייצוא -->
      <div v-if="exportStep === 3" class="export-body export-body--summary">
        <div class="export-summary">
          <div class="export-summary__icon">📊</div>
          <div class="export-summary__text">
            <strong>{{ exportedRows.length }}</strong> רשומות יוצאו
          </div>
          <div class="export-summary__sub">
            {{ selectedExportColumns.map(c => c.label).join(' · ') }}
          </div>
        </div>
      </div>

      <template #footer>
        <n-space justify="space-between">
          <n-button @click="showExport = false">ביטול</n-button>
          <n-space>
            <n-button v-if="exportStep > 0 && exportStep < 3" @click="exportStep--">חזור</n-button>
            <n-button v-if="exportStep < 2" type="primary" @click="exportStep++">המשך ›</n-button>
            <n-button v-if="exportStep === 2" type="primary" @click="doExport">ייצא</n-button>
            <n-button v-if="exportStep === 3" type="primary" @click="showExport = false">סגור</n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <!-- ── Create / Edit modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showForm" :title="editingId ? 'עריכת תסקיר / חוזה' : 'תסקיר / חוזה חדש'" preset="card"
             style="width: 600px; max-width: 95vw" :mask-closable="false">
      <n-form label-placement="top" :model="form">
        <n-grid :cols="formGridCols" :x-gap="16">
          <n-gi>
            <n-form-item label="מספר תסקיר / חוזה">
              <n-input v-model:value="form.contract_number" placeholder="לדוגמה: 15935"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סוג">
              <n-select
                  v-model:value="form.contract_type"
                  :options="contractTypeOptions"
                  clearable
                  filterable
                  tag
                  placeholder="בחר או הקלד"
              />
            </n-form-item>
          </n-gi>

          <n-gi :span="formGridCols">
            <n-form-item label="לקוח">
              <n-select
                  v-model:value="form.client_id"
                  :options="clientOptions"
                  clearable
                  filterable
                  placeholder="חיפוש לקוח..."
                  :loading="loadingClients"
              />
            </n-form-item>
          </n-gi>

          <n-gi>
            <n-form-item label="תאריך תסקיר">
              <n-input v-model:value="form.start_date" type="text" placeholder="YYYY-MM-DD"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="תאריך תפוגה / בדיקה הבאה">
              <n-input v-model:value="form.expiry_date" type="text" placeholder="YYYY-MM-DD"/>
            </n-form-item>
          </n-gi>

          <!--          <n-gi>-->
          <!--            <n-form-item label="סכום">-->
          <!--              <n-input-number v-model:value="form.amount" placeholder="0" style="width:100%" :show-button="false" />-->
          <!--            </n-form-item>-->
          <!--          </n-gi>-->
          <!--          <n-gi>-->
          <!--            <n-form-item label="מטבע">-->
          <!--              <n-select v-model:value="form.currency" :options="currencyOptions" />-->
          <!--            </n-form-item>-->
          <!--          </n-gi>-->

          <n-gi>
            <n-form-item label="סטטוס">
              <n-select v-model:value="form.status" :options="statusOptions"/>
            </n-form-item>
          </n-gi>
          <!--          <n-gi>-->
          <!--            <n-form-item label="צד שכנגד">-->
          <!--              <n-input v-model:value="form.counterparty" placeholder="שם החברה / איש קשר" />-->
          <!--            </n-form-item>-->
          <!--          </n-gi>-->

          <n-gi :span="formGridCols">
            <n-form-item label="סיכום / הערות">
              <n-input v-model:value="form.summary" type="textarea" :rows="3" placeholder="תיאור קצר..."/>
            </n-form-item>
          </n-gi>

          <n-gi :span="formGridCols">
            <n-divider style="margin: 4px 0 12px" title-placement="right">ציוד (יישלח בתזכורת)</n-divider>
          </n-gi>
          <n-gi>
            <n-form-item label="קטגוריה">
              <n-select
                  v-model:value="form.equipment.category"
                  :options="equipmentCategoryOptions"
                  clearable
                  placeholder="בחר קטגוריה"
              />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="יצרן">
              <n-input v-model:value="form.equipment.manufacturer" placeholder="יצרן"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="דגם">
              <n-input v-model:value="form.equipment.model" placeholder="דגם"/>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label='מס"ד סידורי'>
              <n-input v-model:value="form.equipment.serial_number" placeholder='מס"ד סידורי'/>
            </n-form-item>
          </n-gi>
        </n-grid>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showForm = false">ביטול</n-button>
          <n-button type="primary" :loading="saving" @click="saveForm">
            {{ editingId ? "שמור שינויים" : "צור" }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- ── Delete confirm modal ────────────────────────────────────────── -->
    <n-modal
        v-model:show="showDeleteConfirm"
        :class="confirmDialogClass"
        :negative-button-props="confirmCancelButtonProps"
        :positive-button-props="confirmActionButtonProps('error')"
        :show-icon="false"
        preset="dialog"
        type="error"
        :positive-text="'מחק'"
        :negative-text="'ביטול'"
        @positive-click="doDelete"
        @negative-click="showDeleteConfirm = false"
    >
      <template #header>
        <ConfirmDialogHead title="מחיקת רשומה"/>
      </template>
      <p>האם למחוק את הרשומה <strong>{{ deletingRow?.contract_number ?? deletingRow?.contract_type ?? "זו" }}</strong>?
      </p>
      <n-checkbox v-model:checked="deleteRelatedReminders" style="margin: 8px 0 4px">
        מחק גם תזכורות ואימיילים קשורים
      </n-checkbox>
      <p style="font-size:13px; color:var(--text-secondary)">
        פעולה זו אינה הפיכה. {{
          deleteRelatedReminders ? "התזכורות ורישומי האימייל הקשורים יימחקו גם כן." : "התזכורות ורישומי האימייל הקשורים יישארו במערכת."
        }}
      </p>
    </n-modal>

    <n-modal
        v-model:show="showBulkDeleteConfirm"
        :closable="!bulkDeleting"
        :mask-closable="!bulkDeleting"
        aria-describedby="bulk-delete-desc"
        aria-labelledby="bulk-delete-title"
        class="delete-records-modal"
        preset="card"
        role="alertdialog"
        style="width: 460px; max-width: 95vw"
    >
      <template #header>
        <div class="del-modal__head">
          <span aria-hidden="true" class="del-modal__icon">
            <n-icon :component="WarningOutline" :size="22"/>
          </span>
          <div class="del-modal__head-text">
            <h2 id="bulk-delete-title" class="del-modal__title">מחיקת רשומות</h2>
            <p class="del-modal__sub">פעולה סופית · לא ניתן לשחזר</p>
          </div>
        </div>
      </template>

      <div class="del-modal" dir="rtl">
        <p id="bulk-delete-desc" class="del-modal__lead">{{ bulkDeleteLead }}</p>

        <div class="del-modal__count" aria-hidden="true">
          <strong>{{ selectedIds.size }}</strong>
          <span>{{ bulkDeleteNoun }}</span>
        </div>

        <ul v-if="selectedDeletePreview.length" class="del-modal__list">
          <li v-for="row in selectedDeletePreview" :key="row.id" class="del-modal__item">
            <span class="del-modal__item-num">{{ row.contract_number || "ללא מספר" }}</span>
            <span class="del-modal__item-name">{{ row.client_name || "ללא לקוח" }}</span>
            <span v-if="row.contract_type" class="tag tag--neutral">{{ row.contract_type }}</span>
          </li>
        </ul>
        <p v-if="selectedDeleteOverflow > 0" class="del-modal__more">
          ועוד {{ selectedDeleteOverflow }} {{ bulkDeleteNoun }}
        </p>

        <n-checkbox
            v-model:checked="bulkDeleteRelatedReminders"
            :class="{ 'del-modal__option--on': bulkDeleteRelatedReminders }"
            :disabled="bulkDeleting"
            class="del-modal__option"
        >
          <span class="del-modal__option-text">
            <strong>מחק גם תזכורות ואימיילים קשורים</strong>
            <small>{{ bulkDeleteRelatedHint }}</small>
          </span>
        </n-checkbox>

        <p class="del-modal__warn" role="note">
          <n-icon :component="TrashOutline" :size="16"/>
          <span>המחיקה סופית. לא ניתן לשחזר את הרשומות לאחר האישור.</span>
        </p>
      </div>

      <template #footer>
        <div class="del-modal__actions">
          <button
              class="btn del-modal__btn"
              type="button"
              :disabled="bulkDeleting"
              @click="showBulkDeleteConfirm = false"
          >
            ביטול
          </button>
          <button
              class="btn btn--danger-solid del-modal__btn"
              type="button"
              :class="{ 'btn--loading': bulkDeleting }"
              :disabled="bulkDeleting || !selectedIds.size"
              @click="doBulkDelete"
          >
            מחק {{ selectedIds.size }} {{ bulkDeleteNoun }}
          </button>
        </div>
      </template>
    </n-modal>

    <!-- ── Delete all confirm modal ──────────────────────────────────── -->
    <n-modal
        v-model:show="showDeleteAllConfirm"
        :class="confirmDialogClass"
        :negative-button-props="confirmCancelButtonProps"
        :positive-button-props="confirmActionButtonProps('error')"
        :show-icon="false"
        preset="dialog"
        type="error"
        :positive-text="'מחק הכל'"
        :negative-text="'ביטול'"
        @positive-click="doDeleteAll"
        @negative-click="showDeleteAllConfirm = false"
    >
      <template #header>
        <ConfirmDialogHead title="מחיקת כל הרשומות"/>
      </template>
      <p>למחוק את כל <strong>{{ store.rows.length }}</strong> הרשומות? פעולה זו אינה הפיכה.</p>
      <n-checkbox v-model:checked="deleteAllRelatedReminders" style="margin: 8px 0 4px">
        מחק גם את כל התזכורות הקשורות
      </n-checkbox>
    </n-modal>

    <!-- ── Add reminder modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showAddReminder" preset="dialog" :show-icon="false" style="width:480px"
             title="הוסף תזכורת לתסקיר">
      <n-form v-if="reminderForm" label-placement="top">
        <n-form-item label="כותרת" required>
          <n-input v-model:value="reminderForm.title" placeholder="לדוגמה: תזכורת בדיקה הבאה"/>
        </n-form-item>
        <n-form-item label="תאריך שליחה" required>
          <n-date-picker v-model:value="reminderForm.triggerDateMs" style="width:100%" type="date"/>
        </n-form-item>
        <n-form-item label="אימייל נמען">
          <n-input v-model:value="reminderForm.emailTo" placeholder="email@example.com"/>
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" label="תבנית אימייל">
          <n-select
              v-model:value="reminderForm.email_template_id"
              :options="emailTemplateOptions"
              :virtual-scroll="false"
              clearable
              placeholder="ברירת מחדל"
          />
        </n-form-item>
        <n-form-item label="הערה">
          <n-input v-model:value="reminderForm.body" :rows="2" type="textarea"/>
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showAddReminder = false">ביטול</n-button>
        <n-button :loading="savingReminder" type="primary" @click="saveReminder">צור תזכורת</n-button>
      </template>
    </n-modal>

    <!-- Hydraulic check modal (shared component) -->
    <HydraulicCheckModal
        ref="hydraulicModalRef"
        v-model:show="showHydraulicCheck"
        @created="store.fetch(true)"
        @updated="store.fetch(true)"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {
  NButton,
  NCheckbox,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NIcon,
  NInput,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NVirtualList,
  useMessage,
} from "naive-ui";
import {
  ArchiveOutline,
  DocumentTextOutline,
  NotificationsOutline,
  PaperPlaneOutline,
  RefreshOutline,
  TrashOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import {useContractsStore} from "../stores/contracts.js";
import {useFeaturesStore} from "../stores/features.js";
import {storeToRefs} from "pinia";
import {useAuthStore} from "../stores/auth.js";
import {useHydraulicCheckDraftStore} from "../stores/hydraulicCheckDraft.js";
import {useEngineerStore} from "../stores/engineer.js";
import type {HydraulicCheckRequest, PrintTemplateDraftSummary} from "../services/apiService.js";
import {api} from "../services/apiService.js";
import ContractCard from "../components/contracts/ContractCard.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import {FEATURES} from "../shared/features.js";
import type {
  ContractWithClient,
  EmailTemplate,
  Equipment,
  EquipmentCategory,
  PrintTemplate,
  ReminderWithContext
} from "@shared/types.js";
import {contractRowHasEmail} from "@shared/contractEmail.js";
import {
  contractReportNumber,
  countDuplicateReportRows,
  duplicateReportNumberSet,
  isDuplicateReportNumber,
  listContractRowIssues,
} from "@shared/rowIssues.js";
import {readRememberedFilter, writeRememberedFilter} from "@shared/rememberedUi.js";
import {joinStackedValues} from "@shared/printTemplateLayout.js";
import {confirmActionButtonProps, confirmCancelButtonProps, CONFIRM_DIALOG_CLASS, useConfirm} from "../composables/useConfirm.js";
import ConfirmDialogHead from "../components/ConfirmDialogHead.vue";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const store = useContractsStore();
const featuresStore = useFeaturesStore();
const authStore = useAuthStore();
const engineerStore = useEngineerStore();
const {profile: engineerProfile} = storeToRefs(engineerStore);
const isAdmin = computed(() => authStore.isAdmin);
const hydraulicDraftStore = useHydraulicCheckDraftStore();
const route = useRoute();
const router = useRouter();
const message = useMessage();
const canSelectEmailTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.emailTemplates));
const canOpenPrintTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.printTemplates));

const statusFilter = ref<string | null>(null);
const kind = ref<"contract" | "inspection" | "all">("inspection");
type DueFilter = "all" | "overdue" | "month" | "sent" | "no_email" | "has_reminder" | "duplicate_report_number";
const dueFilter = ref<DueFilter>("all");
const showDraftsOnly = ref(false);

const CONTRACT_STATUS_FILTERS: Record<string, string | null> = {
  all: null,
  draft: "draft",
  active: "active",
  expired: "expired",
  cancelled: "cancelled",
};
const CONTRACT_DUE_FILTERS: Record<string, DueFilter> = {
  month: "month",
  sent: "sent",
  no_email: "no_email",
  has_reminder: "has_reminder",
  duplicate_report_number: "duplicate_report_number",
};

function hydrateContractFilter(key: string): string {
  if (key in CONTRACT_STATUS_FILTERS) {
    showDraftsOnly.value = false;
    statusFilter.value = CONTRACT_STATUS_FILTERS[key];
    dueFilter.value = "all";
    return key;
  }
  if (key in CONTRACT_DUE_FILTERS) {
    showDraftsOnly.value = false;
    statusFilter.value = null;
    dueFilter.value = CONTRACT_DUE_FILTERS[key];
    return key;
  }
  if (key === "drafts") {
    showDraftsOnly.value = true;
    statusFilter.value = null;
    dueFilter.value = "all";
    return key;
  }
  showDraftsOnly.value = false;
  statusFilter.value = null;
  dueFilter.value = "all";
  return "all";
}

const activeFilterKey = ref(hydrateContractFilter(readRememberedFilter("contracts")));
const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const isMobile = ref(false);
const page = ref(1);
const pageSize = ref(10);
const formGridCols = computed(() => isMobile.value ? 1 : 2);
const hydraulicGridCols = computed(() => isMobile.value ? 1 : 4);
const exportGridCols = computed(() => isMobile.value ? 1 : 3);
const templateDrafts = ref<PrintTemplateDraftSummary[]>([]);
const draftsLoading = ref(false);
type ContractListItem = { __type: "contract"; row: ContractWithClient };
type DraftListItem = { __type: "draft"; draft: PrintTemplateDraftSummary };
type ListItem = ContractListItem | DraftListItem;

function updateViewport() {
  isMobile.value = window.innerWidth <= 720;
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

// ── Bulk select ───────────────────────────────────────────────────────────────
const bulkMode = ref(false);
const selectedIds = ref(new Set<string>());
const bulkDeleting = ref(false);
const bulkSending = ref(false);
const showBulkDeleteConfirm = ref(false);
const bulkDeleteRelatedReminders = ref(false);

const contractItems = computed(() =>
    visibleItems.value.filter((i): i is ContractListItem => i.__type === "contract")
);

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedIds.value = new Set();
}

function selectAll() {
  if (selectedIds.value.size === contractItems.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(contractItems.value.map((i) => String(i.row.id)));
  }
}

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedIds.value = s;
}

const BULK_DELETE_PREVIEW_LIMIT = 5;

const selectedDeleteRows = computed(() =>
    (store.rows ?? []).filter((row) => selectedIds.value.has(String(row.id)))
);

const selectedDeletePreview = computed(() =>
    selectedDeleteRows.value.slice(0, BULK_DELETE_PREVIEW_LIMIT)
);

const selectedDeleteOverflow = computed(() =>
    Math.max(0, selectedIds.value.size - selectedDeletePreview.value.length)
);

const bulkDeleteNoun = computed(() => {
  const count = selectedIds.value.size;
  if (kind.value === "inspection") return count === 1 ? "תסקיר" : "תסקירים";
  if (kind.value === "contract") return count === 1 ? "חוזה" : "חוזים";
  return count === 1 ? "רשומה" : "רשומות";
});

const bulkDeleteLead = computed(() => {
  const count = selectedIds.value.size;
  const noun = bulkDeleteNoun.value;
  if (count === 1) return `האם למחוק את ה${noun} שנבחר?`;
  return `האם למחוק את ${count} ה${noun} שנבחרו?`;
});

const selectedRelatedReminderCount = computed(() => {
  let total = 0;
  for (const id of selectedIds.value) {
    total += remindersFor(id).length;
  }
  return total;
});

const bulkDeleteRelatedHint = computed(() => {
  if (!bulkDeleteRelatedReminders.value) {
    return "התזכורות ורישומי האימייל הקשורים יישארו במערכת.";
  }
  if (selectedRelatedReminderCount.value > 0) {
    return `${selectedRelatedReminderCount.value} תזכורות ורישומי האימייל הקשורים יימחקו גם כן.`;
  }
  return "התזכורות ורישומי האימייל הקשורים יימחקו גם כן.";
});

function bulkDelete() {
  if (!selectedIds.value.size) return;
  bulkDeleteRelatedReminders.value = false;
  showBulkDeleteConfirm.value = true;
}

async function doBulkDelete() {
  if (!selectedIds.value.size || bulkDeleting.value) return;
  const count = selectedIds.value.size;
  bulkDeleting.value = true;
  try {
    await Promise.all([...selectedIds.value].map((id) =>
        store.remove(id, {deleteRelatedReminders: bulkDeleteRelatedReminders.value})
    ));
    message.success(`${count} רשומות נמחקו`);
    selectedIds.value = new Set();
    bulkMode.value = false;
    showBulkDeleteConfirm.value = false;
    await Promise.all([refresh(), loadReminders()]);
  } catch (e) {
    message.error(String(e));
  } finally {
    bulkDeleting.value = false;
    bulkDeleteRelatedReminders.value = false;
  }
}

async function bulkSendReminders() {
  if (!selectedIds.value.size) return;
  bulkSending.value = true;
  try {
    const sendableReminders = [...selectedIds.value]
        .map((id) => reminderToSendForContract(id))
        .filter((r): r is ReminderWithContext => Boolean(r));
    if (!sendableReminders.length) {
      message.warning("אין תזכורות לתסקירים הנבחרים");
      return;
    }
    const results = await Promise.allSettled(
        sendableReminders.map((r) => api.reminders.sendNow(r.id))
    );
    const sent = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
    const failed = results.length - sent;
    if (sent > 0) message.success(`${sent} התראות נשלחו בהצלחה`);
    if (failed > 0) message.error(`${failed} התראות נכשלו`);
    await loadReminders();
  } catch (e) {
    message.error(String(e));
  } finally {
    bulkSending.value = false;
  }
}

// ── Reminders ─────────────────────────────────────────────────────────────────
const allReminders = ref<ReminderWithContext[]>([]);

// Group reminders by source_id (contract id). source_type may be 'contract_expiry' or 'manual'.
const remindersByContract = computed(() => {
  const map = new Map<string, ReminderWithContext[]>();
  for (const r of allReminders.value) {
    if (r.source_id == null) continue;
    const key = String(r.source_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
});

function remindersFor(contractId: string): ReminderWithContext[] {
  return remindersByContract.value.get(String(contractId)) ?? [];
}

function reminderToSendForContract(contractId: string): ReminderWithContext | null {
  const rows = remindersFor(contractId).filter((r) => r.status !== "dismissed");
  return rows.find((r) => r.status === "pending")
      ?? rows.find((r) => r.status === "sent")
      ?? rows.find((r) => r.status === "snoozed")
      ?? rows[0]
      ?? null;
}

async function loadReminders() {
  try {
    const {rows} = await api.reminders.list({limit: 1000});
    allReminders.value = rows;
  } catch { /* non-fatal */
  }
}

const sendingReminder = ref<number | null>(null);
const message2 = useMessage();
const {confirm} = useConfirm();
const confirmDialogClass = CONFIRM_DIALOG_CLASS;

async function sendReminderNow(r: ReminderWithContext) {
  sendingReminder.value = r.id;
  try {
    const res = await api.reminders.sendNow(r.id);
    if (res.success) {
      message2.success("תזכורת נשלחה");
      await loadReminders();
    } else {
      message2.error(res.error ?? "שגיאה בשליחה");
    }
  } finally {
    sendingReminder.value = null;
  }
}

async function dismissReminder(r: ReminderWithContext) {
  try {
    await api.reminders.dismiss(r.id);
    allReminders.value = allReminders.value.filter((x) => x.id !== r.id);
  } catch (e) {
    message2.error(String(e));
  }
}

function deleteReminderFromCard(r: ReminderWithContext) {
  confirm({
    title: "מחיקת תזכורת",
    content: `למחוק את התזכורת "${r.title}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await api.reminders.delete(r.id);
        allReminders.value = allReminders.value.filter((x) => x.id !== r.id);
        message2.success("התזכורת נמחקה");
      } catch (e) {
        message2.error(String(e));
      }
    },
  });
}

// ── Email templates ───────────────────────────────────────────────────────────
const emailTemplates = ref<EmailTemplate[]>([]);
const emailTemplateOptions = computed(() =>
    emailTemplates.value.map((t) => ({
      label: t.is_default ? `${t.name}  (ברירת מחדל)` : t.name,
      value: t.id,
    }))
);

// ── Add reminder modal ────────────────────────────────────────────────────────
const showAddReminder = ref(false);
const savingReminder = ref(false);
const creatingReminderFor = ref<string | null>(null);
const reminderTargetRow = ref<ContractWithClient | null>(null);
const reminderForm = ref<{
  title: string;
  triggerDateMs: number | null;
  emailTo: string;
  body: string;
  email_template_id: string | null;
} | null>(null);

function openAddReminder(row: ContractWithClient) {
  reminderTargetRow.value = row;
  const client = clientsMap.value.get(String(row.client_id));
  const tpl =
      emailTemplates.value.find((t) => t.name.includes("תסקיר בדיקה תקופתית")) ??
      emailTemplates.value.find((t) => !!t.is_default) ??
      null;
  reminderForm.value = {
    title: `תזכורת בדיקה — ${row.contract_number ?? row.contract_type ?? "תסקיר"}`,
    triggerDateMs: row.expiry_date ? new Date(row.expiry_date).getTime() : Date.now(),
    emailTo: client?.email ?? "",
    body: "",
    email_template_id: canSelectEmailTemplates.value ? tpl?.id ?? null : null,
  };
  showAddReminder.value = true;
}

async function saveReminder() {
  if (!reminderForm.value || !reminderTargetRow.value) return;
  if (!reminderForm.value.title.trim() || !reminderForm.value.triggerDateMs) {
    message2.warning("יש להזין כותרת ותאריך");
    return;
  }
  savingReminder.value = true;
  try {
    const triggerDate = new Date(reminderForm.value.triggerDateMs).toISOString().slice(0, 10);
    const emailTo = reminderForm.value.emailTo.trim()
        ? JSON.stringify([reminderForm.value.emailTo.trim()])
        : null;
    await api.reminders.create({
      source_type: "manual",
      source_id: String(reminderTargetRow.value.id),
      client_id: reminderTargetRow.value.client_id ?? undefined,
      document_id: reminderTargetRow.value.document_id ?? undefined, // Pass document_id
      trigger_date: triggerDate,
      advance_days: 0,
      title: reminderForm.value.title,
      body: reminderForm.value.body || null,
      email_to: emailTo,
      email_template_id: canSelectEmailTemplates.value ? reminderForm.value.email_template_id : null,
    });
    message2.success("תזכורת נוצרה");
    showAddReminder.value = false;
    await loadReminders();
  } catch (e) {
    message2.error(String(e));
  } finally {
    savingReminder.value = false;
  }
}

;

// ── Export wizard ─────────────────────────────────────────────────────────────
const showExport = ref(false);
const showMonthlyReport = ref(false);

function openMonthlyReport() {
  showMonthlyReport.value = true;
}

function openExportFromMonthlyReport() {
  showMonthlyReport.value = false;
  openExport();
}

const exportStep = ref(0);
const exportFormat = ref<"csv" | "xlsx" | "pdf">("csv");
const exportSteps = [
  {key: "filter", label: "סינון"},
  {key: "columns", label: "עמודות"},
  {key: "format", label: "פורמט"},
  {key: "export", label: "ייצוא"},
];
const exportFilter = ref({
  client_id: null as string | null,
  status: null as string | null,
  contract_type: null as string | null,
  dateRange: null as [number, number] | null,
});
const exportColumns = ref([
  {key: "contract_number", label: "מספר תסקיר", selected: true},
  {key: "client_name", label: "פרטי הלקוח/תופש", selected: true},
  {key: "contact_person", label: "איש קשר", selected: true},
  {key: "contact_phone", label: "נייד", selected: true},
  {key: "contact_email", label: "מייל", selected: true},
  {key: "client_address", label: "ישוב / רחוב", selected: true},
  {key: "po_box", label: "ת.ד", selected: true},
  {key: "client_zipcode", label: "מיקוד", selected: true},
  {key: "start_date", label: "תאריך תסקיר", selected: true},
  {key: "expiry_date", label: "בתוקף עד", selected: true},
  {key: "equipment_description", label: "תיאור", selected: true},
  {key: "status", label: "סטטוס", selected: false},
  {key: "contract_type", label: "סוג", selected: false},
  {key: "summary", label: "הערות", selected: false},
]);
const selectedExportColumns = computed(() => exportColumns.value.filter((c) => c.selected));
const exportedRows = computed(() => filteredRows.value.filter((r) => {
  if (exportFilter.value.client_id && r.client_id !== exportFilter.value.client_id) return false;
  if (exportFilter.value.status && r.status !== exportFilter.value.status) return false;
  if (exportFilter.value.contract_type && r.contract_type !== exportFilter.value.contract_type) return false;
  if (exportFilter.value.dateRange) {
    const [from, to] = exportFilter.value.dateRange;
    const d = r.expiry_date ? new Date(r.expiry_date).getTime() : null;
    if (!d || d < from || d > to) return false;
  }
  return true;
}));

function openExport() {
  exportStep.value = 0;
  exportFormat.value = "csv";
  exportFilter.value = {client_id: null, status: null, contract_type: null, dateRange: null};
  showExport.value = true;
}

// Equipment columns appended after main columns
const EQUIPMENT_COLS = [
  {key: "eq_name", label: "תיאור ציוד"},
  {key: "eq_manufacturer", label: "יצרן"},
  {key: "eq_model", label: "דגם"},
  {key: "eq_serial_number", label: 'מ"ס סידורי'},
  {key: "eq_load_capacity_work", label: "עומס עבודה"},
  {key: "eq_load_capacity_test", label: "עומס מבחן"},
  {key: "eq_load_radius", label: "רדיוס"},
];

function cellValue(r: any, key: string): string {
  if (key === "status") return statusLabel(String(r[key] ?? ""));
  if (key === "start_date" || key === "expiry_date") return formatDate(String(r[key] ?? "")) || "";
  return String(r[key] ?? "");
}

function csvQuote(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Expand one contract row into multiple flat rows — one per equipment item.
// If no equipment, produces one row with empty equipment columns.
function expandRows(rows: any[], mainCols: typeof exportColumns.value) {
  const result: Array<{ main: any; eq: any | null }> = [];
  for (const r of rows) {
    const equipment: any[] = Array.isArray(r._equipment) && r._equipment.length ? r._equipment : [null];
    for (const eq of equipment) {
      result.push({main: r, eq});
    }
  }
  return result;
}

function doExport() {
  const rows = exportedRows.value;
  const cols = selectedExportColumns.value;
  const allCols = [...cols, ...EQUIPMENT_COLS];
  const dateStr = new Date().toISOString().slice(0, 10);

  const expanded = expandRows(rows, cols);

  function getCell(main: any, eq: any | null, key: string): string {
    if (key.startsWith("eq_")) {
      const field = key.slice(3); // strip "eq_"
      if (!eq) return "";
      const v = eq[field];
      if (Array.isArray(v)) return v.filter(Boolean).join(" / ");
      return String(v ?? "");
    }
    return cellValue(main, key);
  }

  if (exportFormat.value === "xlsx") {
    Promise.all([import("xlsx"), import("jszip")]).then(async ([{utils, write}, {default: JSZip}]) => {
      const wsData = [
        allCols.map((c) => c.label),
        ...expanded.map(({main, eq}) => allCols.map((c) => getCell(main, eq, c.key))),
      ];
      const ws = utils.aoa_to_sheet(wsData);
      ws["!cols"] = allCols.map(() => ({wch: 20}));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "תסקירים");

      // SheetJS 0.18 ignores rightToLeft and cell styles — patch the zip XML directly
      const buf: ArrayBuffer = write(wb, {type: "array", bookType: "xlsx"});
      const zip = await JSZip.loadAsync(buf);

      // 1. Patch styles.xml — add a bold font + xf style at index 1
      const stylesFile = zip.file("xl/styles.xml");
      if (stylesFile) {
        let sxml = await stylesFile.async("string");
        // Append bold font entry
        sxml = sxml.replace(/(<fonts count=")(\d+)(">)/, (_m, a, n, b) => `${a}${+n + 1}${b}`);
        sxml = sxml.replace(/<\/fonts>/, '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>');
        // Count fonts now (bold font is last)
        const boldFontIdx = (sxml.match(/<font>/g) ?? []).length - 1;
        // Append xf entry referencing the bold font
        sxml = sxml.replace(/(<cellXfs count=")(\d+)(">)/, (_m, a, n, b) => `${a}${+n + 1}${b}`);
        sxml = sxml.replace(/<\/cellXfs>/, `<xf numFmtId="0" fontId="${boldFontIdx}" fillId="0" borderId="0" applyFont="1"/></cellXfs>`);
        zip.file("xl/styles.xml", sxml);
      }

      // 2. Patch sheet1.xml — RTL + bold style (s="1") on all row-1 cells
      const sheetFile = zip.file("xl/worksheets/sheet1.xml");
      if (sheetFile) {
        let xml = await sheetFile.async("string");
        xml = xml.replace(/<sheetView /g, '<sheetView rightToLeft="1" ');
        // Add s="1" to every cell in row 1 (cells look like <c r="A1" t="str">)
        xml = xml.replace(
            /(<row r="1"[^>]*>)([\s\S]*?)(<\/row>)/,
            (_m, open, cells, close) =>
                open + cells.replace(/<c (r="[A-Z]+1"[^>]*)>/g, '<c $1 s="1">') + close
        );
        zip.file("xl/worksheets/sheet1.xml", xml);
      }
      const outBuf = await zip.generateAsync({type: "arraybuffer"});

      const blob = new Blob([outBuf], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `contracts-${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  } else if (exportFormat.value === "csv") {
    const lines = [
      allCols.map((c) => csvQuote(c.label)).join(","),
      ...expanded.map(({main, eq}) => allCols.map((c) => csvQuote(getCell(main, eq, c.key))).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contracts-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const thead = allCols.map((c) => `<th>${c.label}</th>`).join("");
    const tbody = expanded.map(({main, eq}) =>
        `<tr>${allCols.map((c) => `<td>${getCell(main, eq, c.key) || "—"}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
      <style>body{font-family:Arial;padding:32px;direction:rtl}h1{font-size:20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:right}
      th{background:#f0f0f0;font-weight:600}</style></head>
      <body><h1>ייצוא תסקירים — ${new Date().toLocaleDateString("he-IL")}</h1>
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  }
  exportStep.value = 3;
}

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref(emptyForm());

const equipmentCategoryOptions: { label: string; value: EquipmentCategory }[] = [
  {label: "מכונות הרמה", value: "lift"},
  {label: "אביזרי הרמה", value: "accessory"},
  {label: "פיגומים", value: "scaffold"},
  {label: "מעליות", value: "ladder"},
  {label: "מעלונים", value: "balloon"},
  {label: "קולטי אוויר", value: "intake"},
  {label: "קולטי קיטור", value: "extractor"},
  {label: "אחר", value: "other"},
];

const showDeleteConfirm = ref(false);
const deletingRow = ref<ContractWithClient | null>(null);
const deleteRelatedReminders = ref(false);
const showDeleteAllConfirm = ref(false);
const deleteAllRelatedReminders = ref(false);

// ── Client picker ─────────────────────────────────────────────────────────────
const clientOptions = ref<{ label: string; value: string }[]>([]);
const clientsMap = ref<Map<string, import("@shared/types.js").Client>>(new Map());
const loadingClients = ref(false);
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

function extractInspectionSequence(contractNumber: string | null | undefined, inspectorNumber: string): number | null {
  if (!contractNumber) return null;
  const [left, right] = contractNumber.split("/").map((part) => part.trim());
  if (!left || !right) return null;
  if (left === inspectorNumber && /^\d+$/.test(right)) return parseInt(right, 10);
  if (right === inspectorNumber && /^\d+$/.test(left)) return parseInt(left, 10);
  return null;
}

function currentHydraulicInspectorNumber(): string {
  return engineerProfile.value?.inspector_number?.trim() ?? "";
}

function formatHydraulicContractNumber(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const inspectorNumber = currentHydraulicInspectorNumber();
  if (!inspectorNumber) return raw.replace(/\D/g, "");
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  const sequence = parts.length > 1
      ? (parts[0] === inspectorNumber ? parts[1] : parts[parts.length - 1])
      : parts[0];
  const digits = String(sequence ?? "").replace(/\D/g, "");
  return digits ? `${inspectorNumber}/${digits}` : "";
}

function hydraulicContractNumberInputValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const inspectorNumber = currentHydraulicInspectorNumber();
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts[0] === inspectorNumber) return parts[1]?.replace(/\D/g, "") ?? "";
  return parts.at(-1)?.replace(/\D/g, "") ?? "";
}

function setHydraulicContractNumberInput(value: string) {
  if (!hydraulicForm.value) return;
  hydraulicForm.value.contract_number = digitsOnly(value);
}

const suggestedHydraulicContractNumber = computed(() => {
  const inspectorNumber = currentHydraulicInspectorNumber();
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

// ── Manual hydraulic-check: business + equipment + interval ────────────────
const HYDRAULIC_PRINT_TEMPLATE_ID = "6a7cfbee5e95a7b2e1e4b606";

type HydraulicEquipmentRow = {
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
};

const showHydraulicCheck = ref(false);
const hydraulicModalRef = ref<InstanceType<typeof HydraulicCheckModal> | null>(null);
const hydraulicForm = ref<HydraulicCheckRequest | null>(null);
const hydraulicClientId = ref<string | null>(null);
const hydraulicPrevReportNumber = ref("");
const hydraulicEquipmentRows = ref<HydraulicEquipmentRow[]>([]);
const hydraulicClientEquipment = ref<Equipment[]>([]);
const loadingHydraulicEquipment = ref(false);
let hydraulicEquipmentLoadSeq = 0;
const hydraulicTemplates = ref<PrintTemplate[]>([]);
const hydraulicTemplateId = ref<string | null>(null);
const hydraulicTemplate = ref<PrintTemplate | null>(null);
const hydraulicTemplateValues = ref<Record<string, string>>({});
const loadingHydraulicTemplates = ref(false);
const hydratingHydraulicDraft = ref(false);
const clearHydraulicDraftOnClose = ref(false);
const updatingHydraulicContractId = ref<string | null>(null);
const hydraulicUpdateReturnTo = ref("");
const hydraulicModalTitle = computed(() => updatingHydraulicContractId.value ? "עדכון תסקיר" : "תסקיר חדש");


const hydraulicCategoryDefaults: { label: string; value: string }[] = [
  {label: "מכונות הרמה", value: "lift"},
  {label: "פיגומים", value: "scaffold"},
  {label: "מעליות", value: "ladder"},
];

// Categories already used across the user's equipment, so the dropdown grows as
// new types are added instead of being stuck on the three defaults.
const hydraulicKnownCategories = ref<string[]>([]);

const hydraulicCategoryOptions = computed(() => {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const opt of hydraulicCategoryDefaults) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    options.push(opt);
  }
  for (const cat of hydraulicKnownCategories.value) {
    const value = cat.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({label: value, value});
  }
  return options;
});

async function loadHydraulicCategories() {
  try {
    const stats = await api.equipment.stats();
    // "all" is an aggregate bucket in the stats response, not a real category.
    hydraulicKnownCategories.value = Object.keys(stats ?? {}).filter((c) => c && c !== "all");
  } catch {
    hydraulicKnownCategories.value = [];
  }
}

const hydraulicReminderMode = ref<"months" | "date">("months");
const hydraulicReminderDateMs = ref<number | null>(null);
const hydraulicIntervalMonths = ref<number>(4);
const hydraulicReminderModeOptions = [
  {label: "בעוד מספר חודשים מהיום", value: "months"},
  {label: "בתאריך מותאם אישית", value: "date"},
];
const hydraulicIntervalOptions = [
  {label: "4 חודשים", value: 4},
  {label: "6 חודשים", value: 6},
  {label: "12 חודשים", value: 12},
  {label: "14 חודשים", value: 14},
];

const hydraulicTemplateOptions = computed(() =>
    hydraulicTemplates.value.map((template) => ({
      label: `${template.name} (${template.cells.filter((cell) => cell.type === "field").length} שדות)`,
      value: template._id,
    }))
);

const hydraulicEquipmentOptions = computed(() =>
    hydraulicClientEquipment.value.map((equipment) => ({
      label: [
        equipment.name,
        equipment.manufacturer,
        equipment.model,
        equipment.serial_number ? `מס׳ ${equipment.serial_number}` : null,
      ].filter(Boolean).join(" · "),
      value: String(equipment.id),
    }))
);

const hydraulicTemplateKnownFields = new Set([
  "document_number", "contract_number", "report_number", "prev_report_number",
  "start_date", "inspection_date", "check_date", "expiry_date",
  "valid_until", "inspection_type", "client_name", "client_company", "client_phone",
  "client_email", "client_address", "client_id", "zip_code", "contact_person",
  "po_box", "chassis", "name", "manufacturer", "model", "serial_number", "license_number",
  "load_radius", "load_capacity_test", "load_capacity_work", "equipment_description",
  "checked_equipment",
]);

const hydraulicTemplateExtraFields = computed(() => {
  if (!hydraulicTemplate.value) return [];
  const seen = new Set<string>();
  return hydraulicTemplate.value.cells
      .filter((cell) => cell.type === "field" && cell.bind && !seen.has(cell.bind) && seen.add(cell.bind))
      .map((cell) => cell.bind!)
      .filter((bind) => !hydraulicTemplateKnownFields.has(bind) && !bind.match(/_\d+$/));
});

const hydraulicDraftSavedAtLabel = computed(() => {
  const savedAt = hydraulicDraftStore.draft?.savedAt;
  if (!savedAt) return "";
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("he-IL", {dateStyle: "short", timeStyle: "short"});
});

function disablePastHydraulicDates(ts: number): boolean {
  return startOfLocalDay(ts) < startOfLocalDay(Date.now());
}

async function sendFromCard(row: ContractWithClient) {
  const existing = reminderToSendForContract(String(row.id));
  if (existing) {
    await sendReminderNow(existing);
    return;
  }
  if (!contractRowHasEmail(row)) {
    message.warning("חסר אימייל לשליחה");
    return;
  }
  if (!row.expiry_date) {
    message.warning("חסר תאריך תוקף לתזכורת");
    return;
  }
  creatingReminderFor.value = row.id;
  try {
    const result = await api.contracts.createReminder(row.id);
    await loadReminders();
    const created = reminderToSendForContract(String(row.id))
      ?? result.reminders[0] as ReminderWithContext | undefined;
    if (created) {
      await sendReminderNow(created);
    } else {
      message.warning("לא נוצרה תזכורת. בדוק שיש אימייל ללקוח ותאריך עתידי.");
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    creatingReminderFor.value = null;
  }
}

async function createContractReminder(row: ContractWithClient) {
  if (!row.expiry_date) {
    message2.warning("חסר תאריך תוקף לתזכורת");
    return;
  }
  creatingReminderFor.value = row.id;
  try {
    const result = await api.contracts.createReminder(row.id);
    if (result.reminders.length) {
      message2.success("התזכורת נוצרה");
    } else {
      message2.warning("לא נוצרה תזכורת. בדוק שיש אימייל ללקוח ותאריך עתידי.");
    }
    await loadReminders();
  } catch (e) {
    message2.error(e instanceof Error ? e.message : String(e));
  } finally {
    creatingReminderFor.value = null;
  }
}

const deletingDraftId = ref<string | null>(null);

function draftContractHasNoReminder(draft: PrintTemplateDraftSummary): boolean {
  if (!draft.contract_id) return false;
  return remindersFor(String(draft.contract_id)).length === 0;
}

async function createDraftReminder(draft: PrintTemplateDraftSummary) {
  if (!draft.contract_id) return;
  const row = store.rows.find((r) => String(r.id) === String(draft.contract_id));
  if (row) {
    await createContractReminder(row);
    return;
  }
  // Contract not in the loaded list — call the API directly.
  creatingReminderFor.value = draft.contract_id;
  try {
    const result = await api.contracts.createReminder(draft.contract_id);
    if (result.reminders.length) message2.success("התזכורת נוצרה");
    else message2.warning("לא נוצרה תזכורת. בדוק אימייל ותאריך תוקף עתידי.");
    await loadReminders();
  } catch (e) {
    message2.error(e instanceof Error ? e.message : String(e));
  } finally {
    creatingReminderFor.value = null;
  }
}

async function deleteDraft(draft: PrintTemplateDraftSummary) {
  confirm({
    title: "מחיקת טיוטה",
    content: `למחוק את הטיוטה "${draft.contract_number || draft.template_name}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      deletingDraftId.value = draft._id;
      try {
        await api.printTemplates.deleteDraft(draft.template_id, draft.contract_id);
        templateDrafts.value = templateDrafts.value.filter((d) => d._id !== draft._id);
        message2.success("הטיוטה נמחקה");
      } catch (e) {
        message2.error(e instanceof Error ? e.message : String(e));
      } finally {
        deletingDraftId.value = null;
      }
    },
  });
}

const bulkGeneratingReminders = ref(false);

const contractsMissingReminder = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredRows.value.filter((row) => {
        if (!contractHasEmail(row) || !row.expiry_date) return false;
        if (remindersFor(String(row.id)).length > 0) return false;
        const expiry = new Date(row.expiry_date);
        return expiry >= today;
    });
});

async function bulkCreateRemindersForSelected() {
  if (bulkGeneratingReminders.value) return;
  const ids = [...selectedIds.value];
  const targets = store.rows.filter((row) => ids.includes(String(row.id)) && row.expiry_date);
  const skipped = ids.length - targets.length;
  if (!targets.length) {
    message2.warning("אין תסקירים נבחרים עם תאריך תוקף ליצירת תזכורת");
    return;
  }
  bulkGeneratingReminders.value = true;
  let created = 0, failed = 0;
  try {
    for (const row of targets) {
      try {
        const result = await api.contracts.createReminder(row.id);
        if (result.reminders.length) created += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    await loadReminders();
    const parts: string[] = [];
    if (created) parts.push(`נוצרו ל-${created}`);
    if (failed) parts.push(`נכשלו ${failed}`);
    if (skipped) parts.push(`דולגו ${skipped} (ללא תוקף)`);
    if (created && !failed) message2.success(parts.join(", "));
    else message2.warning(parts.join(", ") || "לא נוצרו תזכורות");
  } finally {
    bulkGeneratingReminders.value = false;
  }
}

async function generateMissingReminders() {
  const targets = contractsMissingReminder.value;
  if (!targets.length || bulkGeneratingReminders.value) return;
  bulkGeneratingReminders.value = true;
  let created = 0;
  let failed = 0;
  try {
    for (const row of targets) {
      try {
        const result = await api.contracts.createReminder(row.id);
        if (result.reminders.length) created += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    await loadReminders();
    if (created && !failed) message2.success(`נוצרו תזכורות ל-${created} תסקירים`);
    else if (created && failed) message2.warning(`נוצרו ל-${created}, נכשלו ${failed}`);
    else message2.warning("לא נוצרו תזכורות. בדוק אימייל ותאריך תוקף עתידי.");
  } finally {
    bulkGeneratingReminders.value = false;
  }
}

function defaultHydraulicCheckForm(): HydraulicCheckRequest {
  return {
    contract_number: hydraulicContractNumberInputValue(suggestedHydraulicContractNumber.value),
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

async function openHydraulicCheck() {
  showHydraulicCheck.value = true;
  updatingHydraulicContractId.value = null;
  hydraulicUpdateReturnTo.value = "";
  if (!engineerProfile.value) {
    await loadEngineerProfile().catch(() => {
    });
  }
  const draft = hydraulicDraftStore.draft;
  hydratingHydraulicDraft.value = true;
  hydraulicClientId.value = draft?.clientId ?? null;
  hydraulicReminderMode.value = draft?.reminderMode ?? "months";
  hydraulicReminderDateMs.value = draft?.reminderDateMs ?? null;
  hydraulicIntervalMonths.value = draft?.intervalMonths ?? 4;
  hydraulicPrevReportNumber.value = draft?.prevReportNumber ?? "";
  hydraulicEquipmentRows.value = draft?.equipmentRows?.length
      ? draft.equipmentRows.map((row: any) => ({
        ...row,
        id: row.id || crypto.randomUUID(),
        models: row.models ?? (row.model ? [row.model] : []),
        serial_numbers: row.serial_numbers ?? (row.serial_number ? [row.serial_number] : []),
        load_capacity_work: Array.isArray(row.load_capacity_work) ? row.load_capacity_work : row.load_capacity_work ? [row.load_capacity_work] : [],
        load_capacity_test: Array.isArray(row.load_capacity_test) ? row.load_capacity_test : row.load_capacity_test ? [row.load_capacity_test] : [],
        load_radius: Array.isArray(row.load_radius) ? row.load_radius : row.load_radius ? [row.load_radius] : [],
      }))
      : [emptyHydraulicEquipmentRow()];
  hydraulicClientEquipment.value = [];
  hydraulicTemplateValues.value = {...(draft?.templateValues ?? {})};
  hydraulicForm.value = draft?.form ? {
    ...draft.form,
    business: {...draft.form.business},
    equipment: {...draft.form.equipment}
  } : defaultHydraulicCheckForm();
  hydratingHydraulicDraft.value = false;
  void loadHydraulicPrintTemplates().then(() => {
    if (draft?.templateId) {
      selectHydraulicTemplate(draft.templateId);
      hydraulicTemplateValues.value = {...(draft.templateValues ?? {})};
    }
  });
  if (draft?.templateId) {
    selectHydraulicTemplate(draft.templateId);
    hydraulicTemplateValues.value = {...(draft.templateValues ?? {})};
  }
  void loadClients();
  void loadHydraulicCategories();
}

async function openHydraulicContractUpdate(contractId: string, returnTo?: string) {
  await hydraulicModalRef.value?.openForUpdate(contractId, returnTo);
}

async function editSavedHydraulicDraft() {
  if (!hydraulicDraftStore.draft) {
    message.info("אין טיוטה שמורה לעריכה");
    return;
  }
  await openHydraulicCheck();
}

function emptyHydraulicEquipmentRow(): HydraulicEquipmentRow {
  return {
    id: crypto.randomUUID(),
    selected_equipment_id: null,
    category: "lift",
    name: "",
    manufacturer: "",
    models: [],
    serial_numbers: [],
    license_number: "",
    load_capacity_work: [],
    load_capacity_test: [],
    load_radius: [],
    description: "",
  };
}

function addHydraulicEquipment() {
  hydraulicEquipmentRows.value.push(emptyHydraulicEquipmentRow());
}

function removeHydraulicEquipment(index: number) {
  if (hydraulicEquipmentRows.value.length <= 1) return;
  hydraulicEquipmentRows.value.splice(index, 1);
}

async function loadHydraulicClientEquipment(clientId: string | null) {
  const seq = ++hydraulicEquipmentLoadSeq;
  hydraulicClientEquipment.value = [];
  if (!clientId) return;
  loadingHydraulicEquipment.value = true;
  try {
    const rows = await api.equipment.list({client_id: clientId}, true);
    if (seq === hydraulicEquipmentLoadSeq) hydraulicClientEquipment.value = rows;
  } catch {
    if (seq === hydraulicEquipmentLoadSeq) hydraulicClientEquipment.value = [];
  } finally {
    if (seq === hydraulicEquipmentLoadSeq) loadingHydraulicEquipment.value = false;
  }
}

async function queueHydraulicClientEquipmentLoad() {
  const clientId = hydraulicClientId.value;
  hydraulicClientEquipment.value = [];
  if (!clientId) return;
  if (!showHydraulicCheck.value) return;
  await nextTick();
  void loadHydraulicClientEquipment(clientId);
}

function selectHydraulicEquipment(index: number, id: string | null) {
  const row = hydraulicEquipmentRows.value[index];
  if (!row) return;
  row.selected_equipment_id = id;
  if (!id) return;
  const equipment = hydraulicClientEquipment.value.find((item) => String(item.id) === String(id));
  if (!equipment) return;
  row.category = equipment.category ?? row.category;
  row.name = equipment.name ?? "";
  row.manufacturer = equipment.manufacturer ?? "";
  row.models = equipment.model ? [equipment.model] : [];
  row.serial_numbers = equipment.serial_number ? [digitsOnly(equipment.serial_number)] : [];
  row.license_number = digitsOnly((equipment as any).license_number ?? "");
  row.load_capacity_work = equipment.capacity ? [String(equipment.capacity)] : [];
  row.load_capacity_test = (equipment as any).load_capacity_test ? [String((equipment as any).load_capacity_test)] : [];
  row.load_radius = (equipment as any).load_radius ? [String((equipment as any).load_radius)] : [];
  row.description = equipment.description ?? "";
}

function setNumericEquipmentField(row: HydraulicEquipmentRow, field: "license_number", value: string) {
  row[field] = digitsOnly(value);
}

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

async function loadHydraulicPrintTemplates() {
  if (hydraulicTemplates.value.length) {
    selectHydraulicTemplate(hydraulicTemplateId.value ?? defaultHydraulicTemplateId());
    return;
  }
  loadingHydraulicTemplates.value = true;
  try {
    hydraulicTemplates.value = await api.printTemplates.list();
    selectHydraulicTemplate(defaultHydraulicTemplateId());
  } catch {
    hydraulicTemplates.value = [];
    hydraulicTemplateId.value = null;
    hydraulicTemplate.value = null;
  } finally {
    loadingHydraulicTemplates.value = false;
  }
}

function defaultHydraulicTemplateId(): string | null {
  return firstSectionsTemplateId()
      ?? (hydraulicTemplates.value.some((template) => template._id === HYDRAULIC_PRINT_TEMPLATE_ID)
        ? HYDRAULIC_PRINT_TEMPLATE_ID
        : hydraulicTemplates.value[0]?._id ?? null);
}

function selectHydraulicTemplate(id: string | null) {
  hydraulicTemplateId.value = id;
  hydraulicTemplate.value = hydraulicTemplates.value.find((template) => template._id === id) ?? null;
  if (!hydraulicTemplate.value) {
    hydraulicTemplateValues.value = {};
    return;
  }
  const nextValues: Record<string, string> = {};
  for (const bind of hydraulicTemplateExtraFields.value) {
    nextValues[bind] = hydraulicTemplateValues.value[bind] ?? "";
  }
  hydraulicTemplateValues.value = nextValues;
}

async function applyHydraulicClient(clientId: string | null) {
  if (!hydraulicForm.value) return;
  if (hydratingHydraulicDraft.value) return;
  hydraulicEquipmentRows.value = hydraulicEquipmentRows.value.map((row) => ({...row, selected_equipment_id: null}));

  if (!clientId) {
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
    hydraulicClientEquipment.value = [];
    return;
  }

  const client = clientsMap.value.get(String(clientId));
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
  void queueHydraulicClientEquipmentLoad();
}

watch(hydraulicClientId, applyHydraulicClient);
watch(showHydraulicCheck, (isOpen) => {
  if (isOpen) void queueHydraulicClientEquipmentLoad();
});
watch(showHydraulicCheck, (isOpen, wasOpen) => {
  if (isOpen || !wasOpen) return;
  if (clearHydraulicDraftOnClose.value) {
    hydraulicDraftStore.clear();
    clearHydraulicDraftOnClose.value = false;
    return;
  }
  saveCurrentHydraulicDraft();
});

function saveCurrentHydraulicDraft() {
  if (!hydraulicForm.value) return;
  hydraulicDraftStore.save({
    form: hydraulicForm.value,
    clientId: hydraulicClientId.value,
    prevReportNumber: hydraulicPrevReportNumber.value,
    equipmentRows: hydraulicEquipmentRows.value,
    reminderMode: hydraulicReminderMode.value,
    reminderDateMs: hydraulicReminderDateMs.value,
    intervalMonths: hydraulicIntervalMonths.value,
    templateId: hydraulicTemplateId.value,
    templateValues: hydraulicTemplateValues.value,
  });
}

async function doCreateHydraulicCheck() {
  creatingHydraulicCheck.value = true;
  try {
    const returnTo = hydraulicEditReturnTo();
    if (updatingHydraulicContractId.value) {
      await updateHydraulicContract(updatingHydraulicContractId.value);
      message.success("התסקיר עודכן");
    } else {
      const result = await createHydraulicContract();
      message.success(`התסקיר נשמר עבור ${result.client.display_name}. ניתן ליצור תזכורת מהכרטיס.`);
    }
    clearHydraulicDraftOnClose.value = true;
    showHydraulicCheck.value = false;
    loadClients(true);
    await Promise.all([refresh(), loadReminders()]);
    if (returnTo) await router.push(returnTo);
  } catch (e) {
    message.error(String(e));
  } finally {
    creatingHydraulicCheck.value = false;
  }
}

async function createHydraulicContract() {
  if (!hydraulicForm.value) throw new Error("הטופס לא מוכן");
  if (!hydraulicClientId.value && !hydraulicForm.value.business.display_name.trim()) {
    message.warning("יש לבחור לקוח קיים או להזין שם עסק");
    throw new Error("חסר לקוח");
  }
  if (hydraulicReminderMode.value === "date" && !hydraulicReminderDateMs.value) {
    message.warning("יש לבחור תאריך תזכורת");
    throw new Error("חסר תאריך תזכורת");
  }
  const contractNumber = formatHydraulicContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedHydraulicContractNumber.value,
  );
  syncPrimaryHydraulicEquipment();
  const editorType = hydraulicTemplate.value?.editorType === "sections" ? "sections" : "grid";
  const payload: HydraulicCheckRequest = {
    ...hydraulicForm.value,
    contract_number: contractNumber || undefined,
    client_id: hydraulicClientId.value ?? undefined,
    interval_months: hydraulicIntervalMonths.value,
    skip_reminders: false,
    expiry_date: hydraulicReminderMode.value === "date"
        ? formatLocalDate(hydraulicReminderDateMs.value!)
        : undefined,
    editor_type: editorType,
    print_template_id: hydraulicTemplateId.value ?? undefined,
  };
  return api.reminders.createHydraulicCheck(payload);
}

async function updateHydraulicContract(contractId: string) {
  if (!hydraulicForm.value) throw new Error("הטופס לא מוכן");
  const contractNumber = formatHydraulicContractNumber(
      hydraulicForm.value.contract_number?.trim() || suggestedHydraulicContractNumber.value,
  );
  syncPrimaryHydraulicEquipment();
  const nextDate = hydraulicReminderMode.value === "date" && hydraulicReminderDateMs.value
      ? formatLocalDate(hydraulicReminderDateMs.value)
      : addMonthsToLocalDate(Date.now(), hydraulicIntervalMonths.value);
  const data = buildHydraulicTemplateDraft();
  await api.contracts.update(contractId, {
    client_id: hydraulicClientId.value ?? undefined,
    contract_number: contractNumber || undefined,
    contract_type: "בדיקה הידראולית",
    start_date: data.start_date,
    expiry_date: nextDate,
    summary: data.equipment_description || data.checked_equipment || data.name || undefined,
    editor_type: hydraulicTemplate.value?.editorType === "sections" ? "sections" : "grid",
    print_template_id: hydraulicTemplateId.value ?? null,
    manual_fields: {
      ...data,
      inspection_interval_months: hydraulicIntervalMonths.value,
      _equipment: hydraulicEquipmentRows.value.map((equipment) => ({
        name: equipment.name,
        manufacturer: equipment.manufacturer,
        models: equipment.models,
        model: equipment.models[0] ?? null,
        serial_numbers: equipment.serial_numbers,
        serial_number: equipment.serial_numbers[0] ?? null,
        quantity: Math.max(equipment.serial_numbers.length, 1),
        load_capacity_work: equipment.load_capacity_work,
        load_capacity_test: equipment.load_capacity_test,
        load_radius: equipment.load_radius,
        category: equipment.category,
      })),
    },
    skip_reminders: true,
  } as any);
  if (hydraulicTemplateId.value) {
    await api.printTemplates.saveDraft(
        hydraulicTemplateId.value,
        data,
        {...buildHydraulicTemplateDraftMeta(), contract_id: contractId},
    );
  }
}

function syncPrimaryHydraulicEquipment() {
  if (!hydraulicForm.value) return;
  const first = hydraulicEquipmentRows.value[0] ?? emptyHydraulicEquipmentRow();
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

async function saveHydraulicDraftAndPreview() {
  if (!hydraulicForm.value) return;
  if (!hydraulicTemplateId.value) {
    message.warning("בחר תבנית הדפסה");
    return;
  }
  savingHydraulicDraft.value = true;
  try {
    syncPrimaryHydraulicEquipment();
    const data = buildHydraulicTemplateDraft();
    let contractId = updatingHydraulicContractId.value ?? "";
    let clientId = hydraulicClientId.value ?? "";
    if (contractId) {
      await updateHydraulicContract(contractId);
    } else {
      const result = await createHydraulicContract();
      contractId = String(result.contract.id ?? "");
      clientId = String(result.client.id ?? clientId);
    }
    await api.printTemplates.saveDraft(
        hydraulicTemplateId.value,
        data,
        {...buildHydraulicTemplateDraftMeta(), contract_id: contractId, client_id: clientId},
    );
    clearHydraulicDraftOnClose.value = true;
    showHydraulicCheck.value = false;
    loadClients(true);
    await refresh();
    await router.push(contractPrintPath(contractId, hydraulicTemplateId.value, hydraulicTemplate.value?.editorType));
  } catch (e) {
    message.error(String(e));
  } finally {
    savingHydraulicDraft.value = false;
  }
}

async function openContractInTemplate(row: ContractWithClient) {
  if (!canOpenPrintTemplates.value) {
    message.warning("תבניות הדפסה כבויות בהגדרות");
    return;
  }
  try {
    const target = await resolveContractPrintTarget(row);
    if (!target) {
      message.warning("לא נמצאה תבנית הדפסה");
      return;
    }
    await api.printTemplates.saveDraft(
        target.templateId,
        buildContractTemplateDraft(row),
        buildContractTemplateDraftMeta(row, target.templateId),
    );
    await router.push(contractPrintPath(String(row.id), target.templateId, target.editorType));
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

function openDraftInTemplate(draft: PrintTemplateDraftSummary) {
  if (draft.editor_type === "sections") {
    const query = draft.contract_id ? `?contractId=${encodeURIComponent(draft.contract_id)}` : "";
    router.push(`/print-templates/layout/${draft.template_id}/compose${query}`);
    return;
  }
  if (draft.contract_id) router.push(`/contracts/${draft.contract_id}/draft`);
  else router.push(`/print-templates/${draft.template_id}/draft`);
}

function contractPrintPath(
  contractId: string,
  templateId: string | null | undefined,
  editorType?: string | null,
): string {
  if (editorType === "sections" && templateId) {
    return `/print-templates/layout/${templateId}/compose?contractId=${encodeURIComponent(contractId)}`;
  }
  return `/contracts/${contractId}/draft`;
}

function draftField(draft: PrintTemplateDraftSummary, names: string[]): string {
  for (const name of names) {
    const value = draft.data?.[name]?.trim();
    if (value) return value;
  }
  return "";
}

function formatDraftDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString("he-IL", {dateStyle: "short", timeStyle: "short"});
}

async function ensureHydraulicTemplates(): Promise<PrintTemplate[]> {
  if (!hydraulicTemplates.value.length) {
    try {
      hydraulicTemplates.value = await api.printTemplates.list();
    } catch {
      hydraulicTemplates.value = [];
    }
  }
  return hydraulicTemplates.value;
}

function firstSectionsTemplateId(): string | null {
  return hydraulicTemplates.value.find((template) => template.editorType === "sections")?._id ?? null;
}

async function resolveContractPrintTarget(row: ContractWithClient): Promise<{
  templateId: string;
  editorType: "grid" | "sections";
} | null> {
  const templates = await ensureHydraulicTemplates();
  let draft: Awaited<ReturnType<typeof api.printTemplates.getContractDraft>> | null = null;
  try {
    draft = await api.printTemplates.getContractDraft(String(row.id));
  } catch {
    draft = null;
  }

  const storedId =
    (typeof row.print_template_id === "string" && row.print_template_id) ||
    (typeof draft?.meta?.template_id === "string" && draft.meta.template_id) ||
    draft?.template_id ||
    null;
  const wantsSections = row.editor_type === "sections" || draft?.editor_type === "sections";

  const findTemplate = async (id: string | null): Promise<PrintTemplate | null> => {
    if (!id) return null;
    return templates.find((template) => template._id === id)
      ?? await api.printTemplates.get(id).catch(() => null);
  };

  const stored = await findTemplate(storedId);
  if (stored && (stored.editorType === "sections" || !wantsSections)) {
    return {
      templateId: stored._id,
      editorType: stored.editorType === "sections" ? "sections" : "grid",
    };
  }

  if (wantsSections) {
    const sectionsId = firstSectionsTemplateId();
    if (sectionsId) return {templateId: sectionsId, editorType: "sections"};
  }

  const fallbackId = defaultHydraulicTemplateId();
  if (!fallbackId) return null;
  const fallback = await findTemplate(fallbackId);
  return {
    templateId: fallbackId,
    editorType: fallback?.editorType === "sections" ? "sections" : "grid",
  };
}

function buildContractTemplateDraft(row: ContractWithClient): Record<string, string> {
  const manual = plainStringMap(row.manual_fields);
  const firstEquipment = row._equipment?.[0] ?? null;
  const contractNumber = String(row.contract_number ?? "");
  const data: Record<string, string> = {
    ...manual,
    document_number: manual.document_number ?? contractNumber,
    contract_number: manual.contract_number ?? contractNumber,
    report_number: manual.report_number ?? contractNumber,
    start_date: manual.start_date ?? dateOnly(row.start_date),
    inspection_date: manual.inspection_date ?? dateOnly(row.start_date),
    check_date: manual.check_date ?? dateOnly(row.start_date),
    expiry_date: manual.expiry_date ?? dateOnly(row.expiry_date),
    valid_until: manual.valid_until ?? dateOnly(row.expiry_date),
    inspection_type: manual.inspection_type ?? String(row.contract_type ?? ""),
    client_name: manual.client_name ?? String(row.contact_person ?? ""),
    contact_person: manual.contact_person ?? String(row.contact_person ?? ""),
    client_company: manual.client_company ?? String(row.client_name ?? row.counterparty ?? ""),
    client_phone: manual.client_phone ?? String(row.contact_phone ?? ""),
    client_email: manual.client_email ?? String(row.contact_email ?? ""),
    client_address: manual.client_address ?? String(row.client_address ?? ""),
    client_id: manual.client_id ?? "",
    zip_code: manual.zip_code ?? String(row.client_zipcode ?? ""),
    po_box: manual.po_box ?? String(row.po_box ?? ""),
    name: manual.name ?? String(firstEquipment?.name ?? row.checked_equipment ?? ""),
    checked_equipment: manual.checked_equipment ?? String(row.checked_equipment ?? firstEquipment?.name ?? ""),
    manufacturer: manual.manufacturer ?? String(firstEquipment?.manufacturer ?? ""),
    model: manual.model ?? String(firstEquipment?.model ?? ""),
    serial_number: manual.serial_number ?? String(firstEquipment?.serial_number ?? ""),
    chassis: manual.chassis ?? String(firstEquipment?.serial_number ?? ""),
    license_number: manual.license_number ?? "",
    load_capacity_work: manual.load_capacity_work ?? firstArrayValue(firstEquipment?.load_capacity_work),
    load_capacity_test: manual.load_capacity_test ?? firstArrayValue(firstEquipment?.load_capacity_test),
    load_radius: manual.load_radius ?? firstArrayValue(firstEquipment?.load_radius),
    equipment_description: manual.equipment_description ?? String(row.equipment_description ?? ""),
  };

  row._equipment?.forEach((equipment, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    data[`name${suffix}`] = data[`name${suffix}`] ?? String(equipment.name ?? "");
    data[`checked_equipment${suffix}`] = data[`checked_equipment${suffix}`] ?? String(equipment.name ?? "");
    data[`manufacturer${suffix}`] = data[`manufacturer${suffix}`] ?? String(equipment.manufacturer ?? "");
    const eqModels = (equipment as any).models?.length
      ? joinStackedValues((equipment as any).models)
      : String(equipment.model ?? "");
    const eqSerials = (equipment as any).serial_numbers?.length
      ? joinStackedValues((equipment as any).serial_numbers)
      : String(equipment.serial_number ?? "");
    data[`model${suffix}`] = data[`model${suffix}`] ?? eqModels;
    data[`serial_number${suffix}`] = data[`serial_number${suffix}`] ?? eqSerials;
    data[`chassis${suffix}`] = data[`chassis${suffix}`] ?? eqSerials;
    data[`quantity${suffix}`] = data[`quantity${suffix}`] ?? String((equipment as any).quantity ?? (equipment as any).serial_numbers?.length ?? 1);
    data[`load_capacity_work${suffix}`] = data[`load_capacity_work${suffix}`] ?? joinStackedValues(
      Array.isArray(equipment.load_capacity_work) ? equipment.load_capacity_work : equipment.load_capacity_work ? [equipment.load_capacity_work] : [],
    );
    data[`load_capacity_test${suffix}`] = data[`load_capacity_test${suffix}`] ?? joinStackedValues(
      Array.isArray(equipment.load_capacity_test) ? equipment.load_capacity_test : equipment.load_capacity_test ? [equipment.load_capacity_test] : [],
    );
    data[`load_radius${suffix}`] = data[`load_radius${suffix}`] ?? joinStackedValues(
      Array.isArray(equipment.load_radius) ? equipment.load_radius : equipment.load_radius ? [equipment.load_radius] : [],
    );
  });

  return data;
}

function buildContractTemplateDraftMeta(row: ContractWithClient, templateId: string): Record<string, unknown> {
  return {
    source: "contract_card",
    template_id: templateId,
    client_id: row.client_id ?? null,
    contract_id: String(row.id),
    document_id: row.document_id ?? null,
    equipment_count: row._equipment?.length ?? 0,
  };
}

function plainStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item == null) continue;
    out[key] = String(item);
  }
  return out;
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value.split(" ")[0] ?? value;
}

function firstArrayValue(value: string[] | null | undefined): string {
  return Array.isArray(value) ? String(value.find(Boolean) ?? "") : "";
}

function buildHydraulicTemplateDraft(): Record<string, string> {
  const form = hydraulicForm.value!;
  const contractNumber = formatHydraulicContractNumber(form.contract_number?.trim() || suggestedHydraulicContractNumber.value);
  const nextDate = hydraulicReminderMode.value === "date" && hydraulicReminderDateMs.value
      ? formatLocalDate(hydraulicReminderDateMs.value)
      : addMonthsToLocalDate(Date.now(), hydraulicIntervalMonths.value);
  const today = todayIso();
  const business = form.business;
  const firstEquipment = hydraulicEquipmentRows.value[0] ?? emptyHydraulicEquipmentRow();
  const data: Record<string, string> = {
    document_number: contractNumber,
    contract_number: contractNumber,
    report_number: contractNumber,
    prev_report_number: hydraulicPrevReportNumber.value,
    start_date: today,
    inspection_date: today,
    check_date: today,
    expiry_date: nextDate,
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

  hydraulicEquipmentRows.value.forEach((equipment, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    data[`name${suffix}`] = equipment.name;
    data[`manufacturer${suffix}`] = equipment.manufacturer;
    data[`model${suffix}`] = joinStackedValues(equipment.models);
    data[`serial_number${suffix}`] = joinStackedValues(equipment.serial_numbers);
    data[`license_number${suffix}`] = equipment.license_number;
    data[`lisence_number${suffix}`] = equipment.license_number;
    data[`load_radius${suffix}`] = joinStackedValues(equipment.load_radius);
    data[`load_capacity_test${suffix}`] = joinStackedValues(equipment.load_capacity_test);
    data[`load_capacity_work${suffix}`] = joinStackedValues(equipment.load_capacity_work);
    data[`equipment_description${suffix}`] = equipment.description;
    data[`checked_equipment${suffix}`] = equipment.name;
    data[`chassis${suffix}`] = joinStackedValues(equipment.serial_numbers);
    data[`quantity${suffix}`] = String(Math.max(equipment.serial_numbers.length, 1));
  });

  const templateBinds = new Set(hydraulicTemplate.value?.cells.map((cell) => cell.bind).filter(Boolean) ?? []);
  if (templateBinds.has("client_id") && !templateBinds.has("license_number") && firstEquipment.license_number) {
    data.client_id = firstEquipment.license_number;
  }

  for (const [key, value] of Object.entries(hydraulicTemplateValues.value)) {
    data[key] = value ?? "";
  }
  return data;
}

function buildHydraulicTemplateDraftMeta(): Record<string, unknown> {
  return {
    source: "hydraulic_check",
    client_id: hydraulicClientId.value,
    template_id: hydraulicTemplateId.value,
    equipment_ids: hydraulicEquipmentRows.value
        .map((equipment) => equipment.selected_equipment_id)
        .filter(Boolean),
    equipment_count: hydraulicEquipmentRows.value.length,
  };
}

function addMonthsToLocalDate(ms: number, months: number): string {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return formatLocalDate(d.getTime());
}

const kindOptions = [
  {label: "תסקירים", value: "inspection"},
  {label: "חוזים", value: "contract"},
  {label: "הכל", value: "all"},
];

const contractTypeOptions = [
  {label: "תסקיר בדיקה תקופתית", value: "תסקיר בדיקה תקופתית"},
  {label: "תסקיר בדיקה", value: "תסקיר בדיקה"},
  {label: "חוזה שירות", value: "חוזה שירות"},
  {label: "חוזה תחזוקה", value: "חוזה תחזוקה"},
  {label: "חשבונית", value: "חשבונית"},
  {label: "ביטוח", value: "ביטוח"},
  {label: "אישור", value: "אישור"},
];

const currencyOptions = [
  {label: "₪ שקל", value: "ILS"},
  {label: "$ דולר", value: "USD"},
  {label: "€ אירו", value: "EUR"},
];

const statusOptions = [
  {label: "פעיל", value: "active"},
  {label: "פג תוקף", value: "expired"},
  {label: "בוטל", value: "cancelled"},
  {label: "חודש", value: "renewed"},
];

type CombinedFilter = {
  key: string;
  label: string;
  count: number;
  type: "status" | "due" | "drafts";
  statusValue?: string | null;
  dueValue?: DueFilter;
};

const combinedFilters = computed<CombinedFilter[]>(() => {
  const rows = store.rows ?? [];
  const c = store.counts;
  const duplicateCount = countDuplicateReportRows(rows, contractReportNumber);
  return [
    {key: "all", label: "הכל", count: c.all, type: "status", statusValue: null},
    {key: "draft", label: "טיוטה", count: c.draft, type: "status", statusValue: "draft"},
    {key: "active", label: "פעיל", count: c.active, type: "status", statusValue: "active"},
    {key: "expired", label: "פג תוקף", count: c.expired, type: "status", statusValue: "expired"},
    {
      key: "month",
      label: "החודש",
      count: rows.filter((r) => contractMatchesDueFilter(r, "month")).length,
      type: "due",
      dueValue: "month"
    },
    {
      key: "sent",
      label: "נשלחו",
      count: rows.filter((r) => contractMatchesDueFilter(r, "sent")).length,
      type: "due",
      dueValue: "sent"
    },
    {
      key: "no_email",
      label: "חסר אימייל",
      count: rows.filter((r) => contractMatchesDueFilter(r, "no_email")).length,
      type: "due",
      dueValue: "no_email"
    },
    {
      key: "has_reminder",
      label: "יש תזכורת",
      count: rows.filter((r) => remindersFor(String(r.id)).length > 0).length,
      type: "due",
      dueValue: "has_reminder"
    },
    {
      key: "duplicate_report_number",
      label: "כפילות מספר",
      count: duplicateCount,
      type: "due",
      dueValue: "duplicate_report_number",
    },
    {key: "drafts", label: "טיוטות", count: orphanDrafts.value.length, type: "drafts"},
    {key: "cancelled", label: "בוטל", count: c.cancelled, type: "status", statusValue: "cancelled"},
  ];
});

function applyFilter(f: CombinedFilter) {
  activeFilterKey.value = hydrateContractFilter(f.key);
  writeRememberedFilter("contracts", activeFilterKey.value);
  if (f.type !== "drafts") load();
}

function todayIso(): string {
  return formatLocalDate(Date.now());
}

function monthRangeIso() {
  const now = new Date();
  return {
    from: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1).getTime()),
    to: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()),
  };
}

function contractHasEmail(row: ContractWithClient): boolean {
  return contractRowHasEmail(row);
}

function contractHasSentReminder(row: ContractWithClient): boolean {
  return remindersFor(String(row.id)).some((reminder) => reminder.status === "sent");
}

function contractMatchesDueFilter(row: ContractWithClient, filter: DueFilter): boolean {
  const expiry = row.expiry_date?.slice(0, 10);
  if (filter === "overdue") return row.status === "expired" || Boolean(expiry && expiry < todayIso());
  if (filter === "month") {
    const range = monthRangeIso();
    return Boolean(expiry && expiry >= range.from && expiry <= range.to);
  }
  if (filter === "sent") return contractHasSentReminder(row);
  if (filter === "no_email") return !contractHasEmail(row);
  if (filter === "has_reminder") return remindersFor(String(row.id)).length > 0;
  if (filter === "duplicate_report_number") {
    return isDuplicateReportNumber(contractReportNumber(row), duplicateContractNumbers.value);
  }
  return true;
}

const duplicateContractNumbers = computed(() =>
  duplicateReportNumberSet(store.rows ?? [], contractReportNumber),
);

function contractIssues(row: ContractWithClient) {
  return listContractRowIssues(row, duplicateContractNumbers.value, remindersFor(String(row.id)).length > 0);
}


function load() {
  store.fetch({status: statusFilter.value ?? undefined, kind: kind.value});
}

async function refresh() {
  await Promise.all([
    store.fetch({status: statusFilter.value ?? undefined, kind: kind.value}, true),
    loadTemplateDrafts(),
  ]);
}

async function loadTemplateDrafts() {
  if (!canOpenPrintTemplates.value) {
    templateDrafts.value = [];
    return;
  }
  draftsLoading.value = true;
  try {
    templateDrafts.value = await api.printTemplates.listDrafts();
  } catch {
    templateDrafts.value = [];
  } finally {
    draftsLoading.value = false;
  }
}

onMounted(async () => {
  await featuresStore.fetchFeatures().catch(() => {
  });
  updateViewport();
  window.addEventListener("resize", updateViewport);
  await refresh();
  store.fetchExpiring(30);
  loadClients();
  loadReminders();
  loadEngineerProfile().catch(() => {
  });
  if (canSelectEmailTemplates.value) {
    try {
      emailTemplates.value = await api.emailTemplates.list();
    } catch { /* non-fatal */
    }
  } else {
    emailTemplates.value = [];
  }
  await openHydraulicUpdateFromRoute();
  openCreateFromRoute();
});

watch(() => route.query.edit, () => {
  void openHydraulicUpdateFromRoute();
});

watch(() => route.query.new, () => openCreateFromRoute());

function openCreateFromRoute() {
  if (route.query.new === undefined) return;
  openCreate();
  const nextQuery = {...route.query};
  delete nextQuery.new;
  void router.replace({path: "/contracts", query: nextQuery});
}

async function openHydraulicUpdateFromRoute() {
  const editId = typeof route.query.edit === "string" ? route.query.edit : "";
  if (!editId) return;
  hydraulicUpdateReturnTo.value = typeof route.query.returnTo === "string" && route.query.returnTo.startsWith("/")
      ? route.query.returnTo
      : "";
  await openHydraulicContractUpdate(editId);
  const nextQuery = {...route.query};
  delete nextQuery.edit;
  delete nextQuery.returnTo;
  await router.replace({path: "/contracts", query: nextQuery});
}

function hydraulicEditReturnTo(): string {
  return hydraulicUpdateReturnTo.value;
}

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
        (r.contract_number ?? "").toLowerCase().includes(q) ||
        (contractReportNumber(r)?.includes(q) ?? false) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        (r.contract_type ?? "").toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q)
    );
  }
  if (filterClientId.value) {
    rows = rows.filter((r) => String(r.client_id) === filterClientId.value);
  }
  if (filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    rows = rows.filter((r) => {
      if (!r.expiry_date) return false;
      const d = new Date(r.expiry_date).getTime();
      return d >= from && d <= to;
    });
  }
  if (dueFilter.value !== "all") {
    rows = rows.filter((row) => contractMatchesDueFilter(row, dueFilter.value));
  }
  return [...rows].sort(compareBySerialLastFirst);
});

const visibleItems = computed<ListItem[]>(() => {
  if (showDraftsOnly.value) {
    return filteredDrafts.value.map((draft) => ({__type: "draft", draft}));
  }
  return filteredRows.value.map((row) => ({__type: "contract", row}));
});

const orphanDrafts = computed(() =>
  templateDrafts.value.filter((draft) => !draft.contract_id),
);

const filteredDrafts = computed(() => {
  let rows = orphanDrafts.value;
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((draft) =>
        (draft.contract_number ?? "").toLowerCase().includes(q) ||
        (draft.client_name ?? "").toLowerCase().includes(q) ||
        (draft.contract_type ?? "").toLowerCase().includes(q) ||
        draft.template_name.toLowerCase().includes(q)
    );
  }
  if (filterClientId.value) {
    rows = rows.filter((draft) => String(draft.client_id) === filterClientId.value);
  }
  if (filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    rows = rows.filter((draft) => {
      const ms = draft.updated_at ? new Date(draft.updated_at).getTime() : null;
      return Boolean(ms && ms >= from && ms <= to);
    });
  }
  return [...rows].sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""));
});

const pageCount = computed(() => Math.max(1, Math.ceil(visibleItems.value.length / pageSize.value)));
const pageStart = computed(() => (page.value - 1) * pageSize.value);
const pageEnd = computed(() => Math.min(visibleItems.value.length, pageStart.value + pageSize.value));
const pagedItems = computed(() => visibleItems.value.slice(pageStart.value, pageEnd.value));

watch([search, filterClientId, filterDateRange, statusFilter, dueFilter, kind, pageSize, showDraftsOnly], () => {
  page.value = 1;
});

watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

function contractNumberSortValue(row: ContractWithClient): number {
  const raw = String(row.contract_number ?? "").trim();
  const parts = raw.match(/\d+/g);
  if (!parts?.length) return Number.NEGATIVE_INFINITY;
  return Number(parts[parts.length - 1]);
}

function compareBySerialLastFirst(a: ContractWithClient, b: ContractWithClient): number {
  const numberDiff = contractNumberSortValue(b) - contractNumberSortValue(a);
  if (numberDiff) return numberDiff;
  const textDiff = String(b.contract_number ?? "").localeCompare(String(a.contract_number ?? ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (textDiff) return textDiff;
  return String(b.id).localeCompare(String(a.id), undefined, {numeric: true, sensitivity: "base"});
}


// ── CRUD actions ──────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    contract_number: null as string | null,
    contract_type: kind.value === "inspection" ? "תסקיר בדיקה תקופתית" : null as string | null,
    client_id: null as string | null,
    start_date: null as string | null,
    expiry_date: null as string | null,
    amount: null as number | null,
    currency: "ILS",
    counterparty: null as string | null,
    summary: null as string | null,
    status: "active" as string,
    equipment: {
      category: null as EquipmentCategory | null,
      manufacturer: null as string | null,
      model: null as string | null,
      serial_number: null as string | null,
    },
  };
}

function openCreate() {
  if (kind.value === "inspection") {
    hydraulicModalRef.value?.open();
    return;
  }
  editingId.value = null;
  form.value = emptyForm();
  form.value.contract_type = null;
  showForm.value = true;
}

function openEdit(row: ContractWithClient) {
  editingId.value = row.id;
  form.value = {
    contract_number: row.contract_number,
    contract_type: row.contract_type,
    client_id: row.client_id,
    start_date: row.start_date,
    expiry_date: row.expiry_date,
    amount: row.amount,
    currency: row.currency ?? "ILS",
    counterparty: row.counterparty,
    summary: row.summary,
    status: row.status,
    equipment: {
      category: null as EquipmentCategory | null,
      manufacturer: null as string | null,
      model: null as string | null,
      serial_number: null as string | null,
    },
  };
  showForm.value = true;
}

async function saveForm() {
  saving.value = true;
  try {
    const eq = form.value.equipment;
    const hasEquipment = !!(eq.category || eq.manufacturer?.trim() || eq.model?.trim() || eq.serial_number?.trim());
    const payload = {
      ...form.value,
      status: form.value.status === "draft" ? "active" : form.value.status,
      equipment: hasEquipment ? eq : undefined,
      skip_reminders: true
    };
    if (editingId.value) {
      await store.update(editingId.value, payload as any);
      message.success("הרשומה עודכנה בהצלחה");
    } else {
      await store.create(payload as any);
      message.success("הרשומה נוצרה בהצלחה");
    }
    showForm.value = false;
    await Promise.all([refresh(), loadReminders()]);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: ContractWithClient, options?: { deleteRelatedReminders?: boolean }) {
  deletingRow.value = row;
  deleteRelatedReminders.value = options?.deleteRelatedReminders ?? false;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!deletingRow.value) return;
  try {
    await store.remove(deletingRow.value.id, {deleteRelatedReminders: deleteRelatedReminders.value});
    message.success("הרשומה נמחקה");
    await Promise.all([refresh(), loadReminders()]);
  } catch (e) {
    message.error(String(e));
  } finally {
    deletingRow.value = null;
    deleteRelatedReminders.value = false;
  }
}

async function doDeleteAll() {
  const count = store.rows.length;
  try {
    await store.removeAll();
    if (deleteAllRelatedReminders.value) {
      await api.reminders.deleteAll();
    }
    message.success(`${count} רשומות נמחקו`);
  } catch (e) {
    message.error(String(e));
  } finally {
    showDeleteAllConfirm.value = false;
    deleteAllRelatedReminders.value = false;
  }
}

function openDoc(row: ContractWithClient) {
  if (row.document_id) router.push(`/documents/${row.document_id}?from=contracts`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const datePart = d.includes("T") ? d.split("T")[0] : d.split(" ")[0];
  const [y, m, day] = datePart.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "פעיל", expired: "פג תוקף", cancelled: "בוטל", renewed: "חודש",
  };
  return map[status] ?? status;
}

function exportToExcel() {
  const rows = filteredRows.value;
  const header = ["מספר", "סוג", "לקוח", "תאריך תסקיר", "תאריך תפוגה", "סכום", "מטבע", "סטטוס"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.contract_number ?? "",
      r.contract_type ?? "",
      (r.client_name ?? "").replace(/,/g, " "),
      r.start_date ?? "",
      r.expiry_date ?? "",
      r.amount ?? "",
      r.currency ?? "ILS",
      statusLabel(r.status),
    ].join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contracts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
/* ── Header ─────────────────────────────────────────────────────────────── */
.page__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.page__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.4px;
}

.page__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.page__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  min-width: min(100%, 720px);
}

.page__actions-row {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.bulk-action-anchor {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.bulk-action-anchor > .btn {
  width: 100%;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item + .bulk-action-item {
  border-top: 1px solid var(--border-color);
  border-radius: 0;
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.bulk-action-item--primary {
  color: var(--brand-color);
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.bulk-action-item--loading .bulk-action-item__icon {
  width: 14px;
  height: 14px;
  margin-inline: 4px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.75s linear infinite;
  color: inherit;
  font-size: 0;
}

.bulk-action-item--loading .bulk-action-item__icon :deep(svg) {
  display: none;
}

/* ── Bulk delete confirmation ───────────────────────────────────────────── */
:global(.delete-records-modal.n-card) {
  direction: rtl;
  overflow: hidden;
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
}

:global(.delete-records-modal .n-card-header) {
  padding: 18px 20px 12px;
}

:global(.delete-records-modal .n-card__content) {
  padding: 4px 20px 8px;
}

:global(.delete-records-modal .n-card__footer) {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-color);
}

:global(.delete-records-modal .n-base-close) {
  top: 14px;
  left: 14px;
  right: auto;
}

.del-modal__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.del-modal__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(208, 48, 80, 0.12);
  color: var(--color-error);
}

.del-modal__head-text {
  min-width: 0;
}

.del-modal__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.2px;
}

.del-modal__sub {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.del-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.del-modal__lead {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.55;
}

.del-modal__count {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(208, 48, 80, 0.10);
  color: var(--color-error);
}

.del-modal__count strong {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.del-modal__count span {
  font-size: 13px;
  font-weight: 700;
}

.del-modal__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.del-modal__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
}

.del-modal__item + .del-modal__item {
  border-top: 1px solid var(--border-color);
}

.del-modal__item-num {
  flex: 0 0 auto;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.del-modal__item-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.del-modal__more {
  margin: -4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.del-modal__option {
  display: flex !important;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.del-modal__option:hover {
  background: var(--bg-hover);
}

.del-modal__option--on {
  border-color: rgba(208, 48, 80, 0.35);
  background: rgba(208, 48, 80, 0.06);
}

.del-modal__option :deep(.n-checkbox__label) {
  padding: 0;
  white-space: normal;
}

.del-modal__option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.del-modal__option-text strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.del-modal__option-text small {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.del-modal__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border-inline-start: 3px solid var(--color-error);
  background: rgba(208, 48, 80, 0.08);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.del-modal__warn .n-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--color-error);
}

.del-modal__actions {
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}

.del-modal__btn {
  min-height: 44px;
  min-width: 44px;
  padding-inline: 16px;
  touch-action: manipulation;
}

.btn--danger-solid {
  background: var(--color-error);
  border-color: var(--color-error);
  color: #fff;
  font-weight: 700;
}

.btn--danger-solid:hover:not(:disabled) {
  background: #b82a47;
  border-color: #b82a47;
}

.btn--danger-solid:focus-visible,
.del-modal__btn:focus-visible {
  outline: 2px solid var(--color-info);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .del-modal__option,
  .btn--danger-solid {
    transition: none;
  }
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
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

.btn:hover:not(.btn--primary):not(.btn--danger):not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn--loading {
  opacity: 0.75;
}

.btn--loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.75s linear infinite;
  flex: 0 0 auto;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.btn--primary:hover {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}

.btn--ghost {
  background: transparent;
}

.btn--danger {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}

.btn--danger:hover {
  background: rgba(208, 48, 80, 0.08);
}

.btn--danger-ghost {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}

.btn--danger-ghost:hover {
  background: rgba(208, 48, 80, 0.08);
}

.btn--xs {
  padding: 4px 10px;
  font-size: 12px;
}

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

.refresh-icon {
  display: inline-block;
  transition: transform 0.4s;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Pill filter bar ────────────────────────────────────────────────────── */
.filterbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}

.filterbar--compact {
  margin-top: -8px;
  padding: 5px;
  background: transparent;
}

.pill {
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.pill--compact {
  padding: 6px 13px;
  font-size: 12px;
}

.pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pill--active {
  background: #fff;
  border: 2px solid var(--brand-color);
  color: var(--brand-color);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-color) 55%, transparent);
}

.pill--active .pill__badge {
  background: color-mix(in srgb, var(--brand-color) 22%, transparent);
  color: inherit;
}

.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search {
  width: 360px;
  max-width: 100%;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-primary);
  transition: border-color var(--transition-fast);
  font-family: inherit;
  direction: rtl;
}

.search:focus {
  border-color: var(--brand-color);
  outline: none;
}

/* ── Cards virtual list ──────────────────────────────────────────────── */
.cards-vlist {
  height: calc(100vh - 260px);
}

.cards-vlist__pad {
  padding-bottom: 14px;
}

.draft-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 22px;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.draft-card:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-sm);
}

.draft-card__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 12px;
}

.draft-card__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.draft-card__sub {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}

.draft-card__body {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.card__secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kv {
  font-size: 13px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kv strong {
  color: var(--text-muted);
  font-weight: 500;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.tag--info {
  background: rgba(32, 128, 240, 0.10);
  color: #1560bd;
  border-color: rgba(32, 128, 240, 0.2);
}

html[data-theme="dark"] .tag--info {
  color: #63b3ed;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.pagination-summary {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.btn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

/* ── Empty state ────────────────────────────────────────────────────── */
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}

/* ── Export wizard ──────────────────────────────────────────────────────── */
.export-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-steps {
  display: flex;
  align-items: center;
}

.export-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.export-step--active {
  color: var(--brand-color, #18a058);
  font-weight: 600;
}

.export-step__dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.export-step--active .export-step__dot {
  border-color: var(--brand-color, #18a058);
  color: var(--brand-color, #18a058);
}

.export-step--done .export-step__dot {
  background: var(--brand-color, #18a058);
  border-color: var(--brand-color, #18a058);
  color: #fff;
}

.export-step__label {
  white-space: nowrap;
}

.export-step__line {
  width: 32px;
  height: 2px;
  background: var(--border-color);
  margin: 0 4px;
}

.export-body {
  min-height: 180px;
}

.export-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px;
}

.col-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.col-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.format-cards {
  display: flex;
  gap: 16px;
}

.format-card {
  flex: 1;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}

.format-card--active {
  border-color: var(--brand-color, #18a058);
}

.format-card__icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.format-card__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.format-card__desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.export-body--summary {
  display: flex;
  align-items: center;
  justify-content: center;
}

.export-summary {
  text-align: center;
}

.export-summary__icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.export-summary__text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.export-summary__sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 6px;
}

@media (max-width: 720px) {
  .page__head {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    margin-bottom: 18px;
  }

  .page__title {
    font-size: 23px;
  }

  .page__actions {
    min-width: 0;
    gap: 8px;
  }

  .page__actions-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .bulk-action-anchor__actions {
    min-width: 0;
    width: 100%;
    right: 0;
  }

  .btn {
    justify-content: center;
    min-width: 0;
    padding-inline: 10px;
    white-space: normal;
    text-align: center;
  }

  .filterbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 5px;
    scrollbar-width: none;
  }

  .filterbar::-webkit-scrollbar {
    display: none;
  }

  .pill {
    flex: 0 0 auto;
    padding-inline: 14px;
  }

  .toolbar,
  .toolbar__right {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .search {
    width: 100%;
  }

  .toolbar__right :deep(.n-select),
  .toolbar__right :deep(.n-date-picker) {
    width: 100% !important;
  }

  .cards-vlist {
    height: calc(100vh - 360px);
    min-height: 360px;
  }

  .pagination-bar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .pagination-summary {
    text-align: center;
  }

  .pagination-bar :deep(.n-pagination) {
    justify-content: center;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .export-steps {
    align-items: flex-start;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .export-step__line {
    width: 18px;
  }

  .col-grid,
  .format-cards {
    grid-template-columns: 1fr;
    display: grid;
  }

  :deep(.n-dialog__action),
  :deep(.n-card__footer) {
    align-items: stretch;
  }

  .del-modal__actions {
    flex-direction: column;
  }

  .del-modal__btn {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 460px) {
  .page__actions-row {
    grid-template-columns: 1fr;
  }

  .cards-vlist {
    height: auto;
    min-height: 0;
  }

  .cards-vlist :deep(.v-vl) {
    min-height: 420px;
  }
}
</style>
