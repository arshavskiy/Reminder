<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div>
        <h1 class="page__title">{{ kind === "inspection" ? "ניהול תסקירים" : "ניהול חוזים" }}</h1>
        <p class="page__sub">
          צפייה, סינון וניהול של כל ה{{ kind === "inspection" ? "תסקירים" : "חוזים" }} במערכת
        </p>
      </div>
      <div class="page__actions">
        <button class="btn btn--primary" @click="openCreate">
          {{ kind === "inspection" ? "תסקיר חדש" : "חוזה חדש" }}
        </button>
        <button
          v-if="bulkMode && selectedIds.size > 0"
          :disabled="bulkSending"
          class="btn btn--primary"
          @click="bulkSendReminders"
        >
          {{ bulkSending ? '...' : `📤 שלח התראות (${selectedIds.size})` }}
        </button>
        <button
          v-if="bulkMode && selectedIds.size > 0"
          :disabled="bulkDeleting"
          class="btn btn--danger"
          @click="bulkDelete"
        >
          🗑 מחק נבחרים ({{ selectedIds.size }})
        </button>
        <button
          :class="{ 'btn--ghost-active': bulkMode }"
          class="btn btn--ghost"
          title="בחירה מרובה"
          @click="toggleBulkMode"
        >
          ☑ בחירה מרובה
        </button>
        <button class="btn btn--ghost" @click="openExport" title="ייצוא CSV / Excel / PDF">
          📊 ייצוא CSV / Excel / PDF
        </button>
        <button class="btn btn--ghost" @click="openMonthlyReport" title="הורדת דוח חודשי PDF">
          📄 דוח חודשי PDF
        </button>
        <button class="btn btn--ghost" @click="router.push('/documents')">
          📁 ארכיון
        </button>
        <button class="btn btn--ghost" :disabled="store.loading" @click="refresh" title="רענן">
          <span class="refresh-icon" :class="{ 'refresh-icon--spin': store.loading }">↻</span> רענן
        </button>

      </div>
    </header>

    <!-- ── Pill filter bar ─────────────────────────────────────────────── -->
    <div class="filterbar">
      <button
        v-for="f in pillFilters"
        :key="f.value ?? 'all'"
        class="pill"
        :class="{ 'pill--active': statusFilter === f.value }"
        @click="statusFilter = f.value; load()"
      >
        {{ f.label }}
        <span v-if="f.count !== undefined" class="pill__badge">{{ f.count }}</span>
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
    <n-spin :show="store.loading">
      <n-virtual-list
        v-if="filteredRows.length"
        :item-size="220"
        :items="pagedRows"
        :item-resizable="true"
        class="cards-vlist"
        item-class="cards-vlist__item"
      >
        <template #default="{ item: row }">
          <div class="cards-vlist__pad">
            <ContractCard
              :key="row.id"
              :bulk-mode="bulkMode"
              :kind="kind"
              :inspector-number="engineerProfile?.inspector_number"
              :reminders="remindersFor(String(row.id))"
              :row="row"
              :selected="selectedIds.has(String(row.id))"
              :sending-reminder="sendingReminder"
              @delete="confirmDelete"
              @edit="openEdit"
              @add-reminder="openAddReminder"
              @dismiss-reminder="dismissReminder"
              @open-document="openDoc"
              @send-reminder="sendReminderNow"
              @toggle-select="toggleSelect"
            />
          </div>
        </template>
      </n-virtual-list>

      <div v-if="filteredRows.length" class="pagination-bar">
        <span class="pagination-summary">
          מציג {{ pageStart + 1 }}-{{ pageEnd }} מתוך {{ filteredRows.length }}
        </span>
        <n-pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :item-count="filteredRows.length"
          :page-sizes="[5, 10, 20, 50]"
          show-size-picker
        />
      </div>

      <div v-if="!filteredRows.length" class="empty">
        <p>אין {{ kind === "inspection" ? "תסקירים" : "חוזים" }} להצגה</p>
        <button class="btn btn--primary" style="margin-top:12px" @click="openCreate">
          + {{ kind === "inspection" ? "הוסף תסקיר ראשון" : "הוסף חוזה ראשון" }}
        </button>
      </div>
    </n-spin>

    <!-- ── Monthly report modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showMonthlyReport" preset="dialog" :show-icon="false" title="דוח חודשי PDF" style="width: 420px; max-width: 95vw">
      <n-form label-placement="top">
        <n-form-item label="חודש הדוח">
          <n-date-picker v-model:value="monthlyReportMonthMs" type="month" style="width: 100%" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showMonthlyReport = false">ביטול</n-button>
        <n-button type="primary" :loading="monthlyReportLoading" @click="doMonthlyReport">הורד PDF</n-button>
      </template>
    </n-modal>
    <!-- ── Export wizard modal ──────────────────────────────────────────── -->
    <n-modal v-model:show="showExport" preset="card" style="width:640px; max-width:95vw" :mask-closable="false">
      <template #header>
        <div class="export-header">
          <span>ייצוא חוזים ותסקירים</span>
          <div class="export-steps">
            <div v-for="(s, i) in exportSteps" :key="s.key" class="export-step" :class="{ 'export-step--active': exportStep === i, 'export-step--done': exportStep > i }">
              <div class="export-step__dot">{{ exportStep > i ? '✓' : i + 1 }}</div>
              <span class="export-step__label">{{ s.label }}</span>
              <div v-if="i < exportSteps.length - 1" class="export-step__line" />
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
              <n-select v-model:value="exportFilter.client_id" :options="[{ label: 'כל הלקוחות', value: null }, ...clientOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סטטוס">
              <n-select v-model:value="exportFilter.status" :options="[{ label: 'כל הסטטוסים', value: null }, ...statusOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="סוג בדיקה">
              <n-select v-model:value="exportFilter.contract_type" :options="[{ label: 'כל הסוגים', value: null }, ...contractTypeOptions]" :virtual-scroll="false" clearable />
            </n-form-item>
          </n-gi>
          <n-gi :span="exportGridCols">
            <n-form-item label="טווח תאריכים">
              <n-date-picker v-model:value="exportFilter.dateRange" type="daterange" clearable style="width:100%" />
            </n-form-item>
          </n-gi>
        </n-grid>
      </div>

      <!-- Step 1: עמודות -->
      <div v-if="exportStep === 1" class="export-body">
        <h3 class="export-section-title">בחר עמודות לייצוא</h3>
        <div class="col-grid">
          <label v-for="col in exportColumns" :key="col.key" class="col-check">
            <n-checkbox v-model:checked="col.selected" />
            <span>{{ col.label }}</span>
          </label>
        </div>
      </div>

      <!-- Step 2: פורמט -->
      <div v-if="exportStep === 2" class="export-body">
        <h3 class="export-section-title">בחר פורמט ייצוא</h3>
        <div class="format-cards">
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'csv' }" @click="exportFormat = 'csv'">
            <div class="format-card__icon">🧾</div>
            <div class="format-card__name">CSV</div>
            <div class="format-card__desc">קובץ נתונים פשוט לפתיחה בכל מערכת</div>
          </div>
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'xlsx' }" @click="exportFormat = 'xlsx'">
            <div class="format-card__icon">📊</div>
            <div class="format-card__name">Excel (.xlsx)</div>
            <div class="format-card__desc">גיליון Excel עם כיוון מימין לשמאל</div>
          </div>
          <div class="format-card" :class="{ 'format-card--active': exportFormat === 'pdf' }" @click="exportFormat = 'pdf'">
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
    <n-modal v-model:show="showForm" :title="editingId ? 'עריכת תסקיר / חוזה' : 'תסקיר / חוזה חדש'" preset="card" style="width: 600px; max-width: 95vw" :mask-closable="false">
      <n-form label-placement="top" :model="form">
        <n-grid :cols="formGridCols" :x-gap="16">
          <n-gi>
            <n-form-item label="מספר תסקיר / חוזה">
              <n-input v-model:value="form.contract_number" placeholder="לדוגמה: 15935" />
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
            <n-form-item label="תאריך התחלה">
              <n-input v-model:value="form.start_date" type="text" placeholder="YYYY-MM-DD" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="תאריך תפוגה / בדיקה הבאה">
              <n-input v-model:value="form.expiry_date" type="text" placeholder="YYYY-MM-DD" />
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
              <n-select v-model:value="form.status" :options="statusOptions" />
            </n-form-item>
          </n-gi>
