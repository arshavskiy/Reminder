<template>
  <div>
<!--    <n-h2>חיפוש</n-h2>-->
    <n-input
      v-model:value="query"
      :placeholder="l.search.placeholder"
      clearable
      size="large"
      style="margin-bottom: 24px"
      @keyup.enter="search"
    >
      <template #suffix>
        <n-button text @click="search">🔍</n-button>
      </template>
    </n-input>

    <n-spin :show="loading">
      <template v-if="results">
        <n-card v-if="results.documents.length" :title="l.search.documents" style="margin-bottom: 16px">
          <n-list>
            <n-list-item v-for="doc in results.documents" :key="doc.id">
              <router-link :to="`/documents/${doc.id}`">{{ doc.file_name }}</router-link>
              <div v-html="doc.snippet" style="font-size: 12px; color: #aaa; direction: rtl" />
            </n-list-item>
          </n-list>
        </n-card>

        <n-card v-if="results.clients.length" :title="l.search.clients" style="margin-bottom: 16px">
          <n-list>
            <n-list-item v-for="c in results.clients" :key="c.id">
              <router-link :to="`/clients/${c.id}`">{{ c.display_name }}</router-link>
              <span v-if="c.email" style="color:#aaa; margin-right:8px">{{ c.email }}</span>
            </n-list-item>
          </n-list>
        </n-card>

        <n-card v-if="results.contracts.length" :title="l.search.contracts">
          <n-list>
            <n-list-item v-for="c in results.contracts" :key="c.id">
              {{ c.contract_number ?? c.contract_type ?? `חוזה #${c.id}` }}
              <span v-if="c.expiry_date" style="color:#aaa; margin-right:8px">פג: {{ c.expiry_date }}</span>
            </n-list-item>
          </n-list>
        </n-card>

        <n-empty
          v-if="!results.documents.length && !results.clients.length && !results.contracts.length"
          description="לא נמצאו תוצאות"
        />
      </template>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { NH2, NInput, NButton, NSpin, NCard, NList, NListItem, NEmpty } from "naive-ui";
import { api } from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";
import type { GlobalSearchResult } from "@shared/types.js";

const query = ref("");
const {l} = useI18n();
const loading = ref(false);
const results = ref<GlobalSearchResult | null>(null);

async function search() {
  if (!query.value.trim()) return;
  loading.value = true;
  try {
    results.value = await api.search.global(query.value.trim());
  } finally {
    loading.value = false;
  }
}
</script>
