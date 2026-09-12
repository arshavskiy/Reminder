<template>
  <n-modal
    :show="true"
    :mask-closable="false"
    :bordered="false"
    :segmented="false"
    :title="null"
    preset="card"
    class="quote-modal"
    style="width: min(900px, calc(100vw - 24px)); max-height: calc(100vh - 24px)"
    @update:show="closeModal"
  >
    <template #header>
      <span style="font-size: 15px; font-weight: 600">{{ isEdit ? "עריכת הצעת מחיר" : "הצעת מחיר חדשה" }}</span>
    </template>

    <n-spin :show="loading">
      <form @submit.prevent="save" class="quote-form">
        <!-- FROM DOCUMENT -->
        <section class="form-section">
          <label class="form-label">מסמך שהועלה <span class="required">*</span></label>
          <n-select v-model:value="form.documentId" :options="documentOptions" :loading="loadingDocuments" @update:value="loadDocumentDetails" clearable placeholder="בחר מסמך"/>
          <div v-if="documentDetails" class="contract-details">
            <div><span>שם קובץ</span><strong>{{ documentDetails.fileName }}</strong></div>
            <div><span>לקוח</span><strong>{{ documentDetails.customerName }}</strong></div>
          </div>
        </section>

        <section class="form-section">
          <label class="form-label">סעיפי הצעה</label>
          <div class="lines-list">
            <div v-for="(line, idx) in form.lines" :key="idx" class="line-item">
              <n-select v-model:value="line.rateId" :options="rateOptions" filterable placeholder="בחר סעיף" class="line-input"/>
              <n-input-number v-model:value="line.quantity" :min="1" placeholder="כמות" class="line-input quantity-input"/>
              <span v-if="line.unitCents" class="line-price">{{ formatMoney(line.unitCents * (line.quantity || 1)) }}</span>
              <button type="button" class="btn btn--ghost btn--xs icon-btn" @click="form.lines.splice(idx, 1)" aria-label="הסר סעיף">
                <n-icon :component="TrashOutline" :size="16"/>
              </button>
            </div>
          </div>
          <button type="button" class="btn btn--secondary" @click="addLine">+ הוסף סעיף</button>
        </section>

        <section class="form-section">
          <div class="row-inputs">
            <div class="form-group">
              <label class="form-label">בתוקף עד <span class="required">*</span></label>
              <n-input v-model:value="form.dueDate" type="date" clearable/>
            </div>
            <div class="form-group">
              <label class="form-label">VAT % <span class="required">*</span></label>
              <n-input-number v-model:value="form.vatBasisPoints" :step="100" :min="0" :max="100000" placeholder="0"/>
            </div>
          </div>
        </section>

        <section class="form-section">
          <label class="form-label">הערות</label>
          <n-input v-model:value="form.notes" type="textarea" :rows="4" maxlength="3000" show-count placeholder="הוסף הערות אופציוניות..."/>
        </section>

        <div v-if="totals" class="quote-summary">
          <div><span>סכום חלק</span><strong>{{ formatMoney(totals.subtotalCents || 0) }}</strong></div>
          <div><span>VAT</span><strong>{{ formatMoney(totals.vatCents || 0) }}</strong></div>
          <div><span>סכום כולל</span><strong>{{ formatMoney(totals.totalCents || 0) }}</strong></div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn--primary" :disabled="!form.documentId || !form.dueDate || submitting">
            {{ submitting ? "שמירה…" : "שמור כטיוטה" }}
          </button>
          <button type="button" class="btn btn--ghost" @click="saveAndIssue" :disabled="!form.documentId || !form.dueDate || submitting">
            {{ submitting ? "הפקה…" : "שמור והפק" }}
          </button>
        </div>
      </form>
    </n-spin>
  </n-modal>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NIcon, NInput, NInputNumber, NModal, NSpin, NSelect, NTab, NTabs, useMessage} from "naive-ui";
import {TrashOutline} from "@vicons/ionicons5";
import {paymentService, type PaymentRequest, type PaymentData} from "../services/paymentService";
import {api} from "../services/apiService";

const route = useRoute();
const router = useRouter();
const message = useMessage();

const loading = ref(false);
const submitting = ref(false);
const loadingDocuments = ref(false);
const isEdit = ref(!!route.params.id);
const paymentData = ref<PaymentData | null>(null);
const documents = ref<Array<{id: string; file_name: string; client_name?: string}>>([]);

const form = ref({
  documentId: "",
  lines: [] as Array<{rateId?: string; quantity: number; unitCents?: number; section?: string; label?: string}>,
  dueDate: "",
  vatBasisPoints: 1700,
  notes: "",
});

const documentDetails = ref<{fileName: string; customerName: string} | null>(null);
const totals = ref<{subtotalCents: number; vatCents: number; totalCents: number} | null>(null);

