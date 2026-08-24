<template>
  <div class="storage-sync" :class="{ 'storage-sync--compact': compact }" @click.stop>
    <n-tooltip placement="top">
      <template #trigger>
        <span class="storage-sync__wrap">
          <button
            class="btn btn--ghost btn--xs icon-btn storage-sync__btn"
            :class="{ 'storage-sync__btn--off': !inS3 }"
            type="button"
            :disabled="!inS3"
            :aria-label="s3Label"
            @click="openS3"
          >
            <AwsS3Logo :size="size" />
          </button>
        </span>
      </template>
      {{ s3Label }}
    </n-tooltip>
    <n-tooltip placement="top">
      <template #trigger>
        <span class="storage-sync__wrap">
          <button
            class="btn btn--ghost btn--xs icon-btn storage-sync__btn"
            :class="{
              'storage-sync__btn--off': !driveSynced && !driveBusy,
              'storage-sync__btn--busy': driveBusy && !driveSynced,
            }"
            type="button"
            :disabled="driveBusy && !driveSynced"
            :aria-label="driveLabel"
            @click="openDrive"
          >
            <GoogleDriveLogo :size="size" />
          </button>
        </span>
      </template>
      {{ driveLabel }}
    </n-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NTooltip } from "naive-ui";
import AwsS3Logo from "./AwsS3Logo.vue";
import GoogleDriveLogo from "./GoogleDriveLogo.vue";

const props = withDefaults(defineProps<{
  inS3?: boolean;
  driveSynced?: boolean;
  driveBusy?: boolean;
  driveLink?: string | null;
  downloadUrl?: string | null;
  compact?: boolean;
  size?: number;
}>(), {
  inS3: false,
  driveSynced: false,
  driveBusy: false,
  driveLink: null,
  downloadUrl: null,
  compact: false,
  size: 16,
});

const s3Label = computed(() => props.inS3 ? "שמור ב-S3" : "לא ב-S3");
const driveLabel = computed(() => {
  if (props.driveBusy && !props.driveSynced) return "מייצא ל-Google Drive...";
  if (props.driveSynced) return "מסונכרן ל-Google Drive";
  return "לא מסונכרן ל-Google Drive";
});

function openS3() {
  if (!props.inS3 || !props.downloadUrl) return;
  window.open(props.downloadUrl, "_blank", "noopener,noreferrer");
}

function openDrive() {
  if (!props.driveLink) return;
  window.open(props.driveLink, "_blank", "noopener,noreferrer");
}
</script>

<style scoped>
.storage-sync {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.storage-sync__wrap {
  display: inline-flex;
}

.storage-sync__btn {
  padding: 4px;
  min-width: 28px;
  min-height: 28px;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
}

.storage-sync__btn--off {
  filter: grayscale(1);
  opacity: 0.42;
}

.storage-sync__btn--busy {
  animation: storage-pulse 1s ease-in-out infinite;
}

@keyframes storage-pulse {
  50% {
    opacity: 0.45;
  }
}

.storage-sync--compact .storage-sync__btn {
  background: transparent;
  border-color: transparent;
}
</style>
