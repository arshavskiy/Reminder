<template>
  <header class="page-header">
    <div class="page-header__title-wrap">
      <h1 class="page-header__title">{{ title }}</h1>
      <span v-if="count !== undefined" class="page-header__count">{{ count }}</span>
      <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
interface Props {
  title: string;
  subtitle?: string;
  count?: number;
}
defineProps<Props>();
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-header__title-wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.page-header__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}
.page-header__count {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}
.page-header__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  flex-basis: 100%;
}
.page-header__actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

@media (max-width: 640px) {
  .page-header { flex-direction: column; align-items: flex-start; }
  .page-header__title { font-size: 22px; }
  .page-header__actions { width: 100%; }
}
</style>
