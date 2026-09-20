<template>
  <n-modal v-model:show="visible" preset="card" style="width: min(520px, 96vw)" :mask-closable="!saving">
    <template #header>
      <div style="text-align:start">
        <div style="font-weight:700">{{ l.documents.missingFields.title }}</div>
        <div v-if="fileName" style="font-size:12px;color:var(--n-text-color-3);margin-top:4px">{{ fileName }}</div>
      </div>
    </template>

    <n-alert v-if="blocksReminders" type="warning" :show-icon="true" style="margin-bottom:12px">
      {{ t("documents.missingFields.banner", {field: expiryLabel || l.documents.missingFields.expiryFallback}) }}
    </n-alert>

    <n-form label-placement="top" :style="{ direction: dir, textAlign: 'start' }">
      <n-form-item v-for="field in missing" :key="field.key" :label="field.label">
        <n-input
          v-model:value="values[field.key]"
          :placeholder="placeholderFor(field)"
          :dir="field.type === 'email' ? 'ltr' : undefined"
        />
        <div
          v-if="field.type === 'date' && values[field.key] && !isValidDateInput(values[field.key])"
          style="font-size:12px;color:var(--n-warning-color);margin-top:4px"
        >
          {{ l.documents.missingFields.dateHint }}
        </div>
      </n-form-item>
    </n-form>

    <template #footer>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <n-button quaternary @click="openDocument">{{ l.documents.missingFields.openDocument }}</n-button>
        <div style="display:flex;gap:8px">
          <n-button @click="visible = false">{{ l.documents.missingFields.later }}</n-button>
          <n-button type="primary" :loading="saving" @click="save">{{ l.documents.missingFields.saveReminders }}</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { NAlert, NButton, NForm, NFormItem, NInput, NModal, useMessage } from "naive-ui";
import { api } from "@/services/apiService.js";
import type { MissingFieldItem } from "@/shared/missingDocumentFields.js";
import { missingFieldsBlockReminders } from "@/shared/missingDocumentFields.js";
import { buildMissingFieldsPatch, normalizeDateForContract } from "@/shared/documentDates.js";
import { useI18n } from "@/composables/useI18n.js";

const props = defineProps<{
  documentId: string;
  fileName?: string;
  missing: MissingFieldItem[];
  initialValues?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: "saved"): void;
}>();

const visible = defineModel<boolean>({ required: true });
const router = useRouter();
const message = useMessage();
const { l, t, href, dir } = useI18n();
const saving = ref(false);
const values = reactive<Record<string, string>>({});

const blocksReminders = computed(() => missingFieldsBlockReminders(props.missing));
const expiryLabel = computed(() => props.missing.find((field) => field.critical)?.label ?? "");

watch(
  () => [visible.value, props.missing, props.initialValues] as const,
  ([open]) => {
    if (!open) return;
    for (const field of props.missing) {
      values[field.key] = props.initialValues?.[field.key] ?? values[field.key] ?? "";
    }
  },
  { immediate: true },
);

function placeholderFor(field: MissingFieldItem): string {
  if (field.type === "date") return "DD/MM/YYYY";
  if (field.type === "email") return "email@example.com";
  return field.label;
}

function isValidDateInput(value: string): boolean {
  return normalizeDateForContract(value) != null;
}

function openDocument() {
  visible.value = false;
  router.push(href(`/documents/${props.documentId}`));
}

async function save() {
  const patch = buildMissingFieldsPatch(props.missing, values);
  if (!Object.keys(patch).length) {
    message.warning(l.value.documents.missingFields.fillOne);
    return;
  }
  const invalidDate = props.missing.find(
    (field) => field.type === "date" && values[field.key]?.trim() && !normalizeDateForContract(values[field.key]),
  );
  if (invalidDate) {
    message.warning(t("documents.missingFields.invalidDate", {label: invalidDate.label}));
    return;
  }
  saving.value = true;
  try {
    await api.documents.updateFields(props.documentId, patch);
    message.success(l.value.documents.missingFields.saved);
    visible.value = false;
    emit("saved");
  } catch (err) {
    message.error(String(err));
  } finally {
    saving.value = false;
  }
}
</script>