const documentOptions = computed(() =>
  documents.value?.map(d => ({
    label: `${d.file_name}${d.client_name ? ` — ${d.client_name}` : ""}`,
    value: d.id
  })) || []
);

const rateOptions = computed(() =>
  paymentData.value?.rates?.map(r => ({label: `${r.section} / ${r.label}`, value: r.id, rate: r})) || []
);

function formatMoney(cents: number) {
  return new Intl.NumberFormat("he-IL", {style: "currency", currency: "ILS"}).format((cents || 0) / 100);
}

async function loadData() {
  loading.value = true;
  try {
    const [data, docsRes] = await Promise.all([
      paymentService.list(),
      api.documents.list()
    ]);
    paymentData.value = data;
    documents.value = (docsRes.rows || [])
      .filter((d: any) => d.mime_type === "application/pdf" || d.file_name?.toLowerCase().endsWith(".pdf"))
      .map((d: any) => ({
        id: d._id || d.id,
        file_name: d.file_name,
        client_name: d.extracted_fields?.client_name || d.client_name
      }));

    if (isEdit.value && route.params.id) {
      const quote = await paymentService.get(String(route.params.id));
      if (quote.sourceDocumentId) {
        form.value.documentId = quote.sourceDocumentId;
        await loadDocumentDetails();
      }
      form.value.lines = quote.lines || [];
      form.value.dueDate = quote.dueDate;
      form.value.notes = quote.notes || "";
      form.value.vatBasisPoints = quote.vatBasisPoints || 1700;
      totals.value = {
        subtotalCents: quote.subtotalCents || 0,
        vatCents: quote.vatCents || 0,
        totalCents: quote.totalCents || 0,
      };
    } else if (route.query.docId) {
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
  form.value.lines = [];
  calculateTotals();
}

function addLine() {
  form.value.lines.push({quantity: 1});
}

function calculateTotals() {
  const lines = form.value.lines.filter(l => l.unitCents);
  const subtotalCents = lines.reduce((sum, l) => sum + (l.unitCents || 0) * (l.quantity || 1), 0);
  const vatCents = Math.round(subtotalCents * (form.value.vatBasisPoints / 10000));
  totals.value = {subtotalCents, vatCents, totalCents: subtotalCents + vatCents};
}

function closeModal() {
  router.push("/quotes");
}

async function save() {
  if (!form.value.documentId || !form.value.dueDate) return;
  submitting.value = true;
  try {
    const body: any = {
      lines: form.value.lines,
      dueDate: form.value.dueDate,
      vatBasisPoints: form.value.vatBasisPoints,
      notes: form.value.notes,
      documentKind: "quote" as const,
      requestKey: crypto.randomUUID(),
      documentId: form.value.documentId,
    };

    if (isEdit.value && route.params.id) {
      await paymentService.update(String(route.params.id), body);
      message.success("הצעת המחיר עדכנה");
    } else {
      const result = await paymentService.create(body);
      message.success("הצעת המחיר נשמרה");
      await router.push(`/quotes/${result._id}`);
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "שמירה נכשלה");
  } finally {
    submitting.value = false;
  }
}

async function saveAndIssue() {
  if (!form.value.documentId || !form.value.dueDate) return;
  submitting.value = true;
  try {
    const body: any = {
      lines: form.value.lines,
      dueDate: form.value.dueDate,
      vatBasisPoints: form.value.vatBasisPoints,
      notes: form.value.notes,
      documentKind: "quote" as const,
      requestKey: crypto.randomUUID(),
      documentId: form.value.documentId,
    };

    if (isEdit.value && route.params.id) {
      await paymentService.update(String(route.params.id), body);
      await paymentService.issue(String(route.params.id));
      message.success("הצעת המחיר הופקה");
    } else {
      const result = await paymentService.create(body);
      await paymentService.issue(result._id);
      message.success("הצעת המחיר הופקה");
      await router.push(`/quotes/${result._id}`);
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "הפעולה נכשלה");
  } finally {
    submitting.value = false;
  }
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
.lines-list{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.line-item{display:grid;grid-template-columns:1fr 80px 100px 40px;gap:8px;align-items:center}
.line-input{width:100%}
.quantity-input{width:80px}
.line-price{text-align:center;font-weight:600;color:var(--brand-color);white-space:nowrap}
.row-inputs{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.form-group{display:flex;flex-direction:column;gap:8px}
.quote-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px}
.quote-summary div{display:flex;flex-direction:column;text-align:center;padding:8px}.quote-summary span{color:var(--text-secondary);font-size:12px}.quote-summary strong{color:var(--text-primary);margin-top:4px;font-size:14px}
.form-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
</style>
