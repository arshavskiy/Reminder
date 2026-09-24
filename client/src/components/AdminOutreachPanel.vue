<template>
  <section class="outreach-panel" aria-label="Email outreach">
    <div class="monitor-block">
      <div class="panel-heading">
        <div class="monitor-block__title">Unsubscribe requests</div>
        <n-space size="small">
          <n-tooltip>
            <template #trigger>
              <n-button size="small" type="primary" :loading="scanning" @click="scan">
                <template #icon><n-icon :component="MailUnreadOutline" /></template>
                Scan Gmail for <bdi>"הסר"</bdi>
              </n-button>
            </template>
            Searches your connected Gmail (contact@remindocr.com) for removal replies and flags those senders
          </n-tooltip>
          <n-button size="small" :loading="unsubscribesLoading" @click="loadUnsubscribes">
            <template #icon><n-icon :component="RefreshOutline" /></template>
            Refresh
          </n-button>
        </n-space>
      </div>
      <n-alert v-if="scanSummary" type="success" style="margin:10px 0" closable @close="scanSummary = null">
        Scanned {{ scanSummary.scanned }} replies · {{ scanSummary.requests }} removal requests ·
        {{ scanSummary.newlyUnsubscribed + scanSummary.insertedLeads }} new ·
        {{ scanSummary.alreadyUnsubscribed }} already recorded
      </n-alert>
      <n-data-table
        :columns="unsubscribeColumns"
        :data="unsubscribes"
        :loading="unsubscribesLoading"
        :bordered="false"
        :pagination="{ pageSize: 20 }"
        size="small"
        style="margin-top:12px"
      />
    </div>

    <div class="monitor-block">
      <div class="panel-heading">
        <div class="monitor-block__title">Emails sent</div>
        <n-space size="small">
          <n-input
            v-model:value="sendSearch"
            clearable
            size="small"
            placeholder="Search email..."
            style="width: 220px"
            @keyup.enter="loadSends(1)"
            @clear="loadSends(1)"
          >
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
          <n-select
            v-model:value="campaignFilter"
            clearable
            size="small"
            placeholder="Campaign"
            :options="campaignOptions"
            style="width: 240px"
            @update:value="loadSends(1)"
          />
          <n-button size="small" :loading="sendsLoading" @click="loadSends(1)">
            <template #icon><n-icon :component="RefreshOutline" /></template>
            Refresh
          </n-button>
        </n-space>
      </div>
      <n-data-table
        :columns="sendColumns"
        :data="sends"
        :loading="sendsLoading"
        :bordered="false"
        :pagination="false"
        :max-height="480"
        size="small"
        style="margin-top:12px"
      />
      <div class="leads-pagination">
        <span>{{ sendRangeText }}</span>
        <div class="leads-pagination__actions">
          <n-button size="tiny" :disabled="sendPage <= 1 || sendsLoading" @click="loadSends(sendPage - 1)">Prev</n-button>
          <n-button size="tiny" :disabled="sendPage * sendLimit >= sendsTotal || sendsLoading" @click="loadSends(sendPage + 1)">Next</n-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref} from "vue";
import {NAlert, NButton, NDataTable, NIcon, NInput, NSelect, NSpace, NTag, NTooltip, useMessage, type DataTableColumns} from "naive-ui";
import {MailUnreadOutline, RefreshOutline, SearchOutline} from "@vicons/ionicons5";
import {api, type InspectorLead, type InspectorLeadEmailSend, type UnsubscribeScanResult} from "../services/apiService";

const message = useMessage();

const unsubscribes = ref<InspectorLead[]>([]);
const unsubscribesLoading = ref(false);
const scanning = ref(false);
const scanSummary = ref<UnsubscribeScanResult | null>(null);

const sends = ref<InspectorLeadEmailSend[]>([]);
const sendsTotal = ref(0);
const sendsLoading = ref(false);
const sendPage = ref(1);
const sendLimit = 50;
const sendSearch = ref("");
const campaignFilter = ref<string | null>(null);
const campaigns = ref<{ campaign: string; count: number }[]>([]);

const campaignOptions = computed(() => campaigns.value.map((row) => ({
  label: `${row.campaign} (${row.count})`,
  value: row.campaign,
})));

