<template>
  <n-modal
    :show="show"
    preset="card"
    class="quote-modal"
    :style="{ maxWidth: '760px' }"
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

    <div v-if="loading" class="quote-modal__state">טוען מחירון…</div>

    <template v-else>
      <n-alert v-if="loadError" type="warning" :bordered="false" class="quote-modal__alert">
        {{ loadError }}
      </n-alert>

      <div class="quote-modal__grid">
        <div class="quote-modal__field">
          <label>שיעור מע״מ באחוזים</label>
          <n-input-number v-model:value="vatPercent" :min="0" :max="100" :precision="2" />
        </div>
        <div class="quote-modal__field">
          <label>בתוקף / לתשלום עד</label>
          <n-input v-model:value="dueDate" placeholder="YYYY-MM-DD" />
        </div>
      </div>

      <div class="quote-modal__section">
        <label>סעיפי שירות</label>
        <p v-if="rates.length === 0" class="quote-modal__muted">
          אין סעיפים במחירון. אפשר להוסיף סעיפים במחירון שבאשף תסקיר חדש.
        </p>
        <div v-for="rate in rates" :key="rate.id" class="quote-modal__line">
          <n-checkbox
            :checked="(quantities[rate.id] || 0) > 0"
            @update:checked="(checked: boolean) => quantities[rate.id] = checked ? 1 : 0"
          />
          <n-input v-model:value="rate.section" placeholder="סעיף בדיקה" aria-label="סעיף בדיקה" />
          <n-input v-model:value="rate.label" placeholder="תיאור השירות" aria-label="תיאור השירות" />
          <n-input-number
            v-model:value="amounts[rate.id]"
            :min="0"
            :precision="2"
            aria-label="מחיר יחידה"
          />
          <n-input-number
            v-model:value="quantities[rate.id]"
            :min="0"
            :precision="0"
            aria-label="כמות"
          />
        </div>
      </div>

      <div class="quote-modal__section">
        <label>הערות</label>
        <n-input v-model:value="notes" type="textarea" :rows="2" placeholder="הערות שיופיעו בהצעה" />
      </div>

      <div class="quote-modal__totals">
        <span>סכום ביניים: <strong>{{ formatMoney(subtotalCents) }}</strong></span>
        <span>מע״מ: <strong>{{ formatMoney(vatCents) }}</strong></span>
        <span class="quote-modal__total">סה״כ: <strong>{{ formatMoney(subtotalCents + vatCents) }}</strong></span>
      </div>
    </template>

    <template #footer>
      <div class="quote-modal__footer">
        <n-button :disabled="submitting" @click="emit('update:show', false)">ביטול</n-button>
        <n-button
          type="primary"
          :loading="submitting"
          :disabled="loading || selectedLines.length === 0"
          @click="submit"
        >
          צור הצעת מחיר
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { NAlert, NButton, NCheckbox, NInput, NInputNumber, NModal, useMessage } from "naive-ui";
import { paymentService } from "../../services/paymentService";
import type { Document } from "../../shared/types";

/**
 * Create a quote straight from a document row.
 *
 * The quote itself is built from the document's *contract* — that is what
 * carries the customer and the report type the pricebook is keyed on — so the
 * caller only offers this on rows that have one. The document supplies the
 * heading shown here so the user can see which inspection they are billing for.
 *
 * Deliberately narrower than the inspection wizard's billing step: this edits
 * lines, VAT, due date and notes, and does not re-save the pricebook. Editing a
 * rate here changes only the line on this quote, which keeps a one-off price
 * adjustment from silently rewriting the rate for every future inspection.
 */
type InspectionRate = {
  id: string;
  reportType?: string;
  section?: string;
  label?: string;
  unitCents: number;
  source?: string;
};

const props = defineProps<{ show: boolean; row: Document | null }>();
const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "created", quoteId: string): void;
}>();

