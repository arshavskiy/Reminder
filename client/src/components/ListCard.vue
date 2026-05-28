<template>
  <article
    :class="{ 'list-card--selected': selected, 'list-card--clickable': clickable }"
    class="list-card"
    @click="$emit('click', $event)"
  >
    <div class="list-card__row">
      <div class="list-card__title">
        <slot name="title" />
      </div>
      <div v-if="$slots.actions" class="list-card__actions" @click.stop>
        <slot name="actions" />
      </div>
    </div>

    <p v-if="$slots.subtitle" class="list-card__sub">
      <slot name="subtitle" />
    </p>

    <div v-if="$slots.pills" class="list-card__pills">
      <slot name="pills" />
    </div>

    <div v-if="$slots.default" class="list-card__body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="list-card__foot">
      <slot name="footer" />
    </div>
  </article>
</template>

<script lang="ts" setup>
interface Props {
  selected?: boolean;
  clickable?: boolean;
}
withDefaults(defineProps<Props>(), { selected: false, clickable: true });
defineEmits<{ (e: "click", evt: MouseEvent): void }>();
</script>

<style scoped>
.list-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.list-card--clickable { cursor: pointer; }
.list-card--clickable:hover { border-color: var(--brand-color); box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.list-card--selected { border-color: var(--brand-color); background: rgba(99,226,183,0.04); }

.list-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.list-card__title { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.list-card__actions { display: flex; gap: 6px; flex-shrink: 0; }

.list-card__sub {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.list-card__pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }

.list-card__body { margin-bottom: 10px; }

.list-card__foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
