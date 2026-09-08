<template>
  <section class="whatsapp-panel" aria-label="WhatsApp campaigns">
    <div class="panel-heading">
      <h3>WhatsApp campaigns</h3>
      <n-button size="small" :loading="busy" @click="refresh">Refresh</n-button>
    </div>
    <n-alert v-if="error" type="error" style="margin-bottom:12px">{{ error }}</n-alert>
    <n-alert v-if="status && !status.enabled" type="info" style="margin-bottom:12px">
      {{ status.configured ? 'Sending is disabled. Enable the sender on the server when ready.' : 'Connect your WhatsApp Business account to load approved templates and send campaigns.' }}
      <p v-if="status.missing.length">Missing configuration: {{ status.missing.join(', ') }}</p>
    </n-alert>
    <p class="muted">Sender: {{ status?.sender || 'Not configured' }}. Campaigns and consent belong to this server’s WhatsApp account.</p>

    <n-collapse>
      <n-collapse-item title="Record or revoke recipient consent" name="consent">
        <p>Record permission already given by the recipient. A public directory entry is not consent.</p>
        <n-form-item label="Recipient phone">
          <n-input v-model:value="consentPhone" placeholder="+9725…" />
        </n-form-item>
        <n-form-item label="Evidence / source">
          <n-input v-model:value="consentSource" placeholder="e.g. Website signup on 2026-09-08, or recipient’s request" />
        </n-form-item>
        <n-space>
          <n-button :disabled="busy || !consentPhone || !consentSource.trim()" @click="saveConsent(true)">Record opt-in</n-button>
          <n-button :disabled="busy || !consentPhone || !consentSource.trim()" @click="saveConsent(false)">Revoke consent</n-button>
        </n-space>
        <n-data-table v-if="status?.contacts.length" :columns="consentColumns" :data="status.contacts.map(contact => ({...contact, consent: contact.optedIn ? 'Opted in' : 'Opted out'}))" :pagination="{pageSize:5}" size="small" style="margin-top:12px" />
      </n-collapse-item>
    </n-collapse>

    <n-form-item label="Recipients from the current leads page" style="margin-top:20px">
      <n-select v-model:value="selectedIds" multiple filterable :options="leadOptions" :disabled="busy" placeholder="Choose leads" />
    </n-form-item>
    <n-form-item label="Approved message template">
      <n-select v-model:value="templateKey" :options="templateOptions" :disabled="!status?.configured || busy" placeholder="Choose a template" />
    </n-form-item>
    <p class="muted">Text templates with numbered body variables are supported. Templates with headers or buttons are not listed.</p>
    <template v-if="selectedTemplate">
      <p class="template-body" dir="auto">{{ selectedTemplate.body }}</p>
      <n-form-item v-for="(_, index) in parameters" :key="index" :label="`Variable ${index + 1}`">
        <n-input v-model:value="parameters[index]" :disabled="busy" :placeholder="index === 0 ? '{{name}}' : 'Text or {{company}}'" />
      </n-form-item>
      <p v-if="parameters.length" class="muted" v-text="'Use {{name}}, {{company}} or {{phone}} to personalize each recipient.'" />
    </template>
    <n-button :disabled="!draft || busy" @click="previewCampaign">Preview recipients and message</n-button>

    <div v-if="preview" class="preview">
      <strong>{{ preview.recipients.length }} eligible recipients · {{ preview.skipped }} excluded</strong>
      <p class="muted">Missing consent, invalid numbers, irrelevant leads and duplicates are excluded. Consent is checked again before each send.</p>
      <n-select v-model:value="previewPhone" :options="preview.recipients.map(row => ({label: `${row.name} · +${row.phone}`, value: row.phone}))" placeholder="Preview a recipient" />
      <p class="template-body" dir="auto">{{ previewText }}</p>
      <n-button type="primary" :loading="busy" :disabled="!status?.enabled || !preview.recipients.length" @click="sendCampaign">Queue {{ preview.recipients.length }} messages</n-button>
    </div>

    <h4>Recent campaigns</h4>
    <p v-if="!status?.campaigns.length" class="muted">No campaigns yet.</p>
    <div v-for="campaign in status?.campaigns || []" :key="campaign._id" class="campaign-row">
      <span>{{ campaign.template.name }} · {{ campaign.recipientCount }} recipients · {{ campaign.status }}</span>
      <n-space>
        <n-button size="tiny" @click="loadCampaign(campaign._id)">Delivery details</n-button>
        <n-button v-if="campaign.status === 'queued'" size="tiny" :disabled="busy" @click="cancelCampaign(campaign._id)">Cancel pending</n-button>
      </n-space>
    </div>
    <n-data-table v-if="deliveryRows.length" :columns="deliveryColumns" :data="deliveryRows" :pagination="{pageSize:10}" :scroll-x="600" size="small" style="margin-top:12px" />
    <p v-if="deliveryRows.length" class="muted">Accepted means Meta accepted the send. Delivery and read status require webhook updates. Unknown means the outcome needs checking in Meta before sending again.</p>
  </section>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import {NAlert, NButton, NCollapse, NCollapseItem, NDataTable, NFormItem, NInput, NSelect, NSpace} from "naive-ui";
