<template>
  <section class="gmail-job" :class="`gmail-job--${job.status}`" role="status" aria-live="polite">
    <div class="gmail-job__head">
      <div class="gmail-job__title">
        <n-icon :component="statusIcon" :size="18" />
        <span>{{ statusTitle }}</span>
      </div>
      <button
        v-if="dismissible"
        class="btn btn--ghost btn--xs icon-btn"
        type="button"
        aria-label="סגור סטטוס ייבוא"
        @click="$emit('dismiss')"
      >
        <n-icon :component="CloseOutline" :size="14" />
      </button>
    </div>

    <div class="gmail-job__bar" aria-hidden="true">
      <div class="gmail-job__bar-fill" :style="{ width: `${progressPct}%` }" />
    </div>

    <p v-if="inlineReceipts && job.status === 'completed'" class="gmail-job__plain">{{ inlineSummary }}</p>
    <ul v-if="inlineReceipts && savedResults.length" class="gmail-job__saved">
      <li v-for="result in savedResults" :key="result.messageId">{{ result.filename }}</li>
    </ul>

    <div v-if="!inlineReceipts" class="gmail-job__stats">
      <span>{{ job.processedMessages }} מתוך {{ totalForProgress }} מיילים נסרקו</span>
      <span>{{ job.attachmentsFound ?? job.results.length }} קבצים נמצאו</span>
      <span>{{ job.stored ?? job.imported }} נשמרו</span>
      <span>{{ job.classifiedInvoices ?? 0 }} סווגו כחשבונית</span>
      <span>{{ job.rejected ?? 0 }} נדחו</span>
      <span v-if="job.ocrFailed" class="gmail-job__error">{{ job.ocrFailed }} OCR נכשל</span>
      <span v-if="job.aiRetryPending" class="gmail-job__warn">{{ job.aiRetryPending }} ממתינים לניסיון AI חוזר</span>
      <span v-if="job.errors" class="gmail-job__error">{{ job.errors }} שגיאות</span>
    </div>

    <div v-if="!inlineReceipts && summaryItems.length" class="gmail-job__summary" aria-label="פירוט תוצאות ייבוא">
      <span
        v-for="item in summaryItems"
        :key="item.key"
        class="gmail-job__chip"
        :class="`gmail-job__chip--${item.key}`"
      >
        {{ item.label }} {{ item.count }}
      </span>
    </div>

    <div v-if="!inlineReceipts && retryableCount" class="gmail-job__retry">
      <span>{{ retryableCount }} קבצים נכשלו ואפשר לנסות שוב</span>
      <button class="btn btn--ghost btn--xs" type="button" @click="$emit('retry', 'retryable')">
        נסה שוב
      </button>
    </div>

    <details v-if="!inlineReceipts && visibleResults.length" class="gmail-job__details">
      <summary>{{ inlineReceipts ? "מיילים שלא נשמרו" : "פירוט קבצים" }}</summary>
      <div class="gmail-job__result-list">
        <div v-for="result in visibleResults" :key="`${result.messageId}:${result.filename}`" class="gmail-job__result">
          <span class="gmail-job__result-file" :title="resultLabel(result)">{{ resultLabel(result) }}</span>
          <span class="gmail-job__result-status" :class="`gmail-job__result-status--${resultStatus(result)}`">
            {{ resultStatusLabel(resultStatus(result)) }}
          </span>
          <span class="gmail-job__result-reason" :title="result.explanation ?? result.rejection_label ?? result.error ?? ''">
            {{ resultReason(result) }}
          </span>
        </div>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {NIcon} from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseOutline,
  CloudDownloadOutline,
  TimeOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import type {GmailImportJob} from "../services/apiService.js";

const props = defineProps<{
  job: GmailImportJob;
  dismissible?: boolean;
}>();

defineEmits<{
  dismiss: [];
  retry: [mode: "failed" | "rejected" | "retryable"];
}>();

const inlineReceipts = computed(() => props.job.q === "inline-receipts");
const savedCount = computed(() => Number(props.job.stored ?? props.job.imported ?? 0));
const inlineSummary = computed(() => {
  const saved = `${savedCount.value} קבלות נשמרו בטבלה, בלי קובץ.`;
  const skipped = props.job.rejected ?? 0;
  if (!skipped) return saved;
  return `${saved} ${skipped} מיילים דולגו: לא נמצא בהם גם סכום וגם מספר עסקה, אז אין מה לשמור.`;
});
const totalForProgress = computed(() => props.job.newMessages || props.job.totalMessages || props.job.total || 0);
const progressPct = computed(() => {
  if (props.job.status === "completed") return 100;
  if (props.job.status === "failed") return 100;
  const total = totalForProgress.value;
  if (!total) return props.job.status === "running" ? 12 : 4;
  return Math.max(4, Math.min(100, Math.round((props.job.processedMessages / total) * 100)));
});

const statusTitle = computed(() => {
  if (props.job.status === "queued") return "ייבוא Gmail ממתין בתור";
  if (props.job.status === "running") return "ייבוא Gmail מתבצע";
  if (props.job.status === "failed") return props.job.error ? `ייבוא Gmail נכשל: ${props.job.error}` : "ייבוא Gmail נכשל";
  if (inlineReceipts.value) return `${savedCount.value} קבלות נשמרו`;
  return `ייבוא Gmail הושלם: ${props.job.imported} קבצים`;
});

const statusIcon = computed(() => {
  if (props.job.status === "completed") return CheckmarkCircleOutline;
  if (props.job.status === "failed") return WarningOutline;
  if (props.job.status === "queued") return TimeOutline;
  return CloudDownloadOutline;
});

