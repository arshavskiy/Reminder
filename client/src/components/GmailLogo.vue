<template>
  <span class="gmail-logo" :style="boxStyle" aria-hidden="true">
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4CAF50" d="M45 16.2 40 18.95 35 23.7V40h7c1.66 0 3-1.34 3-3V16.2z"/>
      <path fill="#1E88E5" d="M3 16.2 6.61 17.91 13 23.7V40H6c-1.66 0-3-1.34-3-3V16.2z"/>
      <path fill="#E53935" d="M35 11.2 24 19.45 13 11.2 12 17l1 6.7 11 8.25 11-8.25 1-6.7z"/>
      <path fill="#C62828" d="M3 12.3V16.2l10 7.5V11.2L9.88 8.86A4.28 4.28 0 0 0 7.3 8h0A4.3 4.3 0 0 0 3 12.3z"/>
      <path fill="#FBC02D" d="M45 12.3V16.2l-10 7.5V11.2l3.12-2.34A4.28 4.28 0 0 1 40.7 8h0A4.3 4.3 0 0 1 45 12.3z"/>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ size?: number }>(), { size: 16 });

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));
</script>

<style scoped>
.gmail-logo {
  display: inline-flex;
  flex: 0 0 auto;
  line-height: 0;
}

.gmail-logo svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
