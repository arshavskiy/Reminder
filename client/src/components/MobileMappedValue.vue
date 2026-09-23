<template>
  <n-tooltip>
    <template #trigger>
      <span :aria-label="label" :tabindex="focusable === false ? undefined : 0" class="mapped-value" role="img">
        <n-icon :component="icon" :size="16" class="mapped-value__icon"/>
        <span class="mapped-value__text">{{ label }}</span>
      </span>
    </template>
    {{ label }}
  </n-tooltip>
</template>

<script lang="ts" setup>
import {computed} from "vue";
import {NIcon, NTooltip} from "naive-ui";
import {
  AirplaneOutline,
  BookOutline,
  CodeSlashOutline,
  HeartOutline,
  MedicalOutline,
  StorefrontOutline,
  BusinessOutline
} from "@vicons/ionicons5";
import {
  ArrowDownCircleOutline,
  ArrowUpCircleOutline,
  CarOutline,
  CartOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  ConstructOutline,
  DocumentTextOutline,
  GlobeOutline,
  HomeOutline,
  HourglassOutline,
  MailOutline,
  PersonOutline,
  ReceiptOutline,
  RestaurantOutline,
  ShieldCheckmarkOutline,
  PricetagOutline,
  TvOutline,
  WalletOutline,
  WarningOutline,
  WaterOutline,
  LaptopOutline,
  TimeOutline
} from "@vicons/ionicons5";

const props = defineProps<{ value?: string | null; label: string; focusable?: boolean }>();
const icon = computed(() => {
  const key = (props.value || "").toLowerCase();
  const icons: Record<string, typeof PricetagOutline> = {
    household: HomeOutline, transport: CarOutline, parking: CarOutline, fuel: WaterOutline,
    tv: TvOutline, marketplace: CartOutline, food: RestaurantOutline, payment: WalletOutline,
    government: BusinessOutline, finance: WalletOutline, travel: AirplaneOutline,
    healthcare: MedicalOutline, education: BookOutline, retail: StorefrontOutline,
    electronics: LaptopOutline, nonprofit: HeartOutline, digital: GlobeOutline,
    development: CodeSlashOutline, general: PricetagOutline,
    software: LaptopOutline, insurance: ShieldCheckmarkOutline, certificate: ShieldCheckmarkOutline,
    certification: ShieldCheckmarkOutline, safety: ShieldCheckmarkOutline, compliance: ShieldCheckmarkOutline,
    vehicle: CarOutline, domain: GlobeOutline, contract: DocumentTextOutline, equipment: ConstructOutline,
    personal: PersonOutline, invoice: DocumentTextOutline, receipt: ReceiptOutline, bill: ReceiptOutline,
    payment_request: WalletOutline, income: ArrowDownCircleOutline, expense: ArrowUpCircleOutline,
    queued: HourglassOutline, processing: HourglassOutline, pending: HourglassOutline,
    done: CheckmarkCircleOutline, sent: MailOutline, active: CheckmarkCircleOutline,
    renewed: CheckmarkCircleOutline, triggered: MailOutline, snoozed: TimeOutline,
    dismissed: CloseCircleOutline, cancelled: CloseCircleOutline, error: WarningOutline,
    expired: WarningOutline, no_email: MailOutline,
  };
  return icons[key] ?? (/תסקיר|inspection|בדיקה/.test(key) ? ConstructOutline
      : /חוזה|הסכם/.test(key) ? DocumentTextOutline
          : /ביטוח|תעודה|אישור/.test(key) ? ShieldCheckmarkOutline
              : /רכב/.test(key) ? CarOutline : PricetagOutline);
});
</script>

<style scoped>
.mapped-value {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.mapped-value__icon {
  display: none;
}

@media (max-width: 640px) {
  .mapped-value {
    min-width: 28px;
    min-height: 28px;
    justify-content: center;
  }

  .mapped-value__icon {
    display: inline-flex;
  }

  .mapped-value__text {
    display: none;
  }
}
</style>
