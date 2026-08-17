<template>
  <n-modal v-model:show="visible" preset="card" style="width: min(520px, 96vw)" :mask-closable="!saving">
    <template #header>
      <div style="text-align:right">
        <div style="font-weight:700">שדות חסרים לאחר סריקה</div>
        <div v-if="fileName" style="font-size:12px;color:var(--n-text-color-3);margin-top:4px">{{ fileName }}</div>
      </div>
    </template>

    <n-alert v-if="blocksReminders" type="warning" :show-icon="true" style="margin-bottom:12px">
      לא נוצרו תזכורות כי חסר {{ expiryLabel || "תאריך בתוקף" }}. מלא/י את השדות למטה ושמור/י.
    </n-alert>

    <n-form label-placement="top" style="direction:rtl;text-align:right">
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
          יש להזין תאריך מלא (למשל 31/07/2026) — הערך הנוכחי לא מספיק ליצירת תזכורת
        </div>
      </n-form-item>
    </n-form>

    <template #footer>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <n-button quaternary @click="openDocument">פתח מסמך</n-button>
        <div style="display:flex;gap:8px">
          <n-button @click="visible = false">אחר כך</n-button>
          <n-button type="primary" :loading="saving" @click="save">שמור וצור תזכורות</n-button>
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
  router.push(`/documents/${props.documentId}`);
}

async function save() {
  const patch = buildMissingFieldsPatch(props.missing, values);
  if (!Object.keys(patch).length) {
    message.warning("יש למלא לפחות שדה אחד");
    return;
  }
  const invalidDate = props.missing.find(
    (field) => field.type === "date" && values[field.key]?.trim() && !normalizeDateForContract(values[field.key]),
  );
  if (invalidDate) {
    message.warning(`תאריך לא תקין ב"${invalidDate.label}" — השתמש/י בפורמט DD/MM/YYYY`);
    return;
  }
  saving.value = true;
  try {
    await api.documents.updateFields(props.documentId, patch);
    message.success("השדות נשמרו — תזכורות ייווצרו מחדש");
    visible.value = false;
    emit("saved");
  } catch (err) {
    message.error(String(err));
  } finally {
    saving.value = false;
  }
}
</script>
