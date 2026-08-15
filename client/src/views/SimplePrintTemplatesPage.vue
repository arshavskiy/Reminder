<template>
  <div class="layout-pt page2">
    <!-- List -->
    <template v-if="mode === 'list'">
      <PageHeader
          title="עורך פריסה פשוט"
          subtitle="תבניות הדפסה מבוססות סעיפים"
          :count="templates.length"
      >
        <template #breadcrumb>
          <a href="#" @click.prevent="router.push('/settings/print-templates')">תבניות הדפסה</a>
          <span class="sep">/</span>
          <span>עורך פריסה</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" @click="router.push('/settings/print-templates/excel')">עורך Excel</button>
          <button class="btn btn--primary" @click="createTemplate">+ תבנית חדשה</button>
        </template>
      </PageHeader>

      <n-alert v-if="loadError" type="error" style="margin-bottom:12px">{{ loadError }}</n-alert>
      <n-spin :show="loading">
        <div v-if="templates.length" class="pt-grid">
          <article v-for="t in templates" :key="t._id" class="pt-card">
            <div class="pt-card__head">
              <h3>{{ t.name }}</h3>
              <span class="tag tag--neutral">פריסה</span>
            </div>
            <p class="pt-card__meta">
              מסגרת: {{ borderLabel(t) }} · {{ sectionCount(t) }} סעיפים
            </p>
            <div class="pt-card__actions">
              <button class="btn btn--xs btn--primary" @click="openCompose(t)">✏️ מלא ושלח</button>
              <button class="btn btn--xs btn--ghost" @click="editTemplate(t)">🎨 ערוך</button>
              <button class="btn btn--xs btn--danger" @click="deleteTemplate(t._id)">🗑</button>
            </div>
          </article>
        </div>
        <n-empty v-else-if="!loading" description="אין תבניות פריסה. צרו תבנית חדשה." style="margin-top:48px">
          <template #extra>
            <button class="btn btn--primary" @click="createTemplate">+ תבנית חדשה</button>
          </template>
        </n-empty>
      </n-spin>
    </template>

    <!-- Edit -->
    <template v-else-if="mode === 'edit' && editing">
      <PageHeader :title="editing.name || 'עריכת תבנית'">
        <template #breadcrumb>
          <a href="#" @click.prevent="goList">עורך פריסה</a>
          <span class="sep">/</span>
          <span>{{ editing.name }}</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" @click="goList">ביטול</button>
          <button class="btn btn--primary" :disabled="saving" @click="saveTemplate">שמור</button>
        </template>
      </PageHeader>
      <SimpleLayoutEditor
          v-model:name="editing.name"
          :layout="editingLayout"
          @update:layout="editingLayout = $event"
      />
    </template>

    <!-- Compose -->
    <template v-else-if="mode === 'compose' && composing">
      <PageHeader :title="`${composing.name} — מילוי`">
        <template #breadcrumb>
          <a href="#" @click.prevent="goList">עורך פריסה</a>
          <span class="sep">/</span>
          <span>{{ composing.name }}</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" :disabled="draftSaving" @click="saveDraft">שמור טיוטה</button>
          <button class="btn btn--primary" :disabled="printing" @click="printPdf">🖨 הדפס PDF</button>
          <button class="btn btn--primary" :disabled="savingPdf" @click="savePdf">הורד PDF</button>
        </template>
      </PageHeader>
      <div class="compose-grid">
        <div class="compose-form">
          <h3 class="compose-form__title">שדות</h3>
          <n-form label-placement="top" size="small">
            <n-form-item v-for="f in composeFields" :key="f.bind" :label="f.label">
              <n-input v-model:value="composeData[f.bind]" />
            </n-form-item>
          </n-form>
        </div>
        <div class="compose-preview">
          <div class="compose-preview__label">תצוגה מקדימה</div>
          <LayoutPreviewFrame
              v-if="composing.layout"
              :layout="composing.layout"
              :data="composeData"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NAlert, NEmpty, NForm, NFormItem, NInput, NSpin, useDialog, useMessage} from "naive-ui";
import PageHeader from "../components/PageHeader.vue";
import SimpleLayoutEditor from "../components/print/SimpleLayoutEditor.vue";
import LayoutPreviewFrame from "../components/print/LayoutPreviewFrame.vue";
import {api} from "../services/apiService.js";
import type {PrintTemplate} from "@shared/types.js";
import {
  clonePrintTemplateLayout,
  createDefaultPrintTemplateLayout,
  extractLayoutFieldBinds,
  LAYOUT_BORDER_COLORS,
  type PrintTemplateLayout,
} from "@shared/printTemplateLayout.js";

type Mode = "list" | "edit" | "compose";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const dialog = useDialog();

const mode = ref<Mode>("list");
const loading = ref(false);
const loadError = ref<string | null>(null);
const templates = ref<PrintTemplate[]>([]);
const saving = ref(false);
const editing = ref<PrintTemplate | null>(null);
const editingLayout = ref<PrintTemplateLayout>(createDefaultPrintTemplateLayout());
const composing = ref<PrintTemplate | null>(null);
const composeContractId = ref<string | null>(null);
const composeData = ref<Record<string, string>>({});
const draftSaving = ref(false);
const printing = ref(false);
const savingPdf = ref(false);

const composeFields = computed(() => {
  if (!composing.value?.layout) return [];
  return extractLayoutFieldBinds(composing.value.layout);
});

function sectionTemplates(all: PrintTemplate[]): PrintTemplate[] {
  return all.filter((t) => t.editorType === "sections" && t.layout);
}

