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

    <div class="gmail-job__stats">
      <span>{{ job.processedMessages }} מתוך {{ totalForProgress }} הודעות</span>
      <span>{{ job.imported }} קבצים יובאו</span>
      <span>{{ job.skipped }} דולגו</span>
      <span v-if="job.errors" class="gmail-job__error">{{ job.errors }} שגיאות</span>
    </div>
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
}>();

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
  return `ייבוא Gmail הושלם: ${props.job.imported} קבצים`;
});

const statusIcon = computed(() => {
  if (props.job.status === "completed") return CheckmarkCircleOutline;
  if (props.job.status === "failed") return WarningOutline;
  if (props.job.status === "queued") return TimeOutline;
  return CloudDownloadOutline;
});
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
</style>