import {whatsappApi, type InspectorLead, type WhatsAppStatus, type WhatsAppTemplate, type WhatsAppPreview, type WhatsAppMessage} from "../services/apiService";

const props = defineProps<{leads: InspectorLead[]}>();
const status = ref<WhatsAppStatus | null>(null);
const templates = ref<WhatsAppTemplate[]>([]);
const busy = ref(false);
const error = ref("");
const consentPhone = ref("");
const consentSource = ref("");
const selectedIds = ref<string[]>([]);
const templateKey = ref<string | null>(null);
const parameters = ref<string[]>([]);
const preview = ref<WhatsAppPreview | null>(null);
const previewPhone = ref<string | null>(null);
const deliveryRows = ref<WhatsAppMessage[]>([]);
const requestId = ref("");
const templateOptions = computed(() => templates.value.map(t => ({label: `${t.name} (${t.language})`, value: `${t.name}:${t.language}`})));
const selectedTemplate = computed(() => templates.value.find(t => `${t.name}:${t.language}` === templateKey.value));
const leadOptions = computed(() => props.leads.filter(lead => lead.whatsapp || lead.phone).map(lead => ({label: `${lead.name} · ${lead.whatsapp || lead.phone}`, value: lead.id})));
const draft = computed(() => selectedTemplate.value && selectedIds.value.length && parameters.value.every(value => value.trim())
  ? {leadIds: selectedIds.value, templateName: selectedTemplate.value.name, language: selectedTemplate.value.language, parameters: parameters.value} : null);
const previewText = computed(() => {
  const recipient = preview.value?.recipients.find(row => row.phone === previewPhone.value);
  return preview.value?.template.body.replace(/\{\{(\d+)\}\}/g, (match, n) => recipient?.parameters[Number(n) - 1] ?? match) || "";
});
const deliveryColumns = [{title: "Name", key: "name"}, {title: "Phone", key: "phone"}, {title: "Status", key: "status"}, {title: "Details", key: "error"}];
const consentColumns = [{title: "Phone", key: "phone"}, {title: "Consent", key: "consent"}, {title: "Evidence / source", key: "source"}];

watch(templateKey, () => { parameters.value = Array.from({length: selectedTemplate.value?.parameters || 0}, (_, i) => i === 0 ? "{{name}}" : ""); });
watch([selectedIds, templateKey, parameters], () => { preview.value = null; requestId.value = ""; }, {deep: true});
watch(() => props.leads, () => { selectedIds.value = []; });

async function perform(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try { await action(); } catch (err) { error.value = err instanceof Error ? err.message : "WhatsApp request failed"; }
  finally { busy.value = false; }
}
async function refresh() {
  await perform(async () => {
    status.value = await whatsappApi.status();
    templates.value = status.value.configured ? await whatsappApi.templates() : [];
  });
}
async function saveConsent(optedIn: boolean) {
  await perform(async () => {
    await whatsappApi.consent(consentPhone.value, optedIn, consentSource.value);
    preview.value = null;
    status.value = await whatsappApi.status();
  });
}
async function previewCampaign() {
  if (!draft.value) return;
  const payload = {...draft.value, leadIds: [...draft.value.leadIds], parameters: [...draft.value.parameters]};
  await perform(async () => {
    preview.value = await whatsappApi.preview(payload);
    previewPhone.value = preview.value.recipients[0]?.phone || null;
    requestId.value = crypto.randomUUID();
  });
}
async function sendCampaign() {
  if (!draft.value || !requestId.value || !preview.value) return;
  const payload = {...draft.value, leadIds: [...draft.value.leadIds], parameters: [...draft.value.parameters]};
  const previewHash = preview.value?.previewHash;
  await perform(async () => {
    const result = await whatsappApi.create(payload, requestId.value, previewHash!);
    deliveryRows.value = (await whatsappApi.campaign(result._id)).messages;
    preview.value = null;
    status.value = await whatsappApi.status();
  });
}
async function loadCampaign(id: string) { await perform(async () => { deliveryRows.value = (await whatsappApi.campaign(id)).messages; }); }
async function cancelCampaign(id: string) {
  await perform(async () => { await whatsappApi.cancel(id); status.value = await whatsappApi.status(); deliveryRows.value = (await whatsappApi.campaign(id)).messages; });
}
onMounted(refresh);
</script>

<style scoped>
.whatsapp-panel { margin-top:20px;padding:20px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-card);color:var(--text-primary); }
.panel-heading,.campaign-row { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap; }
h3 { margin:0 0 12px; }
.muted { color:var(--text-secondary);font-size:13px; }
.template-body { white-space:pre-wrap;line-height:1.8;padding:16px;border:1px solid var(--border-color);border-radius:8px; }
.preview { margin-top:16px;padding:16px;border:1px solid var(--brand-color);border-radius:8px; }
.campaign-row { padding:10px 0;border-bottom:1px solid var(--border-color); }
</style>
