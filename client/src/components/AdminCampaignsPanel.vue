<template>
  <section class="campaigns-panel" aria-label="Email campaigns">
    <!-- 1. Leads -->
    <div class="monitor-block">
      <div class="block-head">
        <div class="monitor-block__title">1. Import leads <span class="title-note">(optional)</span></div>
        <div class="title-note">Skip this if the leads are already in the database — choose them in step 3. Use it to add new addresses or update existing leads from a CSV/Excel file (columns email / name / company / phone / city, English or Hebrew; a plain list of emails also works).</div>
      </div>
      <div class="block-toolbar">
        <input ref="leadFileInput" type="file" accept=".csv,.txt,.xlsx,.xls" hidden @change="onLeadFile" />
        <n-radio-group v-model:value="importMode" size="small">
          <n-radio-button value="fill">Fill empty fields only</n-radio-button>
          <n-radio-button value="overwrite">Overwrite with file values</n-radio-button>
        </n-radio-group>
        <n-button size="small" :loading="importing" @click="leadFileInput?.click()">
          <template #icon><n-icon :component="CloudUploadOutline" /></template>
          Upload leads file
        </n-button>
      </div>
      <n-alert v-if="lastImport" type="success" style="margin-top:10px">
        {{ lastImport.file }}: {{ lastImport.valid }} valid emails ·
        {{ lastImport.inserted }} new leads · {{ lastImport.updated }} existing leads {{ lastImport.mode === "overwrite" ? "updated" : "had empty fields filled" }} ·
        {{ lastImport.invalid }} rows without a valid email<span v-if="lastImport.duplicatesInFile"> · {{ lastImport.duplicatesInFile }} duplicates in file</span>
      </n-alert>
    </div>

    <!-- 2. Email -->
    <div class="monitor-block">
      <div class="block-head">
        <div class="monitor-block__title">2. Email</div>
        <div class="title-note">The advertising mark <bdi dir="rtl">פרסומת:</bdi> is added to the subject and an opt-out line to the footer automatically when missing.</div>
      </div>
      <div class="block-toolbar">
        <n-select
          v-model:value="selectedId"
          size="small"
          placeholder="Choose a campaign"
          :options="campaignOptions"
          style="width: 320px"
          @update:value="selectCampaign"
        />
        <n-input v-model:value="newName" size="small" placeholder="New campaign name" style="width: 220px" @keyup.enter="createCampaign" />
        <n-button size="small" :disabled="!newName.trim()" :loading="creating" @click="createCampaign">
          <template #icon><n-icon :component="AddOutline" /></template>
          New
        </n-button>
      </div>

      <n-alert v-if="!draft && selectedLeadIds?.length" type="info" style="margin-top:10px">
        {{ selectedLeadIds.length }} leads selected. Choose a campaign or create a new one to send to them.
      </n-alert>
      <div v-if="draft" class="editor-grid">
        <div class="editor-col">
          <n-form-item label="Subject" :show-feedback="false">
            <n-input v-model:value="draft.subject" dir="auto" :disabled="locked" placeholder="ניהול מסמכים, תפוגות ותזכורות — RemindOCR" />
          </n-form-item>
          <div class="html-toolbar">
            <span class="field-label">HTML</span>
            <input ref="htmlFileInput" type="file" accept=".html,.htm" hidden @change="onHtmlFile" />
            <input ref="imageFileInput" type="file" accept="image/*" hidden @change="onImageFile" />
            <n-button size="tiny" :disabled="locked" @click="htmlFileInput?.click()">
              <template #icon><n-icon :component="DocumentTextOutline" /></template>
              Load .html
            </n-button>
            <n-tooltip>
              <template #trigger>
                <n-button size="tiny" :disabled="locked" :loading="uploadingImage" @click="imageFileInput?.click()">
                  <template #icon><n-icon :component="ImageOutline" /></template>
                  Insert image
                </n-button>
              </template>
              Uploads to public storage and inserts a 500px image at the cursor
            </n-tooltip>
          </div>
          <n-input
            ref="htmlInput"
            v-model:value="draft.html"
            type="textarea"
            class="html-input"
            :disabled="locked"
            :autosize="{ minRows: 18, maxRows: 30 }"
            placeholder="<html dir=&quot;rtl&quot;>…</html>"
          />
          <div class="block-toolbar" style="margin-top:10px">
            <n-button size="small" type="primary" :disabled="locked || !dirty" :loading="saving" @click="saveDraft">
              <template #icon><n-icon :component="SaveOutline" /></template>
              Save
            </n-button>
            <span v-if="dirty" class="title-note">Unsaved changes</span>
          </div>
        </div>
        <div class="editor-col">
          <div class="field-label">Preview</div>
          <div class="preview-subject" dir="rtl">{{ rendered.subject || "—" }}</div>
          <iframe class="preview-frame" :srcdoc="rendered.html" sandbox="" title="Email preview" />
        </div>
      </div>
    </div>

    <!-- 3. Recipients & send -->
    <div v-if="draft" class="monitor-block">
      <div class="block-head">
        <div class="monitor-block__title">3. Recipients &amp; send</div>
        <div class="title-note">Unsubscribed leads and anyone this campaign already reached are always skipped.</div>
      </div>
      <n-radio-group v-model:value="audienceType" :disabled="sending" style="margin-top:6px">
        <n-space vertical>
          <n-radio value="leads" :disabled="!selectedLeadIds?.length">Leads selected in the Leads tab ({{ selectedLeadIds?.length ?? 0 }})</n-radio>
          <n-radio value="import" :disabled="!lastImport">Leads from the file uploaded above<span v-if="lastImport"> ({{ lastImport.file }})</span></n-radio>
          <n-radio value="filter">Leads matching a filter (starts from the Leads tab filter)</n-radio>
          <n-radio value="all">All leads with an email</n-radio>
        </n-space>
      </n-radio-group>
      <div v-if="audienceType === 'filter'" class="block-toolbar" style="margin-top:8px">
        <n-select v-model:value="filterSource" clearable size="small" placeholder="Source" :options="sourceOptions" style="width: 240px" />
        <n-input v-model:value="filterQ" clearable size="small" placeholder="Search name, email…" style="width: 220px" />
      </div>
      <div v-if="audienceType !== 'leads'" class="block-toolbar" style="margin-top:8px">
        <n-select
          v-model:value="filterStatuses"
          multiple
          clearable
          size="small"
          placeholder="Any status"
          :options="statusOptions"
          :max-tag-count="3"
          style="width: 320px"
        />
        <n-switch v-model:value="neverEmailed" size="small" />
        <span class="title-note">Only leads never emailed by any campaign</span>
      </div>
      <div class="block-toolbar" style="margin-top:12px">
        <n-button size="small" :loading="counting" @click="countAudience">
          <template #icon><n-icon :component="PeopleOutline" /></template>
          Count recipients
        </n-button>
        <n-input v-model:value="testTo" size="small" placeholder="Test address (default: you)" style="width: 230px" />
        <n-button size="small" :disabled="dirty || !canSend" :loading="testing" @click="sendTest">
          <template #icon><n-icon :component="FlaskOutline" /></template>
          Send test
        </n-button>
        <n-button
          size="small"
          type="warning"
          :disabled="dirty || !canSend || !preview || !preview.count || sending"
          @click="confirmOpen = true"
        >
          <template #icon><n-icon :component="SendOutline" /></template>
          Send to {{ preview?.count ?? "…" }}
        </n-button>
      </div>
      <p v-if="dirty" class="title-note">Save the email before testing or sending.</p>
      <n-alert v-if="preview" type="info" style="margin-top:10px">
        {{ preview.count }} will receive it · skipped: {{ preview.unsubscribed }} unsubscribed, {{ preview.alreadySent }} already sent,
        {{ preview.invalid }} invalid address
        <div v-if="preview.sample.length" class="sample">e.g. {{ preview.sample.join(", ") }}</div>
      </n-alert>

      <div v-if="draft.status !== 'draft'" class="progress-row">
        <n-progress
          type="line"
          :percentage="progressPercent"
          :status="draft.status === 'failed' ? 'error' : draft.status === 'sent' ? 'success' : 'default'"
          :show-indicator="false"
          style="flex:1"
        />
        <span class="progress-text">{{ statusText }}</span>
        <n-button v-if="draft.status === 'sending'" size="tiny" @click="pause">Pause</n-button>
        <n-button v-if="draft.status === 'paused' || draft.status === 'failed'" size="tiny" type="primary" @click="resume">Resume</n-button>
      </div>
      <n-alert v-if="draft.error" type="error" style="margin-top:10px">{{ draft.error }}</n-alert>
    </div>

    <n-modal v-model:show="confirmOpen" preset="card" title="Send campaign" style="max-width: 460px">
      <p>This sends <strong>{{ draft?.name }}</strong> to <strong>{{ preview?.count }}</strong> people. It cannot be undone.</p>
      <p>Type <strong>{{ preview?.count }}</strong> to confirm:</p>
      <n-input v-model:value="confirmText" placeholder="Number of recipients" @keyup.enter="send" />
      <template #footer>
        <div class="block-toolbar" style="justify-content:flex-end">
          <n-button size="small" @click="confirmOpen = false">Cancel</n-button>
          <n-button size="small" type="warning" :disabled="confirmText.trim() !== String(preview?.count)" :loading="startingSend" @click="send">Send now</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {
  NAlert, NButton, NFormItem, NIcon, NInput, NModal, NProgress, NRadio, NRadioButton, NRadioGroup, NSelect, NSpace, NSwitch, NTooltip, useMessage,
} from "naive-ui";
import {
  AddOutline, CloudUploadOutline, DocumentTextOutline, FlaskOutline, ImageOutline, PeopleOutline, SaveOutline, SendOutline,
} from "@vicons/ionicons5";
import {
  api,
  type CampaignAudiencePreview,
  type CampaignLeadImportResult,
  type EmailCampaign,
  type EmailCampaignAudience,
} from "../services/apiService";

