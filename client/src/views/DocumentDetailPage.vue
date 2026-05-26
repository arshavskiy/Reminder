<template>
  <div v-if="doc">
    <n-space align="center" style="margin-bottom: 20px">
      <n-button text @click="$router.back()">← חזרה</n-button>
      <n-h2 style="margin: 0">{{ doc.file_name }}</n-h2>
      <StatusBadge :status="doc.processing_status" />
    </n-space>

    <n-alert v-if="doc.error_message" type="error" title="שגיאה בעיבוד" style="margin-bottom: 16px">
      {{ doc.error_message }}
    </n-alert>

    <!-- ── PDF preview ──────────────────────────────────────── -->
    <n-card v-if="previewUrl" :segmented="{ content: true }" style="margin-bottom: 16px">
      <iframe
        :src="previewUrl"
        style="width:100%; height:780px; border:none; border-radius:6px"
        type="application/pdf"
      />
    </n-card>
    <n-alert v-else-if="previewError" :title="previewError" style="margin-bottom: 16px" type="warning" />

    <n-grid :cols="2" :x-gap="24" :y-gap="16">
      <!-- ── Document metadata ─────────────────────────────── -->
<!--      <n-gi>-->
<!--        <n-card title="פרטי מסמך">-->
<!--          <n-descriptions :column="1">-->
<!--            <n-descriptions-item label="סוג קובץ">{{ doc.mime_type }}</n-descriptions-item>-->
<!--            <n-descriptions-item label="גודל">{{ ((doc.file_size_bytes ?? 0) / 1024).toFixed(1) }} KB</n-descriptions-item>-->
<!--            <n-descriptions-item label="תאריך ייבוא">{{ doc.import_date }}</n-descriptions-item>-->
<!--            <n-descriptions-item v-if="doc.page_count" label="עמודים">{{ doc.page_count }}</n-descriptions-item>-->
<!--            <n-descriptions-item v-if="(doc as any).document_type" label="סוג מסמך">{{ (doc as any).document_type }}</n-descriptions-item>-->
<!--          </n-descriptions>-->
<!--        </n-card>-->
<!--      </n-gi>-->

      <!-- ── Extracted fields ─────────────────────────────── -->
      <n-gi v-if="extractedFields.length">
        <n-card title="נתונים שחולצו (AI)">
          <n-descriptions :column="1">
            <n-descriptions-item v-for="f in extractedFields" :key="f.key" :label="f.label">
              <span v-if="Array.isArray(f.value)">{{ f.value.join(', ') || '—' }}</span>
              <span v-else-if="f.value && typeof f.value === 'object'">{{ JSON.stringify(f.value) }}</span>
              <span v-else>{{ f.value ?? '—' }}</span>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>
      </n-gi>

      <!-- ── Equipment table (inspection reports) ─────────── -->
      <n-gi :span="2" v-if="equipment.length">
        <n-card title="ציוד שנבדק">
          <n-data-table
            :columns="equipmentColumns"
            :data="equipment"
            size="small"
            :pagination="false"
          />
        </n-card>
      </n-gi>

      <!-- ── Raw text ──────────────────────────────────────── -->
      <n-gi :span="2" v-if="displayText">
        <n-card title="טקסט גולמי" :segmented="{ content: true }">
          <template #header-extra>
            <n-tag size="small" type="info">{{ displayText.length.toLocaleString() }} תווים</n-tag>
          </template>
          <n-scrollbar style="max-height: 500px">
            <pre style="white-space: pre-wrap; direction: rtl; font-size: 12px; line-height: 1.6; font-family: inherit">{{ displayText }}</pre>
          </n-scrollbar>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
  <n-spin v-else :show="loading" style="padding: 80px; display: flex; justify-content: center" />
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {useRoute} from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NGi,
  NGrid,
  NH2,
  NScrollbar,
  NSpace,
  NSpin,
  NTag,
} from "naive-ui";
import {api} from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type {Document} from "@shared/types.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const route = useRoute();
const doc = ref<Document | null>(null);
const extractionRaw = ref<Record<string, any> | null>(null);
const extractionRawText = ref<string | null>(null);
const loading = ref(true);
const previewUrl = ref<string | null>(null);
const previewError = ref<string | null>(null);

