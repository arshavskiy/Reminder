<template>
  <n-modal
    :show="true"
    :mask-closable="false"
    :bordered="false"
    :segmented="false"
    :title="null"
    preset="card"
    class="quote-modal"
    style="width: min(980px, calc(100vw - 24px)); max-height: calc(100vh - 24px)"
    @update:show="closeModal"
  >
    <template #header>
      <span style="font-size: 15px; font-weight: 600">{{ isEdit ? l.quotes.editQuote : l.quotes.newQuote }}</span>
    </template>

    <n-spin :show="loading">
      <form @submit.prevent="save" class="quote-form">
        <section class="form-section">
          <label class="form-label">סוג הצעה</label>
          <n-select v-model:value="quoteSource" :options="sourceOptions" :disabled="isEdit" @update:value="onSourceChange"/>
        </section>

        <section v-if="quoteSource === 'document'" class="form-section">
          <label class="form-label">מסמך שהועלה <span class="required">*</span></label>
          <n-select v-model:value="form.documentId" :options="documentOptions" :loading="loadingDocuments" :disabled="isEdit" @update:value="loadDocumentDetails" clearable placeholder="בחר מסמך"/>
          <div v-if="documentDetails" class="contract-details">
            <div><span>שם קובץ</span><strong>{{ documentDetails.fileName }}</strong></div>
            <div><span>לקוח</span><strong>{{ documentDetails.customerName }}</strong></div>
          </div>
          <QuoteDocumentEquipmentPreview :document-id="form.documentId || null" @loaded="onEquipmentLoaded"/>
        </section>

        <section class="form-section">
          <div class="row-inputs">
            <div class="form-group">
              <label class="form-label">לקוח <span class="required">*</span></label>
              <n-select
                v-model:value="form.customerName"
                :options="clientOptions"
                filterable
                tag
                clearable
                placeholder="בחר לקוח או הזן שם"
                @update:value="onCustomerPick"
              />
            </div>
            <div class="form-group">
              <label class="form-label">אימייל</label>
              <n-input v-model:value="form.customerEmail" placeholder="אופציונלי"/>
            </div>
          </div>
        </section>

        <QuoteBillingForm
          ref="billingRef"
          v-model:rates="billingRates"
          v-model:amounts="billingAmounts"
          v-model:quantities="billingQuantities"
          v-model:vat-percent="billingVatPercent"
          v-model:due-date="billingDueDate"
          :report-type="billingReportType"
          :loading="loadingDocuments"
          :filter-by-report-type="!isEdit && quoteSource === 'document'"
        />

        <section class="form-section">
          <label class="form-label">הערות</label>
          <n-input v-model:value="form.notes" type="textarea" :rows="3" maxlength="3000" placeholder="הוסף הערות אופציוניות..."/>
        </section>
      </form>
    </n-spin>
    <template #footer>
      <div class="form-actions">
        <button type="button" class="btn btn--primary" :disabled="!canSubmit || submitting" @click="save">
          {{ submitting ? "שמירה…" : alreadyIssued ? "שמור ועדכן PDF" : "שמור כטיוטה" }}
        </button>
        <button v-if="!alreadyIssued" type="button" class="btn btn--ghost" :disabled="!canSubmit || submitting" @click="saveAndIssue">
          {{ submitting ? "הפקה…" : "שמור והפק" }}
        </button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NInput, NModal, NSpin, NSelect, useMessage} from "naive-ui";
import {paymentService, type InspectionRate, type PaymentRequest} from "../services/paymentService";
import {api} from "../services/apiService";
import QuoteDocumentEquipmentPreview from "../components/QuoteDocumentEquipmentPreview.vue";
import QuoteBillingForm from "../components/QuoteBillingForm.vue";
import {useI18n} from "../composables/useI18n.js";

const route = useRoute();
const {l} = useI18n();
const router = useRouter();
const message = useMessage();

