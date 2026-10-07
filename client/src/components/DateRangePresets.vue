<template>
  <n-select
    v-if="compact"
    :value="activePreset"
    :options="selectOptions"
    :placeholder="l.common.dateRangeAria"
    clearable
    class="date-presets-select"
    @update:value="selectById"
  />
  <!-- dir=ltr keeps 1m..3y in ascending order inside the RTL toolbar. -->
  <div v-else class="date-presets" dir="ltr" role="group" :aria-label="l.common.dateRangeAria">
    <button
      v-for="preset in DATE_RANGE_PRESETS"
      :key="preset.id"
      :aria-label="presetTitle(preset.id)"
      :aria-pressed="activePreset === preset.id"
      :class="{ 'date-presets__item--active': activePreset === preset.id }"
      :title="presetTitle(preset.id)"
      class="date-presets__item"
      type="button"
      @click="select(preset.id)"
    >
      {{ preset.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NSelect } from "naive-ui";
import {
  DATE_RANGE_PRESETS,
  matchDateRangePreset,
  resolveDateRangePreset,
  type DateRangePresetId,
  type DateRangeTuple,
} from "../shared/dateRangePresets";
import { useI18n } from "../composables/useI18n.js";

const { l } = useI18n();

const props = defineProps<{ modelValue: DateRangeTuple | null; compact?: boolean }>();
const emit = defineEmits<{
  "update:modelValue": [value: DateRangeTuple | null];
  change: [value: DateRangeTuple | null];
}>();

const activePreset = computed(() => matchDateRangePreset(props.modelValue));

function presetTitle(id: DateRangePresetId): string {
  const map = {
    "1m": l.value.common.range1m,
    "3m": l.value.common.range3m,
    "6m": l.value.common.range6m,
    "1y": l.value.common.range1y,
    "3y": l.value.common.range3y,
  };
  return map[id];
}

const selectOptions = computed(() =>
  DATE_RANGE_PRESETS.map(p => ({ label: presetTitle(p.id), value: p.id }))
);

function select(id: DateRangePresetId) {
  // Clicking the active preset clears it, so the chips can toggle back to
  // "all time" without reaching for the date picker's clear button.
  const next = activePreset.value === id ? null : resolveDateRangePreset(id);
  emit("update:modelValue", next);
  emit("change", next);
}

function selectById(id: DateRangePresetId | null) {
  const next = id ? resolveDateRangePreset(id) : null;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<style scoped>
.date-presets {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-elevated);
}

.date-presets__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.date-presets__item:hover,
.date-presets__item:focus-visible {
  color: var(--brand-color);
  outline: none;
}

.date-presets__item--active {
  background: var(--bg-card);
  color: var(--brand-color);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.date-presets-select {
  width: 100%;
}

@media (max-width: 720px) {
  .date-presets {
    width: 100%;
  }

  .date-presets__item {
    flex: 1;
  }
}
</style>
