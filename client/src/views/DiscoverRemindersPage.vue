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
    <p v-if="missed.length" class="muted">{{ c.missedHint }}</p>
    <section v-if="agenda.length" class="agenda" :aria-label="c.upcoming">
      <article v-for="item in agenda" :key="item.id" class="agenda-row" :class="`agenda-row--${stateOf(item)}`">
        <div class="agenda-date" :title="formatDate(item.due_date)">
          <strong>{{ dayOf(item.due_date) }}</strong><span>{{ monthOf(item.due_date) }}</span>
        </div>
        <div class="agenda-main">
          <n-tooltip placement="top-start">
            <template #trigger><h3 class="agenda-title" dir="auto">{{ item.entity_name }}</h3></template>
            <span dir="auto" class="agenda-quote">{{ item.evidence_quote }}</span>
          </n-tooltip>
          <p class="agenda-meta">
            <n-icon :component="kindIcon[item.kind]" :size="14" />
            <span>{{ c.kinds[item.kind] }}</span>
            <span>· {{ relativeLabel(item.due_date) }}</span>
            <span v-if="item.confidence !== 'high'">· {{ c.medium }}</span>
            <span class="agenda-from" dir="auto">· {{ item.from }}</span>
          </p>
        </div>
        <n-dropdown trigger="click" placement="bottom-end" :options="actionOptions(item)" @select="key => onAction(item, String(key))">
          <button type="button" class="btn btn--ghost btn--xs icon-btn" :aria-label="c.actions"><n-icon :component="EllipsisVerticalOutline" :size="18" /></button>
        </n-dropdown>
      </article>
    </section>

    <n-modal v-model:show="showReview" preset="card" :aria-label="c.review" class="review-modal" :style="{ width: 'min(520px, 94vw)' }" :mask-closable="!saving" :closable="!saving">
      <template #header><n-icon :component="AlarmOutline" :size="22" role="img" :aria-label="c.review" /></template>
      <n-alert type="info">{{ c.reviewHint }}</n-alert>
      <n-form class="review-form" @submit.prevent="save">
        <n-form-item :label="c.name"><n-input v-model:value="draftTitle" :disabled="saving" /></n-form-item>
        <n-form-item :label="c.date"><input v-model="draftDate" type="date" required :disabled="saving" class="date-input" /></n-form-item>
        <n-form-item v-if="selected?.kind === 'warranty'" :label="c.returnDeadline"><input v-model="draftReturnDeadline" type="date" :disabled="saving" class="date-input" /></n-form-item>
        <n-checkbox v-model:checked="draftEmail" :disabled="saving">{{ c.emailMe }}</n-checkbox>
        <n-checkbox v-model:checked="draftCalendar" :disabled="saving">{{ c.addToCalendar }}</n-checkbox>
        <p class="review-note">{{ c.warnAhead }}</p>
        <n-alert v-if="saveError" type="error">{{ saveError }}</n-alert>
        <n-button type="primary" attr-type="submit" :loading="saving" :disabled="!draftTitle.trim() || !draftDate">{{ c.create }}</n-button>
      </n-form>
    </n-modal>
    <n-modal v-model:show="showSource" preset="card" :aria-label="c.source" :style="{ width: 'min(1000px, 96vw)' }">
      <template #header><n-icon :component="DocumentTextOutline" :size="22" role="img" :aria-label="c.source" /></template>
      <p v-if="sourceLoading" role="status">{{ c.loadingSource }}</p>
      <n-alert v-if="sourceError" type="error">{{ sourceError }}</n-alert>
      <iframe v-if="sourceHtml" :srcdoc="safePreview" sandbox="" referrerpolicy="no-referrer" :title="c.source" class="source-preview" />
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NAlert, NButton, NCheckbox, NDropdown, NEmpty, NForm, NFormItem, NIcon, NInput, NModal, NSelect, NSwitch, NTag, NTooltip } from "naive-ui";
import type { DropdownOption } from "naive-ui";
import {
  AddOutline, AlarmOutline, AttachOutline, EllipsisVerticalOutline, CalendarOutline, CheckmarkCircleOutline, CloseOutline, ConstructOutline, DocumentTextOutline,
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
const agenda = computed(() => [...visible.value].sort((a, b) => a.due_date.localeCompare(b.due_date)));
const dayOf = (value: string) => String(new Date(`${value}T12:00:00`).getDate());
const monthOf = (value: string) => new Intl.DateTimeFormat(intl.value, { month: "short" }).format(new Date(`${value}T12:00:00`));
function actionOptions(item: ObligationSuggestion): DropdownOption[] {
  const icon = (component: Component) => () => h(NIcon, { component });
  const isSaved = saved.value.has(item.id);
  return [
    { key: "review", label: isSaved ? c.value.saved : c.value.review, icon: icon(isSaved ? CheckmarkCircleOutline : AddOutline), disabled: isSaved },
    { key: "source", label: c.value.source, icon: icon(DocumentTextOutline) },
    { key: "email", label: c.value.openEmail, icon: icon(MailOutline) },
    ...item.pdfs.map(pdf => ({ key: `pdf:${pdf.id}`, label: pdf.filename, icon: icon(AttachOutline) })),
    { type: "divider", key: "divider" },
    { key: "dismiss", label: c.value.dismiss, icon: icon(CloseOutline) },
  ];
}
function onAction(item: ObligationSuggestion, key: string) {
  if (key === "review") review(item);
  else if (key === "source") void preview(item);
  else if (key === "email") window.open(emailLink(item.messageId), "_blank", "noopener,noreferrer");
  else if (key === "dismiss") void dismiss(item);
  else if (key.startsWith("pdf:")) window.open(api.gmail.discoveryPdfUrl(item.id, key.slice(4)), "_blank", "noopener,noreferrer");
}
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
const draftReturnDeadline = ref("");
const draftEmail = ref(true);
const draftCalendar = ref(true);
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
  draftReturnDeadline.value = "";
  saveError.value = "";
  showReview.value = true;
}
async function save() {
  if (!selected.value || saving.value || saved.value.has(selected.value.id) || !draftTitle.value.trim() || !draftDate.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const result = await api.reminders.createPersonal({ title: draftTitle.value.trim(), target_date: draftDate.value, advance_days: [7, 1], email_self: draftEmail.value, sync_calendar: draftCalendar.value, origin: "discovery" });
    if (!result.created) throw new Error(c.value.notCreated);
    if (selected.value.kind === "warranty" && draftReturnDeadline.value) {
      await api.reminders.createPersonal({ title: `${c.value.returnDeadline}: ${selected.value.entity_name}`, target_date: draftReturnDeadline.value, advance_days: [7, 1], email_self: draftEmail.value, sync_calendar: draftCalendar.value, origin: "discovery" }).catch(() => {});
    }
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
.scan-panel { padding: 24px; border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-card); }
.connection, .scan-controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
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
a { color: var(--brand-color); }
.empty-state { padding: 40px 0; }.review-form { margin-top: 20px; }
.review-form :deep(.n-checkbox) { display: flex; margin-bottom: 8px; }
.review-note { margin: 4px 0 12px; font-size: 13px; color: var(--text-secondary); }.date-input { width: 100%; padding: 10px; font: inherit; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; }
.agenda { border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
.agenda-row { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-bottom: 1px solid var(--border-color); border-inline-start: 3px solid var(--brand-color); }
.agenda-row:last-child { border-bottom: 0; }
.agenda-row:hover { background: var(--bg-hover); }
.agenda-row--urgent { border-inline-start-color: var(--color-warning); }
.agenda-row--missed { border-inline-start-color: var(--color-error); }
.agenda-date { width: 44px; flex: none; text-align: center; line-height: 1.15; color: var(--brand-color); }
.agenda-date strong { display: block; font-size: 20px; }
.agenda-date span { font-size: 11px; text-transform: uppercase; }
.agenda-row--urgent .agenda-date { color: var(--color-warning); }
.agenda-row--missed .agenda-date { color: var(--color-error); }
.agenda-main { flex: 1; min-width: 0; text-align: start; }
.agenda-title, .agenda-from { text-align: start; unicode-bidi: plaintext; }
.agenda-title { margin: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agenda-meta { display: flex; align-items: center; gap: 4px; margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); min-width: 0; flex-wrap: wrap; row-gap: 0; }
.agenda-from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex-shrink: 1; }
.agenda-quote { display: block; max-width: 420px; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) {
  .scan-panel { padding: 14px; }
  .stat-card { padding: 10px 12px; gap: 10px; }
  .stat-card strong { font-size: 20px; }
  .stat-card span { font-size: 11px; }
  .stat-card__icon { padding: 6px; }
  .scan-controls > .n-button { width: 100%; }
  .agenda-row { gap: 8px; padding: 10px 10px; }
  .agenda-date { width: 36px; }
  .agenda-date strong { font-size: 17px; }
  .agenda-meta { flex-wrap: wrap; row-gap: 2px; }
  .agenda-from { max-width: 100%; }
  .agenda-title { font-size: 14px; }
}
</style>
