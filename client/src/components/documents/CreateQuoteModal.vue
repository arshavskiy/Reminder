<template>
  <n-modal
    :show="show"
    preset="card"
    class="quote-modal"
    :style="{ maxWidth: '980px' }"
    :mask-closable="!submitting"
    :closable="!submitting"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <template #header>
      <div class="quote-modal__head">
        <span>הצעת מחיר חדשה</span>
        <span v-if="props.row" class="quote-modal__subject" dir="auto">{{ props.row.file_name }}</span>
      </div>
    </template>

    <n-spin :show="loading">
      <n-alert v-if="loadError" type="warning" :bordered="false" class="quote-modal__alert">
        {{ loadError }}
      </n-alert>

      <QuoteDocumentEquipmentPreview
        :document-id="documentId"
        @loaded="onEquipmentLoaded"
      />

      <QuoteBillingForm
        ref="billingRef"
        v-model:rates="billingRates"
        v-model:amounts="billingAmounts"
        v-model:quantities="billingQuantities"
        v-model:vat-percent="billingVatPercent"
        v-model:due-date="billingDueDate"
        :report-type="billingReportType"
        :loading="loading"
        :filter-by-report-type="false"
      />

      <div class="quote-modal__section">
        <label>הערות</label>
        <n-input v-model:value="notes" type="textarea" :rows="2" placeholder="הערות שיופיעו בהצעה" />
      </div>
    </n-spin>

    <template #footer>
      <div class="quote-modal__footer">
        <n-button :disabled="submitting" @click="emit('update:show', false)">ביטול</n-button>
        <n-button type="primary" :loading="submitting" :disabled="loading" @click="submit">
          צור הצעת מחיר
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from "vue";
import { NAlert, NButton, NInput, NModal, NSpin, useMessage } from "naive-ui";
import { paymentService, type InspectionRate } from "../../services/paymentService";
import type { Document } from "../../shared/types";
import QuoteDocumentEquipmentPreview from "../QuoteDocumentEquipmentPreview.vue";
import QuoteBillingForm from "../QuoteBillingForm.vue";

const props = defineProps<{ show: boolean; row: Document | null }>();
const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "created", quoteId: string): void;
}>();

const message = useMessage();
const loading = ref(false);
const submitting = ref(false);
const loadError = ref("");
const notes = ref("");
const billingRef = ref<InstanceType<typeof QuoteBillingForm> | null>(null);
const billingRates = ref<InspectionRate[]>([]);
const billingAmounts = ref<Record<string, number>>({});
const billingQuantities = ref<Record<string, number>>({});
const billingVatPercent = ref<number | null>(18);
const billingDueDate = ref(defaultDueDate());
const billingReportType = ref("");
const pendingEquipment = ref<{name: string; manufacturer?: string; model?: string; serial_number?: string}[] | null>(null);

const documentId = computed(() => props.row?.id != null ? String(props.row.id) : null);

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function applyPricebook(rates: InspectionRate[]) {
  billingRates.value = rates.map((rate) => ({ ...rate }));
  billingAmounts.value = Object.fromEntries(rates.map((rate) => [rate.id, rate.unitCents / 100]));
  billingQuantities.value = Object.fromEntries(rates.map((rate) => [rate.id, 0]));
}

function flushEquipment() {
  if (!pendingEquipment.value) return;
  billingRef.value?.applyEquipmentItems(pendingEquipment.value);
}

function onEquipmentLoaded(items: {name: string; manufacturer?: string; model?: string; serial_number?: string}[]) {
  pendingEquipment.value = items;
  void nextTick(flushEquipment);
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await paymentService.list();
    const all = (result.rates ?? []).map((rate) => ({ ...rate }));
    const reportType = (props.row as {contract_report_type?: string} | null)?.contract_report_type
      || props.row?.inspection_type
      || props.row?.document_type
      || "";
    billingReportType.value = reportType;
    applyPricebook(all);
    if (all.length === 0) {
      loadError.value = "לא נמצאו סעיפים במחירון. אפשר להגדיר מחירון באשף תסקיר חדש.";
    }
    await nextTick();
    flushEquipment();
  } catch {
    loadError.value = "טעינת המחירון נכשלה. אפשר להזין סעיפים ידנית באשף תסקיר חדש.";
    billingRates.value = [];
  } finally {
    loading.value = false;
    await nextTick();
    flushEquipment();
  }
}

async function submit() {
  const contractId = props.row?.contract_id;
  if (!contractId) {
    message.error("למסמך הזה אין חוזה מקושר, ולכן לא ניתן להפיק ממנו הצעת מחיר");
    return;
  }
  const error = billingRef.value?.validate();
  if (error) {
    message.error(error);
    return;
  }
  const payload = billingRef.value?.toPayload();
  if (!payload) return;
  submitting.value = true;
  try {
    const created = await paymentService.create({
      requestKey: crypto.randomUUID(),
      documentKind: "quote",
      contractId,
      documentId: documentId.value,
      lines: payload.lines,
      inlineRates: payload.inlineRates,
      vatBasisPoints: payload.vatBasisPoints,
      dueDate: payload.dueDate,
      notes: notes.value,
    });
    await paymentService.issue(created._id);
    message.success("הצעת המחיר נוצרה");
    emit("created", String(created._id));
    emit("update:show", false);
  } catch (error) {
    message.error(error instanceof Error ? error.message : "יצירת הצעת המחיר נכשלה");
  } finally {
    submitting.value = false;
  }
}

watch(
  () => [props.show, props.row?.id] as const,
  ([open]) => {
    if (!open) return;
    billingVatPercent.value = 18;
    billingDueDate.value = defaultDueDate();
    notes.value = "";
    pendingEquipment.value = null;
    void load();
  },
);
</script>

<style scoped>
.quote-modal__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quote-modal__subject {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}

.quote-modal__alert {
  margin-bottom: 14px;
}

.quote-modal__section {
  margin-top: 16px;
}

.quote-modal__section label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.quote-modal__footer {
  display: flex;
  justify-content: flex-start;
  gap: 10px;
}
</style>
