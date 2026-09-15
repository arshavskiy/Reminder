<template>
  <div class="table-import-root" :class="{'table-import-root--card': variant === 'card'}">
  <button v-if="variant === 'card'" type="button" class="table-import-card" @click="show = true">
    <span class="table-import-card__top">
      <n-icon :component="GridOutline" :size="22" />
      <span class="table-import-card__label">ייבוא Excel / CSV</span>
    </span>
    <span class="table-import-card__hint">הוסף תזכורות מקובץ</span>
  </button>
  <slot v-else name="trigger" :open="() => (show = true)">
    <button type="button" class="btn btn--ghost" @click="show = true">
      <n-icon :component="GridOutline" class="btn-icon" />
      ייבוא Excel / CSV
    </button>
  </slot>
  <n-modal v-model:show="show" preset="card" title="ייבוא תזכורות מטבלה" :style="{width: '900px', maxWidth: 'calc(100vw - 32px)'}" :mask-closable="!busy" :closable="!busy">
    <div class="table-import" dir="rtl">
      <p class="table-import__intro">הוסיפו לקוחות, תאריכי תוקף ותזכורות מתוך קובץ אחד. בדקו את הנתונים לפני השמירה.</p>
      <ol class="table-import__steps" aria-label="שלבי הייבוא">
        <li :class="{'is-active': !preview}"><span>1</span> בחירת קובץ</li>
        <li :class="{'is-active': preview && !confirmed}"><span>2</span> בדיקת הנתונים</li>
        <li :class="{'is-active': confirmed}"><span>3</span> ייבוא למערכת</li>
      </ol>
      <section class="table-import__templates" aria-label="קבצים לדוגמה">
        <div class="table-import__section-heading"><strong>מתחילים עם קובץ לדוגמה?</strong><span>20 פריטים בכל קובץ · אותם נתונים בכל הפורמטים</span></div>
        <div class="table-import__links">
          <a href="/templates/remindocr-import-20.xlsx" download="remindocr-import-20.xlsx"><n-icon :component="DocumentOutline" :size="22" /><span><strong>Excel</strong><small>כותרות בעברית · XLSX</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
          <a href="/templates/remindocr-import-20-he.csv" download="remindocr-import-20-he.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>CSV בעברית</strong><small>20 פריטים לדוגמה</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
          <a href="/templates/remindocr-import-20-en.csv" download="remindocr-import-20-en.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>CSV באנגלית</strong><small>English column headers</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
        </div>
      </section>
      <div class="table-import__upload" :class="{'is-dragging': dragging}" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
        <n-icon :component="CloudUploadOutline" :size="34" class="table-import__upload-icon" />
        <strong>{{ file?.name || 'גררו לכאן קובץ Excel או CSV' }}</strong>
        <span>{{ file ? 'אפשר לבחור קובץ אחר כדי להחליף את הנתונים' : 'טבלאות בעברית ובאנגלית מתקבלות באופן אוטומטי' }}</span>
        <n-button :disabled="busy" secondary type="primary" @click="fileInput?.click()">{{ file ? 'החלפת קובץ' : 'בחירת קובץ מהמחשב' }}</n-button>
        <small dir="ltr">CSV / XLS / XLSX · 5 MB · עד 500 פריטים</small>
        <input ref="fileInput" class="table-import__file-input" type="file" accept=".csv,.xls,.xlsx" :disabled="busy" aria-label="בחירת קובץ לייבוא" @change="selectFile" />
      </div>
      <div class="table-import__requirements"><n-icon :component="InformationCircleOutline" :size="18" /><p>שדות חובה: <strong>שם תזכורת</strong> ו־<strong>תאריך תפוגה</strong> (<bdi>YYYY-MM-DD</bdi>). ללא ימי התראה, התזכורת תיווצר ביום התפוגה.</p></div>
      <n-alert v-if="error" type="error" role="alert">{{ error }}</n-alert>
      <n-alert v-if="success" type="success" role="status">{{ success }}</n-alert>
      <n-spin :show="busy">
        <template v-if="preview">
          <div class="table-import__summary"><strong>תצוגה מקדימה</strong><span>{{ preview.rows.length }} פריטים · {{ preview.reminderCount }} תזכורות · {{ preview.newReminderCount }} חדשות</span></div>
          <div class="table-import__messages">
            <n-alert v-for="warning in preview.warnings" :key="warning" type="warning">{{ warning }}</n-alert>
            <n-alert v-for="issue in preview.errors" :key="issue" type="error">{{ issue }}</n-alert>
          </div>
          <div class="table-import__scroll reminders-table">
            <table>
              <thead>
                <tr>
                  <th>שורה</th>
                  <th>שם</th>
                  <th>לקוח</th>
                  <th>תפוגה</th>
                  <th>תאריכי תזכורות</th>
                  <th>נמענים</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in preview.rows" :key="`${row.sheet}:${row.row}`">
                  <td class="reminder-source-cell">{{ row.sheet }}:{{ row.row }}</td>
                  <td><span class="reminder-name-cell">{{ row.name }}</span></td>
                  <td><span class="reminder-client-link">{{ row.fields.clientName || "—" }}</span></td>
                  <td><span class="reminder-date-cell__date" dir="ltr">{{ row.expiry }}</span></td>
                  <td class="reminder-muted-cell" dir="ltr">{{ row.dates.join(", ") }}</td>
                  <td class="reminder-email-cell">{{ row.recipients.join("; ") || "ללא אימייל" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <details class="table-import__details"><summary>מה יקרה לאחר הייבוא?</summary><p>מסמכים, אחראי, תיקייה, תגיות ועדיפות נשמרים כמידע נלווה. קבצים מצורפים אינם מועלים דרך הטבלה. ייבוא חוזר של אותם מזהים ידלג על תזכורות קיימות.</p><p>תזכורות עם נמענים יטופלו לפי הגדרות השליחה בחשבון. סנכרון Google Calendar דורש חיבור יומן פעיל.</p></details>
        </template>
      </n-spin>
      <div class="table-import__footer"><span>{{ confirmed ? 'הייבוא הושלם' : 'הנתונים יישמרו רק לאחר אישור הייבוא' }}</span><div><n-button :disabled="busy" @click="show = false">{{ confirmed ? 'סגירה' : 'ביטול' }}</n-button><n-button v-if="!confirmed" type="primary" :loading="busy" :disabled="busy || !preview || preview.errors.length > 0 || !preview.rows.length" @click="confirm">{{ preview ? `ייבוא ${preview.rows.length} פריטים` : 'ייבוא למערכת' }}</n-button></div></div>
    </div>
  </n-modal>
  </div>
</template>

<script setup lang="ts">
import {ref} from "vue";
import {NAlert, NButton, NIcon, NModal, NSpin} from "naive-ui";
import {GridOutline, CloudUploadOutline, DownloadOutline, DocumentOutline, DocumentTextOutline, InformationCircleOutline} from "@vicons/ionicons5";
import {api} from "../services/apiService";
type Preview = {rows: {row: number; sheet: string; name: string; expiry: string; dates: string[]; recipients: string[]; fields: Record<string, string>}[]; errors: string[]; warnings: string[]; reminderCount: number; newReminderCount: number};
withDefaults(defineProps<{variant?: "button" | "card"}>(), {variant: "button"});
const emit = defineEmits<{imported: []}>();
const show = ref(false);
const busy = ref(false);
const file = ref<File | null>(null);
const preview = ref<Preview | null>(null);
const error = ref("");
const success = ref("");
const confirmed = ref(false);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
async function selectFile(event: Event) {
  await previewFile((event.target as HTMLInputElement).files?.[0] ?? null);
  (event.target as HTMLInputElement).value = "";
}
async function dropFile(event: DragEvent) {
  dragging.value = false;
  if (busy.value) return;
  if (event.dataTransfer?.files.length !== 1) { error.value = "יש לבחור קובץ אחד בכל ייבוא"; return; }
  await previewFile(event.dataTransfer.files[0]);
}
async function previewFile(selected: File | null) {
  file.value = selected;
  preview.value = null; error.value = ""; success.value = ""; confirmed.value = false;
  if (!file.value) return;
  if (!/\.(csv|xls|xlsx)$/i.test(file.value.name)) { error.value = "יש לבחור קובץ CSV או Excel"; return; }
  if (file.value.size > 5 * 1024 * 1024) { error.value = "גודל הקובץ המרבי הוא 5 MB"; return; }
  busy.value = true;
  try { preview.value = await api.importReminderTable<Preview>(file.value, "preview"); }
  catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
async function confirm() {
  if (!file.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const result = await api.importReminderTable<{createdReminders: number; skippedReminders: number}>(file.value, "confirm");
    success.value = `נוצרו ${result.createdReminders} תזכורות. ${result.skippedReminders} תזכורות קיימות דולגו.`;
    confirmed.value = true; emit("imported");
  } catch (e) { error.value = `${(e as Error).message}. ניתן לנסות שוב עם אותו קובץ; תזכורות שכבר נוצרו לא יוכפלו.`; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.table-import-root--card {
  display: flex;
  min-width: 0;
  width: 100%;
}
.table-import-card {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 60px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 40%, var(--border-color));
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast);
}
.table-import-card:hover {
  background: var(--bg-hover);
  border-color: color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  box-shadow: var(--shadow-sm);
}
.table-import-card:active { transform: scale(0.98); }
.table-import-card__top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.table-import-card__top :deep(.n-icon) { color: var(--brand-color); }
.table-import-card__label {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
.table-import-card__hint {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.3;
}
.table-import { display: grid; gap: 20px; color: var(--text-primary); font-family: var(--font-ui); }
.table-import p { margin: 0; }
.table-import__intro, .table-import small, .table-import__section-heading > span { color: var(--text-secondary); }
.table-import__steps { display: flex; padding: 0; margin: 0; list-style: none; gap: 24px; font-size: 13px; color: var(--text-secondary); }
.table-import__steps li { display: flex; align-items: center; gap: 7px; }
.table-import__steps li > span { display: grid; place-items: center; border: 1px solid var(--border-color, #8884); width: 24px; height: 24px; border-radius: 50%; }
.table-import__steps .is-active { color: var(--brand-color); font-weight: 600; }
.table-import__steps .is-active > span { border-color: var(--brand-color); background: color-mix(in srgb, var(--brand-color) 10%, transparent); }
.table-import__section-heading { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; }
.table-import__links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.table-import__links a { display: flex; align-items: center; gap: 10px; padding: 14px; border: 1px solid var(--border-color, #8884); border-radius: 10px; color: var(--text-primary); text-decoration: none; transition: border-color .15s, background .15s; }
.table-import__links a:hover, .table-import__links a:focus-visible { border-color: var(--brand-color); background: color-mix(in srgb, var(--brand-color) 6%, transparent); }
.table-import__links a > span { flex: 1; display: grid; gap: 3px; }
.table-import__links a > .n-icon { color: var(--brand-color); flex-shrink: 0; }
.table-import__links small { font-size: 11px; }
.table-import__upload { display: flex; flex-direction: column; align-items: center; gap: 9px; text-align: center; padding: 26px 20px; border: 1.5px dashed var(--border-color, #8886); border-radius: 12px; background: color-mix(in srgb, var(--brand-color) 3%, var(--bg-card)); }
.table-import__upload.is-dragging { border-color: var(--brand-color); background: color-mix(in srgb, var(--brand-color) 10%, var(--bg-card)); }
.table-import__upload > strong { overflow-wrap: anywhere; }
.table-import__upload > span { color: var(--text-secondary); font-size: 13px; }
.table-import__upload-icon { color: var(--brand-color); }
.table-import__file-input { display: none; }
.table-import__requirements { display: flex; gap: 8px; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.table-import__requirements > .n-icon { flex-shrink: 0; margin-top: 2px; }
.table-import__summary { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.table-import__messages { display: grid; gap: 8px; max-height: 200px; overflow: auto; }
.table-import__scroll { overflow: auto; max-height: 360px; margin: 12px 0; }
.reminders-table {
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}
.table-import table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 14px;
}
.table-import th,
.table-import td {
  padding: 12px 16px;
  text-align: right;
  vertical-align: top;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}
.table-import th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.table-import tbody tr:last-child td { border-bottom: 0; }
.table-import tbody tr:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}
.reminder-name-cell {
  display: block;
  font-weight: 700;
  line-height: 1.45;
}
.reminder-client-link {
  color: var(--brand-color);
  font-size: 14px;
  font-weight: 700;
}
.reminder-date-cell__date {
  display: block;
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.45;
  white-space: nowrap;
}
.reminder-source-cell {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.reminder-muted-cell,
.reminder-email-cell {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}
.reminder-email-cell {
  direction: ltr;
  text-align: right;
}
.table-import__details { font-size: 12px; color: var(--text-secondary); line-height: 1.8; }
.table-import__details summary { cursor: pointer; }
.table-import__details p { margin-top: 8px; }
.table-import__footer { border-top: 1px solid var(--border-color, #8884); padding-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.table-import__footer > span { font-size: 12px; color: var(--text-secondary); }
.table-import__footer > div { display: flex; gap: 8px; }
@media (max-width: 600px) {
  .table-import__links { grid-template-columns: 1fr; }
  .table-import__links a { padding: 10px 12px; }
  .table-import__steps { gap: 12px; font-size: 11px; }
  .table-import__footer { align-items: stretch; flex-direction: column; }
  .table-import__footer > div { justify-content: flex-end; }
}
</style>
