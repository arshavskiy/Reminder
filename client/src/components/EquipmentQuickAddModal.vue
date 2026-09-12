<template>
  <n-modal v-model:show="visible" :mask-closable="false" preset="card" style="width: 480px" title="הוספת ציוד">
    <n-form label-placement="top">
      <n-form-item label="שם הציוד" required>
        <n-input v-model:value="form.name" placeholder="למשל: במת הרמה" />
      </n-form-item>
      <n-form-item label="קטגוריה" required>
        <n-select v-model:value="form.category" :options="categoryOptions" :virtual-scroll="false" />
      </n-form-item>
      <n-grid :cols="2" :x-gap="12">
        <n-gi><n-form-item label="יצרן"><n-input v-model:value="form.manufacturer" /></n-form-item></n-gi>
        <n-gi><n-form-item label="דגם"><n-input v-model:value="form.model" /></n-form-item></n-gi>
        <n-gi><n-form-item label="מספר סידורי"><n-input v-model:value="form.serial_number" /></n-form-item></n-gi>
        <n-gi><n-form-item label='עומס עבודה בטוח (ק"ג)'><n-input v-model:value="form.capacity" /></n-form-item></n-gi>
      </n-grid>
    </n-form>

    <template #footer>
      <n-space justify="end">
        <n-button @click="close">ביטול</n-button>
        <n-button :loading="saving" type="primary" @click="submit">שמור</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import {ref, watch} from "vue";
import {NButton, NForm, NFormItem, NGi, NGrid, NInput, NModal, NSelect, NSpace, useMessage} from "naive-ui";
import {api} from "../services/apiService.js";
import type {Equipment} from "../shared/types.js";

const props = defineProps<{clientId: string}>();
const emit = defineEmits<{(e: "created", equipment: Equipment): void}>();
const visible = defineModel<boolean>("show", {required: true});

const message = useMessage();
const saving = ref(false);

const categoryOptions = [
  {value: "lift", label: "מכונות הרמה"},
  {value: "accessory", label: "אביזרי הרמה"},
  {value: "scaffold", label: "פיגומים"},
  {value: "ladder", label: "מעליות"},
  {value: "balloon", label: "מעלונים"},
  {value: "intake", label: "קולטי אוויר"},
  {value: "extractor", label: "קולטי קיטור"},
  {value: "other", label: "אחר"},
];

function emptyForm() {
  return {
    name: "",
    category: "lift",
    manufacturer: "",
    model: "",
    serial_number: "",
    capacity: "",
  };
}

const form = ref(emptyForm());

watch(visible, (isOpen) => {
  if (isOpen) form.value = emptyForm();
});

function close() {
  visible.value = false;
}

async function submit() {
  if (!form.value.name.trim()) {
    message.warning("יש להזין שם");
    return;
  }
  saving.value = true;
  try {
    const created = await api.equipment.create({...form.value, client_id: props.clientId, is_active: 1});
    message.success("הציוד נוסף");
    visible.value = false;
    emit("created", created);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}
</script>