<!--          <n-gi>-->
<!--            <n-form-item label="צד שכנגד">-->
<!--              <n-input v-model:value="form.counterparty" placeholder="שם החברה / איש קשר" />-->
<!--            </n-form-item>-->
<!--          </n-gi>-->

          <n-gi :span="formGridCols">
            <n-form-item label="סיכום / הערות">
              <n-input v-model:value="form.summary" type="textarea" :rows="3" placeholder="תיאור קצר..." />
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
              <n-input v-model:value="form.equipment.manufacturer" placeholder="יצרן" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="דגם">
              <n-input v-model:value="form.equipment.model" placeholder="דגם" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label='מס"ד סידורי'>
              <n-input v-model:value="form.equipment.serial_number" placeholder='מס"ד סידורי' />
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
    <n-modal v-model:show="showDeleteConfirm" title="מחיקת רשומה" preset="dialog" type="error" :positive-text="'מחק'" :negative-text="'ביטול'" @positive-click="doDelete" @negative-click="showDeleteConfirm = false">
      <p>האם למחוק את הרשומה <strong>{{ deletingRow?.contract_number ?? deletingRow?.contract_type ?? "זו" }}</strong>?</p>
      <n-checkbox v-model:checked="deleteRelatedReminders" style="margin: 8px 0 4px">
        מחק גם תזכורות ואימיילים קשורים
      </n-checkbox>
      <p style="font-size:13px; color:var(--text-secondary)">
        פעולה זו אינה הפיכה. {{ deleteRelatedReminders ? "התזכורות ורישומי האימייל הקשורים יימחקו גם כן." : "התזכורות ורישומי האימייל הקשורים יישארו במערכת." }}
      </p>
    </n-modal>

    <n-modal v-model:show="showBulkDeleteConfirm" title="מחיקת רשומות" preset="dialog" type="error" :positive-text="'מחק'" :negative-text="'ביטול'" @positive-click="doBulkDelete" @negative-click="showBulkDeleteConfirm = false">
      <p>למחוק {{ selectedIds.size }} רשומות?</p>
      <n-checkbox v-model:checked="bulkDeleteRelatedReminders" style="margin: 8px 0 4px">
        מחק גם תזכורות ואימיילים קשורים
      </n-checkbox>
      <p style="font-size:13px; color:var(--text-secondary)">
        פעולה זו אינה הפיכה. {{ bulkDeleteRelatedReminders ? "התזכורות ורישומי האימייל הקשורים יימחקו גם כן." : "התזכורות ורישומי האימייל הקשורים יישארו במערכת." }}
      </p>
    </n-modal>

    <!-- ── Add reminder modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showAddReminder" preset="dialog" :show-icon="false" style="width:480px" title="הוסף תזכורת לתסקיר">
      <n-form v-if="reminderForm" label-placement="top">
        <n-form-item label="כותרת" required>
          <n-input v-model:value="reminderForm.title" placeholder="לדוגמה: תזכורת בדיקה הבאה" />
        </n-form-item>
        <n-form-item label="תאריך שליחה" required>
          <n-date-picker v-model:value="reminderForm.triggerDateMs" style="width:100%" type="date" />
        </n-form-item>
        <n-form-item label="אימייל נמען">
          <n-input v-model:value="reminderForm.emailTo" placeholder="email@example.com" />
        </n-form-item>
        <n-form-item label="תבנית אימייל">
          <n-select
            v-model:value="reminderForm.email_template_id"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            clearable
            placeholder="ברירת מחדל"
          />
        </n-form-item>
        <n-form-item label="הערה">
          <n-input v-model:value="reminderForm.body" :rows="2" type="textarea" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showAddReminder = false">ביטול</n-button>
        <n-button :loading="savingReminder" type="primary" @click="saveReminder">צור תזכורת</n-button>
      </template>
    </n-modal>

    <!-- Manual hydraulic-check modal: business + equipment + interval -->
    <n-modal v-model:show="showHydraulicCheck" title="תסקיר חדש" :show-icon="false" preset="dialog" style="width: 760px; max-width: 95vw">
      <n-form label-placement="top" v-if="hydraulicForm">
        <n-grid :cols="formGridCols" :x-gap="16">
          <n-gi>
            <n-form-item label="מספר תסקיר">
              <n-input
                v-model:value="hydraulicForm.contract_number"
                placeholder="אוטומטי לפי מספר מפקח והמספר הבא"
              />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="לקוח קיים">
              <n-select
                v-model:value="hydraulicClientId"
                :options="clientOptions"
                clearable
                filterable
                placeholder="בחר לקוח קיים, או השאר ריק ליצירת עסק חדש"
                :loading="loadingClients"
              />
            </n-form-item>
          </n-gi>
        </n-grid>
        <template v-if="!hydraulicClientId">
          <n-form-item label="שם העסק" required>
            <n-input v-model:value="hydraulicForm.business.display_name" placeholder="לדוגמה: מפעל דן בע&quot;מ" />
          </n-form-item>
          <n-grid :cols="formGridCols" :x-gap="16">
            <n-gi>
              <n-form-item label="ח.פ / ת.ז">
                <n-input v-model:value="hydraulicForm.business.id_number" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="איש קשר">
                <n-input v-model:value="hydraulicForm.business.contact_person" placeholder="שם איש קשר" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="טלפון">
                <n-input v-model:value="hydraulicForm.business.phone" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="אימייל">
                <n-input v-model:value="hydraulicForm.business.email" placeholder="office@example.com" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="כתובת">
                <n-input v-model:value="hydraulicForm.business.address" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="ת.ד">
                <n-input v-model:value="hydraulicForm.business.po_box" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="מיקוד">
                <n-input v-model:value="hydraulicForm.business.client_zipcode" />
              </n-form-item>
            </n-gi>
          </n-grid>
        </template>
        <template v-else>
          <n-grid :cols="formGridCols" :x-gap="16">
            <n-gi>
              <n-form-item label="איש קשר">
                <n-input v-model:value="hydraulicForm.business.contact_person" placeholder="אם שונה מפרטי הלקוח" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="אימייל לתזכורות">
                <n-input v-model:value="hydraulicForm.business.email" placeholder="אם שונה מפרטי הלקוח" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="טלפון">
                <n-input v-model:value="hydraulicForm.business.phone" placeholder="אם שונה מפרטי הלקוח" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="כתובת">
                <n-input v-model:value="hydraulicForm.business.address" placeholder="אם שונה מפרטי הלקוח" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="ת.ד">
                <n-input v-model:value="hydraulicForm.business.po_box" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="מיקוד">
                <n-input v-model:value="hydraulicForm.business.client_zipcode" />
              </n-form-item>
            </n-gi>
          </n-grid>
        </template>

        <n-h4 style="margin: 16px 0 4px">ציוד הידראולי</n-h4>
        <n-form-item label="סוג ציוד" required>
          <n-select v-model:value="hydraulicForm.equipment.category" :options="hydraulicCategoryOptions" />
        </n-form-item>
        <n-grid :cols="formGridCols" :x-gap="16">
          <n-gi>
            <n-form-item label="שם הציוד">
              <n-input v-model:value="hydraulicForm.equipment.name" placeholder="לדוגמה: מלגזה חשמלית / במת הרמה / עגורן" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="יצרן">
              <n-input v-model:value="hydraulicForm.equipment.manufacturer" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="דגם">
              <n-input v-model:value="hydraulicForm.equipment.model" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="מספר סידורי">
              <n-input v-model:value="hydraulicForm.equipment.serial_number" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="עומס עבודה">
              <n-input v-model:value="hydraulicForm.equipment.load_capacity_work" placeholder="לדוגמה: 3 טון" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="עומס בדיקה">
              <n-input v-model:value="hydraulicForm.equipment.load_capacity_test" placeholder="לדוגמה: 3.75 טון" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="רדיוס / טווח">
              <n-input v-model:value="hydraulicForm.equipment.load_radius" />
            </n-form-item>
          </n-gi>
          <n-gi :span="formGridCols">
            <n-form-item label="תיאור ציוד">
              <n-input v-model:value="hydraulicForm.equipment.description" type="textarea" :rows="2" />
            </n-form-item>
          </n-gi>
        </n-grid>



        <n-divider />
        <n-form-item label="מועד התזכורת הבאה">
          <n-select v-model:value="hydraulicReminderMode" :options="hydraulicReminderModeOptions" />
        </n-form-item>
        <n-form-item v-if="hydraulicReminderMode === 'months'" label="בעוד כמה חודשים">
          <n-select v-model:value="hydraulicIntervalMonths" :options="hydraulicIntervalOptions" />
        </n-form-item>
        <n-form-item v-else label="תאריך תזכורת מותאם אישית" required>
          <n-date-picker
            v-model:value="hydraulicReminderDateMs"
            :is-date-disabled="disablePastHydraulicDates"
            type="date"
            style="width: 100%"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showHydraulicCheck = false">ביטול</n-button>
        <n-button type="primary" :loading="creatingHydraulicCheck" @click="doCreateHydraulicCheck">צור</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NButton,
  NCheckbox,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NH4,
  NInput,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NVirtualList,
  useMessage,
} from "naive-ui";
import {useContractsStore} from "../stores/contracts.js";
import {api} from "../services/apiService.js";
import type {HydraulicCheckRequest} from "../services/apiService.js";
import ContractCard from "../components/contracts/ContractCard.vue";
import type {ContractWithClient, EmailTemplate, EquipmentCategory, ReminderWithContext} from "@shared/types.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const store = useContractsStore();
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>(null);
const kind = ref<"contract" | "inspection" | "all">("inspection");
const search = ref("");
const filterClientId = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const isMobile = ref(false);
const page = ref(1);
const pageSize = ref(10);
const formGridCols = computed(() => isMobile.value ? 1 : 2);
const exportGridCols = computed(() => isMobile.value ? 1 : 3);

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

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedIds.value = new Set();
}
function toggleSelect(id: string) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedIds.value = s;
}
function bulkDelete() {
  if (!selectedIds.value.size) return;
  bulkDeleteRelatedReminders.value = false;
  showBulkDeleteConfirm.value = true;
}