const props = defineProps<{
  /** The Inspector Leads table filter, used as the starting recipient filter. */
  leadFilter?: {source?: string | null; status?: string | null; q?: string | null};
  /** Lead ids ticked in the Leads tab table. */
  selectedLeadIds?: string[];
}>();
const emit = defineEmits<{ "leads-imported": [] }>();

const message = useMessage();

const leadFileInput = ref<HTMLInputElement | null>(null);
const htmlFileInput = ref<HTMLInputElement | null>(null);
const imageFileInput = ref<HTMLInputElement | null>(null);
const htmlInput = ref<InstanceType<typeof NInput> | null>(null);

const importing = ref(false);
const lastImport = ref<CampaignLeadImportResult | null>(null);
const importMode = ref<"fill" | "overwrite">("fill");

const campaigns = ref<EmailCampaign[]>([]);
const selectedId = ref<string | null>(null);
const draft = ref<EmailCampaign | null>(null);
const saved = ref({subject: "", html: ""});
const newName = ref("");
const creating = ref(false);
const saving = ref(false);
const uploadingImage = ref(false);
const rendered = ref({subject: "", html: ""});

const audienceType = ref<"leads" | "import" | "filter" | "all">(props.selectedLeadIds?.length ? "leads" : "filter");
const filterSource = ref<string | null>(props.leadFilter?.source ?? null);
const filterStatuses = ref<string[]>(props.leadFilter?.status ? [props.leadFilter.status] : []);
const neverEmailed = ref(false);
const filterQ = ref(props.leadFilter?.q ?? "");
const sourceOptions = ref<{label: string; value: string}[]>([]);
const statusOptions = [
  {label: "New", value: "NEW"},
  {label: "Contacted", value: "CONTACTED"},
  {label: "Demo", value: "DEMO"},
  {label: "Trial", value: "TRIAL"},
  {label: "Customer", value: "CUSTOMER"},
  {label: "Not relevant", value: "NOT_RELEVANT"},
];

