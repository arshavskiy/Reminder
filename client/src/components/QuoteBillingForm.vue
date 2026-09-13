<script setup lang="ts">
import { computed } from "vue";
import { NCheckbox, NInput, NInputNumber } from "naive-ui";
import type { InspectionRate } from "@/services/paymentService";

export type QuoteEquipmentItem = {
  name: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
};

const rates = defineModel<InspectionRate[]>("rates", { default: () => [] });
const amounts = defineModel<Record<string, number>>("amounts", { default: () => ({}) });
const quantities = defineModel<Record<string, number>>("quantities", { default: () => ({}) });
const vatPercent = defineModel<number | null>("vatPercent", { default: 18 });
const dueDate = defineModel<string>("dueDate", { default: "" });

const props = withDefaults(defineProps<{
  reportType?: string;
  loading?: boolean;
  showVatAndDue?: boolean;
  filterByReportType?: boolean;
}>(), {
  reportType: "",
  loading: false,
  showVatAndDue: true,
  filterByReportType: true,
});

const visibleRates = computed(() => {
  if (!props.filterByReportType || !props.reportType) return rates.value;
  return rates.value.filter((rate) => rate.reportType === props.reportType || rate.source === "equipment" || rate.source === "quote");
});

const subtotalCents = computed(() => visibleRates.value.reduce((sum, rate) => (
  sum + Math.round((amounts.value[rate.id] || 0) * 100) * (quantities.value[rate.id] || 0)
), 0));

const vatCents = computed(() => Math.round(
  subtotalCents.value * Math.round((vatPercent.value || 0) * 100) / 10000,
));

const totalCents = computed(() => subtotalCents.value + vatCents.value);

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("he-IL", { style: "currency", currency: "ILS" });
}

function addRate() {
  const rate: InspectionRate = {
    id: crypto.randomUUID(),
    reportType: props.reportType || "מסמך",
    section: "",
    label: "",
    unitCents: 0,
    source: rates.value.some((item) => item.source === "quote") ? "quote" : undefined,
  };
  rates.value = [...rates.value, rate];
  amounts.value = { ...amounts.value, [rate.id]: 0 };
  quantities.value = { ...quantities.value, [rate.id]: 1 };
}

function removeRate(rateId: string) {
  rates.value = rates.value.filter((rate) => rate.id !== rateId);
  const nextAmounts = { ...amounts.value };
  const nextQuantities = { ...quantities.value };
  delete nextAmounts[rateId];
  delete nextQuantities[rateId];
  amounts.value = nextAmounts;
  quantities.value = nextQuantities;
}

function setChecked(rateId: string, checked: boolean) {
  quantities.value = { ...quantities.value, [rateId]: checked ? Math.max(quantities.value[rateId] || 1, 1) : 0 };
}

