<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center">
    <h2 style="margin:0 0 8px;font-size:24px">{{ l.forbidden.title }}</h2>
    <p style="color:var(--text-secondary);margin:0 0 24px">{{ l.forbidden.body }}</p>
    <n-button @click="$router.push(homePath)">{{ l.forbidden.backHome }}</n-button>
  </div>
</template>

<script lang="ts" setup>
import {NButton} from "naive-ui";
import {useI18n} from "../composables/useI18n.js";
import {dashboardPath} from "../stores/locale.js";

const {l} = useI18n();
const homePath = dashboardPath();
</script>
