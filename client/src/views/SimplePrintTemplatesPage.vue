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
          <router-link to="/print-templates">תבניות הדפסה</router-link>
          <span class="sep">/</span>
          <span>עורך פריסה</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" @click="router.push('/print-templates/excel')">עורך Excel</button>
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
              <span v-if="t.is_shared" class="tag tag--neutral">משותף</span>
            </div>
            <p class="pt-card__meta">
              מסגרת: {{ borderLabel(t) }} · {{ sectionCount(t) }} סעיפים
            </p>
            <div class="pt-card__actions">
              <button class="btn btn--xs btn--primary" @click="openCompose(t)">
                <n-icon :component="CreateOutline"/>
                מלא ושלח
              </button>
              <button v-if="canMutateTemplate(t)" class="btn btn--xs btn--ghost" @click="editTemplate(t)">
                <n-icon :component="BrushOutline"/>
                ערוך
              </button>
              <button v-if="canDeleteTemplate(t)" class="btn btn--xs btn--danger" @click="deleteTemplate(t._id)">
                <n-icon :component="TrashOutline"/>
              </button>
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
          <router-link to="/print-templates">תבניות הדפסה</router-link>
          <span class="sep">/</span>
          <a href="#" @click.prevent="goList">עורך פריסה</a>
          <span class="sep">/</span>
          <span>{{ editing.name || "עריכת תבנית" }}</span>
        </template>
      </PageHeader>
      <SimpleLayoutEditor
          v-model:name="editing.name"
          :layout="editingLayout"
          @update:layout="editingLayout = $event"
      />
      <div class="edit-footer">
        <button class="btn btn--ghost" @click="goList">ביטול</button>
        <button v-if="canMutateEditing" :disabled="saving" class="btn btn--primary" @click="saveTemplate">שמור</button>
      </div>
    </template>

    <!-- Compose -->
    <template v-else-if="mode === 'compose' && composing">
      <PageHeader :title="`${composing.name} — מילוי`">
        <template #breadcrumb>
          <router-link to="/print-templates">תבניות הדפסה</router-link>
          <span class="sep">/</span>
          <a href="#" @click.prevent="goList">עורך פריסה</a>
          <span class="sep">/</span>
          <span>{{ composing.name }}</span>
        </template>
        <template #actions>
          <button class="btn btn--ghost" :disabled="draftSaving" @click="saveDraft">שמור טיוטה</button>
          <button :disabled="!exportAllowed || printing" class="btn btn--primary" @click="printPdf">
            <n-icon :component="PrintOutline"/>
            הדפס PDF
          </button>
          <button class="btn btn--primary" :disabled="!exportAllowed || savingPdf" @click="savePdf">הורד PDF</button>
          <a v-if="linkedQuote && linkedQuote.status === 'issued'" :href="paymentService.pdf(linkedQuote._id)" target="_blank" rel="noopener" class="btn btn--ghost">
            הצעת מחיר PDF
          </a>
          <router-link v-else-if="linkedQuote" :to="`/quotes/${linkedQuote._id}`" class="btn btn--ghost">
            הצעת מחיר (טיוטה)
          </router-link>
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
        <div class="compose-preview-area">
          <div class="compose-preview">
            <div class="compose-preview__label">תצוגה מקדימה</div>
            <LayoutPreviewFrame
                v-if="composing.layout"
                :data="composeData"
                :layout="composing.layout"
            />
          </div>
          <div v-if="linkedQuote" class="compose-preview">
            <div class="compose-preview__label">תצוגה מקדימה — הצעת מחיר</div>
            <iframe
                v-if="linkedQuote.status === 'issued'"
                :src="paymentService.pdf(linkedQuote._id)"
                :title="`הצעת מחיר ${linkedQuote.number || ''}`"
                class="compose-quote-frame"
            />
            <div v-else class="compose-quote-empty">
              הצעת המחיר עדיין בטיוטה ולא הופקה כ-PDF.
              <router-link :to="`/quotes/${linkedQuote._id}`">פתח את הטיוטה</router-link>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NAlert, NEmpty, NForm, NFormItem, NIcon, NInput, NSpin, useMessage} from "naive-ui";