const sendRangeText = computed(() => {
  if (!sendsTotal.value) return "No emails recorded";
  const start = (sendPage.value - 1) * sendLimit + 1;
  const end = Math.min(sendPage.value * sendLimit, sendsTotal.value);
  return `${start}-${end} of ${sendsTotal.value}`;
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"});
}

const muted = (text: string) => h("span", {style: "font-size:12px;color:var(--text-secondary)"}, text);

const unsubscribeColumns: DataTableColumns<InspectorLead> = [
  {title: "Email", key: "email", minWidth: 220, ellipsis: {tooltip: true}},
  {
    title: "Lead", key: "name", minWidth: 180, ellipsis: {tooltip: true},
    render: (row) => row.name || row.company || muted(row.source === "unsubscribe-reply" ? "Not a lead (reply only)" : "—"),
  },
  {
    title: "Requested", key: "unsubscribedAt", width: 150,
    render: (row) => muted(formatDateTime(row.unsubscribedAt)),
  },
  {
    title: "Reply", key: "unsubscribeSnippet", minWidth: 240, ellipsis: {tooltip: true},
    render: (row) => h("span", {dir: "auto"}, row.unsubscribeSnippet || row.unsubscribeSubject || "—"),
  },
  {
    title: "Last campaign", key: "lastEmailCampaign", width: 190,
    render: (row) => row.lastEmailCampaign ? h(NTag, {size: "small", round: true}, {default: () => row.lastEmailCampaign}) : "—",
  },
];

const sendColumns: DataTableColumns<InspectorLeadEmailSend> = [
  {title: "Email", key: "email", minWidth: 220, ellipsis: {tooltip: true}},
  {
    title: "Lead", key: "name", minWidth: 160, ellipsis: {tooltip: true},
    render: (row) => row.name || row.company || "—",
  },
  {
    title: "Campaign", key: "campaign", width: 230,
    render: (row) => h(NTag, {size: "small", round: true}, {default: () => row.campaign}),
  },
  {
    title: "Sent", key: "sentAt", width: 150,
    render: (row) => muted(formatDateTime(row.sentAt)),
  },
  {
    title: "Status", key: "unsubscribed", width: 130,
    render: (row) => row.unsubscribed
      ? h(NTag, {size: "small", round: true, type: "error"}, {default: () => "Unsubscribed"})
      : h(NTag, {size: "small", round: true, type: "success"}, {default: () => "Sent"}),
  },
];

async function loadUnsubscribes() {
  unsubscribesLoading.value = true;
  try {
    unsubscribes.value = (await api.admin.listInspectorLeadUnsubscribes()).rows;
  } catch (err: any) {
    message.error(err?.message ?? "Failed to load unsubscribe requests");
  } finally {
    unsubscribesLoading.value = false;
  }
}

async function loadSends(page = sendPage.value) {
  sendsLoading.value = true;
  try {
    const res = await api.admin.listInspectorLeadEmailSends({
      page,
      limit: sendLimit,
      campaign: campaignFilter.value,
      q: sendSearch.value.trim() || null,
    });
    sends.value = res.rows;
    sendsTotal.value = res.total;
    sendPage.value = res.page;
    campaigns.value = res.campaigns;
  } catch (err: any) {
    message.error(err?.message ?? "Failed to load sent emails");
  } finally {
    sendsLoading.value = false;
  }
}

async function scan() {
  scanning.value = true;
  try {
    scanSummary.value = await api.admin.scanInspectorLeadUnsubscribes();
    await Promise.all([loadUnsubscribes(), loadSends(sendPage.value)]);
  } catch (err: any) {
    const text = String(err?.message ?? "");
    message.error(text.includes("gmail_not_connected")
      ? "Connect the contact@remindocr.com Gmail to your admin account first"
      : text || "Scan failed");
  } finally {
    scanning.value = false;
  }
}

onMounted(() => {
  loadUnsubscribes();
  loadSends(1);
});
</script>

<style scoped>
.outreach-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
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

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.leads-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.leads-pagination__actions {
  display: flex;
  gap: 6px;
}
</style>
