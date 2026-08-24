<template>
  <section class="drive-job" :class="`drive-job--${job.status}`" role="status" aria-live="polite">
    <div class="drive-job__head">
      <div class="drive-job__title">
        <n-icon :component="statusIcon" :size="18" />
        <span>{{ statusTitle }}</span>
      </div>
      <button
        v-if="dismissible"
        class="btn btn--ghost btn--xs icon-btn"
        type="button"
        aria-label="סגור סטטוס ייצוא"
        @click="$emit('dismiss')"
      >
        <n-icon :component="CloseOutline" :size="14" />
      </button>
    </div>

    <div class="drive-job__bar" aria-hidden="true">
      <div class="drive-job__bar-fill" :style="{ width: `${progressPct}%` }" />
    </div>

    <div class="drive-job__stats">
      <span>{{ job.processed }} מתוך {{ job.total }} מסמכים</span>
      <span>{{ job.uploaded }} הועלו</span>
      <span>{{ job.skipped }} דולגו</span>
      <span v-if="job.failed" class="drive-job__error">{{ job.failed }} נכשלו</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed} from "vue";
import {NIcon} from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseOutline,
  CloudUploadOutline,
  TimeOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import type {DriveExportJob} from "../services/apiService.js";

const props = defineProps<{
  job: DriveExportJob;
  dismissible?: boolean;
}>();

defineEmits<{
  dismiss: [];
}>();

const progressPct = computed(() => {
  if (props.job.status === "completed") return 100;
  if (props.job.status === "failed") return 100;
  const total = props.job.total;
  if (!total) return props.job.status === "running" ? 12 : 4;
  return Math.max(4, Math.min(100, Math.round((props.job.processed / total) * 100)));
});

const statusTitle = computed(() => {
  if (props.job.status === "queued") return "ייצוא ל-Drive ממתין בתור";
  if (props.job.status === "running") return "ייצוא ל-Drive מתבצע";
  if (props.job.status === "failed") return props.job.error ? `ייצוא ל-Drive נכשל: ${props.job.error}` : "ייצוא ל-Drive נכשל";
  if (props.job.total === 0) return "ייצוא ל-Drive הושלם: כל המסמכים כבר מסונכרנים";
  return `ייצוא ל-Drive הושלם: ${props.job.uploaded} מסמכים`;
});

const statusIcon = computed(() => {
  if (props.job.status === "completed") return CheckmarkCircleOutline;
  if (props.job.status === "failed") return WarningOutline;
  if (props.job.status === "queued") return TimeOutline;
  return CloudUploadOutline;
});
</script>

<style scoped>
.drive-job {
  display: grid;
  gap: 10px;
  margin: 12px 0;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
}

.drive-job__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drive-job__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.drive-job__bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-elevated);
}

.drive-job__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--brand-color);
  transition: width 180ms ease;
}

.drive-job--completed .drive-job__bar-fill {
  background: var(--color-success);
}

.drive-job--failed .drive-job__bar-fill,
.drive-job__error {
  color: var(--color-error);
}

.drive-job--failed .drive-job__bar-fill {
  background: var(--color-error);
}

.drive-job__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
