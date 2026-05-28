<template>
  <div v-if="totalItems > pageSize" class="pagination-bar">
    <n-pagination
      :page="page"
      :page-count="pageCount"
      :page-slot="5"
      show-quick-jumper
      @update:page="$emit('update:page', $event)"
    />
    <span class="pagination-bar__info">{{ totalItems }} {{ label }}</span>
  </div>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NPagination} from "naive-ui";

interface Props {
  page: number;
  pageSize: number;
  totalItems: number;
  label?: string;
}
const props = withDefaults(defineProps<Props>(), { label: "פריטים" });
defineEmits<{ (e: "update:page", v: number): void }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));
</script>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.pagination-bar__info { font-size: 13px; color: var(--text-secondary); }
</style>