async function loadPreview() {
  if (!doc.value?.spaces_key) return;
  try {
    const res = await fetch(`${SERVER}/api/documents/${doc.value.id}/download`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const { url } = await res.json() as { url: string };
    if (doc.value.mime_type === "application/pdf") {
      previewUrl.value = url;
    } else {
      window.open(url, "_blank", "noopener");
    }
  } catch (e) {
    previewError.value = `לא ניתן לטעון תצוגה מקדימה: ${e}`;
  }
}

// Friendly Hebrew labels for common generic-extraction keys
const LABEL_MAP: Record<string, string> = {
  // client / contact
  client_company: "פרטי הלקוח/תופש",
  client_name: "איש קשר",
  contact_person: "איש קשר",
  client_phone: "נייד",
  contact_phone: "נייד",
  client_email: "מייל",
  contact_email: "מייל",
  client_address: "ישוב",
  client_zipcode: "מיקוד",
  client_id: "ח.פ / ת.ז",
  // document identity
  report_number: "מספר תסקיר",
  document_number: "מספר מסמך",
  contract_number: "מספר חוזה",
  invoice_number: "מספר חשבונית",
  document_type: "סוג מסמך",
  contract_type: "סוג חוזה",
  // dates
  inspection_date: "תאריך בדיקה",
  next_inspection_date: "בתוקף עד",
  start_date: "תאריך התחלה",
  expiry_date: "תאריך תפוגה",
  issue_date: "תאריך הוצאה",
  payment_due_date: "תאריך לתשלום",
  // equipment
  equipment_description: "תיאור מכונת הרמה",
  license_number: "מספר רישוי",
  equipment_type: "סוג ציוד",
  manufacturer: "יצרן",
  model: "דגם",
  serial_number: "מספר סידורי",
  load_capacity: "כושר עמיסה",
  // misc
  findings: "ממצאים",
  notes: "הערות",
  summary_hebrew: "תקציר",
  auto_renewal: "חידוש אוטומטי",
  counterparty: "צד שכנגד",
  vat_amount: 'סכום מע"מ',
  confidence: "רמת ביטחון",
  _confidence: "רמת ביטחון",
};

const SKIP_KEYS = new Set(["_equipment", "parties", "tasks", "amount", "currency"]);

const extractedFields = computed(() => {
  const raw = extractionRaw.value;
  if (!raw) return [];
  return Object.entries(raw)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => ({ key: k, label: LABEL_MAP[k] ?? k, value: v }));
});

const displayText = computed(() => extractionRawText.value ?? doc.value?.raw_text ?? null);

const equipment = computed<any[]>(() => {
  const raw = extractionRaw.value;
  if (!raw || !Array.isArray(raw._equipment)) return [];
  return raw._equipment.filter((e: any) => e && e.name);
});

const equipmentColumns = [
  { title: "תיאור", key: "name", ellipsis: true },
  { title: "יצרן", key: "manufacturer", width: 110 },
  { title: "דגם", key: "model", width: 120 },
  { title: "מ\"ס סידורי", key: "serial_number", width: 130 },
  { title: 'עומס עבודה', key: "load_capacity_work", width: 110 },
  { title: 'עומס מבחן', key: "load_capacity_test", width: 110 },
  { title: "רדיוס", key: "load_radius", width: 80 },
];

onMounted(async () => {
  const id = route.params.id as string;
  try {
    doc.value = await api.documents.get(id);
    loadPreview();

    // Try to get extraction — prefer template extraction (__tpl), fall back to generic
    const rows = await fetch(`${SERVER}/api/documents/${id}/extractions`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .catch(() => []);

    if (Array.isArray(rows) && rows.length) {
      // Prefer the most recent successful extraction
      const best = rows.find((r: any) => r.parsed_ok && r.result_json) ?? rows[0];
      if (best?.result_json) {
        try { extractionRaw.value = JSON.parse(best.result_json); } catch {}
      }
      if (best?.raw_text) {
        extractionRawText.value = best.raw_text;
      }
    }

    // Also check the document's own extracted_fields (stored during processing)
    if (!extractionRaw.value && (doc.value as any).extracted_fields) {
      try { extractionRaw.value = JSON.parse((doc.value as any).extracted_fields); } catch {}
    }
  } finally {
    loading.value = false;
  }
});
</script>
