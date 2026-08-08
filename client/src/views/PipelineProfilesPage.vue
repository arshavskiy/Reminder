<template>
  <div class="pipeline-profiles-page">
    <n-space align="center" justify="space-between" style="margin-bottom: 16px">
      <span></span>
      <n-button type="primary" @click="newProfile">+ פרופיל חדש</n-button>
    </n-space>

    <n-alert v-if="!profiles.length" :show-icon="false" type="info">
      אין עדיין פרופילי Pipeline. פרופיל הוא בלוק הגדרות (מודל AI, שפת OCR, כללי פרומפט) שניתן לשייך למספר לקוחות.
    </n-alert>

    <n-grid v-else :cols="gridCols" :x-gap="16" :y-gap="16">
      <n-gi v-for="p in profiles" :key="p.id">
        <n-card :title="p.name" hoverable style="cursor:pointer" @click="select(p)">
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 8px">
            {{ p.description || "—" }}
          </p>
          <n-space :size="4">
            <n-tag v-if="p.ai_backend" size="small" type="info">{{ p.ai_backend }}</n-tag>
            <n-tag v-if="p.ai_model" size="small">{{ p.ai_model }}</n-tag>
            <n-tag v-if="p.ocr_language" size="small">OCR: {{ p.ocr_language }}</n-tag>
          </n-space>
        </n-card>
      </n-gi>
    </n-grid>

    <n-drawer v-model:show="showEdit" :width="drawerWidth" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת פרופיל' : 'פרופיל חדש'" closable>
        <n-form v-if="editing" label-placement="top">
          <n-form-item label="שם" required>
            <n-input v-model:value="editing.name" placeholder="למשל: מפעלי הרמה" />
          </n-form-item>
          <n-form-item label="תיאור">
            <n-input v-model:value="editing.description" :rows="2" type="textarea" />
          </n-form-item>

          <n-divider style="margin: 12px 0" />

          <n-grid :cols="2" :x-gap="16">
            <n-gi>
              <n-form-item label="מנוע AI">
                <n-select
                  v-model:value="editing.ai_backend"
                  :options="aiBackendOptions"
                  :virtual-scroll="false"
                  clearable
                  placeholder="ברירת מחדל (הגדרות מערכת)"
                />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="מודל AI">
                <n-input v-model:value="editing.ai_model" placeholder="ברירת מחדל" />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-grid :cols="2" :x-gap="16">
            <n-gi>
              <n-form-item label="שפת OCR">
                <n-input v-model:value="editing.ocr_language" placeholder="למשל: heb+eng" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="מקסימום תווים לחילוץ">
                <n-input-number
                  v-model:value="editing.extraction_max_chars"
                  :min="0"
                  clearable
                  placeholder="ברירת מחדל"
                  style="width: 100%"
                />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-form-item label="ימי התראה מראש (מופרדים בפסיק)">
            <n-input
              :value="(editing.reminder_advance_days || []).join(', ')"
              placeholder="למשל: 30, 14, 7"
              @update:value="onAdvanceDaysInput"
            />
          </n-form-item>

          <n-form-item label="תבנית ברירת מחדל">
            <n-select
              v-model:value="editing.default_template_id"
              :options="templateOptions"
              :virtual-scroll="false"
              clearable
              placeholder="ללא"
            />
          </n-form-item>

          <n-form-item label="כללי פרומפט מותאמים">
            <n-input
              v-model:value="editing.custom_prompt_rules"
              :rows="3"
              placeholder="הוראות נוספות ל-AI עבור לקוחות המשויכים לפרופיל זה..."
              type="textarea"
            />
          </n-form-item>

          <n-divider style="margin: 12px 0" />

          <n-form-item label="פרומפט חילוץ כללי (למסמכים ללא תבנית תואמת)">
            <div style="width: 100%">
              <n-input
                v-model:value="genericPrompt"
                :autosize="{ minRows: 6, maxRows: 20 }"
                placeholder="ה-system prompt הגלובלי לחילוץ מסמכים כלליים..."
                type="textarea"
                @update:value="genericPromptDirty = true"
              />
              <n-alert :show-icon="false" style="margin-top: 6px; font-size: 12px" type="info">
                זהו הפרומפט הכללי הגלובלי (נשמר בהגדרות המערכת ומשפיע על כל המשתמשים). שמירה כאן מעדכנת אותו מיד.
              </n-alert>

              <n-input
                v-model:value="genTestText"
                :autosize="{ minRows: 3, maxRows: 8 }"
                placeholder="הדבק טקסט לדוגמה לבדיקת החילוץ (ללא שמירה)..."
                style="margin-top: 8px"
                type="textarea"
              />
              <n-button
                :disabled="genTestText.trim().length < 20"
                :loading="genTesting"
                style="margin-top: 8px"
                @click="runGenericTest"
              >בדוק חילוץ</n-button>
              <n-alert v-if="genTestError" :show-icon="false" style="margin-top: 8px; font-size: 12px" type="error">
                {{ genTestError }}
              </n-alert>
              <div v-if="genTestResult" style="margin-top: 8px">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px">מודל: {{ genTestModel }} · {{ genTestMs }}ms</div>
                <pre class="test-result">{{ genTestResult }}</pre>
              </div>
            </div>
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button v-if="editing?.id" type="error" @click="remove">מחק</n-button>
            <n-button :loading="saving" type="primary" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script lang="ts" setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NTag,
  useMessage,
} from "naive-ui";
import {api} from "../services/apiService.js";
import type {DocTemplate, PipelineProfile} from "@shared/types.js";