const preview = ref<CampaignAudiencePreview | null>(null);
const counting = ref(false);
const testTo = ref("");
const testing = ref(false);
const confirmOpen = ref(false);
const confirmText = ref("");
const startingSend = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;

const campaignOptions = computed(() => campaigns.value.map((c) => ({
  label: `${c.name} · ${c.status}${c.counts.total ? ` (${c.counts.sent}/${c.counts.total})` : ""}`,
  value: c.id,
})));
const sending = computed(() => draft.value?.status === "sending");
const locked = computed(() => sending.value);
const dirty = computed(() => !!draft.value && (draft.value.subject !== saved.value.subject || draft.value.html !== saved.value.html));
const canSend = computed(() => !!draft.value?.subject.trim() && !!draft.value?.html.trim());
const progressPercent = computed(() => {
  const counts = draft.value?.counts;
  return counts?.total ? Math.round(((counts.sent + counts.failed) / counts.total) * 100) : 0;
});
const statusText = computed(() => {
  const d = draft.value;
  if (!d) return "";
  const label = {sending: "Sending", sent: "Sent", paused: "Paused", failed: "Stopped", draft: "Draft"}[d.status];
  return `${label} · ${d.counts.sent} of ${d.counts.total} sent${d.counts.failed ? ` · ${d.counts.failed} failed` : ""}`;
});

