<template>
  <div class="confirm-dialog__head">
    <span
      :class="['confirm-dialog__icon', `confirm-dialog__icon--${type}`]"
      aria-hidden="true"
    >
      <n-icon :component="WarningOutline" :size="22"/>
    </span>
    <span class="confirm-dialog__title-text">{{ title }}</span>
  </div>
</template>

<script lang="ts" setup>
import {NIcon} from "naive-ui";
import {WarningOutline} from "@vicons/ionicons5";

withDefaults(defineProps<{
  title: string;
  type?: "error" | "warning" | "info";
}>(), {
  type: "error",
});
</script>
