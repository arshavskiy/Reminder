<template>
  <div class="table-import-root" :class="{'table-import-root--card': variant === 'card'}">
    <!-- Non-embedded: trigger button + modal wrapper -->
    <template v-if="variant !== 'embedded'">
      <button v-if="variant === 'card'" type="button" class="table-import-card" @click="show = true">
        <span class="table-import-card__top">
          <n-icon :component="GridOutline" :size="22" />
          <span class="table-import-card__label">{{ l.reminderTableImport.cardLabel }}</span>
        </span>
        <span class="table-import-card__hint">{{ l.reminderTableImport.cardHint }}</span>
      </button>
      <slot v-else name="trigger" :open="() => (show = true)">
        <button type="button" class="btn btn--ghost" @click="show = true">
          <n-icon :component="GridOutline" class="btn-icon" />
          {{ l.reminderTableImport.triggerButton }}
        </button>
      </slot>
      <n-modal v-model:show="show" preset="card" :title="l.reminderTableImport.modalTitle" :style="{width: '900px', maxWidth: 'calc(100vw - 32px)'}" :mask-closable="!busy" :closable="!busy">
        <div class="table-import" :dir="dir">
          <p class="table-import__intro">{{ l.reminderTableImport.intro }}</p>
          <ol class="table-import__steps" :aria-label="l.reminderTableImport.stepsAria">
            <li :class="{'is-active': !preview}"><span>1</span> {{ l.reminderTableImport.step1 }}</li>
            <li :class="{'is-active': preview && !confirmed}"><span>2</span> {{ l.reminderTableImport.step2 }}</li>
            <li :class="{'is-active': confirmed}"><span>3</span> {{ l.reminderTableImport.step3 }}</li>
          </ol>
          <section class="table-import__templates" :aria-label="l.reminderTableImport.templatesAria">
            <div class="table-import__section-heading"><strong>{{ l.reminderTableImport.templatesHeading }}</strong><span>{{ l.reminderTableImport.templatesSub }}</span></div>
            <div class="table-import__links">
              <a href="/templates/remindocr-import-20.xlsx" download="remindocr-import-20.xlsx"><n-icon :component="DocumentOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateExcel }}</strong><small>{{ l.reminderTableImport.templateExcelSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
              <a href="/templates/remindocr-import-20-he.csv" download="remindocr-import-20-he.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateCsvHe }}</strong><small>{{ l.reminderTableImport.templateCsvHeSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
              <a href="/templates/remindocr-import-20-en.csv" download="remindocr-import-20-en.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateCsvEn }}</strong><small>{{ l.reminderTableImport.templateCsvEnSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
            </div>
          </section>
          <div class="table-import__upload" :class="{'is-dragging': dragging}" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
            <n-icon :component="CloudUploadOutline" :size="34" class="table-import__upload-icon" />
            <strong>{{ file?.name || l.reminderTableImport.dropHint }}</strong>
            <span>{{ file ? l.reminderTableImport.dropHintHasFile : l.reminderTableImport.dropHintNoFile }}</span>
            <n-button :disabled="busy" secondary type="primary" @click="fileInput?.click()">{{ file ? l.reminderTableImport.replaceFile : l.reminderTableImport.chooseFile }}</n-button>
            <small dir="ltr">{{ l.reminderTableImport.fileLimits }}</small>
            <input ref="fileInput" class="table-import__file-input" type="file" accept=".csv,.xls,.xlsx" :disabled="busy" :aria-label="l.reminderTableImport.fileInputAria" @change="selectFile" />
          </div>
          <div class="table-import__requirements"><n-icon :component="InformationCircleOutline" :size="18" /><p>{{ t('reminderTableImport.requirements', {name: l.reminderTableImport.requiredName, expiry: l.reminderTableImport.requiredExpiry, format: 'YYYY-MM-DD'}) }}</p></div>
          <n-alert v-if="error" type="error" role="alert">{{ error }}</n-alert>
          <n-alert v-if="success" type="success" role="status">{{ success }}</n-alert>
          <n-spin :show="busy">
            <template v-if="preview">
              <div class="table-import__summary"><strong>{{ l.reminderTableImport.previewTitle }}</strong><span>{{ t('reminderTableImport.previewSummary', {rows: preview.rows.length, reminders: preview.reminderCount, newReminders: preview.newReminderCount}) }}</span></div>
              <div class="table-import__messages">
                <n-alert v-for="warning in preview.warnings" :key="warning" type="warning">{{ warning }}</n-alert>
                <n-alert v-for="issue in preview.errors" :key="issue" type="error">{{ issue }}</n-alert>
              </div>
              <div class="table-import__scroll reminders-table">
                <table>
                  <thead>
                    <tr>
                      <th>{{ l.reminderTableImport.colRow }}</th>
                      <th>{{ l.reminderTableImport.colName }}</th>
                      <th>{{ l.reminderTableImport.colClient }}</th>
                      <th>{{ l.reminderTableImport.colExpiry }}</th>
                      <th>{{ l.reminderTableImport.colReminderDates }}</th>
                      <th>{{ l.reminderTableImport.colRecipients }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in preview.rows" :key="`${row.sheet}:${row.row}`">
                      <td class="reminder-source-cell">{{ row.sheet }}:{{ row.row }}</td>
                      <td><span class="reminder-name-cell">{{ row.name }}</span></td>
                      <td><span class="reminder-client-link">{{ row.fields.clientName || "—" }}</span></td>
                      <td><span class="reminder-date-cell__date" dir="ltr">{{ row.expiry }}</span></td>
                      <td class="reminder-muted-cell" dir="ltr">{{ row.dates.join(", ") }}</td>
                      <td class="reminder-email-cell">{{ row.recipients.join("; ") || l.reminderTableImport.noEmail }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <details class="table-import__details"><summary>{{ l.reminderTableImport.detailsSummary }}</summary><p>{{ l.reminderTableImport.detailsBody1 }}</p><p>{{ l.reminderTableImport.detailsBody2 }}</p></details>
            </template>
          </n-spin>
          <div class="table-import__footer"><span>{{ confirmed ? l.reminderTableImport.footerConfirmed : l.reminderTableImport.footerPending }}</span><div><n-button :disabled="busy" @click="closeImport">{{ confirmed ? l.reminderTableImport.close : l.reminderTableImport.cancel }}</n-button><n-button v-if="!confirmed" type="primary" :loading="busy" :disabled="busy || !preview || preview.errors.length > 0 || !preview.rows.length" @click="confirm">{{ preview ? t('reminderTableImport.importN', {count: preview.rows.length}) : l.reminderTableImport.importToSystem }}</n-button></div></div>
        </div>
      </n-modal>
    </template>

    <!-- Embedded variant: content only, no trigger or modal -->
    <div v-else class="table-import" :dir="dir">
      <p class="table-import__intro">{{ l.reminderTableImport.intro }}</p>
      <ol class="table-import__steps" :aria-label="l.reminderTableImport.stepsAria">
        <li :class="{'is-active': !preview}"><span>1</span> {{ l.reminderTableImport.step1 }}</li>
        <li :class="{'is-active': preview && !confirmed}"><span>2</span> {{ l.reminderTableImport.step2 }}</li>
        <li :class="{'is-active': confirmed}"><span>3</span> {{ l.reminderTableImport.step3 }}</li>
      </ol>
      <section class="table-import__templates" :aria-label="l.reminderTableImport.templatesAria">
        <div class="table-import__section-heading"><strong>{{ l.reminderTableImport.templatesHeading }}</strong><span>{{ l.reminderTableImport.templatesSub }}</span></div>
        <div class="table-import__links">
          <a href="/templates/remindocr-import-20.xlsx" download="remindocr-import-20.xlsx"><n-icon :component="DocumentOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateExcel }}</strong><small>{{ l.reminderTableImport.templateExcelSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
          <a href="/templates/remindocr-import-20-he.csv" download="remindocr-import-20-he.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateCsvHe }}</strong><small>{{ l.reminderTableImport.templateCsvHeSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
          <a href="/templates/remindocr-import-20-en.csv" download="remindocr-import-20-en.csv"><n-icon :component="DocumentTextOutline" :size="22" /><span><strong>{{ l.reminderTableImport.templateCsvEn }}</strong><small>{{ l.reminderTableImport.templateCsvEnSub }}</small></span><n-icon :component="DownloadOutline" :size="18" /></a>
        </div>
      </section>
      <div class="table-import__upload" :class="{'is-dragging': dragging}" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
        <n-icon :component="CloudUploadOutline" :size="34" class="table-import__upload-icon" />
        <strong>{{ file?.name || l.reminderTableImport.dropHint }}</strong>
        <span>{{ file ? l.reminderTableImport.dropHintHasFile : l.reminderTableImport.dropHintNoFile }}</span>
        <n-button :disabled="busy" secondary type="primary" @click="fileInput?.click()">{{ file ? l.reminderTableImport.replaceFile : l.reminderTableImport.chooseFile }}</n-button>
        <small dir="ltr">{{ l.reminderTableImport.fileLimits }}</small>
        <input ref="fileInput" class="table-import__file-input" type="file" accept=".csv,.xls,.xlsx" :disabled="busy" :aria-label="l.reminderTableImport.fileInputAria" @change="selectFile" />
      </div>
      <div class="table-import__requirements"><n-icon :component="InformationCircleOutline" :size="18" /><p>{{ t('reminderTableImport.requirements', {name: l.reminderTableImport.requiredName, expiry: l.reminderTableImport.requiredExpiry, format: 'YYYY-MM-DD'}) }}</p></div>
      <n-alert v-if="error" type="error" role="alert">{{ error }}</n-alert>
      <n-alert v-if="success" type="success" role="status">{{ success }}</n-alert>
      <n-spin :show="busy">
        <template v-if="preview">
          <div class="table-import__summary"><strong>{{ l.reminderTableImport.previewTitle }}</strong><span>{{ t('reminderTableImport.previewSummary', {rows: preview.rows.length, reminders: preview.reminderCount, newReminders: preview.newReminderCount}) }}</span></div>
          <div class="table-import__messages">
            <n-alert v-for="warning in preview.warnings" :key="warning" type="warning">{{ warning }}</n-alert>
            <n-alert v-for="issue in preview.errors" :key="issue" type="error">{{ issue }}</n-alert>
          </div>
          <div class="table-import__scroll reminders-table">
            <table>
              <thead>
                <tr>
                  <th>{{ l.reminderTableImport.colRow }}</th>
                  <th>{{ l.reminderTableImport.colName }}</th>
                  <th>{{ l.reminderTableImport.colClient }}</th>
                  <th>{{ l.reminderTableImport.colExpiry }}</th>
                  <th>{{ l.reminderTableImport.colReminderDates }}</th>
                  <th>{{ l.reminderTableImport.colRecipients }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in preview.rows" :key="`${row.sheet}:${row.row}`">
                  <td class="reminder-source-cell">{{ row.sheet }}:{{ row.row }}</td>
                  <td><span class="reminder-name-cell">{{ row.name }}</span></td>
                  <td><span class="reminder-client-link">{{ row.fields.clientName || "—" }}</span></td>
                  <td><span class="reminder-date-cell__date" dir="ltr">{{ row.expiry }}</span></td>
                  <td class="reminder-muted-cell" dir="ltr">{{ row.dates.join(", ") }}</td>
                  <td class="reminder-email-cell">{{ row.recipients.join("; ") || l.reminderTableImport.noEmail }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <details class="table-import__details"><summary>{{ l.reminderTableImport.detailsSummary }}</summary><p>{{ l.reminderTableImport.detailsBody1 }}</p><p>{{ l.reminderTableImport.detailsBody2 }}</p></details>
        </template>
      </n-spin>
      <div class="table-import__footer"><span>{{ confirmed ? l.reminderTableImport.footerConfirmed : l.reminderTableImport.footerPending }}</span><div><n-button :disabled="busy" @click="closeImport">{{ confirmed ? l.reminderTableImport.close : l.reminderTableImport.cancel }}</n-button><n-button v-if="!confirmed" type="primary" :loading="busy" :disabled="busy || !preview || preview.errors.length > 0 || !preview.rows.length" @click="confirm">{{ preview ? t('reminderTableImport.importN', {count: preview.rows.length}) : l.reminderTableImport.importToSystem }}</n-button></div></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from "vue";
import {useDevModal} from "../composables/useDevModal.js";
import {NAlert, NButton, NIcon, NModal, NSpin} from "naive-ui";
import {GridOutline, CloudUploadOutline, DownloadOutline, DocumentOutline, DocumentTextOutline, InformationCircleOutline} from "@vicons/ionicons5";
import {api} from "../services/apiService";
import {useI18n} from "../composables/useI18n.js";
type Preview = {rows: {row: number; sheet: string; name: string; expiry: string; dates: string[]; recipients: string[]; fields: Record<string, string>}[]; errors: string[]; warnings: string[]; reminderCount: number; newReminderCount: number};
const props = withDefaults(defineProps<{variant?: "button" | "card" | "embedded"}>(), {variant: "button"});
const emit = defineEmits<{imported: []; close: []}>();
const {l, t, dir} = useI18n();
const show = ref(false);
useDevModal("reminderTableImport", show);
function closeImport() {
  if (props.variant === "embedded") emit("close");
  else show.value = false;
}
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
  if (event.dataTransfer?.files.length !== 1) { error.value = l.value.reminderTableImport.errorOneFile; return; }
  await previewFile(event.dataTransfer.files[0]);
}
async function previewFile(selected: File | null) {
  file.value = selected;
  preview.value = null; error.value = ""; success.value = ""; confirmed.value = false;
  if (!file.value) return;
  if (!/\.(csv|xls|xlsx)$/i.test(file.value.name)) { error.value = l.value.reminderTableImport.errorFileType; return; }
  if (file.value.size > 5 * 1024 * 1024) { error.value = l.value.reminderTableImport.errorFileSize; return; }
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
    success.value = t("reminderTableImport.successMessage", {created: result.createdReminders, skipped: result.skippedReminders});
    confirmed.value = true; emit("imported");
  } catch (e) { error.value = t("reminderTableImport.errorRetryHint", {message: (e as Error).message}); }
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
