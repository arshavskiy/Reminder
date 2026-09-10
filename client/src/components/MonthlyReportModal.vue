<template>
  <n-modal
    :show="show"
    preset="dialog"
    :show-icon="false"
    title="דוח חודשי"
    style="width: 460px; max-width: 95vw"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="top">
      <n-form-item label="חודש הדוח">
        <n-date-picker v-model:value="monthMs" type="month" style="width: 100%" />
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end" style="width: 100%">
        <n-button @click="emit('update:show', false)">ביטול</n-button>
        <n-button type="primary" :loading="loading" @click="downloadMonthlyReport">הורד DOC</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import {ref, watch} from "vue";
import {NButton, NDatePicker, NForm, NFormItem, NModal, NSpace, useMessage} from "naive-ui";
import {api} from "../services/apiService.js";
import {useUserSettingsStore} from "../stores/userSettings.js";

const props = defineProps<{
  show: boolean;
  initialMonthMs?: number | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const message = useMessage();
const userSettingsStore = useUserSettingsStore();
const monthMs = ref(props.initialMonthMs ?? Date.now());
const loading = ref(false);

watch(
  () => props.show,
  (visible) => {
    if (visible) monthMs.value = props.initialMonthMs ?? Date.now();
  },
);

watch(
  () => props.initialMonthMs,
  (value) => {
    if (props.show && value) monthMs.value = value;
  },
);

async function downloadMonthlyReport() {
  const date = new Date(monthMs.value ?? Date.now());
  loading.value = true;
  try {
    const settings = await userSettingsStore.load();
    const selectedFields = settings?.report_config?.all_fields;
    await api.reports.downloadMonthly({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      format: "docx",
      mode: "all",
      fields: Array.isArray(selectedFields) && selectedFields.length ? selectedFields : undefined,
    });
    message.success("דוח DOC הורד בהצלחה");
    emit("update:show", false);
  } catch (e) {
    message.error(String(e));
  } finally {
    loading.value = false;
  }
}
</script>