function audience(): EmailCampaignAudience {
  if (audienceType.value === "leads" && props.selectedLeadIds?.length) return {type: "leads", ids: [...props.selectedLeadIds]};
  const refine = {statuses: [...filterStatuses.value], neverEmailed: neverEmailed.value};
  if (audienceType.value === "import" && lastImport.value) return {...refine, type: "import", batchId: lastImport.value.batchId};
  if (audienceType.value === "filter") return {...refine, type: "filter", source: filterSource.value, q: filterQ.value.trim() || null};
  return {...refine, type: "all"};
}

watch([audienceType, filterSource, filterStatuses, neverEmailed, filterQ], () => { preview.value = null; }, {deep: true});

// Ticking leads in the table makes them the recipients; clearing the selection falls back to the filter.
watch(() => props.selectedLeadIds?.length ?? 0, (count) => {
  if (count) audienceType.value = "leads";
  else if (audienceType.value === "leads") audienceType.value = "filter";
  preview.value = null;
});

// Follow the leads table filter when it changes, so "matching a filter" means what the table shows.
watch(() => props.leadFilter, (filter) => {
  filterSource.value = filter?.source ?? null;
  filterStatuses.value = filter?.status ? [filter.status] : [];
  filterQ.value = filter?.q ?? "";
}, {deep: true});

async function readFileText(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

async function onLeadFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importing.value = true;
  try {
    lastImport.value = await api.admin.importCampaignLeads(file, importMode.value);
    audienceType.value = "import";
    await loadSources();
    emit("leads-imported");
    message.success(`Imported ${lastImport.value.valid} leads`);
  } catch (err: any) {
    message.error(err?.message ?? "Import failed");
  } finally {
    importing.value = false;
  }
}

async function onHtmlFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !draft.value) return;
  draft.value.html = await readFileText(file);
}

async function onImageFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !draft.value) return;
  uploadingImage.value = true;
  try {
    const {url} = await api.admin.uploadCampaignImage(file);
    const tag = `<p style="margin:0 0 28px;"><img src="${url}" width="500" alt="" style="display:block;width:100%;max-width:500px;height:auto;border:1px solid #dddddd;border-radius:6px;margin:0 auto;"></p>\n`;
    const textarea = (htmlInput.value as any)?.textareaElRef as HTMLTextAreaElement | undefined;
    const html = draft.value.html;
    const at = textarea && document.activeElement !== null ? textarea.selectionStart ?? html.length : html.length;
    draft.value.html = html.slice(0, at) + tag + html.slice(at);
    message.success("Image inserted");
  } catch (err: any) {
    message.error(err?.message ?? "Image upload failed");
  } finally {
    uploadingImage.value = false;
  }
}

async function loadCampaigns() {
  campaigns.value = (await api.admin.listCampaigns()).rows;
}

async function loadSources() {
  const res = await api.admin.listInspectorLeads({page: 1, limit: 1});
  sourceOptions.value = res.summary.bySource.map((row) => ({label: `${row.source} (${row.count})`, value: row.source}));
}

function setDraft(campaign: EmailCampaign) {
  draft.value = {...campaign};
  saved.value = {subject: campaign.subject, html: campaign.html};
  selectedId.value = campaign.id;
  preview.value = null;
  scheduleRender();
  syncPolling();
}

