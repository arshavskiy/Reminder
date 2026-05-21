<template>
  <div v-if="doc">
    <n-space align="center" style="margin-bottom: 16px">
      <n-button text @click="$router.back()">← חזרה</n-button>
      <n-h2 style="margin: 0">{{ doc.file_name }}</n-h2>
      <StatusBadge :status="doc.processing_status" />
    </n-space>

    <n-alert
      v-if="doc.error_message"
      type="error"
      title="שגיאה בעיבוד"
      style="margin-bottom: 16px"
    >
      {{ doc.error_message }}
    </n-alert>

    <n-alert
      v-else-if="doc.processing_status === 'done' && !extraction"
      type="warning"
      title="לא חולצו נתונים מהמסמך"
      style="margin-bottom: 16px"
    >
      ייתכן שמפתח OpenAI חסר/שגוי בהגדרות, או שהטקסט במסמך לא היה זמין לחילוץ.
    </n-alert>

    <n-grid :cols="2" :x-gap="24" :y-gap="16">
      <n-gi>
        <n-card title="פרטי מסמך">
          <n-descriptions :column="1" bordered>
            <n-descriptions-item label="סוג קובץ">{{ doc.mime_type }}</n-descriptions-item>
            <n-descriptions-item label="גודל">{{ (doc.file_size_bytes / 1024).toFixed(1) }} KB</n-descriptions-item>
            <n-descriptions-item label="תאריך ייבוא">{{ doc.import_date }}</n-descriptions-item>
            <n-descriptions-item v-if="doc.page_count" label="עמודים">{{ doc.page_count }}</n-descriptions-item>
          </n-descriptions>
        </n-card>
      </n-gi>

      <n-gi v-if="extraction">
        <n-card title="נתונים שחולצו (AI)">
          <n-descriptions :column="1" bordered>
            <n-descriptions-item v-if="extraction.client_name" label="שם לקוח">{{ extraction.client_name }}</n-descriptions-item>
            <n-descriptions-item v-if="extraction.contract_number" label="מספר חוזה">{{ extraction.contract_number }}</n-descriptions-item>
            <n-descriptions-item v-if="extraction.start_date" label="תאריך התחלה">{{ extraction.start_date }}</n-descriptions-item>
            <n-descriptions-item v-if="extraction.expiry_date" label="תאריך פקיעה">{{ extraction.expiry_date }}</n-descriptions-item>
            <n-descriptions-item v-if="extraction.amount" label="סכום">{{ extraction.amount }} {{ extraction.currency }}</n-descriptions-item>
            <n-descriptions-item v-if="extraction.summary_hebrew" label="תקציר">{{ extraction.summary_hebrew }}</n-descriptions-item>
            <n-descriptions-item label="רמת ביטחון">{{ extraction.confidence }}</n-descriptions-item>
          </n-descriptions>
        </n-card>
      </n-gi>

      <n-gi :span="2" v-if="doc.raw_text">
        <n-card title="טקסט גולמי" :segmented="{ content: true }">
          <n-scrollbar style="max-height: 300px">
            <pre style="white-space: pre-wrap; direction: rtl; font-size: 13px">{{ doc.raw_text }}</pre>
          </n-scrollbar>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
  <n-spin v-else :show="loading" />
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import {
  NH2, NSpace, NButton, NGrid, NGi, NCard, NDescriptions, NDescriptionsItem,
  NSpin, NScrollbar, NAlert,
} from "naive-ui";
import { api } from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type { Document, ExtractionResult } from "@shared/types.js";

const route = useRoute();
const doc = ref<Document | null>(null);
const extractions = ref<{ result_json: string; parsed_ok: number }[]>([]);
const loading = ref(true);

const extraction = computed<ExtractionResult | null>(() => {
  const e = extractions.value.find((x) => x.parsed_ok);
  if (!e) return null;
  try { return JSON.parse(e.result_json); } catch { return null; }
});

onMounted(async () => {
  const id = Number(route.params.id);
  [doc.value, extractions.value] = await Promise.all([
    api.documents.get(id),
    api.documents.list({ limit: 1 }).then(() => [] as typeof extractions.value), // placeholder
  ]);
  // fetch extractions
  try {
    const res = await fetch(`/api/documents/${id}/extractions`).then((r) => r.json());
    extractions.value = Array.isArray(res) ? res : [];
  } catch {}
  loading.value = false;
});
</script>
