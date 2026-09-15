<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <n-button type="primary" @click="newTemplate">+ תבנית חדשה</n-button>
    </n-space>

    <n-grid v-if="templates.length" :cols="templateGridCols" :x-gap="16" :y-gap="16">
      <n-gi v-for="t in templates" :key="t.id">
        <n-card hoverable :title="t.name" @click="select(t)" style="cursor: pointer">
          <template #header-extra>
            <n-tag v-if="userDefaultTemplateId ? t.id === userDefaultTemplateId : t.is_default" size="small" type="success">ברירת מחדל</n-tag>
          </template>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0">
            {{ docTplName(t.doc_template_id) || "לכל סוגי המסמכים" }}
          </p>
          <p v-if="t.reminder_category" style="font-size: 12px; color: var(--text-secondary); margin: 4px 0 0">
            קטגוריה: {{ categoryLabel(t.reminder_category) }}
          </p>
          <p style="font-size: 12px; color: var(--text-muted); margin: 8px 0 0">{{ t.subject }}</p>
          <template #footer>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
              <n-button
                v-if="!(userDefaultTemplateId ? t.id === userDefaultTemplateId : t.is_default)"
                size="small" text type="primary"
                @click.stop="setMyDefault(t.id)"
              >הגדר כברירת מחדל שלי</n-button>
              <n-button size="small" text @click.stop="openSendTest(t)">📧 שלח דוגמה</n-button>
            </div>
          </template>
        </n-card>
      </n-gi>
    </n-grid>
    <n-alert v-else type="info" :show-icon="false">
      אין עדיין תבניות. צור תבנית כדי לעצב את תוכן התזכורות.
    </n-alert>

    <!-- Editor drawer -->
    <!-- Send test email modal -->
    <n-modal v-model:show="showSendTest" preset="card" title="שלח אימייל לדוגמה" style="max-width:480px">
      <n-form label-placement="top" :show-feedback="false">
        <n-form-item label="כתובת אימייל" style="margin-bottom:16px">
          <n-input v-model:value="sendTestEmail" placeholder="email@example.com" @keydown.enter="sendTest" />
        </n-form-item>
        <n-form-item style="margin-bottom:0">
          <template #label>
            <span>תזכורת לדוגמה <span style="color:var(--text-muted);font-size:12px">(אופציונלי — ישתמש בנתונים אמיתיים)</span></span>
          </template>
          <n-select
            v-model:value="sendTestReminderId"
            :options="reminderOptions"
            placeholder="ללא — נשתמש בנתוני דוגמה"
            clearable
            filterable
            :loading="loadingReminders"
            :virtual-scroll="false"
          />
        </n-form-item>
      </n-form>
      <n-form-item style="margin-top:12px; margin-bottom:0">
        <n-checkbox v-model:checked="sendTestNoCC">ללא CC (אל תשלח עותק אליי)</n-checkbox>
      </n-form-item>
      <template #footer>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          <n-button @click="showSendTest=false">ביטול</n-button>
          <n-button type="primary" :loading="sendingTest" :disabled="!sendTestEmail.trim()" @click="sendTest">שלח</n-button>
        </div>
      </template>
    </n-modal>

    <n-drawer v-model:show="showEdit" :width="drawerWidth" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת תבנית אימייל' : 'תבנית אימייל חדשה'" closable>
        <n-tabs v-if="editing" v-model:value="activeTab" type="line" animated @update:value="onTabChange">
          <!-- ── Preview tab ─────────────────────────────────────────────── -->
          <n-tab-pane name="preview" tab="תצוגה מקדימה">
            <n-space justify="space-between" align="center" style="margin-bottom:12px">
              <n-text strong>נושא: {{ previewSubject || "—" }}</n-text>
              <n-space>
                <n-button v-if="editing?.id" size="small" type="error" @click="deleteTpl">מחק תבנית</n-button>
                <n-button size="small" @click="refreshPreview" :loading="previewing">רענן תצוגה</n-button>
              </n-space>
            </n-space>
            <div v-if="previewing" style="text-align:center; padding:40px">
              <n-spin size="large" />
            </div>
            <iframe
              v-else-if="previewHtml"
              :srcdoc="previewHtml"
              style="width:100%; height:620px; border:1px solid var(--border-color); border-radius:8px"
            />
            <n-alert v-else type="default" :show-icon="false">
              לחץ על "רענן תצוגה" כדי לראות את התצוגה המקדימה
            </n-alert>
          </n-tab-pane>

          <!-- ── Editor tab ──────────────────────────────────────────────── -->
          <n-tab-pane name="editor" tab="עריכה">
            <n-form label-placement="top">
              <n-form-item label="שם" required>
                <n-input v-model:value="editing.name" />
              </n-form-item>

              <n-form-item label="קשור לתבנית מסמך (אופציונלי)">
                <n-select
                  v-model:value="editing.doc_template_id"
                  :options="docTplOptions"
                  placeholder="לכל סוגי המסמכים"
                  clearable
                  :virtual-scroll="false"
                />
              </n-form-item>

              <n-form-item label="קשור לקטגוריית תזכורות מטבלה (אופציונלי)">
                <n-select
                  v-model:value="editing.reminder_category"
                  :options="categoryOptions"
                  placeholder="לכל הקטגוריות"
                  clearable
                  filterable
                  tag
                  :virtual-scroll="false"
                />
              </n-form-item>

              <n-form-item label="נושא האימייל">
                <n-input v-model:value="editing.subject" placeholder="[תזכורת] {{title}}" />
              </n-form-item>

              <n-form-item label="לוגו">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap: wrap">
                  <img
                    v-if="editing.logo_path"
                    :src="api.assets.url(editing.logo_path)"
                    style="max-height:48px; border-radius:4px"
                  />
                  <n-upload
                    :show-file-list="false"
                    :custom-request="uploadLogo as any"
                    accept="image/*"
                  >
                    <n-button size="small">העלה לוגו</n-button>
                  </n-upload>
                  <n-button v-if="editing.logo_path" size="small" quaternary @click="editing.logo_path = null">הסר</n-button>
                </div>
              </n-form-item>

              <n-form-item label="תמונת פוסטר">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap: wrap">
                  <img
                    v-if="editing.poster_url"
                    :src="editing.poster_url"
                    style="max-height:80px; border-radius:6px"
                  />
                  <n-upload
                    :show-file-list="false"
                    :custom-request="uploadPoster as any"
                    accept="image/*"
                  >
                    <n-button size="small">העלה פוסטר</n-button>
                  </n-upload>
                  <n-button v-if="editing.poster_url" size="small" quaternary @click="editing.poster_url = null">הסר</n-button>
                </div>
              </n-form-item>

              <n-form-item label="מסמך לדוגמה (לקישור ההורדה)">
                <div style="display:flex; gap:12px; align-items:center; flex-wrap: wrap">
                  <a
                    v-if="editing.example_document_url"
                    :href="editing.example_document_url"
                    target="_blank"
                    style="font-size:13px"
                  >📄 מסמך לדוגמה הועלה ✓</a>
                  <n-upload
                    :show-file-list="false"
                    :custom-request="uploadExampleDoc as any"
                    accept="image/*,application/pdf,.doc,.docx"
                  >
                    <n-button size="small">העלה מסמך</n-button>
                  </n-upload>
                  <n-button v-if="editing.example_document_url" size="small" quaternary @click="editing.example_document_url = null">הסר</n-button>
                </div>
              </n-form-item>

              <n-form-item label="גוף ה-HTML">
                <div class="html-body-editor">
                  <div class="html-body-editor__toolbar">
                    <n-button
                      class="detect-vars-btn"
                      size="tiny"
                      type="info"
                      secondary
                      attr-type="button"
                      :loading="detectingVars"
                      @click="detectVars"
                    >
                      זהה משתנים
                    </n-button>
                    <n-button size="tiny" @click="insertItemsTable">הוסף טבלת פריטים</n-button>
                    <n-button size="tiny" @click="insertSampleHtml" v-if="!editing.html">טען תבנית ברירת מחדל</n-button>
                    <n-button size="tiny" quaternary @click="resetToDefault" :loading="resettingDefault">אפס לברירת מחדל</n-button>
                    <span
                      v-for="v in detectedVars"
                      :key="v"
                      class="var-chip var-chip--detected var-chip--readonly"
                      title="נמצא בתבנית"
                      v-text="formatVarToken(v)"
                    />
                  </div>
                  <div class="html-editor">
                    <pre
                      ref="htmlHighlightRef"
                      class="html-editor__highlight"
                      aria-hidden="true"
                      v-html="highlightedHtml"
                    />
                    <textarea
                      ref="htmlTextareaRef"
                      class="html-editor__input"
                      :value="editing.html"
                      placeholder="<div>תזכורת: {{title}}</div>"
                      spellcheck="false"
                      @input="onHtmlInput"
                      @scroll="syncHtmlScroll"
                    />
                  </div>
                </div>
              </n-form-item>

              <n-alert type="info" :show-icon="false" class="vars-help">
                <b>משתנים זמינים:</b>
                <div class="vars-help__chips">
                  <button
                    v-for="v in availableVars"
                    :key="v"
                    type="button"
                    class="var-chip"
                    :title="'הכנס ' + formatVarToken(v)"
                    v-text="formatVarToken(v)"
                    @click="insertVar(v)"
                  />
                </div>
                <p class="vars-help__note">
                  וכל שדה מתבנית המסמך לפי ה-<code>key</code> שלו.
                  <code v-pre>{{items_table}}</code> — טבלת תסקירים כשנשלחות כמה תזכורות לאותו לקוח באותו יום.
                  בלוקים מותנים: <code v-pre>{{#if var}}...{{/if}}</code>
                  · ערכי ברירת מחדל: <code v-pre>{{name|ברירת מחדל}}</code>
                </p>
              </n-alert>

              <n-form-item style="margin-top:12px">
                <n-checkbox v-model:checked="editing.is_default as any">תבנית ברירת מחדל</n-checkbox>
              </n-form-item>
            </n-form>
          </n-tab-pane>
        </n-tabs>

        <template #footer>
          <n-space justify="space-between" style="width:100%">
            <n-space>
              <n-button @click="showEdit = false">ביטול</n-button>
              <n-button v-if="editing?.id" type="error" @click="deleteTpl">מחק</n-button>
            </n-space>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  NText,
  NUpload,
  useMessage,
} from "naive-ui";
import {api} from "../services/apiService.js";
import type {DocTemplate, EmailTemplate} from "@shared/types.js";
import {useAuthStore} from "../stores/auth.js";
import {useConfirm} from "../composables/useConfirm.js";
import {categoryLabel} from "../utils/reminderCategoryLabels.js";

const templates = ref<EmailTemplate[]>([]);
const docTemplates = ref<DocTemplate[]>([]);
const reminderCategories = ref<{ name: string; count: number }[]>([]);
const userDefaultTemplateId = ref<string | null>(null);
const showEdit = ref(false);
const editing = ref<EmailTemplate | null>(null);
const saving = ref(false);
const previewing = ref(false);
const detectingVars = ref(false);
const resettingDefault = ref(false);
const previewHtml = ref("");
const previewSubject = ref("");
const detectedVars = ref<string[]>([]);
const activeTab = ref("editor");
const htmlTextareaRef = ref<HTMLTextAreaElement | null>(null);
const htmlHighlightRef = ref<HTMLPreElement | null>(null);
const message = useMessage();
const {confirm: confirmDialog} = useConfirm();
const authStore = useAuthStore();
const isMobile = ref(false);
const templateGridCols = computed(() => isMobile.value ? 1 : 3);
const drawerWidth = computed(() => isMobile.value ? "100vw" : 960);

const availableVars = [
  "title",
  "trigger_date",
  "expiry_date",
  "client_company",
  "contact_person",
  "contact_phone",
  "document_number",
  "inspector_number",
  "license_number",
  "logo_url",
  "poster_url",
  "document_url",
  "items_table",
] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const highlightedHtml = computed(() => {
  const raw = editing.value?.html ?? "";
  const escaped = escapeHtml(raw);
  // Color {{vars}}, {{#if}}, {{/if}}, and {{name|default}}
  return escaped.replace(
    /(\{\{(?:#[\w.-]+|\w[\w.-]*(?:\|[^}]*)?|\/\w+)\}\})/g,
    '<mark class="tpl-var">$1</mark>',
  ) + "\n";
});

function onHtmlInput(event: Event) {
  if (!editing.value) return;
  editing.value.html = (event.target as HTMLTextAreaElement).value;
}

function syncHtmlScroll() {
  const ta = htmlTextareaRef.value;
  const pre = htmlHighlightRef.value;
  if (!ta || !pre) return;
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

function updateViewport() {
  isMobile.value = window.innerWidth <= 720;
}

const docTplOptions = computed(() =>
  docTemplates.value.map((t) => ({ label: t.name, value: t.id }))
);

function docTplName(id: string | null): string {
  if (!id) return "";
  return docTemplates.value.find((t) => t.id === id)?.name ?? "";
}

const categoryOptions = computed(() =>
  reminderCategories.value.map((c) => ({ label: categoryLabel(c.name), value: c.name }))
);

const showSendTest = ref(false);
const sendTestEmail = ref("");
const sendingTest = ref(false);
const sendTestTemplateId = ref<string | null>(null);
const sendTestReminderId = ref<string | null>(null);
const sendTestNoCC = ref(false);
const loadingReminders = ref(false);
const reminderOptions = ref<{ label: string; value: string }[]>([]);

async function openSendTest(t: EmailTemplate) {
  sendTestTemplateId.value = t.id;
  sendTestEmail.value = authStore.user?.email ?? "";
  sendTestReminderId.value = null;
  sendTestNoCC.value = false;
  showSendTest.value = true;
  loadingReminders.value = true;
  try {
    const result = await api.reminders.list({ limit: 200 });
    reminderOptions.value = (result.rows ?? []).map((r: any) => ({
      label: `${r.title}${r.client_name ? ` — ${r.client_name}` : ""}`,
      value: String(r.id),
    }));
  } catch {
    reminderOptions.value = [];
  } finally {
    loadingReminders.value = false;
  }
}

async function sendTest() {
  if (!sendTestEmail.value.trim() || !sendTestTemplateId.value) return;
  sendingTest.value = true;
  try {
    const body: Record<string, string | boolean> = { to: sendTestEmail.value.trim() };
    if (sendTestReminderId.value) body.reminder_id = sendTestReminderId.value;
    if (sendTestNoCC.value) body.no_cc = true;
    const data = await api.emailTemplates.sendTest(sendTestTemplateId.value!, body);
    if (data.success) {
      message.success("אימייל נשלח בהצלחה");
      showSendTest.value = false;
    } else {
      message.error(data.error ?? "שגיאה בשליחה");
    }
  } catch (e) {
    message.error(String(e));
  } finally {
    sendingTest.value = false;
  }
}

async function setMyDefault(templateId: string) {
  await api.userSettings.save({ default_email_template_id: templateId } as any);
  userDefaultTemplateId.value = templateId;
  message.success("ברירת המחדל עודכנה");
}

async function load() {
  const [tplResult, docResult, settingsResult, categoriesResult] = await Promise.allSettled([
    api.emailTemplates.list(),
    api.docTemplates.list(),
    api.userSettings.get(),
    api.reminders.categories(),
  ]);
  if (tplResult.status === "fulfilled") templates.value = tplResult.value;
  if (docResult.status === "fulfilled") docTemplates.value = docResult.value;
  if (settingsResult.status === "fulfilled") userDefaultTemplateId.value = (settingsResult.value as any)?.default_email_template_id ?? null;
  if (categoriesResult.status === "fulfilled") reminderCategories.value = categoriesResult.value.categories;
}
onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewport);
});

function select(t: EmailTemplate) {
  editing.value = JSON.parse(JSON.stringify(t));
  detectedVars.value = [];
  previewHtml.value = "";
  previewSubject.value = "";
  activeTab.value = "preview";
  showEdit.value = true;
  refreshPreview();
}

function newTemplate() {
  editing.value = {
    id: "",
    name: "תבנית חדשה",
    doc_template_id: null,
    reminder_category: null,
    subject: "[תזכורת] {{title}}",
    html: "",
    logo_path: null,
    poster_url: null,
    example_document_url: null,
    is_default: 0,
    created_at: "",
    updated_at: "",
  };
  detectedVars.value = [];
  previewHtml.value = "";
  previewSubject.value = "";
  activeTab.value = "preview";
  showEdit.value = true;
  refreshPreview();
}

async function insertSampleHtml() {
  if (!editing.value) return;
  try {
    const name = builtinTemplateName();
    const r = await api.emailTemplates.getDefault(name);
    editing.value.html = r.html;
  } catch {
    message.error("לא ניתן לטעון את תבנית ברירת המחדל");
  }
}

async function uploadLogo({ file, onFinish, onError }: any) {
  try {
    const result = await api.assets.uploadLogo(file.file as File);
    if (editing.value) editing.value.logo_path = result.logo_path;
    onFinish();
  } catch (e) {
    message.error("העלאת הלוגו נכשלה");
    onError();
  }
}

async function uploadPoster({ file, onFinish, onError }: any) {
  try {
    const result = await api.emailTemplates.uploadAsset("poster", file.file as File);
    if (editing.value) editing.value.poster_url = result.url;
    onFinish();
  } catch (e) {
    message.error("העלאת הפוסטר נכשלה");
    onError();
  }
}

async function uploadExampleDoc({ file, onFinish, onError }: any) {
  try {
    const result = await api.emailTemplates.uploadAsset("doc", file.file as File);
    if (editing.value) editing.value.example_document_url = result.url;
    onFinish();
  } catch (e) {
    message.error("העלאת המסמך נכשלה");
    onError();
  }
}

function formatVarToken(varName: string): string {
  return `{{${varName}}}`;
}

function insertAtCursor(snippet: string) {
  if (!editing.value) return;
  const textarea = htmlTextareaRef.value;
  if (textarea) {
    const start = textarea.selectionStart ?? editing.value.html.length;
    const end = textarea.selectionEnd ?? start;
    editing.value.html = editing.value.html.slice(0, start) + snippet + editing.value.html.slice(end);
    requestAnimationFrame(() => {
      const pos = start + snippet.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      syncHtmlScroll();
    });
  } else {
    editing.value.html += snippet;
  }
}

function insertVar(varName: string) {
  insertAtCursor(formatVarToken(varName));
}

function insertItemsTable() {
  insertAtCursor(`{{#if items_table}}\n    {{items_table}}\n    {{/if}}\n`);
}

// Map the bound doc-template name → built-in reminder HTML file name
function builtinTemplateName(): "default" | "inspection" | "contract" | "invoice" {
  if (!editing.value?.doc_template_id) return "default";
  const docName = docTemplates.value.find((t) => t.id === editing.value!.doc_template_id)?.name ?? "";
  if (docName.includes("תסקיר")) return "inspection";
  if (docName.includes("חוזה")) return "contract";
  if (docName.includes("חשבונית")) return "invoice";
  return "default";
}

async function resetToDefault() {
  if (!editing.value) return;
  if (!confirm("לאפס את גוף ה-HTML לתבנית ברירת המחדל המובנית?")) return;
  resettingDefault.value = true;
  try {
    const name = builtinTemplateName();
    const r = await api.emailTemplates.getDefault(name);
    editing.value.html = r.html;
    message.success("הוחזר לברירת המחדל");
  } catch (e) {
    message.error(String(e));
  } finally {
    resettingDefault.value = false;
  }
}

async function detectVars() {
  if (!editing.value?.html) return;
  detectingVars.value = true;
  try {
    const r = await api.emailTemplates.detectVars(editing.value.html);
    detectedVars.value = r.vars;
    if (r.vars.length === 0) message.info("לא נמצאו משתנים בתבנית");
  } catch (e) {
    message.error(String(e));
  } finally {
    detectingVars.value = false;
  }
}

async function onTabChange(tab: string) {
  if (tab === "preview") {
    await refreshPreview();
  }
}

async function refreshPreview() {
  if (!editing.value) return;
  previewing.value = true;
  try {
    const sampleVars: Record<string, unknown> = {
      title: "בדיקה הבאה",
      trigger_date: "09/02/2027",
      expiry_date: "11/03/2027",
      advance_days: 30,
      client_company: 'אלפא לוגיסטיקה והפצה בע"מ',
      contact_person: "ישראל ישראלי",
      contact_phone: "050-1234567",
      contact_email: "demo@example.com",
      document_number: "12345",
      inspector_number: "484590",
      license_number: "233017",
      document_type: "תסקיר בדיקה",
      from_name: " RemindOCR ",
      body: "טקסט גוף לדוגמה",
      logo_url: editing.value.logo_path ? api.assets.url(editing.value.logo_path) : null,
      poster_url: editing.value.poster_url ?? null,
      document_url: editing.value.example_document_url ?? null,
    };
    const r = await api.emailTemplates.preview(editing.value.html, editing.value.subject, sampleVars);
    previewHtml.value = r.html;
    previewSubject.value = r.subject;
  } catch (e) {
    message.error(String(e));
  } finally {
    previewing.value = false;
  }
}

async function save() {
  if (!editing.value) return;
  if (!editing.value.name?.trim()) {
    message.warning("חובה להזין שם לתבנית");
    return;
  }
  saving.value = true;
  try {
    if (editing.value.id) {
      await api.emailTemplates.update(editing.value.id, editing.value);
      message.success("התבנית נשמרה");
    } else {
      await api.emailTemplates.create(editing.value);
      message.success("התבנית נוצרה");
    }
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function deleteTpl() {
  if (!editing.value?.id) return;
  const name = editing.value.name;
  const id = editing.value.id;
  confirmDialog({
    title: "מחיקת תבנית",
    content: `למחוק את "${name}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await api.emailTemplates.delete(id);
        message.success("התבנית נמחקה");
        showEdit.value = false;
        await load();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}
</script>

<style scoped>
.html-body-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.html-body-editor__toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.detect-vars-btn {
  font-weight: 700;
}

.var-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 9px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  color: var(--brand-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
.var-chip:hover {
  background: color-mix(in srgb, var(--brand-color) 22%, var(--bg-card));
  border-color: var(--brand-color);
  transform: translateY(-1px);
}
.var-chip--detected {
  background: color-mix(in srgb, #2080f0 14%, var(--bg-card));
  border-color: color-mix(in srgb, #2080f0 45%, var(--border-color));
  color: #2080f0;
}
.var-chip--detected:hover {
  background: color-mix(in srgb, #2080f0 24%, var(--bg-card));
  border-color: #2080f0;
}
.var-chip--readonly {
  cursor: default;
  transform: none;
}
.var-chip--readonly:hover {
  transform: none;
}

.html-editor {
  position: relative;
  width: 100%;
  min-height: 360px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}

.html-editor__highlight,
.html-editor__input {
  margin: 0;
  padding: 12px;
  width: 100%;
  min-height: 360px;
  height: 360px;
  box-sizing: border-box;
  border: 0;
  outline: none;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  direction: ltr;
  text-align: left;
  tab-size: 2;
}

.html-editor__highlight {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: none;
  color: var(--text-primary);
  background: transparent;
}

.html-editor__input {
  position: relative;
  z-index: 1;
  color: transparent;
  caret-color: var(--text-primary);
  background: transparent;
}

.html-editor__input::placeholder {
  color: var(--text-muted, var(--text-secondary));
}

.html-editor__highlight :deep(.tpl-var) {
  color: #0c7a43;
  background: color-mix(in srgb, var(--brand-color) 18%, transparent);
  border-radius: 4px;
  padding: 0 2px;
  font-weight: 700;
}

html[data-theme="dark"] .html-editor__highlight :deep(.tpl-var),
:global(html[data-theme="dark"]) .html-editor__highlight :deep(.tpl-var) {
  color: #63e2b7;
  background: color-mix(in srgb, #63e2b7 18%, transparent);
}

.vars-help {
  font-size: 12px;
}
.vars-help__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.vars-help__note {
  margin: 12px 0 0;
  color: var(--text-secondary);
  line-height: 1.55;
}
.vars-help__note code {
  color: var(--brand-color);
  font-weight: 700;
}

@media (max-width: 720px) {
  :deep(.n-space) {
    width: 100%;
  }

  :deep(.n-space .n-button) {
    justify-content: center;
  }

  :deep(.n-drawer-body-content-wrapper) {
    padding: 14px;
  }

  :deep(.n-drawer-header__main) {
    font-size: 16px;
  }

  iframe {
    height: 520px !important;
    min-height: 520px;
  }

  :deep(.n-tabs-nav-scroll-content) {
    width: 100%;
  }

  :deep(.n-drawer .n-card__footer),
  :deep(.n-drawer-footer .n-space) {
    align-items: stretch;
  }

  :deep(.n-drawer-footer .n-space) {
    flex-direction: column-reverse;
  }

  :deep(.n-drawer-footer .n-button) {
    width: 100%;
  }

  .html-editor__highlight,
  .html-editor__input {
    min-height: 280px;
    height: 280px;
  }
}

@media (max-width: 420px) {
  iframe {
    height: 440px !important;
    min-height: 440px;
  }
}
</style>