async function selectCampaign(id: string) {
  const found = campaigns.value.find((c) => c.id === id);
  if (found) setDraft(await api.admin.getCampaign(found.id));
}

async function createCampaign() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const campaign = await api.admin.createCampaign({name: newName.value.trim()});
    newName.value = "";
    await loadCampaigns();
    setDraft(campaign);
  } catch (err: any) {
    message.error(err?.message ?? "Could not create campaign");
  } finally {
    creating.value = false;
  }
}

async function saveDraft() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const updated = await api.admin.updateCampaign(draft.value.id, {subject: draft.value.subject, html: draft.value.html});
    saved.value = {subject: updated.subject, html: updated.html};
    await loadCampaigns();
    message.success("Saved");
  } catch (err: any) {
    message.error(err?.message ?? "Save failed");
  } finally {
    saving.value = false;
  }
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    if (!draft.value) return;
    try {
      rendered.value = await api.admin.renderCampaign(draft.value.subject, draft.value.html);
    } catch { /* keep last preview */ }
  }, 400);
}

watch(() => [draft.value?.subject, draft.value?.html], scheduleRender);

async function countAudience() {
  if (!draft.value) return;
  counting.value = true;
  try {
    preview.value = await api.admin.previewCampaignAudience(draft.value.id, audience());
  } catch (err: any) {
    message.error(err?.message ?? "Could not count recipients");
  } finally {
    counting.value = false;
  }
}

async function sendTest() {
  if (!draft.value) return;
  testing.value = true;
  try {
    const res = await api.admin.sendCampaignTest(draft.value.id, testTo.value.trim() || undefined);
    message.success(`Test sent to ${res.to}`);
  } catch (err: any) {
    message.error(err?.message ?? "Test failed");
  } finally {
    testing.value = false;
  }
}

async function send() {
  if (!draft.value || !preview.value || confirmText.value.trim() !== String(preview.value.count)) return;
  startingSend.value = true;
  try {
    await api.admin.sendCampaign(draft.value.id, audience(), preview.value.count);
    confirmOpen.value = false;
    confirmText.value = "";
    await refreshDraft();
    message.success("Sending started");
  } catch (err: any) {
    const text = String(err?.message ?? "");
    message.error(text.includes("audience_changed") ? "The recipient list changed — count again before sending" : text || "Send failed");
    if (text.includes("audience_changed")) await countAudience();
  } finally {
    startingSend.value = false;
  }
}

async function refreshDraft() {
  if (!draft.value) return;
  const fresh = await api.admin.getCampaign(draft.value.id);
  draft.value = {...fresh, subject: draft.value.subject, html: draft.value.html};
  syncPolling();
  if (fresh.status !== "sending") await loadCampaigns();
}

async function pause() {
  if (!draft.value) return;
  await api.admin.pauseCampaign(draft.value.id);
  await refreshDraft();
}

async function resume() {
  if (!draft.value) return;
  await api.admin.resumeCampaign(draft.value.id);
  await refreshDraft();
}

function syncPolling() {
  const shouldPoll = draft.value?.status === "sending";
  if (shouldPoll && !pollTimer) pollTimer = setInterval(() => { void refreshDraft(); }, 2000);
  if (!shouldPoll && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

onMounted(async () => {
  try {
    await Promise.all([loadCampaigns(), loadSources()]);
  } catch (err: any) {
    message.error(err?.message ?? "Failed to load campaigns");
  }
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (renderTimer) clearTimeout(renderTimer);
});
</script>

<style scoped>
.campaigns-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.monitor-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
}

.monitor-block__title {
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.block-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.title-note {
  font-size: 12px;
  color: var(--text-secondary);
}

.block-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .editor-grid { grid-template-columns: minmax(0, 1fr); }
}

.editor-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.html-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.html-toolbar .field-label {
  margin-inline-end: auto;
}

.html-input :deep(textarea) {
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  direction: ltr;
}

.preview-subject {
  font-size: 14px;
  font-weight: 600;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.preview-frame {
  width: 100%;
  min-height: 620px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.sample {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>
