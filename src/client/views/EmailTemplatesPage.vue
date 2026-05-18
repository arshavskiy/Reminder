<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
<!--      <h2 style="margin: 0">תבניות אימייל</h2>-->
      <n-button type="primary" @click="newTemplate">+ תבנית חדשה</n-button>
    </n-space>

    <n-grid v-if="templates.length" :cols="3" :x-gap="16" :y-gap="16">
      <n-gi v-for="t in templates" :key="t.id">
        <n-card hoverable :title="t.name" @click="select(t)" style="cursor: pointer">
          <template #header-extra>
            <n-tag v-if="t.is_default" size="small" type="success">ברירת מחדל</n-tag>
          </template>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0">
            {{ docTplName(t.doc_template_id) || "לכל סוגי המסמכים" }}
          </p>
          <p style="font-size: 12px; color: var(--text-muted); margin: 8px 0 0">{{ t.subject }}</p>
        </n-card>
      </n-gi>
    </n-grid>
    <n-alert v-else type="info" :show-icon="false">
      אין עדיין תבניות אימייל. צור תבנית כדי לעצב את תוכן התזכורות.
    </n-alert>

    <!-- Editor drawer -->
    <n-drawer v-model:show="showEdit" :width="900" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת תבנית אימייל' : 'תבנית אימייל חדשה'" closable>
        <n-tabs v-if="editing" type="line" animated>
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

              <n-form-item label="גוף ה-HTML">
                <n-input
                  v-model:value="editing.html"
                  type="textarea"
                  :rows="18"
                  placeholder="<div>תזכורת: {{title}}</div>"
                  style="font-family: monospace; font-size: 12px"
                />
              </n-form-item>

              <n-alert type="info" :show-icon="false" style="font-size:12px">
                משתנים זמינים:
                <code v-pre>{{title}}</code>,
                <code v-pre>{{trigger_date}}</code>,
                <code v-pre>{{expiry_date}}</code>,
                <code v-pre>{{client_company}}</code>,
                <code v-pre>{{contact_person}}</code>,
                <code v-pre>{{contact_phone}}</code>,
                <code v-pre>{{document_number}}</code>,
                <code v-pre>{{logo_url}}</code>,
                ובנוסף כל שדה שהוגדר בתבנית המסמך לפי ה-<code>key</code> שלו.
                בלוקים מותנים: <code v-pre>{{#if var}}...{{/if}}</code>.
                ערכי ברירת מחדל: <code v-pre>{{name|ברירת מחדל}}</code>.
              </n-alert>

              <n-form-item style="margin-top:12px">
                <n-checkbox v-model:checked="editing.is_default as any">תבנית ברירת מחדל</n-checkbox>
              </n-form-item>
            </n-form>
          </n-tab-pane>

          <n-tab-pane name="preview" tab="תצוגה מקדימה" @click="refreshPreview">
            <n-space justify="space-between" align="center" style="margin-bottom:12px">
              <n-text strong>נושא: {{ previewSubject }}</n-text>
              <n-button size="small" @click="refreshPreview">רענן</n-button>
            </n-space>
            <iframe
              v-if="previewHtml"
              :srcdoc="previewHtml"
              style="width:100%; height:600px; border:1px solid var(--border-color); border-radius:8px"
            />
          </n-tab-pane>
        </n-tabs>

        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button v-if="editing?.id" type="error" @click="deleteTpl">מחק</n-button>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import {
  NSpace, NButton, NCard, NGrid, NGi, NTag, NDrawer, NDrawerContent,
  NForm, NFormItem, NInput, NSelect, NCheckbox, NAlert, NText,
  NTabs, NTabPane, NUpload, useMessage,
} from "naive-ui";
import { api } from "../services/apiService.js";
import type { DocTemplate, EmailTemplate } from "@shared/types.js";

const templates = ref<EmailTemplate[]>([]);
const docTemplates = ref<DocTemplate[]>([]);
const showEdit = ref(false);
const editing = ref<EmailTemplate | null>(null);
const saving = ref(false);
const previewHtml = ref("");
const previewSubject = ref("");
const message = useMessage();

const docTplOptions = computed(() =>
  docTemplates.value.map((t) => ({ label: t.name, value: t.id }))
);

function docTplName(id: number | null): string {
  if (!id) return "";
  return docTemplates.value.find((t) => t.id === id)?.name ?? "";
}

async function load() {
  [templates.value, docTemplates.value] = await Promise.all([
    api.emailTemplates.list(),
    api.docTemplates.list(),
  ]);
}
onMounted(load);

function select(t: EmailTemplate) {
  editing.value = JSON.parse(JSON.stringify(t));
  showEdit.value = true;
}

function newTemplate() {
  editing.value = {
    id: 0,
    name: "תבנית חדשה",
    doc_template_id: null,
    subject: "[תזכורת] {{title}}",
    html:
      '<!DOCTYPE html><html lang="he" dir="rtl"><body style="font-family:Arial">' +
      '<h2>{{title}}</h2><p>{{body}}</p></body></html>',
    logo_path: null,
    is_default: 0,
    created_at: "",
    updated_at: "",
  };
  showEdit.value = true;
}

async function uploadLogo({ file }: { file: { file: File } }) {
  if (!editing.value) return;
  try {
    const { logo_path } = await api.assets.uploadLogo(file.file);
    editing.value.logo_path = logo_path;
    message.success("לוגו הועלה");
  } catch (e) {
    message.error(String(e));
  }
}

async function refreshPreview() {
  if (!editing.value) return;
  const sampleVars = {
    title: "בדיקה הבאה",
    trigger_date: "2027-02-09",
    expiry_date: "2027-03-11",
    advance_days: 30,
    client_company: "אלפא לוגיסטיקה והפצה בע\"מ",
    contact_person: "ישראל ישראלי",
    contact_phone: "050-1234567",
    contact_email: "demo@example.com",
    document_number: "12345",
    document_type: "תסקיר בדיקה",
    from_name: "תזכורת לקוח",
    body: "טקסט גוף לדוגמה",
    logo_url: editing.value.logo_path ? api.assets.url(editing.value.logo_path) : null,
  };
  const r = await api.emailTemplates.preview(editing.value.html, editing.value.subject, sampleVars);
  previewHtml.value = r.html;
  previewSubject.value = r.subject;
}

async function save() {
  if (!editing.value) return;
  saving.value = true;
  try {
    if (editing.value.id) {
      await api.emailTemplates.update(editing.value.id, editing.value);
      message.success("נשמרה");
    } else {
      await api.emailTemplates.create(editing.value);
      message.success("נוצרה");
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
  if (!confirm(`למחוק את "${editing.value.name}"?`)) return;
  try {
    await api.emailTemplates.delete(editing.value.id);
    message.success("נמחקה");
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  }
}
</script>
