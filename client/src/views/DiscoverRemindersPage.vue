<template>
  <main class="discover-page" :dir="dir">
    <PageHeader :title="c.title" :subtitle="c.subtitle">
      <template #actions><n-button @click="router.push(href('/reminders'))">{{ c.myReminders }}</n-button></template>
    </PageHeader>
    <n-alert v-if="error" type="error" closable @close="error = ''">{{ error }}</n-alert>
    <n-alert v-if="success" type="success" closable @close="success = ''">{{ success }}</n-alert>
    <n-alert v-if="!allowed" type="info">{{ c.plan }} <router-link :to="href('/profile') + '?section=subscription'">{{ c.plans }}</router-link></n-alert>

    <section class="scan-panel">
      <div class="connection">
        <n-icon :component="SearchOutline" :size="28" />
        <div><h2>{{ c.emailScan }}</h2><p>{{ connected ? (email || c.connected) : c.connectHint }}</p></div>
        <n-button v-if="!connected" :loading="connecting || loading" :disabled="!allowed || loading" @click="connect">{{ c.connect }}</n-button>
      </div>
      <div class="scan-controls">
        <label>{{ c.languages }}<n-select v-model:value="languages" multiple :options="languageOptions" :disabled="scanning" /></label>
        <label>{{ c.history }}<n-select v-model:value="months" :options="monthOptions" :disabled="scanning" /></label>
        <n-button type="primary" :loading="scanning" :disabled="!connected || !allowed || !languages.length || loading" @click="scan">
          <template #icon><n-icon :component="SearchOutline" /></template>{{ c.scan }}
        </n-button>
      </div>
      <label class="auto-scan">
        <n-switch :value="autoScan" :loading="autoScanSaving" :disabled="!connected || !allowed" @update:value="setAutoScan" />
        <span><strong>{{ c.autoScan }}</strong><small class="muted">{{ c.autoScanHint }}</small></span>
      </label>
      <label v-if="autoScan" class="scan-frequency">
        <span>{{ c.frequency }}</span>
        <n-select v-model:value="frequency" size="small" :options="frequencyOptions" :loading="autoScanSaving" @update:value="setFrequency" />
      </label>
      <p class="muted">{{ c.limit }}</p>
      <p v-if="scanning" role="status">{{ c.scanning }}</p>
    </section>

    <div class="summary" aria-live="polite">
      <div class="stat-card">
        <n-icon :component="MailOutline" :size="20" class="stat-card__icon" />
        <div><strong>{{ scanned ?? '—' }}</strong><span>{{ c.scanned }}</span></div>
      </div>
      <div class="stat-card stat-card--missed">
        <n-icon :component="WarningOutline" :size="20" class="stat-card__icon" />
        <div><strong>{{ missed.length }}</strong><span>{{ c.missed }}</span></div>
      </div>
      <div class="stat-card stat-card--upcoming">
        <n-icon :component="CalendarOutline" :size="20" class="stat-card__icon" />
        <div><strong>{{ upcoming.length }}</strong><span>{{ c.upcoming }}</span></div>
      </div>
      <div class="stat-card stat-card--urgent">
        <n-icon :component="FlashOutline" :size="20" class="stat-card__icon" />
        <div><strong>{{ urgent.length }}</strong><span>{{ c.urgent }}</span></div>
      </div>
    </div>
    <n-input v-model:value="search" :placeholder="c.search" :aria-label="c.search" clearable>
      <template #prefix><n-icon :component="SearchOutline" /></template>
    </n-input>
    <n-empty v-if="!scanning && !visible.length" :description="scanned === null ? c.start : search ? c.noMatch : c.empty" class="empty-state" />
    <section v-for="group in groups" v-show="group.items.length" :key="group.key" class="result-group" :class="`result-group--${group.key}`">
      <h2 class="result-group__title">
        <n-icon :component="group.icon" :size="20" />{{ group.label }} <span class="count-pill">{{ group.items.length }}</span>
      </h2>
      <p v-if="group.key === 'missed'" class="muted">{{ c.missedHint }}</p>
      <article v-for="item in group.items" :key="item.id" class="suggestion" :class="`suggestion--${stateOf(item)}`">
        <div class="suggestion-heading">
          <n-tag :type="item.warning ? 'warning' : 'info'" size="small" round>
            <template #icon><n-icon :component="kindIcon[item.kind]" /></template>{{ c.kinds[item.kind] }}
          </n-tag>
          <span class="due-chip" :class="`due-chip--${stateOf(item)}`">
            <n-icon :component="stateOf(item) === 'missed' ? WarningOutline : TimeOutline" :size="14" />
            <time :datetime="item.due_date">{{ formatDate(item.due_date) }}</time>
            <span class="due-chip__rel">· {{ relativeLabel(item.due_date) }}</span>
          </span>
        </div>
        <h3>{{ item.entity_name }}</h3><p class="muted sender" dir="auto">{{ item.from }}</p>
        <blockquote dir="auto">{{ item.evidence_quote }}</blockquote>
        <p v-if="item.warning" class="muted">{{ c.immediate }}</p>
        <p class="muted">{{ item.confidence === 'high' ? c.high : c.medium }}<span v-if="item.attachment_name"> · {{ item.attachment_name }}</span></p>
        <div class="card-actions">
          <n-button type="primary" :disabled="saved.has(item.id)" @click="review(item)">
            <template #icon><n-icon :component="saved.has(item.id) ? CheckmarkCircleOutline : AddOutline" /></template>{{ saved.has(item.id) ? c.saved : c.review }}
          </n-button>
          <n-button @click="preview(item)"><template #icon><n-icon :component="DocumentTextOutline" /></template>{{ c.source }}</n-button>
          <a v-for="pdf in item.pdfs" :key="pdf.id" :href="api.gmail.discoveryPdfUrl(item.id, pdf.id)" target="_blank" rel="noopener noreferrer">{{ pdf.filename }}</a>
          <a :href="emailLink(item.messageId)" target="_blank" rel="noopener noreferrer">{{ c.openEmail }}</a>
          <n-button quaternary @click="dismiss(item)"><template #icon><n-icon :component="CloseOutline" /></template>{{ c.dismiss }}</n-button>
        </div>
      </article>
    </section>

    <n-modal v-model:show="showReview" preset="card" :title="c.review" class="review-modal" :style="{ width: 'min(520px, 94vw)' }" :mask-closable="!saving" :closable="!saving">
      <n-alert type="info">{{ c.reviewHint }}</n-alert>
      <n-form class="review-form" @submit.prevent="save">
        <n-form-item :label="c.name"><n-input v-model:value="draftTitle" :disabled="saving" /></n-form-item>
        <n-form-item :label="c.date"><input v-model="draftDate" type="date" required :disabled="saving" class="date-input" /></n-form-item>
        <n-alert v-if="saveError" type="error">{{ saveError }}</n-alert>
        <n-button type="primary" attr-type="submit" :loading="saving" :disabled="!draftTitle.trim() || !draftDate">{{ c.create }}</n-button>
      </n-form>
    </n-modal>
    <n-modal v-model:show="showSource" preset="card" :title="c.source" :style="{ width: 'min(1000px, 96vw)' }">
      <p v-if="sourceLoading" role="status">{{ c.loadingSource }}</p>
      <n-alert v-if="sourceError" type="error">{{ sourceError }}</n-alert>
      <iframe v-if="sourceHtml" :srcdoc="safePreview" sandbox="" referrerpolicy="no-referrer" :title="c.source" class="source-preview" />
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NAlert, NButton, NEmpty, NForm, NFormItem, NIcon, NInput, NModal, NSelect, NSwitch, NTag } from "naive-ui";
import {
  AddOutline, AlarmOutline, CalendarOutline, CheckmarkCircleOutline, CloseOutline, ConstructOutline, DocumentTextOutline,
  FlashOutline, MailOutline, RefreshOutline, SearchOutline, ShieldCheckmarkOutline, TimeOutline, WalletOutline, WarningOutline,
} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import { api, type ObligationSuggestion } from "../services/apiService";
import { useI18n } from "../composables/useI18n";
import { useAuthStore } from "../stores/auth";
import { useUserSettingsStore } from "../stores/userSettings";
import { planAllowsDocumentImport, resolveUserPlan } from "../shared/pricingPlans";
import { discoveryMessages } from "../locales/discoveryMessages";

