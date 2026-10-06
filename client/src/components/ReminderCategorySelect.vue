<template>
  <n-select
    :value="value"
    :options="categoryOptions"
    :placeholder="placeholder"
    :virtual-scroll="false"
    clearable
    filterable
    tag
    @update:value="selectCategory"
  >
    <template #action>
      <div :dir="dir" class="category-create" @keydown.stop>
        <div class="category-create__row">
          <n-input
            v-model:value="draft"
            :placeholder="l.notifications.customCategoryName"
            :input-props="{ 'aria-label': l.notifications.customCategoryName }"
            size="small"
            @keydown.enter.prevent="addCategory"
          />
          <n-button size="small" type="primary" :disabled="!draft.trim()" @click="addCategory">
            {{ l.notifications.addCategory }}
          </n-button>
        </div>
        <p>{{ l.notifications.customCategorySaveHint }}</p>
      </div>
    </template>
  </n-select>
</template>

<script setup lang="ts">
import {computed, ref} from "vue";
import {NButton, NInput, NSelect} from "naive-ui";
import {useI18n} from "../composables/useI18n.js";

const props = defineProps<{
  value: string | null;
  options: { label: string; value: string }[];
  placeholder: string;
}>();
const emit = defineEmits<{ (e: "update:value", value: string | null): void }>();
const {l, dir} = useI18n();
const draft = ref("");
const categoryOptions = computed(() => {
  if (!props.value || props.options.some((option) => option.value === props.value)) return props.options;
  return [...props.options, {label: props.value, value: props.value}];
});

function selectCategory(value: string | null) {
  emit("update:value", value?.trim() || null);
}

function addCategory() {
  const name = draft.value.trim();
  if (!name) return;
  const existing = props.options.find((option) => option.value.toLocaleLowerCase() === name.toLocaleLowerCase());
  selectCategory(existing?.value ?? name);
  draft.value = "";
}
</script>

<style scoped>
.category-create__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.category-create__row .n-input {
  flex: 1;
  min-width: 0;
}
.category-create p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