import {BrushOutline, CreateOutline, PrintOutline, TrashOutline} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import SimpleLayoutEditor from "../components/print/SimpleLayoutEditor.vue";
import LayoutPreviewFrame from "../components/print/LayoutPreviewFrame.vue";
import {api} from "../services/apiService.js";
import {paymentService, type PaymentRequest} from "../services/paymentService.js";
import {useAuthStore} from "../stores/auth.js";
import {useConfirm} from "../composables/useConfirm.js";
import {featureFlagsForUser, resolveUserPlan} from "../shared/pricingPlans.js";
import type {PrintTemplate} from "@shared/types.js";
import {
  clonePrintTemplateLayout,
  createDefaultFooterSection,
  createDefaultPrintTemplateLayout,
  extractLayoutFieldBinds,
  LAYOUT_BORDER_COLORS,
  type PrintTemplateLayout,
} from "@shared/printTemplateLayout.js";

const authStore = useAuthStore();

function canMutateTemplate(_t: PrintTemplate) {
  return true;
}

function canDeleteTemplate(t: PrintTemplate) {
  return authStore.isAdmin || t.user_id === authStore.user?.id;
}

type Mode = "list" | "edit" | "compose";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const {confirm} = useConfirm();

const mode = ref<Mode>("list");
const loading = ref(false);
const loadError = ref<string | null>(null);
const templates = ref<PrintTemplate[]>([]);
const saving = ref(false);
const editing = ref<PrintTemplate | null>(null);
const canMutateEditing = computed(() => !editing.value?._id || canMutateTemplate(editing.value));
const editingLayout = ref<PrintTemplateLayout>(createDefaultPrintTemplateLayout());
const composing = ref<PrintTemplate | null>(null);
const composeContractId = ref<string | null>(null);
const composeData = ref<Record<string, string>>({});
const linkedQuote = ref<PaymentRequest | null>(null);
const draftSaving = ref(false);
const printing = ref(false);
const savingPdf = ref(false);
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);

const composeFields = computed(() => {
  if (!composing.value?.layout) return [];
  return extractLayoutFieldBinds(composing.value.layout);
});

async function fetchUserProfile(): Promise<{ name?: string; email?: string; phone?: string } | null> {
  if (!authStore.user && !authStore.initialized) {
    await authStore.fetchMe();
  }
  const user = authStore.actingAs ?? authStore.user;
  if (!user) return null;
  return {
    name: user.name ?? undefined,
    email: user.email,
    phone: user.phone ?? undefined,
  };
}

function ensureFooterSection(layout: PrintTemplateLayout): PrintTemplateLayout {
  const footerIndex = layout.sections.findIndex((s) => s.type === "footer");
  const nextFooter = createDefaultFooterSection();
  if (footerIndex < 0) {
    return layout;
  }
  const current = layout.sections[footerIndex];
  if (current.type !== "footer") return layout;
  const isLegacyFooter =
      current.leftBind === "engineer_email" &&
      current.centerBind === "engineer_company" &&
      current.rightBind === "engineer_phone";
  if (!isLegacyFooter) return layout;
  const sections = layout.sections.slice();
  sections[footerIndex] = {...current, ...nextFooter};
  return {...layout, sections};
}

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
  void router.replace("/print-templates/layout");
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
  const baseLayout = clonePrintTemplateLayout(t.layout ?? createDefaultPrintTemplateLayout());
  editingLayout.value = ensureFooterSection(baseLayout);
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

  // Fetch engineer profile data and populate engineer fields
  const [engineerProfile, userProfile] = await Promise.all([
    authStore.fetchMe(),
    fetchUserProfile(),
  ]);
  if (engineerProfile || userProfile) {
    const companyName = engineerProfile?.company_name || "";
    composeData.value.engineer_name = engineerProfile?.name || userProfile?.name || "";
    composeData.value.engineer_email = engineerProfile?.company_email || userProfile?.email || "";
    composeData.value.engineer_phone = engineerProfile?.company_phone || userProfile?.phone || "";
    composeData.value.engineer_company = companyName;
    composeData.value.inspector_number = engineerProfile?.inspector_number || "";
    composeData.value.company_name = companyName;
    composeData.value.company_registration = engineerProfile?.company_registration || "";
    composeData.value.engineer_address = engineerProfile?.address || "";
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
      ? `/print-templates/layout/${t._id}/compose?contractId=${contractId}`
      : `/print-templates/layout/${t._id}/compose`;
  void router.replace(url);
  linkedQuote.value = null;
  if (contractId) void loadLinkedQuote(contractId);
}