const { uiLocale, intl, dir, href } = useI18n();
const c = computed(() => discoveryMessages[uiLocale.value]);
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const allowed = computed(() => planAllowsDocumentImport(resolveUserPlan(auth.user)));
const userSettings = useUserSettingsStore();
const autoScan = ref(false);
const frequency = ref<"daily" | "weekly">("weekly");
const frequencyOptions = computed(() => [
  { label: c.value.daily, value: "daily" },
  { label: c.value.weekly, value: "weekly" },
]);
const autoScanSaving = ref(false);
const connected = ref(false);
const email = ref<string | null>(null);
const loading = ref(true);
const connecting = ref(false);
const scanning = ref(false);
const error = ref("");
const success = ref("");
const languages = ref<string[]>([uiLocale.value]);
const months = ref(3);
const scanned = ref<number | null>(null);
const proposals = ref<ObligationSuggestion[]>([]);
const dismissed = ref(new Set<string>());
const saved = ref(new Set<string>());
const search = ref("");
const languageOptions = [{ label: "עברית", value: "he" }, { label: "English", value: "en" }, { label: "Русский", value: "ru" }];
const monthOptions = computed(() => [1, 3, 6, 12, 24, 36].map(value => ({ value, label: `${value} ${c.value.months}` })));
const visible = computed(() => proposals.value.filter(item => !dismissed.value.has(item.id) && `${item.entity_name} ${item.from} ${item.evidence_quote}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const kindIcon = { warranty: ShieldCheckmarkOutline, renewal: RefreshOutline, payment_due: WalletOutline, maintenance: ConstructOutline, due_task: FlashOutline };
type ItemState = "missed" | "urgent" | "upcoming";
function stateOf(item: ObligationSuggestion): ItemState {
  if (item.due_date < todayIso() && !item.warning) return "missed";
  return item.kind === "due_task" || item.warning === "immediate" ? "urgent" : "upcoming";
}
const missed = computed(() => visible.value.filter(item => stateOf(item) === "missed"));
const urgent = computed(() => visible.value.filter(item => stateOf(item) === "urgent"));
const upcoming = computed(() => visible.value.filter(item => stateOf(item) === "upcoming"));
const groups = computed(() => [
  { key: "missed", icon: WarningOutline, label: c.value.missed, items: [...missed.value].sort((a, b) => b.due_date.localeCompare(a.due_date)) },
  { key: "urgent", icon: FlashOutline, label: c.value.urgent, items: urgent.value },
  { key: "upcoming", icon: AlarmOutline, label: c.value.upcoming, items: upcoming.value },
]);
function relativeLabel(value: string): string {
  const days = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400000);
  if (days === 0) return c.value.dueToday;
  if (days === 1) return c.value.dueTomorrow;
  if (days === -1) return c.value.dayAgo;
  return (days > 0 ? c.value.inDays : c.value.daysAgo).replace("{n}", String(Math.abs(days)));
}
const showReview = ref(false);
const selected = ref<ObligationSuggestion | null>(null);
const draftTitle = ref("");
const draftDate = ref("");
const saving = ref(false);
const saveError = ref("");
const showSource = ref(false);
const sourceLoading = ref(false);
const sourceError = ref("");
const sourceHtml = ref("");
const safePreview = computed(() => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">${sourceHtml.value}`);
async function loadSaved() {
  const result = await api.gmail.discoveries();
  proposals.value = result.proposals;
  dismissed.value = new Set(result.proposals.filter(item => item.status === "dismissed").map(item => item.id));
  saved.value = new Set(result.proposals.filter(item => item.status === "created").map(item => item.id));
}
async function preview(item: ObligationSuggestion) {
  showSource.value = true; sourceLoading.value = true; sourceHtml.value = ""; sourceError.value = "";
  try { sourceHtml.value = (await api.gmail.discovery(item.id)).preview_html; }
  catch (err) { sourceError.value = errorText(err); }
  finally { sourceLoading.value = false; }
}
async function dismiss(item: ObligationSuggestion) {
  try { await api.gmail.updateDiscovery(item.id, "dismissed"); dismissed.value.add(item.id); }
  catch (err) { error.value = errorText(err); }
}
function formatDate(value: string) { return new Intl.DateTimeFormat(uiLocale.value === "en" ? "en-GB" : intl.value).format(new Date(`${value}T12:00:00`)); }
function emailLink(id: string) { return `https://mail.google.com/mail/u/${email.value ? `?authuser=${encodeURIComponent(email.value)}` : '0/'}#all/${encodeURIComponent(id)}`; }
function errorText(err: unknown) { return err instanceof Error ? err.message : c.value.failed; }
async function setAutoScan(value: boolean) {
  autoScanSaving.value = true;
  error.value = "";
  try {
    const row = await userSettings.save({ discovery_auto_scan: value, discovery_langs: languages.value });
    autoScan.value = Boolean(row.discovery_auto_scan);
  } catch (err) { error.value = errorText(err); }
  finally { autoScanSaving.value = false; }
}
async function setFrequency(value: "daily" | "weekly") {
  autoScanSaving.value = true;
  error.value = "";
  try {
    const row = await userSettings.save({ discovery_scan_frequency: value });
    frequency.value = row.discovery_scan_frequency === "daily" ? "daily" : "weekly";
  } catch (err) { error.value = errorText(err); }
  finally { autoScanSaving.value = false; }
}
async function connect() {
  connecting.value = true;
  error.value = "";
  try { const result = await api.gmail.authUrl(href("/discover-reminders"), "gmail"); window.location.assign(result.url); }
  catch (err) { error.value = errorText(err); }
  finally { connecting.value = false; }
}
async function scan() {
  scanning.value = true;
  error.value = "";
  try {
    const result = await api.gmail.scanObligations(languages.value, months.value);
    await loadSaved();
    scanned.value = result.scanned;
  } catch (err) {
    error.value = errorText(err);
    await loadSaved().catch(() => undefined);
  }
  finally { scanning.value = false; }
}
function review(item: ObligationSuggestion) {
  selected.value = item;
  draftTitle.value = `${c.value.kinds[item.kind]}: ${item.entity_name}`;
  const today = new Date();
  draftDate.value = item.warning ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}` : item.due_date;
  saveError.value = "";
  showReview.value = true;
}
async function save() {
  if (!selected.value || saving.value || saved.value.has(selected.value.id) || !draftTitle.value.trim() || !draftDate.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const result = await api.reminders.createPersonal({ title: draftTitle.value.trim(), target_date: draftDate.value, remind_before_days: [0], sync_calendar: false });
    if (!result.created) throw new Error(c.value.notCreated);
    saved.value.add(selected.value.id);
    await api.gmail.updateDiscovery(selected.value.id, "created");
    showReview.value = false;
    success.value = c.value.created;
  } catch (err) { saveError.value = errorText(err); }
  finally { saving.value = false; }
}
onMounted(async () => {
  if (route.query.error) error.value = c.value.connectionFailed;
  try { await loadSaved(); } catch (err) { error.value = errorText(err); }
  try {
    const row = await userSettings.load();
    autoScan.value = Boolean(row?.discovery_auto_scan);
    frequency.value = row?.discovery_scan_frequency === "daily" ? "daily" : "weekly";
    if (row?.discovery_langs?.length) languages.value = [...row.discovery_langs];
  } catch { /* the switch just stays off */ }
  try { const status = await api.gmail.status(); connected.value = status.connected; email.value = status.email; }
  catch (err) { error.value = errorText(err); }
  finally { loading.value = false; }
});
</script>

<style scoped>
.discover-page { max-width: 1100px; margin: 0 auto; display: grid; gap: 20px; }
.source-preview { width: 100%; height: 65vh; border: 0; background: white; }
.scan-panel, .suggestion { padding: 24px; border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-card); }
.connection, .scan-controls, .card-actions, .suggestion-heading { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.connection > div { flex: 1; min-width: 180px; }
h2, h3, p { margin: 0 0 8px; }
h2 { font-size: 18px; } h3 { font-size: 17px; margin-top: 16px; }
.scan-controls { margin: 24px 0 12px; align-items: end; }
.scan-controls label { display: grid; gap: 8px; flex: 1; min-width: 180px; }
.scan-frequency { display: flex; align-items: center; gap: 10px; max-width: 280px; }
.scan-frequency span { white-space: nowrap; color: var(--text-secondary); font-size: 13px; }
.auto-scan { display: flex; align-items: center; gap: 12px; margin-top: 4px; cursor: pointer; }
.auto-scan span { display: grid; gap: 2px; }
.muted, .connection p { color: var(--text-secondary); font-size: 13px; }
.scan-panel { background: linear-gradient(135deg, color-mix(in srgb, var(--brand-color) 9%, var(--bg-card)), var(--bg-card) 60%); }
.connection > .n-icon { padding: 10px; border-radius: 14px; box-sizing: content-box; background: color-mix(in srgb, var(--brand-color) 16%, transparent); color: var(--brand-color); }
.summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; }
.stat-card > div { display: grid; gap: 2px; min-width: 0; }
.stat-card__icon { flex: 0 0 auto; padding: 9px; border-radius: 12px; box-sizing: content-box; background: var(--bg-hover); color: var(--text-secondary); }
.stat-card strong { font-size: 26px; line-height: 1.1; color: var(--text-primary); }
.stat-card span { color: var(--text-secondary); font-size: 13px; }
.stat-card--upcoming .stat-card__icon { color: var(--brand-color); background: color-mix(in srgb, var(--brand-color) 15%, transparent); }
.stat-card--urgent .stat-card__icon { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 16%, transparent); }
.stat-card--missed .stat-card__icon { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 14%, transparent); }
.stat-card--missed strong { color: var(--color-error); }
.result-group { display: grid; gap: 14px; }
.result-group__title { display: flex; align-items: center; gap: 8px; }
.result-group--missed .result-group__title { color: var(--color-error); }
.result-group--urgent .result-group__title { color: var(--color-warning); }
.count-pill { padding: 1px 10px; border-radius: 999px; background: var(--bg-hover); color: var(--text-secondary); font-size: 12px; font-weight: 700; }
.suggestion { border-inline-start: 4px solid var(--brand-color); transition: box-shadow var(--transition-fast); }
.suggestion:hover { box-shadow: 0 6px 20px color-mix(in srgb, var(--text-primary) 8%, transparent); }
.suggestion--urgent { border-inline-start-color: var(--color-warning); }
.suggestion--missed { border-inline-start-color: var(--color-error); }
.suggestion-heading { justify-content: space-between; }
.due-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; background: color-mix(in srgb, var(--brand-color) 13%, transparent); color: var(--brand-color); }
.due-chip--urgent { background: color-mix(in srgb, var(--color-warning) 16%, transparent); color: var(--color-warning); }
.due-chip--missed { background: color-mix(in srgb, var(--color-error) 13%, transparent); color: var(--color-error); }
.due-chip__rel { font-weight: 500; opacity: 0.85; }
blockquote { margin: 16px 0; padding: 12px 16px; border-inline-start: 3px solid var(--brand-color); background: var(--bg-elevated); white-space: pre-wrap; overflow-wrap: anywhere; }
.sender { overflow-wrap: anywhere; }.card-actions { margin-top: 20px; }a { color: var(--brand-color); }
.empty-state { padding: 40px 0; }.review-form { margin-top: 20px; }.date-input { width: 100%; padding: 10px; font: inherit; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; }
@media (max-width: 900px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) {
  .scan-panel, .suggestion { padding: 14px; }
  .stat-card { padding: 10px 12px; gap: 10px; }
  .stat-card strong { font-size: 20px; }
  .stat-card span { font-size: 11px; }
  .stat-card__icon { padding: 6px; }
  .scan-controls > .n-button { width: 100%; }
  .due-chip__rel { display: none; }
}
</style>