const message = useMessage();
const loading = ref(false);
const submitting = ref(false);
const loadError = ref("");
const rates = ref<InspectionRate[]>([]);
const amounts = ref<Record<string, number>>({});
const quantities = ref<Record<string, number>>({});
const vatPercent = ref<number | null>(18);
const dueDate = ref("");
const notes = ref("");

const selectedLines = computed(() =>
  rates.value
    .filter((rate) => (quantities.value[rate.id] || 0) > 0)
    .map((rate) => ({
      rateId: rate.id,
      section: rate.section ?? "",
      label: rate.label ?? "",
      unitCents: Math.round((amounts.value[rate.id] || 0) * 100),
      quantity: quantities.value[rate.id] || 0,
    })),
);

const subtotalCents = computed(() =>
  selectedLines.value.reduce((sum, line) => sum + line.unitCents * line.quantity, 0),
);

const vatCents = computed(() =>
  Math.round(subtotalCents.value * Math.round((vatPercent.value || 0) * 100) / 10000),
);

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format((cents || 0) / 100);
}

/**
 * Load the pricebook and preselect the rates matching this document's report
 * type, so the common case is "confirm" rather than "fill in a form".
 */
async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await paymentService.list();
    const all = (result.rates ?? []).map((rate: InspectionRate) => ({ ...rate }));

    // The contract row on the list carries the report type the pricebook keys
    // on; when it is unknown every rate is offered rather than none, so the
    // user is never shown an empty sheet with no way forward.
    const reportType = (props.row as any)?.contract_report_type ?? null;
    const matching = reportType ? all.filter((rate) => rate.reportType === reportType) : all;
    rates.value = matching.length > 0 ? matching : all;

    amounts.value = Object.fromEntries(rates.value.map((rate) => [rate.id, rate.unitCents / 100]));
    quantities.value = Object.fromEntries(rates.value.map((rate) => [rate.id, matching.length > 0 ? 1 : 0]));

    if (rates.value.length === 0) {
      loadError.value = "לא נמצאו סעיפים במחירון. אפשר להגדיר מחירון באשף תסקיר חדש.";
    }
  } catch {
    loadError.value = "טעינת המחירון נכשלה. אפשר להזין סעיפים ידנית באשף תסקיר חדש.";
    rates.value = [];
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const contractId = props.row?.contract_id;
  if (!contractId) {
    message.error("למסמך הזה אין חוזה מקושר, ולכן לא ניתן להפיק ממנו הצעת מחיר");
    return;
  }
  submitting.value = true;
  try {
    const created = await paymentService.create({
      requestKey: crypto.randomUUID(),
      documentKind: "quote",
      contractId,
      lines: selectedLines.value,
      // Rates edited here are sent inline so the change applies to this quote
      // only; saveRates would rewrite the shared pricebook.
      inlineRates: rates.value.map(({ id, reportType, section, label }) => ({
        id,
        reportType,
        section,
        label,
        unitCents: Math.round((amounts.value[id] || 0) * 100),
      })),
      vatBasisPoints: Math.round((vatPercent.value || 0) * 100),
      dueDate: dueDate.value,
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
  () => props.show,
  (open) => {
    if (!open) return;
    vatPercent.value = 18;
    dueDate.value = "";
    notes.value = "";
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

.quote-modal__state,
.quote-modal__muted {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 8px 0;
}

.quote-modal__alert {
  margin-bottom: 14px;
}

.quote-modal__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.quote-modal__field label,
.quote-modal__section label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.quote-modal__section {
  margin-bottom: 16px;
}

.quote-modal__line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.6fr) 120px 90px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.quote-modal__totals {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
}

.quote-modal__total {
  color: var(--text-primary);
  font-size: 15px;
}

.quote-modal__footer {
  display: flex;
  justify-content: flex-start;
  gap: 10px;
}

@media (max-width: 720px) {
  .quote-modal__grid,
  .quote-modal__line {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
