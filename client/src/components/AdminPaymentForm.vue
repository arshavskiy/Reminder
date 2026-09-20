<template>
  <section class="payment-form">
    <h3>Record verified payment</h3>
    <p>Confirm the receipt in Morning first. Each item covers one month. Enter the purchased quantity (1–12); renewal
      reminders are scheduled when the prepaid period ends.</p>
    <n-form @submit.prevent="save">
      <n-form-item label="Plan">
        <n-select v-model:value="plan" :options="plans"/>
      </n-form-item>
      <n-form-item label="Billing">
        <n-select v-model:value="billing" :options="billingOptions"/>
      </n-form-item>
      <n-form-item v-if="billing === 'one_time'" label="Months purchased (item quantity)">
        <n-input-number v-model:value="months" :max="12" :min="1" :precision="0"/>
      </n-form-item>
      <n-form-item label="Payment / receipt ID">
        <n-input v-model:value="paymentId" :maxlength="200" placeholder="Unique ID from Morning"/>
      </n-form-item>
      <n-form-item label="Paid at">
        <n-date-picker v-model:value="paidAt" type="datetime"/>
      </n-form-item>
      <n-button :disabled="!paymentId.trim() || !paidAt || (billing === 'one_time' && !months)" :loading="saving" attr-type="submit"
                type="primary">
        Record payment
      </n-button>
    </n-form>
  </section>
</template>

<script lang="ts" setup>
import {ref, watch} from "vue";
import {NButton, NDatePicker, NForm, NFormItem, NInput, NInputNumber, NSelect, useMessage} from "naive-ui";
import {api} from "../services/apiService";

const props = defineProps<{ userId: string; currentPlan?: string }>();
const emit = defineEmits<{ saved: [] }>();
const message = useMessage();
const plan = ref<"digital" | "basic" | "business">("basic");
const billing = ref<"one_time" | "monthly" | "yearly">("one_time");
const months = ref<number | null>(1);
const paymentId = ref("");
const paidAt = ref<number | null>(Date.now());
const saving = ref(false);
const plans = ["digital", "basic", "business"].map(value => ({label: value, value}));
const billingOptions = [
  {label: "One-time prepaid payment", value: "one_time"},
  {label: "Automatic monthly billing", value: "monthly"},
  {label: "Yearly payment", value: "yearly"},
];
watch(() => props.userId, () => {
  paymentId.value = "";
  paidAt.value = Date.now();
  billing.value = "one_time";
  months.value = 1;
  plan.value = props.currentPlan === "digital" || props.currentPlan === "business" ? props.currentPlan : "basic";
}, {immediate: true});

async function save() {
  if (!paymentId.value.trim() || !paidAt.value || saving.value) return;
  if (billing.value === "one_time" && (!months.value || !Number.isInteger(months.value) || months.value < 1 || months.value > 12)) return;
  saving.value = true;
  const userId = props.userId;
  try {
    await api.admin.updateUserTier(userId, plan.value, {
      billing: billing.value, paymentId: paymentId.value.trim(), paidAt: new Date(paidAt.value).toISOString(),
      ...(billing.value === "one_time" ? {months: months.value!} : {}),
    });
    if (userId === props.userId) {
      message.success("Payment processed. Duplicate or older receipts leave the renewal date unchanged.");
      paymentId.value = "";
      emit("saved");
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Unable to record payment");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.payment-form {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.payment-form p {
  color: var(--text-secondary);
  margin: 8px 0 16px;
}
</style>
