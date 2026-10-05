<template>
  <n-modal
    :show="show"
    :title="l.expensesMsg.spendingAlerts"
    :show-icon="false"
    preset="dialog"
    style="width: 520px; max-width: 95vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <p class="spending-alerts__hint">{{ l.expensesMsg.spendingAlertsHint }}</p>

    <div v-if="alerts.length" class="spending-alerts__list">
      <div v-for="(alert, idx) in alerts" :key="idx" class="spending-alerts__row">
        <n-select
          v-model:value="alert.category"
          :options="categoryOptions"
          size="small"
          class="spending-alerts__cat"
          filterable
        />
        <n-input-number
          v-model:value="alert.threshold"
          :min="1"
          size="small"
          class="spending-alerts__threshold"
          :placeholder="l.expensesMsg.alertThreshold"
        />
        <span class="spending-alerts__cur">₪</span>
        <n-tooltip>
          <template #trigger>
            <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="remove(idx)">
              <n-icon :component="TrashOutline" :size="14" />
            </button>
          </template>
          {{ l.expensesMsg.deleteAlert }}
        </n-tooltip>
      </div>
    </div>
    <p v-else class="spending-alerts__empty">{{ l.expensesMsg.noAlerts }}</p>

    <div class="spending-alerts__actions">
      <button class="btn btn--ghost btn--sm" type="button" @click="addRow">
        <n-icon :component="AddOutline" :size="14" class="btn-icon" />
        {{ l.expensesMsg.addAlert }}
      </button>
      <button class="btn btn--primary btn--sm" type="button" :disabled="saving" @click="save">
        {{ l.expensesMsg.alertSaved }}
      </button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NIcon, NInputNumber, NModal, NSelect, NTooltip, useMessage } from "naive-ui";
import { AddOutline, TrashOutline } from "@vicons/ionicons5";
import { useI18n } from "../composables/useI18n.js";
import { api, type SpendingAlert } from "../services/apiService.js";

const props = defineProps<{ show: boolean; categories: string[] }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

const { l } = useI18n();
const message = useMessage();
const alerts = ref<SpendingAlert[]>([]);
const saving = ref(false);

const categoryOptions = ref<{ label: string; value: string }[]>([]);

function buildOptions() {
  categoryOptions.value = props.categories.map((c) => ({ label: c, value: c }));
}

onMounted(async () => {
  buildOptions();
  try {
    const data = await api.profile.getSpendingAlerts();
    alerts.value = data.alerts.map((a) => ({ ...a }));
  } catch {
    // start empty
  }
});

function addRow() {
  alerts.value.push({ category: props.categories[0] ?? "general", threshold: 500, currency: "ILS" });
}

function remove(idx: number) {
  alerts.value.splice(idx, 1);
}

async function save() {
  saving.value = true;
  try {
    const data = await api.profile.saveSpendingAlerts(alerts.value);
    alerts.value = data.alerts.map((a) => ({ ...a }));
    message.success(l.value.expensesMsg.alertSaved);
    emit("update:show", false);
  } catch {
    message.error(l.value.expensesMsg.alertSaveError);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.spending-alerts__hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
}
.spending-alerts__list {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.spending-alerts__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spending-alerts__cat {
  flex: 1;
}
.spending-alerts__threshold {
  width: 110px;
}
.spending-alerts__cur {
  font-size: 13px;
  color: var(--text-secondary);
}
.spending-alerts__empty {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 12px 0;
}
.spending-alerts__actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 8px;
}
</style>