const summaryItems = computed(() => {
  const summary = props.job.explanationSummary ?? {};
  if (inlineReceipts.value) {
    return [
      { key: "stored", label: "נשמרו", count: savedCount.value },
      { key: "rejected", label: "לא זוהו", count: Number(props.job.rejected ?? summary.rejected ?? 0) },
      { key: "failed", label: "נכשלו", count: Number(summary.failed ?? props.job.errors ?? 0) },
    ].filter((item) => item.count > 0);
  }
  return [
    { key: "stored", label: "נשמרו", count: Number(props.job.stored ?? summary.stored ?? props.job.imported ?? 0) },
    { key: "invoice", label: "חשבוניות", count: Number(props.job.classifiedInvoices ?? summary.invoice ?? 0) },
    { key: "failed", label: "נכשלו", count: Number(summary.failed ?? props.job.errors ?? 0) },
    { key: "rejected", label: "נדחו", count: Number(props.job.rejected ?? summary.rejected ?? 0) },
    { key: "ocr_failed", label: "OCR נכשל", count: Number(props.job.ocrFailed ?? summary.ocr_failed ?? 0) },
    { key: "quota_limited", label: "מגבלה", count: Number(summary.quota_limited ?? 0) },
  ].filter((item) => item.count > 0);
});

const retryableCount = computed(() => {
  if (inlineReceipts.value) {
    return (props.job.results ?? []).filter((result) => resultStatus(result) === "failed").length;
  }
  return Number(props.job.explanationSummary?.retryable ?? 0);
});
const savedResults = computed(() =>
  (props.job.results ?? []).filter((result) => resultStatus(result) === "invoice").slice(0, 8),
);
const visibleResults = computed(() => (props.job.results ?? []).slice(0, 12));

function resultLabel(result: GmailImportJob["results"][number]): string {
  if (inlineReceipts.value && /^[0-9a-f]{8,}$/i.test(result.filename)) return "מייל ללא קבלה";
  return result.filename;
}

function resultReason(result: GmailImportJob["results"][number]): string {
  if (result.error === "not_a_recognized_inline_receipt") return "אין סכום ומספר עסקה שאפשר לשמור";
  return result.explanation ?? result.rejection_label ?? result.error ?? "—";
}

function resultStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    imported: "יובא",
    invoice: "חשבונית",
    stored: "נשמר",
    failed: "נכשל",
    rejected: "נדחה",
    skipped: "דולג",
    quota_limited: "מגבלה",
    missing_document: "חסר",
    ocr_failed: "OCR נכשל",
  };
  return labels[status] ?? status;
}

function resultStatus(result: GmailImportJob["results"][number]): string {
  return result.importStatus ?? result.import_status ?? (result.documentId ? "stored" : "failed");
}
</script>

<style scoped>
.gmail-job {
  display: grid;
  gap: 10px;
  margin: 12px 0;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
}

.gmail-job__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gmail-job__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.gmail-job__bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-elevated);
}

.gmail-job__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--brand-color);
  transition: width 180ms ease;
}

.gmail-job--completed .gmail-job__bar-fill {
  background: var(--color-success);
}

.gmail-job--failed .gmail-job__bar-fill,
.gmail-job__error {
  color: var(--color-error);
}

.gmail-job__warn {
  color: #c4841d;
}

.gmail-job--failed .gmail-job__bar-fill {
  background: var(--color-error);
}

.gmail-job__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

.gmail-job__plain {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}

.gmail-job__saved {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gmail-job__saved li {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-success) 13%, var(--bg-card));
  color: var(--color-success);
  font-size: 12px;
  font-weight: 700;
}

.gmail-job__summary,
.gmail-job__retry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.gmail-job__chip,
.gmail-job__result-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.gmail-job__chip--stored,
.gmail-job__chip--invoice,
.gmail-job__chip--imported,
.gmail-job__result-status--stored,
.gmail-job__result-status--invoice,
.gmail-job__result-status--imported {
  background: color-mix(in srgb, var(--color-success) 13%, var(--bg-card));
  color: var(--color-success);
}

.gmail-job__chip--failed,
.gmail-job__chip--rejected,
.gmail-job__chip--ocr_failed,
.gmail-job__result-status--failed,
.gmail-job__result-status--rejected,
.gmail-job__result-status--ocr_failed,
.gmail-job__result-status--missing_document {
  background: color-mix(in srgb, var(--color-error) 13%, var(--bg-card));
  color: var(--color-error);
}

.gmail-job__chip--quota_limited,
.gmail-job__result-status--quota_limited,
.gmail-job__result-status--skipped {
  background: color-mix(in srgb, #f0a020 15%, var(--bg-card));
  color: #c4841d;
}

.gmail-job__retry {
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, #f0a020 28%, var(--border-color));
  border-radius: 8px;
  background: color-mix(in srgb, #f0a020 7%, var(--bg-card));
  color: var(--text-primary);
  font-size: 13px;
}

.gmail-job__details {
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

.gmail-job__details summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.gmail-job__result-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.gmail-job__result {
  display: grid;
  grid-template-columns: minmax(130px, 1.1fr) auto minmax(140px, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--bg-elevated);
  font-size: 12px;
}

.gmail-job__result-file,
.gmail-job__result-reason {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-job__result-file {
  color: var(--text-primary);
  font-weight: 700;
}

.gmail-job__result-reason {
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .gmail-job__result {
    grid-template-columns: 1fr;
  }
}
</style>