const message = useMessage();
const profiles = ref<PipelineProfile[]>([]);
const docTemplates = ref<DocTemplate[]>([]);
const editing = ref<PipelineProfile | null>(null);
const showEdit = ref(false);
const saving = ref(false);
const isMobile = ref(false);

const gridCols = computed(() => (isMobile.value ? 1 : 3));
const drawerWidth = computed(() => (isMobile.value ? "100%" : 520));

const aiBackendOptions = [
  { label: "OpenAI", value: "openai" },
  { label: "Ollama", value: "ollama" },
];
const templateOptions = computed(() =>
  docTemplates.value.map((t) => ({ label: t.name, value: t.id }))
);

// Global generic prompt (stored in system_settings, shown here for convenience)
const genericPrompt = ref("");
const genericPromptDirty = ref(false);
const genTestText = ref("");
const genTesting = ref(false);
const genTestResult = ref("");
const genTestError = ref("");
const genTestModel = ref("");
const genTestMs = ref(0);

async function runGenericTest() {
  if (genTestText.value.trim().length < 20) return;
  genTesting.value = true;
  genTestError.value = "";
  genTestResult.value = "";
  try {
    const res = await api.docTemplates.testExtraction({
      sampleText: genTestText.value,
      prompt: genericPrompt.value || "",
      mode: "generic",
    });
    genTestModel.value = res.model;
    genTestMs.value = res.execMs;
    if (res.error) genTestError.value = res.error;
    else genTestResult.value = JSON.stringify(res.result, null, 2);
  } catch (e) {
    genTestError.value = String(e);
  } finally {
    genTesting.value = false;
  }
}

function onAdvanceDaysInput(v: string) {
  if (!editing.value) return;
  const days = v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  editing.value.reminder_advance_days = days.length ? days : null;
}

function updateViewport() {
  isMobile.value = window.innerWidth < 768;
}

async function load() {
  profiles.value = await api.pipelineProfiles.list();
  docTemplates.value = await api.docTemplates.list().catch(() => []);
  try {
    const s = await api.settings.get();
    genericPrompt.value = (s as any).genericExtractionPrompt ?? "";
  } catch { /* non-admin or unavailable */ }
}

onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  load();
});
onBeforeUnmount(() => window.removeEventListener("resize", updateViewport));

function select(p: PipelineProfile) {
  editing.value = JSON.parse(JSON.stringify(p));
  showEdit.value = true;
}

function newProfile() {
  editing.value = {
    id: "",
    user_id: "",
    name: "",
    description: null,
    ai_backend: null,
    ai_model: null,
    ocr_language: null,
    extraction_max_chars: null,
    reminder_advance_days: null,
    default_template_id: null,
    custom_prompt_rules: null,
    created_at: "",
    updated_at: "",
  };
  showEdit.value = true;
}

async function save() {
  if (!editing.value) return;
  if (!editing.value.name.trim()) {
    message.warning("יש להזין שם");
    return;
  }
  // Normalize blank strings to null
  const p = editing.value;
  for (const k of ["ai_backend", "ai_model", "ocr_language", "custom_prompt_rules", "default_template_id", "description"] as const) {
    if (typeof p[k] === "string" && !(p[k] as string).trim()) (p as any)[k] = null;
  }
  saving.value = true;
  try {
    if (editing.value.id) {
      await api.pipelineProfiles.update(editing.value.id, editing.value);
      message.success("הפרופיל עודכן");
    } else {
      await api.pipelineProfiles.create(editing.value);
      message.success("הפרופיל נוצר");
    }
    // Persist the global generic prompt (system_settings) if it was edited.
    if (genericPromptDirty.value) {
      await api.settings.save({ genericExtractionPrompt: genericPrompt.value } as any);
      genericPromptDirty.value = false;
    }
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!editing.value?.id) return;
  if (!confirm(`למחוק את "${editing.value.name}"?`)) return;
  try {
    await api.pipelineProfiles.delete(editing.value.id);
    message.success("נמחק");
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  }
}
</script>

<style scoped>
.test-result {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  background: var(--code-bg, rgba(128,128,128,0.08));
  padding: 8px;
  border-radius: 6px;
  margin: 0;
}
</style>
