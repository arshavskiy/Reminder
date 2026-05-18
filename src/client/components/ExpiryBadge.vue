<template>
  <n-tag :type="tagType" size="small">{{ label }}</n-tag>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NTag } from "naive-ui";
import { differenceInDays, parseISO } from "date-fns";

const props = defineProps<{ date: string | null }>();

const days = computed(() => {
  if (!props.date) return null;
  return differenceInDays(parseISO(props.date), new Date());
});

const tagType = computed(() => {
  if (days.value === null) return "default";
  if (days.value < 0) return "error";
  if (days.value <= 30) return "warning";
  if (days.value <= 90) return "info";
  return "success";
});

const label = computed(() => {
  if (days.value === null) return "—";
  if (days.value < 0) return `פג לפני ${Math.abs(days.value)} ימים`;
  if (days.value === 0) return "פג היום";
  return `${days.value} ימים נותרו`;
});
</script>