async function doBulkDelete() {
  if (!selectedIds.value.size) return;
  const count = selectedIds.value.size;
  bulkDeleting.value = true;
  try {
    await Promise.all([...selectedIds.value].map((id) =>
      store.remove(id, { deleteRelatedReminders: bulkDeleteRelatedReminders.value })
    ));
    message.success(`${count} רשומות נמחקו`);
    selectedIds.value = new Set();
    bulkMode.value = false;
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
    const pendingReminders = [...selectedIds.value].flatMap((id) =>
      remindersFor(id).filter((r) => r.status === "pending")
    );
    if (!pendingReminders.length) {
      message.warning("אין תזכורות ממתינות לתסקירים הנבחרים");
      return;
    }
    const results = await Promise.allSettled(
      pendingReminders.map((r) => api.reminders.sendNow(r.id))
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

async function loadReminders() {
  try {
    const { rows } = await api.reminders.list({ limit: 1000 });
    allReminders.value = rows;
  } catch { /* non-fatal */ }
}

const sendingReminder = ref<number | null>(null);
const message2 = useMessage();

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
    email_template_id: tpl?.id ?? null,
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
      source_id: Number(reminderTargetRow.value.id),
      client_id: reminderTargetRow.value.client_id ?? undefined,
      document_id: reminderTargetRow.value.document_id ?? undefined, // Pass document_id
      trigger_date: triggerDate,
      advance_days: 0,
      title: reminderForm.value.title,
      body: reminderForm.value.body || null,
      email_to: emailTo,
      email_template_id: reminderForm.value.email_template_id,
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
const monthlyReportLoading = ref(false);
const monthlyReportMonthMs = ref(Date.now());

function openMonthlyReport() {
  monthlyReportMonthMs.value = Date.now();
  showMonthlyReport.value = true;
}

async function doMonthlyReport() {
  const date = new Date(monthlyReportMonthMs.value ?? Date.now());
  monthlyReportLoading.value = true;
  try {
    await api.contracts.downloadMonthlyReport({ year: date.getFullYear(), month: date.getMonth() + 1, kind: "all" });
    showMonthlyReport.value = false;
  } catch (e) {
    message.error(String(e));
  } finally {
    monthlyReportLoading.value = false;
  }
}

const exportStep = ref(0);
const exportFormat = ref<"csv" | "xlsx" | "pdf">("csv");
const exportSteps = [
  { key: "filter", label: "סינון" },
  { key: "columns", label: "עמודות" },
  { key: "format", label: "פורמט" },
  { key: "export", label: "ייצוא" },
];
const exportFilter = ref({
  client_id: null as string | null,
  status: null as string | null,
  contract_type: null as string | null,
  dateRange: null as [number, number] | null,
});
const exportColumns = ref([
  { key: "contract_number",       label: "מספר תסקיר",         selected: true },
  { key: "client_name",           label: "פרטי הלקוח/תופש",    selected: true },
  { key: "contact_person",        label: "איש קשר",            selected: true },
  { key: "contact_phone",         label: "נייד",               selected: true },
  { key: "contact_email",         label: "מייל",               selected: true },
  { key: "client_address",        label: "ישוב / רחוב",        selected: true },
  { key: "po_box",                label: "ת.ד",                selected: true },
  { key: "client_zipcode",        label: "מיקוד",              selected: true },
  { key: "start_date",            label: "תאריך בדיקה",        selected: true },
  { key: "expiry_date",           label: "בתוקף עד",           selected: true },
  { key: "equipment_description", label: "תיאור מכונת הרמה",   selected: true },
  { key: "status",                label: "סטטוס",              selected: false },
  { key: "contract_type",         label: "סוג",                selected: false },
  { key: "summary",               label: "הערות",              selected: false },
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
  exportFilter.value = { client_id: null, status: null, contract_type: null, dateRange: null };
  showExport.value = true;
}

// Equipment columns appended after main columns
const EQUIPMENT_COLS = [
  { key: "eq_name",               label: "תיאור ציוד" },
  { key: "eq_manufacturer",       label: "יצרן" },
  { key: "eq_model",              label: "דגם" },
  { key: "eq_serial_number",      label: 'מ"ס סידורי' },
  { key: "eq_load_capacity_work", label: "עומס עבודה" },
  { key: "eq_load_capacity_test", label: "עומס מבחן" },
  { key: "eq_load_radius",        label: "רדיוס" },
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
      result.push({ main: r, eq });
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
    Promise.all([import("xlsx"), import("jszip")]).then(async ([{ utils, write }, { default: JSZip }]) => {
      const wsData = [
        allCols.map((c) => c.label),
        ...expanded.map(({ main, eq }) => allCols.map((c) => getCell(main, eq, c.key))),
      ];
      const ws = utils.aoa_to_sheet(wsData);
      ws["!cols"] = allCols.map(() => ({ wch: 20 }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "תסקירים");

      // SheetJS 0.18 ignores rightToLeft and cell styles — patch the zip XML directly
      const buf: ArrayBuffer = write(wb, { type: "array", bookType: "xlsx" });
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
      const outBuf = await zip.generateAsync({ type: "arraybuffer" });

      const blob = new Blob([outBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `contracts-${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  } else if (exportFormat.value === "csv") {
    const lines = [
      allCols.map((c) => csvQuote(c.label)).join(","),
      ...expanded.map(({ main, eq }) => allCols.map((c) => csvQuote(getCell(main, eq, c.key))).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contracts-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const thead = allCols.map((c) => `<th>${c.label}</th>`).join("");
    const tbody = expanded.map(({ main, eq }) =>
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
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  }
  exportStep.value = 3;
}

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref(emptyForm());

const equipmentCategoryOptions: { label: string; value: EquipmentCategory }[] = [
  { label: "מכונות הרמה", value: "lift" },
  { label: "אביזרי הרמה", value: "accessory" },
  { label: "פיגומים", value: "scaffold" },
  { label: "מעליות", value: "ladder" },
  { label: "מעלונים", value: "balloon" },
  { label: "קולטי אוויר", value: "intake" },
  { label: "קולטי קיטור", value: "extractor" },
  { label: "אחר", value: "other" },
];

const showDeleteConfirm = ref(false);
const deletingRow = ref<ContractWithClient | null>(null);
const deleteRelatedReminders = ref(false);

// ── Client picker ─────────────────────────────────────────────────────────────
const clientOptions = ref<{ label: string; value: string }[]>([]);
const clientsMap = ref<Map<string, import("@shared/types.js").Client>>(new Map());
const loadingClients = ref(false);
const engineerProfile = ref<{
  inspector_number?: string;
  inspector_id_start?: string;
  next_inspection_seq?: number | null;
} | null>(null);

async function loadClients(force = false) {
  if (clientOptions.value.length && !force) return;
  loadingClients.value = true;
  try {
    const r = await api.clients.list({ limit: 500 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
    clientsMap.value = new Map(r.rows.map((c) => [String(c.id), c]));
  } finally {
    loadingClients.value = false;
  }
}

async function loadEngineerProfile() {
  const res = await fetch(`${SERVER}/api/profile/engineer`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load engineer profile: ${res.status}`);
  engineerProfile.value = await res.json();
}

function extractInspectionSequence(contractNumber: string | null | undefined, inspectorNumber: string): number | null {
  if (!contractNumber) return null;
  const [left, right] = contractNumber.split("/").map((part) => part.trim());
  if (!left || !right) return null;
  if (left === inspectorNumber && /^\d+$/.test(right)) return parseInt(right, 10);
  if (right === inspectorNumber && /^\d+$/.test(left)) return parseInt(left, 10);
  return null;
}

const suggestedHydraulicContractNumber = computed(() => {
  const inspectorNumber = engineerProfile.value?.inspector_number?.trim();
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
const showHydraulicCheck = ref(false);
const creatingHydraulicCheck = ref(false);
const hydraulicForm = ref<HydraulicCheckRequest | null>(null);
const hydraulicClientId = ref<string | null>(null);


const hydraulicCategoryOptions: { label: string; value: EquipmentCategory }[] = [
  { label: "מכונות הרמה", value: "lift" },
  { label: "פיגומים", value: "scaffold" },
  { label: "מעליות", value: "ladder" },
];

const hydraulicReminderMode = ref<"months" | "date">("months");
const hydraulicReminderDateMs = ref<number | null>(null);
const hydraulicIntervalMonths = ref<4 | 6 | 12 | 14>(4);
const hydraulicReminderModeOptions = [
  { label: "בעוד מספר חודשים מהיום", value: "months" },
  { label: "בתאריך מותאם אישית", value: "date" },
];
const hydraulicIntervalOptions = [
  { label: "4 חודשים", value: 4 },
  { label: "6 חודשים", value: 6 },
  { label: "12 חודשים", value: 12 },
  { label: "14 חודשים", value: 14 },
];

function disablePastHydraulicDates(ts: number): boolean {
  return startOfLocalDay(ts) < startOfLocalDay(Date.now());
}

async function openHydraulicCheck() {
  if (!engineerProfile.value) {
    await loadEngineerProfile().catch(() => {});
  }
  hydraulicClientId.value = null;
  hydraulicReminderMode.value = "months";
  hydraulicReminderDateMs.value = null;
  hydraulicIntervalMonths.value = 4;

  hydraulicForm.value = {
    contract_number: suggestedHydraulicContractNumber.value || "",
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
  loadClients();
  showHydraulicCheck.value = true;
}

function applyHydraulicClient(clientId: string | null) {
  if (!hydraulicForm.value) return;

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
}

watch(hydraulicClientId, applyHydraulicClient);

async function doCreateHydraulicCheck() {
  if (!hydraulicForm.value) return;
  if (!hydraulicClientId.value && !hydraulicForm.value.business.display_name.trim()) {
    message.warning("יש לבחור לקוח קיים או להזין שם עסק");
    return;
  }
  if (hydraulicReminderMode.value === "date" && !hydraulicReminderDateMs.value) {
    message.warning("יש לבחור תאריך תזכורת");
    return;
  }
  creatingHydraulicCheck.value = true;
  try {
    const contractNumber = hydraulicForm.value.contract_number?.trim() || suggestedHydraulicContractNumber.value;
    if (contractNumber && !hydraulicForm.value.contract_number?.trim()) {
      hydraulicForm.value.contract_number = contractNumber;
    }
    const payload: HydraulicCheckRequest = {
      ...hydraulicForm.value,
      contract_number: contractNumber || undefined,
      client_id: hydraulicClientId.value ?? undefined,
      interval_months: hydraulicIntervalMonths.value,
      next_inspection_date: hydraulicReminderMode.value === "date"
        ? formatLocalDate(hydraulicReminderDateMs.value!)
        : undefined,

    };
    const result = await api.reminders.createHydraulicCheck(payload);
    message.success(`נוצרו ${result.reminders.length} תזכורות עבור ${result.client.display_name}`);
    showHydraulicCheck.value = false;
    loadClients(true);
    await Promise.all([refresh(), loadReminders()]);
  } catch (e) {
    message.error(String(e));
  } finally {
    creatingHydraulicCheck.value = false;
  }
}

const kindOptions = [
  { label: "תסקירים", value: "inspection" },
  { label: "חוזים",   value: "contract" },
  { label: "הכל",     value: "all" },
];

const contractTypeOptions = [
  { label: "תסקיר בדיקה תקופתית", value: "תסקיר בדיקה תקופתית" },
  { label: "תסקיר בדיקה", value: "תסקיר בדיקה" },
  { label: "חוזה שירות", value: "חוזה שירות" },
  { label: "חוזה תחזוקה", value: "חוזה תחזוקה" },
  { label: "חשבונית", value: "חשבונית" },
  { label: "ביטוח", value: "ביטוח" },
  { label: "אישור", value: "אישור" },
];

const currencyOptions = [
  { label: "₪ שקל", value: "ILS" },
  { label: "$ דולר", value: "USD" },
  { label: "€ אירו", value: "EUR" },
];

const statusOptions = [
  { label: "פעיל", value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל", value: "cancelled" },
  { label: "חודש", value: "renewed" },
];

const pillFilters = computed(() => [
  { label: "הכל",     value: null },
  { label: "פעיל",    value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל",    value: "cancelled" },
  { label: "חודש",    value: "renewed" },
]);

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 200, kind: kind.value });
}

async function refresh() {
  await store.fetch({ status: statusFilter.value ?? undefined, limit: 200, kind: kind.value }, true);
}

onMounted(async () => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  refresh();
  store.fetchExpiring(30);
  loadClients();
  loadReminders();
  loadEngineerProfile().catch(() => {});
  try {
    emailTemplates.value = await api.emailTemplates.list();
  } catch { /* non-fatal */ }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      (r.contract_number ?? "").toLowerCase().includes(q) ||
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
  return [...rows].sort(compareBySerialLastFirst);
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)));
const pageStart = computed(() => (page.value - 1) * pageSize.value);
const pageEnd = computed(() => Math.min(filteredRows.value.length, pageStart.value + pageSize.value));
const pagedRows = computed(() => filteredRows.value.slice(pageStart.value, pageEnd.value));

watch([search, filterClientId, filterDateRange, statusFilter, kind, pageSize], () => {
  page.value = 1;
});

watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

function serialSortValue(row: ContractWithClient): string {
  const equipment = Array.isArray((row as any)._equipment) ? (row as any)._equipment : [];
  const firstSerial = equipment
    .map((item: any) => String(item?.serial_number ?? "").trim())
    .find(Boolean);
  return firstSerial || String(row.contract_number ?? "");
}

function compareBySerialLastFirst(a: ContractWithClient, b: ContractWithClient): number {
  const aSerial = serialSortValue(a);
  const bSerial = serialSortValue(b);
  const result = aSerial.localeCompare(bSerial, undefined, { numeric: true, sensitivity: "base" });
  if (result !== 0) return -result;
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true, sensitivity: "base" });
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
    openHydraulicCheck();
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
    const payload = { ...form.value, equipment: hasEquipment ? eq : undefined };
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
    await store.remove(deletingRow.value.id, { deleteRelatedReminders: deleteRelatedReminders.value });
    message.success("הרשומה נמחקה");
    await Promise.all([refresh(), loadReminders()]);
  } catch (e) {
    message.error(String(e));
  } finally {
    deletingRow.value = null;
    deleteRelatedReminders.value = false;
  }
}

function openDoc(row: ContractWithClient) {
  if (row.document_id) router.push(`/documents/${row.document_id}`);
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
  const header = ["מספר", "סוג", "לקוח", "תאריך התחלה", "תאריך תפוגה", "סכום", "מטבע", "סטטוס"];
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
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
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
  gap: 10px;
  flex-wrap: wrap;
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
.btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}
.btn--primary:hover { background: var(--brand-color-hover); border-color: var(--brand-color-hover); }
.btn--ghost { background: transparent; }
.btn--danger {
  background: transparent;
  border-color: var(--error-color, #d03050);
  color: var(--error-color, #d03050);
}
.btn--danger:hover { background: rgba(208, 48, 80, 0.08); }
.btn--xs { padding: 4px 10px; font-size: 12px; }
.refresh-icon { display: inline-block; transition: transform 0.4s; }
.refresh-icon--spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

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
.pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.pill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
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
.toolbar__right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
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
.search:focus { border-color: var(--brand-color); outline: none; }

/* ── Cards virtual list ──────────────────────────────────────────────── */
.cards-vlist { height: calc(100vh - 260px); }
.cards-vlist__pad { padding-bottom: 14px; }
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
.btn--ghost-active { background: var(--bg-elevated); border-color: var(--brand-color); color: var(--brand-color); }

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
.export-header { display: flex; flex-direction: column; gap: 16px; }
.export-steps { display: flex; align-items: center; }
.export-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.export-step--active { color: var(--brand-color, #18a058); font-weight: 600; }
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
.export-step--active .export-step__dot { border-color: var(--brand-color, #18a058); color: var(--brand-color, #18a058); }
.export-step--done .export-step__dot { background: var(--brand-color, #18a058); border-color: var(--brand-color, #18a058); color: #fff; }
.export-step__label { white-space: nowrap; }
.export-step__line { width: 32px; height: 2px; background: var(--border-color); margin: 0 4px; }

.export-body { min-height: 180px; }
.export-section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 16px; }

.col-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.col-check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }

.format-cards { display: flex; gap: 16px; }
.format-card {
  flex: 1;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.format-card--active { border-color: var(--brand-color, #18a058); }
.format-card__icon { font-size: 32px; margin-bottom: 8px; }
.format-card__name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.format-card__desc { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

.export-body--summary { display: flex; align-items: center; justify-content: center; }
.export-summary { text-align: center; }
.export-summary__icon { font-size: 48px; margin-bottom: 12px; }
.export-summary__text { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.export-summary__sub { font-size: 13px; color: var(--text-secondary); margin-top: 6px; }

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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
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
}

@media (max-width: 460px) {
  .page__actions {
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
