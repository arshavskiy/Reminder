<template>
  <div class="pt-hub page2">
    <PageHeader
        :title="l.printTemplates.title"
        :subtitle="l.printTemplates.hubSubtitle"
    >
      <template #breadcrumb>
        <span>{{ l.printTemplates.title }}</span>
      </template>
    </PageHeader>

    <div class="pt-hub__grid">
      <article class="pt-hub__card" @click="router.push(href('/print-templates/layout'))">
        <div class="pt-hub__icon">
          <n-icon :component="DocumentTextOutline" :size="36"/>
        </div>
        <h2>{{ l.printTemplates.simpleTitle }}</h2>
        <p>{{ l.printTemplates.simpleCard }}</p>
        <button class="btn btn--primary" type="button">
          <n-icon :component="CreateOutline"/>
          {{ l.printTemplates.layoutEditor }}
        </button>
      </article>

      <article class="pt-hub__card" @click="router.push(href('/print-templates/excel'))">
        <div class="pt-hub__icon">
          <n-icon :component="GridOutline" :size="36"/>
        </div>
        <h2>{{ l.printTemplates.excelEditor }}</h2>
        <p>{{ l.printTemplates.subtitle }}</p>
        <button class="btn btn--ghost" type="button">
          <n-icon :component="AppsOutline"/>
          {{ l.printTemplates.excelEditor }}
        </button>
      </article>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {useRouter} from "vue-router";
import {NIcon} from "naive-ui";
import {AppsOutline, CreateOutline, DocumentTextOutline, GridOutline} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";

const router = useRouter();
const {l, href} = useI18n();
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

.pt-hub__icon {
  margin-bottom: 12px;
  color: var(--brand-color);
}
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