const loading = ref(false);
const submitting = ref(false);
const loadingDocuments = ref(false);
const isEdit = ref(!!route.params.id);
const alreadyIssued = ref(false);
const documents = ref<Array<{id: string; file_name: string; client_name?: string; inspection_type?: string; document_type?: string}>>([]);
const clients = ref<Array<{id: string; display_name: string; email?: string | null}>>([]);
const quoteSource = ref<"document" | "standalone">("standalone");
const form = ref({documentId: "", notes: "", customerName: "", customerEmail: ""});
const skipEquipmentFill = ref(isEdit.value);
const documentDetails = ref<{fileName: string; customerName: string} | null>(null);
const billingRef = ref<InstanceType<typeof QuoteBillingForm> | null>(null);
const billingRates = ref<InspectionRate[]>([]);
const billingAmounts = ref<Record<string, number>>({});
const billingQuantities = ref<Record<string, number>>({});
const billingVatPercent = ref<number | null>(18);
const billingDueDate = ref(defaultDueDate());
const billingReportType = ref("");

const sourceOptions = [
  {label: "הצעה", value: "standalone"},
  {label: "מסמך שהועלה", value: "document"},
];
const documentOptions = computed(() =>
  documents.value?.map(d => ({
    label: `${d.file_name}${d.client_name ? ` — ${d.client_name}` : ""}`,
    value: d.id
  })) || []
);
const clientOptions = computed(() =>
  clients.value.map((client) => ({label: client.display_name, value: client.display_name}))
);
const canSubmit = computed(() => {
  if (!billingDueDate.value || !form.value.customerName.trim()) return false;
  if (quoteSource.value === "document") return Boolean(form.value.documentId);
  return true;
});

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function applyPricebook(rates: InspectionRate[]) {
  billingRates.value = rates.map((rate) => ({...rate}));
  billingAmounts.value = Object.fromEntries(rates.map((rate) => [rate.id, rate.unitCents / 100]));
  billingQuantities.value = Object.fromEntries(rates.map((rate) => [rate.id, 0]));
}

function applyQuoteLines(quote: PaymentRequest) {
  const rows = (quote.lines || []).map((line, index) => ({
    id: `quote-line-${index}`,
    reportType: quote.reportType || billingReportType.value || "מסמך",
    section: line.section || "",
    label: line.label || "",
    unitCents: line.unitCents || 0,
    source: "quote" as const,
  }));
  billingRates.value = rows;
  billingAmounts.value = Object.fromEntries(rows.map((rate) => [rate.id, (rate.unitCents || 0) / 100]));
  billingQuantities.value = Object.fromEntries(
    (quote.lines || []).map((line, index) => [`quote-line-${index}`, line.quantity || 1]),
  );
  billingVatPercent.value = (quote.vatBasisPoints ?? 1800) / 100;
  billingDueDate.value = quote.dueDate || defaultDueDate();
}

async function loadData() {
  loading.value = true;
  try {
    const [data, docsRes, clientsRes] = await Promise.all([
      paymentService.list(),
      api.documents.list(),
      api.clients.list({limit: 500}),
    ]);
    clients.value = clientsRes.rows || [];
    if (!isEdit.value) applyPricebook(data.rates || []);
    documents.value = (docsRes.rows || [])
      .filter((d: any) => d.mime_type === "application/pdf" || d.file_name?.toLowerCase().endsWith(".pdf"))
      .map((d: any) => ({
        id: d._id || d.id,
        file_name: d.file_name,
        client_name: d.extracted_fields?.client_name || d.client_name,
        inspection_type: d.inspection_type,
        document_type: d.document_type,
      }));

    if (isEdit.value && route.params.id) {
      skipEquipmentFill.value = true;
      alreadyIssued.value = false;
      const quote = await paymentService.get(String(route.params.id));
      if (quote.sourceDocumentId) {
        quoteSource.value = "document";
        form.value.documentId = quote.sourceDocumentId;
        await loadDocumentDetails();
      } else {
        quoteSource.value = "standalone";
        form.value.customerName = quote.customer?.name || "";
        form.value.customerEmail = quote.customer?.email || "";
      }
      form.value.customerName = quote.customer?.name || form.value.customerName;
      form.value.customerEmail = quote.customer?.email || form.value.customerEmail;
      form.value.notes = quote.notes || "";
      alreadyIssued.value = quote.status === "issued";
      applyQuoteLines(quote);
    } else if (route.query.docId) {
      quoteSource.value = "document";
      form.value.documentId = String(route.query.docId);
      await loadDocumentDetails();
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "לא ניתן לטעון את הנתונים");
  } finally {
    loading.value = false;
  }
}

