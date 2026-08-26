<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center">
    <div style="font-size:64px;margin-bottom:16px">🔒</div>
    <h2 style="margin:0 0 8px;font-size:24px">אין הרשאה</h2>
    <p style="color:var(--text-secondary);margin:0 0 24px">הדף הזה מיועד למנהלי מערכת בלבד.</p>
    <n-button @click="$router.push('/dashboard')">חזרה לדף הבית</n-button>
  </div>
</template>

<script lang="ts" setup>
import {NButton} from "naive-ui";
</script>