async function loadTemplates() {
  loading.value = true;
  loadError.value = null;
  try {
    const all = await api.printTemplates.list();
    templates.value = sectionTemplates(all);
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function borderLabel(t: PrintTemplate): string {
  const color = t.layout?.styles.borderColor ?? "#111";
  return LAYOUT_BORDER_COLORS.find((c) => c.value === color)?.label ?? color;
}

function sectionCount(t: PrintTemplate): number {
  return t.layout?.sections.length ?? 0;
}

function goList() {
  mode.value = "list";
  editing.value = null;
  composing.value = null;
  void router.replace("/settings/print-templates/layout");
}

function createTemplate() {
  editing.value = {
    _id: "",
    name: "תבנית תסקיר חדשה",
    page: "A4",
    dir: "rtl",
    cols: [],
    rows: [],
    cells: [],
    editorType: "sections",
    layout: createDefaultPrintTemplateLayout(),
    created_at: "",
    updated_at: "",
  };
  editingLayout.value = createDefaultPrintTemplateLayout();
  mode.value = "edit";
}

function editTemplate(t: PrintTemplate) {
  editing.value = { ...t };
  editingLayout.value = clonePrintTemplateLayout(t.layout ?? createDefaultPrintTemplateLayout());
  mode.value = "edit";
}

async function saveTemplate() {
  if (!editing.value) return;
  saving.value = true;
  try {
    const body = {
      name: editing.value.name,
      page: "A4" as const,
      dir: "rtl" as const,
      cols: [],
      rows: [],
      cells: [],
      editorType: "sections" as const,
      layout: editingLayout.value,
    };
    if (editing.value._id) {
      await api.printTemplates.update(editing.value._id, body);
      message.success("נשמר");
    } else {
      const created = await api.printTemplates.create(body);
      editing.value._id = created._id;
      message.success("נוצר");
    }
    await loadTemplates();
    goList();
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    saving.value = false;
  }
}

async function openCompose(t: PrintTemplate, contractId?: string | null) {
  composing.value = t;
  composeContractId.value = contractId ?? null;
  mode.value = "compose";
  composeData.value = {};
  for (const f of extractLayoutFieldBinds(t.layout ?? createDefaultPrintTemplateLayout())) {
    composeData.value[f.bind] = "";
  }
  try {
    const draft = contractId
      ? await api.printTemplates.getDraftForContract(t._id, contractId)
      : await api.printTemplates.getDraft(t._id);
    if (draft.data) {
      for (const [k, v] of Object.entries(draft.data)) composeData.value[k] = v;
    }
  } catch { /* no draft yet */ }
  const url = contractId
    ? `/settings/print-templates/layout/${t._id}/compose?contractId=${contractId}`
    : `/settings/print-templates/layout/${t._id}/compose`;
  void router.replace(url);
}

async function saveDraft() {
  if (!composing.value) return;
  draftSaving.value = true;
  try {
    const meta = composeContractId.value ? { contract_id: composeContractId.value } : {};
    await api.printTemplates.saveDraft(composing.value._id, composeData.value, meta);
    message.success("טיוטה נשמרה");
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    draftSaving.value = false;
  }
}

async function printPdf() {
  if (!composing.value) return;
  printing.value = true;
  try {
    const blob = await api.printTemplates.renderPdf(composing.value._id, composeData.value);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    printing.value = false;
  }
}

async function savePdf() {
  if (!composing.value) return;
  savingPdf.value = true;
  try {
    const meta = composeContractId.value ? { contract_id: composeContractId.value } : {};
    const blob = await api.printTemplates.savePdf(composing.value._id, composeData.value, meta);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${composing.value.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("PDF נשמר");
  } catch (e: unknown) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    savingPdf.value = false;
  }
}

function deleteTemplate(id: string) {
  dialog.warning({
    title: "מחיקת תבנית",
    content: "למחוק את התבנית?",
    positiveText: "מחק",
    negativeText: "ביטול",
    onPositiveClick: async () => {
      await api.printTemplates.delete(id);
      templates.value = templates.value.filter((t) => t._id !== id);
      message.success("נמחק");
    },
  });
}

async function openRouteCompose() {
  const templateId = route.params.templateId;
  if (typeof templateId !== "string") return;
  const contractId = typeof route.query.contractId === "string" ? route.query.contractId : null;
  await loadTemplates();
  const t = templates.value.find((x) => x._id === templateId);
  if (t) await openCompose(t, contractId);
  else {
    const all = await api.printTemplates.list();
    const found = sectionTemplates(all).find((x) => x._id === templateId);
    if (found) await openCompose(found, contractId);
  }
}

watch(
  () => route.path,
  () => {
    if (route.name === "print-templates-layout-compose") void openRouteCompose();
    else if (route.path === "/settings/print-templates/layout") {
      mode.value = "list";
      void loadTemplates();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (route.path === "/settings/print-templates/layout") void loadTemplates();
});
</script>

<style scoped>
.pt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.pt-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-elevated);
}
.pt-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.pt-card__head h3 { margin: 0; font-size: 16px; }
.pt-card__meta { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); }
.pt-card__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.compose-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}
.compose-form {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-elevated);
  max-height: 75vh;
  overflow: auto;
}
.compose-form__title { margin: 0 0 10px; font-size: 14px; }
.compose-preview {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.compose-preview__label {
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
@media (max-width: 900px) {
  .compose-grid { grid-template-columns: 1fr; }
}
</style>
