<template>
  <div class="pt-hub page2">
    <PageHeader
        title="תבניות הדפסה"
        subtitle="בחרו את סוג העורך המתאים לכם"
    />

    <div class="pt-hub__grid">
      <article class="pt-hub__card" @click="router.push('/settings/print-templates/layout')">
        <div class="pt-hub__icon">📋</div>
        <h2>עורך פריסה פשוט</h2>
        <p>סעיפים, שדות דינמיים וצבע מסגרת — מומלץ לתסקירים סטandardיים</p>
        <button class="btn btn--primary" type="button">פתח עורך פריסה</button>
      </article>

      <article class="pt-hub__card" @click="router.push('/settings/print-templates/excel')">
        <div class="pt-hub__icon">📊</div>
        <h2>עורך Excel</h2>
        <p>טבלה מלאה עם תאים, מיזוג, גבולות לכל צד ועיצוב מתקדם</p>
        <button class="btn btn--ghost" type="button">פתח עורך Excel</button>
      </article>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {useRouter} from "vue-router";
import PageHeader from "../components/PageHeader.vue";

const router = useRouter();
</script>

<style scoped>
.pt-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 8px;
}
.pt-hub__card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 24px;
  background: var(--bg-elevated);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pt-hub__card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}
.pt-hub__icon { font-size: 32px; margin-bottom: 12px; }
.pt-hub__card h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--text-primary);
}
.pt-hub__card p {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}
</style>
