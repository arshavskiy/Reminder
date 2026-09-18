<template>
  <nav class="invoice-section-nav" :aria-label="l.common.invoicesNav">
    <button
      v-for="item in items"
      :key="item.path"
      :class="{ 'invoice-section-nav__item--active': isActive(item.path) }"
      class="invoice-section-nav__item"
      type="button"
      @click="router.push(item.path)"
    >
      <n-icon :component="item.icon" :size="16" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { AnalyticsOutline, ReceiptOutline } from "@vicons/ionicons5";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../composables/useI18n.js";
import { stripLocalePrefix } from "../stores/locale.js";

const route = useRoute();
const router = useRouter();
const { l, href } = useI18n();

const items = computed(() => [
  { label: l.value.invoices.title, path: href("/invoices"), icon: ReceiptOutline },
  { label: l.value.common.expenses, path: href("/invoices/expenses"), icon: AnalyticsOutline },
]);

function isActive(path: string): boolean {
  const current = stripLocalePrefix(route.path);
  const target = stripLocalePrefix(path);
  if (target === "/invoices") return current === "/invoices";
  return current === target || current.startsWith(`${target}/`);
}
</script>

<style scoped>
.invoice-section-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-elevated);
}

.invoice-section-nav__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.invoice-section-nav__item:hover,
.invoice-section-nav__item:focus-visible {
  color: var(--brand-color);
  outline: none;
}

.invoice-section-nav__item--active {
  background: var(--bg-card);
  color: var(--brand-color);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent);
}

@media (max-width: 520px) {
  .invoice-section-nav {
    width: 100%;
  }

  .invoice-section-nav__item {
    flex: 1;
  }
}
</style>