function equipmentRateId(index: number, name: string) {
  return `equipment-${index}-${name}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function applyEquipmentItems(items: QuoteEquipmentItem[]) {
  const kept = rates.value.filter((rate) => rate.source !== "equipment");
  const nextAmounts = { ...amounts.value };
  const nextQuantities = { ...quantities.value };
  for (const rate of rates.value.filter((item) => item.source === "equipment")) {
    delete nextAmounts[rate.id];
    delete nextQuantities[rate.id];
  }
  for (const rate of kept) {
    nextQuantities[rate.id] = 0;
  }
  const equipmentRates = items.map((item, index) => {
    const id = equipmentRateId(index, item.name);
    const details = [
      item.name,
      item.manufacturer,
      item.model,
      item.serial_number ? `מס׳ זיהוי: ${item.serial_number}` : "",
    ].filter(Boolean);
    nextAmounts[id] = nextAmounts[id] ?? 0;
    nextQuantities[id] = 1;
    return {
      id,
      reportType: props.reportType || "מסמך",
      section: String(index + 1),
      label: details.join(" · "),
      unitCents: Math.round((nextAmounts[id] || 0) * 100),
      source: "equipment" as const,
    };
  });
  rates.value = [...kept, ...equipmentRates];
  amounts.value = nextAmounts;
  quantities.value = nextQuantities;
}

function selectedLines() {
  return visibleRates.value
    .filter((rate) => (quantities.value[rate.id] || 0) > 0)
    .map((rate) => ({ rateId: rate.id, quantity: quantities.value[rate.id], label: rate.label }));
}

function validate(): string | null {
  if (!selectedLines().length) return "יש לבחור לפחות סעיף שירות אחד להצעת המחיר";
  if (vatPercent.value === null || vatPercent.value < 0 || vatPercent.value > 100) return "יש להזין שיעור מע״מ תקין";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.value || "")) return "יש להזין תאריך תוקף / תשלום תקין";
  if (visibleRates.value.some((rate) => (quantities.value[rate.id] || 0) > 0 && (
    !String(rate.section || "").trim() || !String(rate.label || "").trim()
    || !Number.isFinite(amounts.value[rate.id]) || amounts.value[rate.id] < 0
  ))) {
    return "יש להשלים סעיף, תיאור ומחיר בכל שורות המחירון";
  }
  return null;
}

function toPayload() {
  rates.value.forEach((rate) => {
    rate.unitCents = Math.round((amounts.value[rate.id] || 0) * 100);
  });
  return {
    lines: selectedLines(),
    inlineRates: rates.value
      .filter((rate) => rate.source === "equipment" || rate.source === "quote")
      .map(({ id, reportType, section, label, unitCents }) => ({ id, reportType, section, label, unitCents })),
    savedRates: rates.value.filter((rate) => rate.source !== "equipment" && rate.source !== "quote"),
    vatBasisPoints: Math.round((vatPercent.value || 0) * 100),
    dueDate: dueDate.value,
  };
}

defineExpose({
  visibleRates,
  subtotalCents,
  vatCents,
  totalCents,
  applyEquipmentItems,
  validate,
  toPayload,
});
</script>

<template>
  <div class="quote-billing">
    <div v-if="showVatAndDue" class="quote-billing__meta">
      <div class="quote-billing__field">
        <label>שיעור מע״מ באחוזים</label>
        <NInputNumber v-model:value="vatPercent" :min="0" :max="100" :precision="2"/>
      </div>
      <div class="quote-billing__field">
        <label>בתוקף / לתשלום עד</label>
        <NInput v-model:value="dueDate" placeholder="YYYY-MM-DD"/>
      </div>
    </div>

    <div class="quote-billing__field">
      <label>סעיפי שירות</label>
      <div v-if="loading" class="quote-billing__muted">טוען מחירון…</div>
      <div v-for="rate in visibleRates" :key="rate.id" class="quote-billing__line">
        <NCheckbox
          :checked="(quantities[rate.id] || 0) > 0"
          @update:checked="(checked: boolean) => setChecked(rate.id, checked)"
        />
        <NInput v-model:value="rate.section" placeholder="סעיף בדיקה" aria-label="סעיף בדיקה"/>
        <NInput v-model:value="rate.label" placeholder="תיאור השירות" aria-label="תיאור השירות"/>
        <NInputNumber
          :value="amounts[rate.id]"
          :min="0"
          :precision="2"
          aria-label="מחיר יחידה"
          @update:value="(value: number | null) => amounts = { ...amounts, [rate.id]: value ?? 0 }"
        />
        <NInputNumber
          v-if="(quantities[rate.id] || 0) > 0"
          :value="quantities[rate.id]"
          :min="1"
          :max="10000"
          :precision="0"
          aria-label="כמות"
          @update:value="(value: number | null) => quantities = { ...quantities, [rate.id]: value ?? 1 }"
        />
        <button type="button" class="btn btn--ghost btn--xs" @click="removeRate(rate.id)">הסר</button>
      </div>
      <button type="button" class="btn btn--ghost" @click="addRate">הוספת סעיף</button>
    </div>

    <div class="quote-billing__total">סה״כ: {{ formatMoney(totalCents) }}</div>
    <p class="quote-billing__muted">המסמך הוא הצעת מחיר בלבד. הוא אינו חשבונית או קבלה.</p>
  </div>
</template>

<style scoped>
.quote-billing {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quote-billing__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.quote-billing__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quote-billing__field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.quote-billing__line {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) minmax(150px, 1.4fr) 120px 90px auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.quote-billing__total {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.quote-billing__muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 720px) {
  .quote-billing__meta,
  .quote-billing__line {
    grid-template-columns: auto 1fr;
  }
}
</style>
