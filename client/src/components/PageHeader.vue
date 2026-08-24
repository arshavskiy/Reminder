<template>
  <header class="page-header">
    <div class="page-header__copy">
      <nav v-if="$slots.breadcrumb" class="page-header__breadcrumb" aria-label="breadcrumb">
        <slot name="breadcrumb" />
      </nav>
      <div class="page-header__title-row">
        <h1 class="page-header__title">{{ title }}</h1>
        <span v-if="count !== undefined" class="page-header__count">{{ count }}</span>
        <div v-if="$slots.hero" class="page-header__hero">
          <slot name="hero" />
        </div>
      </div>
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
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}
.page-header__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.page-header__hero {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-inline-start: auto;
}
.page-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.page-header__breadcrumb :deep(a) {
  color: var(--brand-color);
  text-decoration: none;
  transition: color 0.15s, opacity 0.15s;
}
.page-header__breadcrumb :deep(a:hover) { opacity: 0.75; }
.page-header__breadcrumb :deep(.sep) { color: var(--text-secondary); font-size: 16px; }
.page-header__breadcrumb :deep(span:last-child) { color: var(--text-secondary); }
.page-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.page-header__title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.4px;
  line-height: 1.2;
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
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.page-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
}

@media (max-width: 640px) {
  .page-header {
    margin-bottom: 18px;
  }
  .page-header__title { font-size: 23px; }
}
</style>
