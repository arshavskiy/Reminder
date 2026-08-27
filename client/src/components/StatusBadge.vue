<template>
  <n-tag :type="tagType" size="small">{{ label }}</n-tag>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NTag } from "naive-ui";

const props = defineProps<{ status: string }>();

const MAP: Record<string, { type: "default" | "success" | "warning" | "error" | "info"; label: string }> = {
  queued:     { type: "default", label: "ממתין" },
  processing: { type: "info",    label: "מעבד..." },
  done:       { type: "success", label: "הושלם" },
  pending:    { type: "warning", label: "ממתין" },
  sent:       { type: "success", label: "נשלח" },
  snoozed:    { type: "default", label: "נדחה" },
  dismissed:  { type: "default", label: "בוטל" },
  error:      { type: "error",   label: "שגיאה" },
  no_email:   { type: "warning", label: "חסר אימייל" },
  active:     { type: "success", label: "פעיל" },
  expired:    { type: "error",   label: "פג תוקף" },
  cancelled:  { type: "default", label: "בוטל" },
  renewed:    { type: "info",    label: "חודש" },
};

const tagType = computed(() => MAP[props.status]?.type ?? "default");
const label = computed(() => MAP[props.status]?.label ?? props.status);
</script>
