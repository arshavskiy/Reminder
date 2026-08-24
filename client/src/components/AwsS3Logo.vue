<template>
  <span class="aws-s3-logo" :style="boxStyle" aria-hidden="true">
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#F58536" d="M24 6 42 16 24 26 6 16z"/>
      <path fill="#8C310A" d="M6 16 24 26v16L6 32z"/>
      <path fill="#E25303" d="M24 26 42 16v16L24 42z"/>
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
.aws-s3-logo {
  display: inline-flex;
  flex: 0 0 auto;
  line-height: 0;
}

.aws-s3-logo svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
