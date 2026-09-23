<template>
  <div v-if="itemCount > 0" class="pagination-bar">
    <span class="pagination-summary">
      {{ t("common.showingRange", { start, end, total: itemCount }) }}
    </span>
    <n-pagination
      :page="page"
      :page-size="pageSize"
      :item-count="itemCount"
      :page-sizes="pageSizes"
      :page-slot="5"
      show-size-picker
      @update:page="$emit('update:page', $event)"
      @update:page-size="$emit('update:pageSize', $event)"
    />
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NPagination} from "naive-ui";
import {useI18n} from "../composables/useI18n.js";

const {t} = useI18n();

const props = withDefaults(defineProps<{
  page: number;
  pageSize: number;
  itemCount: number;
  pageSizes?: number[];
}>(), {
  pageSizes: () => [5, 10, 20, 50],
});

defineEmits<{
  (e: "update:page", value: number): void;
  (e: "update:pageSize", value: number): void;
}>();

const start = computed(() => {
  if (!props.itemCount) return 0;
  return (props.page - 1) * props.pageSize + 1;
});
const end = computed(() => Math.min(props.itemCount, props.page * props.pageSize));
</script>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.pagination-summary {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .pagination-bar {
    min-width: 0;
    padding: 8px;
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .pagination-summary {
    text-align: center;
  }

  .pagination-bar :deep(.n-pagination) {
    flex-wrap: wrap;
    justify-content: center;
    overflow-x: auto;
    padding-bottom: 2px;
  }
}
</style>