async function loadDocumentDetails() {
  if (!form.value.documentId) return;
  const doc = documents.value.find(d => d.id === form.value.documentId);
  if (!doc) return;
  documentDetails.value = {
    fileName: doc.file_name || "ללא שם",
    customerName: doc.client_name || "לא צוין"
  };
  if (!form.value.customerName) form.value.customerName = doc.client_name || "";
  const type = doc.inspection_type || doc.document_type || "";
  billingReportType.value = billingRates.value.some((rate) => rate.reportType === type)
    ? type
    : (billingRates.value.find((rate) => rate.source !== "equipment")?.reportType || type);
}

function onSourceChange(source: "document" | "standalone") {
  if (source === "standalone") {
    form.value.documentId = "";
    documentDetails.value = null;
    billingRef.value?.applyEquipmentItems([]);
    billingReportType.value = billingRates.value.find((rate) => rate.source !== "equipment")?.reportType || "";
  }
}

function onCustomerPick(name: string | null) {
  const client = clients.value.find((item) => item.display_name === name);
  form.value.customerEmail = client?.email || "";
}

function onEquipmentLoaded(items: {name: string; manufacturer?: string; model?: string; serial_number?: string}[]) {
  if (skipEquipmentFill.value || isEdit.value) return;
  void nextTick(() => billingRef.value?.applyEquipmentItems(items));
}

function closeModal() {
  router.push("/quotes");
}

async function persist(issue: boolean) {
  if (!canSubmit.value || submitting.value) return;
  const error = billingRef.value?.validate();
  if (error) {
    message.error(error);
    return;
  }
  const payload = billingRef.value?.toPayload();
  if (!payload) return;
  submitting.value = true;
  try {
    if (!isEdit.value && payload.savedRates.length) await paymentService.saveRates(payload.savedRates);
    const body = {
      lines: payload.lines,
      inlineRates: payload.inlineRates,
      dueDate: payload.dueDate,
      vatBasisPoints: payload.vatBasisPoints,
      notes: form.value.notes,
      documentKind: "quote" as const,
      requestKey: crypto.randomUUID(),
      customer: {name: form.value.customerName.trim(), email: form.value.customerEmail.trim()},
      ...(quoteSource.value === "document"
        ? {documentId: form.value.documentId}
        : {standalone: true}),
    };
    if (isEdit.value && route.params.id) {
      await paymentService.update(String(route.params.id), body);
      if (issue && !alreadyIssued.value) await paymentService.issue(String(route.params.id));
      message.success(alreadyIssued.value ? "ההצעה עודכנה וה-PDF הופק מחדש" : issue ? "הצעת המחיר הופקה" : "הצעת המחיר עודכנה");
      await router.push(`/quotes/${route.params.id}`);
    } else {
      const result = await paymentService.create(body);
      if (issue) await paymentService.issue(result._id);
      message.success(issue ? "הצעת המחיר הופקה" : "הצעת המחיר נשמרה");
      await router.push(`/quotes/${result._id}`);
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : "הפעולה נכשלה");
  } finally {
    submitting.value = false;
  }
}

function save() {
  return persist(false);
}

function saveAndIssue() {
  return persist(true);
}

onMounted(loadData);
</script>

<style scoped>
.quote-modal :deep(.n-modal){overflow-y:auto}
.quote-form{display:flex;flex-direction:column;gap:16px}
.form-section{display:flex;flex-direction:column;gap:8px}
.form-label{font-weight:600;color:var(--text-primary);font-size:14px}
.required{color:#d03050}
.contract-details{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px;padding:12px;background:var(--bg-muted);border-radius:8px}
.contract-details div{display:flex;flex-direction:column}.contract-details span{color:var(--text-secondary);font-size:12px}.contract-details strong{color:var(--text-primary)}
.row-inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.form-group{display:flex;flex-direction:column;gap:8px}
.form-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
</style>
