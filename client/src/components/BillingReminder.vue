<template>
  <n-alert v-if="status?.mode === 'one_time' && (showUpcoming || status.paymentDue)"
           :type="status.paymentDue ? 'warning' : 'info'" class="billing-reminder">
    <strong>{{ locale === 'en' ? 'Subscription renewal · one-time payment' : 'חידוש מנוי · תשלום חד־פעמי' }}</strong>
    <p>{{ description }}</p>
    <a v-if="status.paymentUrl" :href="status.paymentUrl" class="btn btn--primary btn--sm" rel="noopener noreferrer"
       target="_blank">
      {{ locale === 'en' ? 'Renew subscription' : 'תשלום לחידוש המנוי' }}
    </a>
    <a v-else :href="supportUrl" class="btn btn--ghost btn--sm" rel="noopener noreferrer" target="_blank">
      {{ locale === 'en' ? 'Request a payment link' : 'בקשת קישור לתשלום' }}
    </a>
  </n-alert>
  <n-alert v-else-if="showUpcoming && failed" type="error">
    {{ locale === 'en' ? 'Unable to load payment details.' : 'לא ניתן לטעון את פרטי התשלום.' }}
    <button class="btn btn--ghost btn--xs" type="button" @click="refresh">
      {{ locale === 'en' ? 'Retry' : 'נסו שוב' }}
    </button>
  </n-alert>
</template>

<script lang="ts" setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {NAlert} from "naive-ui";
import {api, type BillingStatus} from "../services/apiService";
import {useI18n} from "../composables/useI18n";
import {useAuthStore} from "../stores/auth";

defineProps<{ showUpcoming?: boolean }>();
const emit = defineEmits<{ loaded: [status: BillingStatus] }>();
const {locale} = useI18n();
const auth = useAuthStore();
const status = ref<BillingStatus | null>(null);
const failed = ref(false);
const accountId = computed(() => auth.actingAs?.id ?? auth.user?.id);
let requestVersion = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const description = computed(() => {
  const date = status.value?.nextPaymentAt
      ? new Date(status.value.nextPaymentAt).toLocaleDateString(locale.value === "en" ? "en-GB" : "he-IL") : "";
  const months = status.value?.months ?? 1;
  const period = months === 1 ? "1 month" : `${months} months`;
  const hebrewPeriod = months === 1 ? "חודש אחד" : months === 2 ? "חודשיים" : `${months} חודשים`;
  if (locale.value === "en") return status.value?.paymentDue
      ? `Your prepaid period (${period}) ended on ${date}. Pay again to renew. You will not be charged automatically.`
      : `Paid for ${period}. Next payment: ${date}. We’ll remind you by email and in the app. You will not be charged automatically.`;
  return status.value?.paymentDue
      ? `התקופה ששולמה (${hebrewPeriod}) הסתיימה ב־${date}. לחידוש יש לשלם שוב. לא יתבצע חיוב אוטומטי.`
      : `התקופה ששולמה: ${hebrewPeriod}. התשלום הבא ב־${date}. נזכיר לכם באימייל ובאפליקציה. לא יתבצע חיוב אוטומטי.`;
});
const supportUrl = computed(() => `https://wa.me/972554605328?text=${encodeURIComponent(
    locale.value === "en" ? "Please send me a link to renew my RemindOCR subscription."
        : "אשמח לקישור לתשלום לחידוש מנוי RemindOCR.",
)}`);

async function refresh() {
  const version = ++requestVersion;
  if (!accountId.value) {
    status.value = null;
    return;
  }
  try {
    const result = await api.billing.status();
    if (version === requestVersion) {
      status.value = result;
      failed.value = false;
      emit("loaded", result);
    }
  } catch {
    if (version === requestVersion) failed.value = true;
  }
}

watch(accountId, () => {
  status.value = null;
  void refresh();
}, {immediate: true});
onMounted(() => {
  timer = setInterval(refresh, 60_000);
  window.addEventListener("focus", refresh);
});
onUnmounted(() => {
  requestVersion++;
  clearInterval(timer);
  window.removeEventListener("focus", refresh);
});
</script>

<style scoped>
.billing-reminder {
  margin-bottom: 16px;
}

.billing-reminder p {
  margin: 8px 0 12px;
}
</style>