async function loadLinkedQuote(contractId: string) {
  try {
    const {rows} = await paymentService.list();
    linkedQuote.value = rows.find((row) => row.contractId === contractId) ?? null;
  } catch {
    linkedQuote.value = null;
  }
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
  if (!exportAllowed.value) {
    message.warning("ייצוא PDF זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
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
  if (!exportAllowed.value) {
    message.warning("ייצוא PDF זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  savingPdf.value = true;
  try {
    const meta = composeContractId.value ? { contract_id: composeContractId.value } : {};
    const saved = await api.printTemplates.savePdf(composing.value._id, composeData.value, meta);
    if (!(saved.blob instanceof Blob)) throw new Error("PDF save did not return a file");
    const url = URL.createObjectURL(saved.blob);
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
  confirm({
    title: "מחיקת תבנית",
    content: "למחוק את התבנית?",
    confirmText: "מחק",
    onConfirm: async () => {
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
  () => [route.path, route.query.create, route.query.edit] as const,
  async () => {
    if (route.name === "print-templates-layout-compose") {
      void openRouteCompose();
      return;
    }
    if (route.name !== "print-templates-layout") return;
    await loadTemplates();
    if (String(route.query.create ?? "") === "1") {
      createTemplate();
      const nextQuery = {...route.query};
      delete nextQuery.create;
      void router.replace({path: "/print-templates/layout", query: nextQuery});
      return;
    }
    const editId = typeof route.query.edit === "string" ? route.query.edit : "";
    if (editId) {
      const t = templates.value.find((x) => x._id === editId);
      if (t) editTemplate(t);
      else message.warning("התבנית לא נמצאה");
      const nextQuery = {...route.query};
      delete nextQuery.edit;
      void router.replace({path: "/print-templates/layout", query: nextQuery});
      return;
    }
    if (mode.value !== "edit") mode.value = "list";
  },
  {immediate: true},
);

onMounted(() => {
  if (
    route.name === "print-templates-layout"
    && String(route.query.create ?? "") !== "1"
    && !route.query.edit
  ) {
    void loadTemplates();
  }
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
.edit-footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
  padding: 16px 0 8px;
  border-top: 1px solid var(--border-color);
}

.layout-pt {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compose-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) 1fr;
  gap: 20px;
  align-items: start;
  margin-top: 8px;
}

.compose-form {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-card, var(--bg-elevated));
  max-height: 75vh;
  overflow: auto;
}

.compose-form__title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
}

.compose-form :deep(.n-form-item) {
  margin-bottom: 14px;
}

.compose-preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.compose-preview {
  width: 500px;
  max-width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.compose-preview__label {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}

.compose-quote-frame {
  width: 100%;
  height: 500px;
  border: 0;
  display: block;
}

.compose-quote-empty {
  padding: 32px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

@media (max-width: 900px) {
  .compose-grid { grid-template-columns: 1fr; }
}
</style>
