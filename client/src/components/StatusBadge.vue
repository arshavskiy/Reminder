<template>
  <n-tag :type="tagType" size="small">{{ label }}</n-tag>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NTag } from "naive-ui";
import { useI18n } from "../composables/useI18n.js";

const props = defineProps<{ status: string }>();
const { l } = useI18n();

const MAP = computed(() => {
  const c = l.value.common;
  return {
    queued:     { type: "default" as const, label: c.queued },
    processing: { type: "info" as const,    label: c.processing },
    done:       { type: "success" as const, label: c.done },
    pending:    { type: "warning" as const, label: c.pending },
    triggered:  { type: "info" as const,    label: c.triggered },
    sent:       { type: "success" as const, label: c.sent },
    snoozed:    { type: "default" as const, label: c.snoozed },
    dismissed:  { type: "default" as const, label: c.dismissed },
    error:      { type: "error" as const,   label: c.error },
    no_email:   { type: "warning" as const, label: c.missingEmail },
    active:     { type: "success" as const, label: c.active },
    expired:    { type: "error" as const,   label: c.expired },
    cancelled:  { type: "default" as const, label: c.cancelled },
    renewed:    { type: "info" as const,    label: c.renewed },
  };
});

const tagType = computed(() => MAP.value[props.status as keyof typeof MAP.value]?.type ?? "default");
const label = computed(() => MAP.value[props.status as keyof typeof MAP.value]?.label ?? props.status);
</script>
