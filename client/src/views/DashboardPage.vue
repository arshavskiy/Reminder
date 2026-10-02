<template>
  <div class="dash">
    <div v-if="needsOnboarding" class="dash__onboarding-reminder">
      <span>{{ l.dashboard.onboarding }}</span>
      <button type="button" class="dash__onboarding-reminder__btn" @click="openOnboarding">
        {{ l.dashboard.completeSetup }}
      </button>
    </div>
    <WhatsNewCard @upload="showUploadModal = true" />
    <QuickReminderModal v-model:show="showNewReminder" @created="refreshCalendar(true)" />
    <!-- ── Greeting + date ─────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <div
        v-if="
          hasFeature(FEATURES.dashboard.dropStrip) &&
          hasFeature(FEATURES.pages.documents)
        "
        class="dash__intake"
      >
        <button v-if="documentImportAllowed" class="dash__upload-btn" type="button" @click="showUploadModal = true">
          <span class="dash__upload-btn__icon">
            <n-icon :component="CloudUploadOutline" :size="20"/>
          </span>
          <span class="dash__upload-btn__text">{{ l.common.upload }}</span>
        </button>
        <n-tooltip v-else>
          <template #trigger>
            <button class="rbtn-sm rbtn-sm--disabled" type="button" @click="goToSubscription">
              <n-icon :component="CloudUploadOutline" class="btn-icon"/>
              {{ l.common.upload }}
            </button>
          </template>
          {{ l.profile.upgradePlan }}
        </n-tooltip>
        <div class="dash__intake-actions">
          <n-tooltip v-if="canCreateInspection && hasFeature(FEATURES.pages.contracts)" :disabled="writesAllowed">
            <template #trigger>
              <span class="dash__locked-action" @click="!writesAllowed && goToSubscription()">
                <button
                    :disabled="!writesAllowed"
                    class="rbtn-sm"
                    type="button"
                    @click="hydraulicModalRef?.open()"
                >
                  <n-icon :component="AddOutline" class="btn-icon"/>
                  {{ l.dashboard.newInspection }}
                </button>
              </span>
            </template>
            {{ l.profile.upgradePlan }}
          </n-tooltip>
          <button
            v-if="writesAllowed && (hasFeature(FEATURES.pages.reminders) || hasFeature(FEATURES.dashboard.calendar))"
            class="rbtn-sm rbtn-sm--primary"
            type="button"
            @click="showNewReminder = true"
          >
            + {{ l.reminders.newReminder }}
          </button>
          <button
            v-if="writesAllowed && (hasFeature(FEATURES.pages.reminders) || hasFeature(FEATURES.dashboard.calendar))"
            class="rbtn-sm"
            type="button"
            @click="showExtractModal = true"
          >
            <n-icon :component="DocumentTextOutline" class="btn-icon" />
            {{ l.uploadModal.importRemindersTitle }}
          </button>
        </div>
      </div>

      <!-- Quick stats — small chips line, easy to scan -->
      <div class="dash__stats">
        <div v-if="hasFeature(FEATURES.dashboard.statDocuments)" class="stat stat--link" role="link" tabindex="0" @click="goStat('/documents')" @keydown.enter="goStat('/documents')">
          <n-icon :component="DocumentTextOutline" :size="18" class="stat__icon" />
          <div>
            <span class="stat__num">{{ stats?.total_documents ?? 0 }}</span>
            <span class="stat__label">{{ l.dashboard.statDocuments }}</span>
          </div>
        </div>
        <div v-if="hasFeature(FEATURES.dashboard.statClients)" class="stat stat--link" role="link" tabindex="0" @click="goStat('/clients')" @keydown.enter="goStat('/clients')">
          <n-icon :component="PeopleOutline" :size="18" class="stat__icon" />
          <div>
            <span class="stat__num">{{ stats?.total_clients ?? 0 }}</span>
            <span class="stat__label">{{ l.dashboard.statClients }}</span>
          </div>
        </div>
        <div v-if="hasFeature(FEATURES.dashboard.statInspections)" class="stat stat--link" role="link" tabindex="0" @click="goStat('/documents')" @keydown.enter="goStat('/documents')">
          <n-icon :component="ConstructOutline" :size="18" class="stat__icon" />
          <div>
            <span class="stat__num">{{ stats?.total_inspections ?? 0 }}</span>
            <span class="stat__label">{{ l.dashboard.statInspections }}</span>
          </div>
        </div>
        <div
          v-if="hasFeature(FEATURES.dashboard.statPendingReminders)"
          class="stat stat--link"
          role="link" tabindex="0" @click="goStat('/reminders')" @keydown.enter="goStat('/reminders')"
        >
          <n-icon :component="AlarmOutline" :size="18" class="stat__icon stat__icon--accent" />
          <div>
            <span class="stat__num stat__num--accent">{{
              stats?.pending_reminders ?? 0
            }}</span>
            <span class="stat__label">{{ l.dashboard.statPending }}</span>
          </div>
        </div>
        <div
          v-if="
            hasFeature(FEATURES.dashboard.statExpiringSoon) &&
            (stats?.expiring_soon ?? 0) > 0
          "
          class="stat stat--link"
          role="link" tabindex="0" @click="goStat('/documents')" @keydown.enter="goStat('/documents')"
        >
          <n-icon :component="WarningOutline" :size="18" class="stat__icon stat__icon--warn" />
          <div>
            <span class="stat__num stat__num--warn">{{
              stats?.expiring_soon
            }}</span>
            <span class="stat__label">{{ l.dashboard.statExpiring }}</span>
          </div>
        </div>
        <template v-if="showInvoiceStats">
          <div class="stat stat--link" role="link" tabindex="0" @click="goStat('/invoices')" @keydown.enter="goStat('/invoices')">
            <n-icon :component="ReceiptOutline" :size="18" class="stat__icon" />
            <div>
              <span class="stat__num">{{ invoiceCounts.invoice }}</span>
              <span class="stat__label">{{ l.invoices.title }}</span>
            </div>
          </div>
          <div class="stat stat--link" role="link" tabindex="0" @click="goStat('/invoices')" @keydown.enter="goStat('/invoices')">
            <n-icon :component="CheckmarkCircleOutline" :size="18" class="stat__icon" />
            <div>
              <span class="stat__num">{{ invoiceCounts.receipt }}</span>
              <span class="stat__label">{{ l.common.receipts }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Reminders calendar ───────────────────────────────────────── -->
      <div v-if="hasFeature(FEATURES.dashboard.calendar)" class="calendar-pref">
        <span class="calendar-pref__label">{{ l.dashboard.testsOnly }}</span>
        <n-switch
          v-model:value="calendarNextTestsOnly"
          :loading="savingCalendarPreference"
          @update:value="saveCalendarPreference"
        />
      </div>
      <ReminderCalendar
        v-if="hasFeature(FEATURES.dashboard.calendar)"
        :loading="calendarLoading"
        :rows="calendarRows"
        :expiry-items="calendarExpiryItems"
        :tests-only="calendarNextTestsOnly"
        @open-monthly-report="openMonthlyReport"
        @month-change="onCalendarMonthChange"
        @refresh="refreshCalendar(true)"
      />
      <MonthlyReportModal
        v-model:show="showMonthlyReport"
        :initial-month-ms="monthlyReportMonthMs"
      />

      <HydraulicCheckModal
          ref="hydraulicModalRef"
          v-model:show="showHydraulicModal"
          @created="store.fetch(true)"
          @updated="store.fetch(true)"
      />

      <QuoteCreateModal
          v-model:show="showQuoteCreateModal"
          @created="store.fetch(true)"
      />

      <UploadModal
        ref="uploadModalRef"
        v-model="showUploadModal"
        :uploading="dashUploading"
        :rescan="rescanModalState"
        @upload="onDashUpload"
      />

      <ExtractRemindersModal
        v-model="showExtractModal"
        @reminders-saved="onTableImported"
      />

      <!-- ── Module cards ──────────────────────────────────────────────── -->
      <h2 v-if="hasFeature(FEATURES.dashboard.modules)" class="dash__section">
        {{ l.dashboard.workspace }}
      </h2>
      <div v-if="hasFeature(FEATURES.dashboard.modules)" class="module-grid">
        <article
          v-for="m in data_cards"
          :key="m.key"
          class="module"
          @click="router.push(m.to)"
        >
          <div class="module__body">
            <div class="module__head">
              <div class="module__icon">
                <n-icon :component="m.icon" :size="22" />
              </div>
              <div class="module__heading">
                <h3 class="module__title">{{ m.title }}</h3>
                <span v-if="m.count" class="module__count">{{
                  m.count()
                }}</span>
              </div>
            </div>
            <p class="module__desc">{{ m.desc }}</p>
            <span class="module__cta">{{ l.dashboard.open }}</span>
          </div>
        </article>
      </div>

      <!-- ── Two-column: recent docs + upcoming reminders ──────────────── -->
      <div class="dash__two-col">
        <section
          v-if="hasFeature(FEATURES.dashboard.recentDocuments)"
          class="panel"
        >
          <header class="panel__head">
            <h3>{{ l.dashboard.recentDocuments }}</h3>
            <router-link class="panel__more" :to="href('/documents')"
              >{{ l.dashboard.allDocuments }}
            </router-link>
          </header>
          <ul v-if="stats?.recent_documents?.length" class="panel__list">
            <li
              v-for="doc in stats.recent_documents"
              :key="doc.id"
              class="panel__row"
            >
              <router-link
                :to="href(`/documents/${doc.id}`)"
                class="panel__row-title"
              >
                {{ doc.file_name }}
              </router-link>
              <StatusBadge :status="doc.processing_status" />
            </li>
          </ul>
          <p v-else class="panel__empty">{{ l.dashboard.noDocuments }}</p>
        </section>

        <section
          v-if="hasFeature(FEATURES.dashboard.upcomingReminders)"
          class="panel"
        >
          <header class="panel__head">
            <h3>{{ l.dashboard.upcomingReminders }}</h3>
            <router-link class="panel__more" :to="href('/reminders')"
              >{{ l.dashboard.allReminders }}
            </router-link>
          </header>
          <ul v-if="stats?.upcoming_reminders?.length" class="panel__list">
            <li
              v-for="r in stats.upcoming_reminders"
              :key="r.id"
              class="panel__row"
            >
              <div class="panel__row-stack">
                <strong class="panel__row-title">{{ r.title }}</strong>
                <span v-if="r.client_name" class="panel__row-sub">{{
                  r.client_name
                }}</span>
              </div>
              <span class="panel__row-date">{{ r.trigger_date }}</span>
            </li>
          </ul>
          <p v-else class="panel__empty">{{ l.dashboard.noUpcoming }}</p>
        </section>

        <section v-if="showInvoiceStats && dueSoon.length" class="panel">
          <header class="panel__head">
            <h3>{{ l.dashboard.dueSoonTitle }}</h3>
            <router-link class="panel__more" :to="href('/invoices')">{{ l.dashboard.allInvoices }}</router-link>
          </header>
          <ul class="panel__list">
            <li v-for="inv in dueSoon" :key="inv.id" class="panel__row">
              <div class="panel__row-stack">
                <router-link class="panel__row-title" :to="href('/invoices/' + inv.id)">{{ inv.supplier_name || l.dashboard.unknownSupplier }}</router-link>
                <span class="panel__row-sub" dir="ltr">{{ inv.amount_display }}</span>
              </div>
              <span class="panel__row-date" :class="{ 'panel__row-date--late': inv.daysLeft < 0 }">
                {{ inv.payment_due_date }} · {{ dueLabel(inv.daysLeft) }}
              </span>
              <n-tooltip>
                <template #trigger>
                  <button class="btn btn--ghost btn--xs icon-btn" type="button" :aria-label="l.dashboard.addReminder" :disabled="remindedIds.has(inv.id)" @click="remindAboutInvoice(inv)">
                    <n-icon :component="remindedIds.has(inv.id) ? CheckmarkCircleOutline : AlarmOutline" :size="16" />
                  </button>
                </template>
                {{ l.dashboard.addReminder }}
              </n-tooltip>
            </li>
          </ul>
        </section>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {clearSharedFiles, readSharedFiles} from "../utils/sharedFiles.js";
import {NIcon, NSpin, NSwitch, NTooltip, useMessage} from "naive-ui";
import {
  AddOutline,
  AlarmOutline,
  CheckmarkCircleOutline,
  ClipboardOutline,
  CloudUploadOutline,
  ConstructOutline,
  DocumentTextOutline,
  ExtensionPuzzleOutline,
  LocationOutline,
  MailOutline,
  PeopleOutline,
  ReceiptOutline,
  SearchOutline,
  SettingsOutline,
  WalletOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import {useDashboardStore} from "../stores/dashboard.js";
import {useRemindersStore} from "../stores/reminders.js";
import {useAuthStore} from "../stores/auth.js";
import {
  PAID_PLAN_IDS,
  planAllowsDocumentImport,
  PLAN_GATE_MESSAGES,
  planMeetsMinimum,
  resolveUserPlan,
  type PlanId
} from "../shared/pricingPlans.js";
import {useRescanModalStore} from "../stores/rescanModal.js";
import {useFeaturesStore} from "../stores/features.js";
import {useUserSettingsStore} from "../stores/userSettings.js";
import type {ExpiryCalendarItem, InvoiceDueSoon, ObligationSuggestion} from "../services/apiService.js";
import {api} from "../services/apiService.js";
import type {DocTemplate} from "../shared/types.js";
import {type FeatureKey, FEATURES} from "../shared/features.js";
import StatusBadge from "../components/StatusBadge.vue";
import ReminderCalendar from "../components/ReminderCalendar.vue";
import UploadModal from "../components/UploadModal.vue";
import WhatsNewCard from "../components/WhatsNewCard.vue";
import QuickReminderModal from "../components/QuickReminderModal.vue";
import type { UploadOptions } from "../components/UploadModal.vue";
import ExtractRemindersModal from "../components/ExtractRemindersModal.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import QuoteCreateModal from "../components/QuoteCreateModal.vue";
import GmailLogo from "../components/GmailLogo.vue";
import {useOnboarding} from "../composables/useOnboarding.js";
import {useI18n} from "../composables/useI18n.js";

const hydraulicModalRef = ref<InstanceType<typeof HydraulicCheckModal> | null>(null);
const {l, t, href, locale, canCreateInspection} = useI18n();
function onTableImported() {
  calendarNextTestsOnly.value = false;
  store.fetch(true);
  refreshCalendar(true);
}
const showHydraulicModal = ref(false);
const store = useDashboardStore();
const remindersStore = useRemindersStore();
const authStore = useAuthStore();
// Hidden entirely on a plan without file import — the digital plan enters its
// data through the forms, so a drop strip there has nothing to accept.
const currentPlan = computed(() => resolveUserPlan(authStore.user));
const documentImportAllowed = computed(() => planAllowsDocumentImport(currentPlan.value));
const writesAllowed = computed(() => currentPlan.value !== "expired");

function goToSubscription() {
  router.push({path: href("/profile"), query: {section: "subscription"}});
}
const featuresStore = useFeaturesStore();
const userSettingsStore = useUserSettingsStore();
const router = useRouter();
const route = useRoute();
const message = useMessage();
const {openOnboarding} = useOnboarding();
const needsOnboarding = computed(() => {
  return Boolean(authStore.user && !(authStore.user as any).onboarding_completed);
});

// Files shared to the installed PWA arrive here through /share-target (see sw.ts).
async function openSharedFiles() {
  if (route.query.shared !== "1") return;
  try {
    const shared = await readSharedFiles();
    await clearSharedFiles();
    if (shared.length && documentImportAllowed.value) {
      showUploadModal.value = true;
      await nextTick();
      uploadModalRef.value?.addFiles(shared);
    }
  } catch {
    // Shared files are a convenience; the normal upload button still works.
  } finally {
    void router.replace({ path: route.path });
  }
}

const rescanStore = useRescanModalStore();
const showUploadModal = ref(false);
const showExtractModal = ref(false);
const dashUploading = ref(false);
const uploadModalRef = ref<InstanceType<typeof UploadModal> | null>(null);
let rescanPollTimer: ReturnType<typeof setInterval> | null = null;

const rescanModalState = computed(() => ({
  queued: rescanStore.queued,
  remaining: rescanStore.remaining,
  done: rescanStore.done,
  kind: rescanStore.kind,
  rows: rescanStore.rows,
}));

async function onDashUpload(
  files: File[],
  options: UploadOptions,
) {
  dashUploading.value = true;
  try {
    const { ids, duplicates } = await api.documents.upload(files, options, options.templateId);
    rescanStore.start({ queued: ids.length, ids, duplicates, kind: "upload" });
    store.fetch(true);
    uploadModalRef.value?.openRescan();
    startUploadPolling(ids);
  } catch (e: any) {
    if (e?.message === "document_limit_reached" || e?.message === "document_monthly_limit_reached") {
      message.warning(l.value.dashboard.quotaWarning);
    } else {
      message.error(String(e));
    }
  } finally {
    dashUploading.value = false;
  }
}

function stopRescanPolling() {
  if (rescanPollTimer) {
    clearInterval(rescanPollTimer);
    rescanPollTimer = null;
  }
}

function startUploadPolling(uploadIds: string[]) {
  stopRescanPolling();
  const watchIds = new Set(uploadIds.map(String));
  if (!watchIds.size) return;

  let attempts = 0;
  rescanPollTimer = setInterval(async () => {
    attempts += 1;
    try {
      const { rows } = await api.documents.list({ limit: uploadIds.length + 10 }, true);
      const watched = rows.filter((row: any) => watchIds.has(String(row.id)));
      const duplicateSet = new Set(rescanStore.duplicateIds);
      rescanStore.updateRows(watched.map((row: any) => ({
        id: row.id,
        file_name: row.file_name,
        processing_status: row.processing_status,
        reminder_status: row.reminder_status ?? null,
        reminder_date: row.reminder_date ?? null,
        document_type: row.document_type ?? null,
        error_message: row.error_message ?? null,
      })));
      const running = watched.filter((row: any) => row.processing_status === "queued" || row.processing_status === "processing");
      rescanStore.setRemaining(running.length);

      if (running.length === 0 && watched.length > 0) {
        stopRescanPolling();
        rescanStore.markDone();
        store.fetch(true);
        const completed = watched.filter((row: any) => row.processing_status === "done").length;
        const failed = watched.filter((row: any) => row.processing_status === "error").length;
        if (failed) {
          message.warning(t("documentsMsg.uploadDoneErrors", { completed, failed }));
        } else {
          message.success(t("documentsMsg.uploadDone", { completed }));
        }
      } else if (attempts >= 40) {
        stopRescanPolling();
        rescanStore.markBackground();
        message.info(l.value.documentsMsg.scanStillRunning);
      }
    } catch {
      if (attempts >= 3) stopRescanPolling();
    }
  }, 3000);
}
const stats = computed(() => store.stats);

// Invoice and receipt totals come from the invoices list facets, so the card
// needs no extra dashboard endpoint. Shown only when the expenses page is
// enabled in settings and the plan includes it.
const showInvoiceStats = computed(() =>
  hasFeature(FEATURES.pages.invoices) && planMeetsMinimum(resolveUserPlan(authStore.user), "business" as PlanId),
);
const invoiceCounts = ref({invoice: 0, receipt: 0});
function goStat(path: string) {
  router.push(href(path));
}
const dueSoon = ref<InvoiceDueSoon[]>([]);
const remindedIds = ref(new Set<string>());
function dueLabel(days: number): string {
  if (days === 0) return l.value.dashboard.dueToday;
  if (days === 1) return l.value.dashboard.dueTomorrow;
  return (days > 0 ? l.value.dashboard.dueInDays : l.value.dashboard.overdueDays).replace("{n}", String(Math.abs(days)));
}
async function remindAboutInvoice(inv: InvoiceDueSoon) {
  try {
    const result = await api.reminders.createPersonal({
      title: `${l.value.dashboard.payPrefix}: ${inv.supplier_name || l.value.dashboard.unknownSupplier} ${inv.amount_display}`.trim(),
      target_date: inv.payment_due_date,
      remind_before_days: [1, 0],
      reminder_category: "Personal",
    });
    if (!result.created) throw new Error("not_created");
    remindedIds.value = new Set([...remindedIds.value, inv.id]);
    message.success(l.value.dashboard.reminderAdded);
  } catch {
    message.error(l.value.dashboard.reminderFailed);
  }
}
async function loadInvoiceCounts() {
  if (!showInvoiceStats.value) return;
  try {
    const [result, due] = await Promise.all([
      api.invoices.list({limit: 1}, true),
      api.invoices.dueSoon(14).catch(() => ({items: [] as InvoiceDueSoon[]})),
    ]);
    dueSoon.value = due.items;
    invoiceCounts.value = {
      invoice: result.documentCategoryCounts?.invoice ?? 0,
      receipt: result.documentCategoryCounts?.receipt ?? 0,
    };
  } catch {
    invoiceCounts.value = {invoice: 0, receipt: 0};
  }
}
const expiryItems = ref<ExpiryCalendarItem[]>([]);
// Extra calendar events beside the contract expiries: unpaid invoices (the "due soon"
// panel) and new suggestions from the discovery page. Each loads only when its feature is on.
const showNewReminder = ref(false);
const calendarInvoices = ref<InvoiceDueSoon[]>([]);
const calendarDiscoveries = ref<ObligationSuggestion[]>([]);
const calendarExpiryItems = computed<ExpiryCalendarItem[]>(() => [
  ...expiryItems.value,
  ...calendarInvoices.value.map(invoiceCalendarItem),
  ...calendarDiscoveries.value.map(discoveryCalendarItem),
]);
const loadingExpiryItems = ref(false);
const calendarNextTestsOnly = ref(true);
const savingCalendarPreference = ref(false);
const gmailInspectionLoading = ref(false);
const showMonthlyReport = ref(false);
const monthlyReportMonthMs = ref<number | null>(null);
const showQuoteCreateModal = ref(false);
function hasFeature(feature: FeatureKey): boolean {
  return featuresStore.hasFeature(feature);
}

const calendarRows = computed(() => {
  if (!calendarNextTestsOnly.value) return remindersStore.rows;
  return remindersStore.rows.filter((row) => row.source_type === "personal");
});
const calendarLoading = computed(
  () =>
    loadingExpiryItems.value ||
    (!calendarNextTestsOnly.value && remindersStore.loading),
);

function openMonthlyReport(monthMs?: number) {
  monthlyReportMonthMs.value = monthMs ?? Date.now();
  showMonthlyReport.value = true;
}

onMounted(async () => {
  void openSharedFiles();
  // Always refetch fresh — stats can go stale after a client/contract/document
  // is deleted elsewhere, and the cached singleton would otherwise show the old
  // count until a hard reload.
  store.fetch(true);
  await Promise.all([
    featuresStore.fetchFeatures().catch(() => {}),
    loadCalendarPreference(),
  ]);
  loadInvoiceCounts();
  if (hasFeature(FEATURES.dashboard.calendar)) {
    refreshCalendar(false);
  }
  continuePendingGmailInspectionImport();
});

onUnmounted(() => stopRescanPolling());

async function loadCalendarPreference() {
  try {
    const settings = await userSettingsStore.load();
    calendarNextTestsOnly.value = Boolean(settings.calendar_next_tests_only);
  } catch {
    calendarNextTestsOnly.value = false;
  }
}

async function saveCalendarPreference(value: boolean) {
  savingCalendarPreference.value = true;
  try {
    await userSettingsStore.save({ calendar_next_tests_only: value });
    await refreshCalendar(true);
  } catch (err) {
    calendarNextTestsOnly.value = !value;
    message.error(
      err instanceof Error ? err.message : "שגיאה בשמירת הגדרת הלוח",
    );
  } finally {
    savingCalendarPreference.value = false;
  }
}

/**
 * The month the calendar is showing, so the request covers that window rather
 * than every contract on the account. Null until the calendar reports one, which
 * keeps the very first load working before any month has been announced.
 */
const calendarRange = ref<{ from: string; to: string } | null>(null);

function onCalendarMonthChange(range: { from: string; to: string }) {
  // The calendar re-announces its month on mount and on every navigation, and
  // other things refresh it too, so without this guard the same window is
  // fetched repeatedly — ten calls in eight seconds in production.
  const current = calendarRange.value;
  if (current && current.from === range.from && current.to === range.to) return;
  calendarRange.value = range;
  refreshCalendar(true);
}

function visibleCalendarRange(): { from: string; to: string } {
  if (calendarRange.value) return calendarRange.value;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}`};
}

function dayDiffFromToday(iso: string): number {
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function invoiceCalendarItem(inv: InvoiceDueSoon): ExpiryCalendarItem {
  return {
    id: `invoice-${inv.id}`, invoice_id: inv.id, kind: "invoice", document_id: null,
    expiry_date: inv.payment_due_date, contract_type: null, contract_number: null,
    client_name: null, contact_person: null, contact_email: null, contact_phone: null, equipment_name: null,
    supplier_name: inv.supplier_name, amount_display: inv.amount_display,
    days_until: inv.daysLeft, urgency: inv.daysLeft < 0 ? "overdue" : inv.daysLeft <= 7 ? "critical" : "warning",
  };
}

function discoveryCalendarItem(item: ObligationSuggestion): ExpiryCalendarItem {
  const days = dayDiffFromToday(item.due_date);
  return {
    id: `discovery-${item.id}`, kind: "discovery", title: item.title, document_id: null,
    expiry_date: item.due_date, contract_type: null, contract_number: null,
    client_name: null, contact_person: null, contact_email: null, contact_phone: null, equipment_name: null,
    days_until: days, urgency: days < 0 ? "overdue" : days <= 7 ? "critical" : "warning",
  };
}

async function loadCalendarInvoices() {
  if (!showInvoiceStats.value) { calendarInvoices.value = []; return; }
  try {
    const {from, to} = visibleCalendarRange();
    calendarInvoices.value = (await api.invoices.dueInRange(from, to)).items;
  } catch {
    calendarInvoices.value = [];
  }
}

async function loadCalendarDiscoveries() {
  if (!hasFeature(FEATURES.pages.discovery)) { calendarDiscoveries.value = []; return; }
  try {
    const {from, to} = visibleCalendarRange();
    // Only suggestions still waiting for a decision; created or dismissed ones are not events.
    calendarDiscoveries.value = (await api.gmail.discoveries()).proposals
      .filter((item) => item.status === "new" && item.due_date >= from && item.due_date <= to);
  } catch {
    calendarDiscoveries.value = [];
  }
}

async function refreshCalendar(force: boolean) {
  if (force || !remindersStore.rows.length) {
    remindersStore.fetch({ limit: 200 }, force);
  }
  loadingExpiryItems.value = true;
  try {
    // "Next tests only" is an open-ended forward look, so it keeps its own
    // from-today filter; otherwise fetch just the visible month.
    const params = calendarNextTestsOnly.value
      ? { from: todayIso() }
      : calendarRange.value ?? undefined;
    expiryItems.value = await api.equipment.expiryCalendar(params);
  } catch {
    expiryItems.value = [];
  }
  try {
    await Promise.all([loadCalendarInvoices(), loadCalendarDiscoveries()]);
  } finally {
    loadingExpiryItems.value = false;
  }
}

async function openGmailInspectionImport(options: { skipConnect?: boolean } = {}) {
  gmailInspectionLoading.value = true;
  try {
    const status = await api.gmail.status();
    if (status.connected) {
      const template = await findInspectionTemplate();
      const result = await api.gmail.importAll(inspectionGmailQuery(template), undefined, template?.id ? String(template.id) : undefined);
      const imported = result.imported ?? 0;
      const failed = result.results.filter((item) => item.error).length;
      if (imported) {
        message.success(`יובאו ${imported} תסקירי בדיקה מ-Gmail`);
        store.fetch(true);
        refreshCalendar(true);
      } else if (failed) {
        message.warning("לא יובאו תסקירים. חלק מהקבצים נכשלו בעיבוד.");
      } else {
        message.info("לא נמצאו תסקירי בדיקה חדשים לייבוא");
      }
      return;
    }
    if (options.skipConnect) {
      message.error("Gmail לא מחובר");
      return;
    }
    sessionStorage.setItem("dashboard:gmail-inspection-import", "1");
    const { url } = await api.gmail.authUrl("/");
    window.location.assign(url);
  } catch (err) {
    sessionStorage.removeItem("dashboard:gmail-inspection-import");
    message.error(err instanceof Error ? err.message : "שגיאה בחיבור ל-Gmail");
  } finally {
    gmailInspectionLoading.value = false;
  }
}

function continuePendingGmailInspectionImport() {
  if (sessionStorage.getItem("dashboard:gmail-inspection-import") !== "1") return;
  sessionStorage.removeItem("dashboard:gmail-inspection-import");
  openGmailInspectionImport({ skipConnect: true });
}

async function findInspectionTemplate(): Promise<DocTemplate | null> {
  const templates = await api.docTemplates.list();
  return templates.find((template) =>
    template.document_kind === "inspection_report" || /תסקיר|בדיקה|ציוד|הרמה/i.test(template.name)
  ) ?? null;
}

function inspectionGmailQuery(template: DocTemplate | null): string {
  const parts = [
    "has:attachment",
    "{filename:pdf filename:doc filename:docx}",
  ];
  const terms = inspectionTemplateTerms(template);
  if (terms.length === 1) {
    parts.push(formatGmailSearchTerm(terms[0]));
  } else if (terms.length > 1) {
    parts.push(`{${terms.map(formatGmailSearchTerm).join(" ")}}`);
  }
  parts.push("newer_than:16m");
  return parts.join(" ");
}

function inspectionTemplateTerms(template: DocTemplate | null): string[] {
  if (!template) return ["תסקיר", "בדיקה", "inspection", "report"];
  const candidates = [
    template.name,
    template.document_kind !== "unknown" ? template.document_kind : "",
    ...(template.match_keywords ?? []),
  ];
  const seen = new Set<string>();
  return candidates
    .map((term) => String(term ?? "").trim())
    .filter((term) => term.length >= 3)
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function formatGmailSearchTerm(term: string): string {
  return `"${term.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

const userName = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  // Use first name only if full name available, else email prefix
  const name = u.name?.trim();
  if (name) return name.split(" ")[0];
  return u.email?.split("@")[0] ?? "";
});

// "בוקר טוב / צהריים טובים / ערב טוב / לילה טוב" by local hour
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 21) return "ערב טוב";
  return "לילה טוב";
});

// Hebrew-formatted date: יום רביעי, 20 במאי 2026
const dateLine = computed(() => {
  const d = new Date();
  return d.toLocaleDateString(locale.value === "en" ? "en-US" : "he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const modules = computed(() => {
  const m = l.value.dashboard.modules;
  const userPlan = resolveUserPlan(authStore.user);
  return [
  {
    key: "documents",
    feature: FEATURES.pages.documents,
    minPlan: "expired" as PlanId,
    title: m.documentsTitle,
    desc: m.documentsDesc,
    count: () => stats.value?.total_documents ?? 0,
    icon: ClipboardOutline,
    to: href("/contracts"),
    show: true,
  },
  {
    key: "contracts",
    feature: FEATURES.pages.contracts,
    minPlan: "expired" as PlanId,
    title: m.inspectionsTitle,
    desc: m.inspectionsDesc,
    count: () => stats.value?.total_inspections ?? 0,
    icon: ClipboardOutline,
    to: href("/contracts"),
    show: true,
  },
  {
    key: "equipment",
    feature: FEATURES.pages.equipment,
    minPlan: "expired" as PlanId,
    title: m.equipmentTitle,
    desc: m.equipmentDesc,
    count: () => stats.value?.total_equipment ?? 0,
    icon: ConstructOutline,
    to: href("/equipment"),
    show: true,
  },
  {
    key: "clients",
    feature: FEATURES.pages.clients,
    minPlan: "expired" as PlanId,
    title: m.clientsTitle,
    desc: m.clientsDesc,
    count: () => stats.value?.total_clients ?? 0,
    icon: PeopleOutline,
    to: href("/clients"),
    show: true,
  },
  {
    key: "doc-templates",
    feature: FEATURES.pages.docTemplates,
    minPlan: PAID_PLAN_IDS,
    title: m.docTemplatesTitle,
    desc: m.docTemplatesDesc,
    count: () => stats.value?.total_email_templates ?? 0,
    icon: ExtensionPuzzleOutline,
    to: href("/settings/doc-templates"),
    show: true,
  },
  {
    key: "email-templates",
    feature: FEATURES.pages.emailTemplates,
    minPlan: "business" as PlanId,
    title: m.emailTemplatesTitle,
    desc: m.emailTemplatesDesc,
    count: () => stats.value?.total_email_templates ?? 0,
    icon: MailOutline,
    to: href("/settings/email-templates"),
    show: authStore.user?.role === "admin",
  },
  {
    key: "reminders",
    feature: FEATURES.pages.reminders,
    minPlan: "expired" as PlanId,
    title: m.remindersTitle,
    desc: m.remindersDesc,
    count: () => stats.value?.pending_reminders ?? 0,
    icon: AlarmOutline,
    to: href("/reminders"),
    show: true,
  },
  {
    key: "invoices",
    feature: FEATURES.pages.invoices,
    minPlan: "business" as PlanId,
    title: m.invoicesTitle,
    desc: m.invoicesDesc,
    icon: WalletOutline,
    to: href("/invoices"),
    show: true,
  },
  {
    key: "discovery",
    feature: FEATURES.pages.discovery,
    minPlan: "expired" as PlanId,
    title: m.discoveryTitle,
    desc: m.discoveryDesc,
    icon: SearchOutline,
    to: href("/discover-reminders"),
    show: true,
  },
  {
    key: "gmail",
    feature: FEATURES.pages.gmail,
    minPlan: "expired" as PlanId,
    title: m.gmailTitle,
    desc: m.gmailDesc,
    icon: MailOutline,
    to: href("/gmail"),
    show: authStore.user?.role === "admin",
  },
  {
    key: "field",
    feature: FEATURES.pages.field,
    minPlan: "business" as PlanId,
    title: m.fieldTitle,
    desc: m.fieldDesc,
    icon: LocationOutline,
    to: href("/field"),
    show: true,
  },
  {
    key: "quotes",
    feature: FEATURES.pages.contracts,
    minPlan: "expired" as PlanId,
    title: m.quotesTitle,
    desc: m.quotesDesc,
    icon: ReceiptOutline,
    to: href("/quotes"),
    show: true,
  },
  ].filter((item) => item.show && hasFeature(item.feature) && planMeetsMinimum(userPlan, item.minPlan));
});

const data_cards = computed(() => modules.value);
</script>

<style scoped>
.dash {
  max-width: 1200px;
  margin: 0 auto;
}

.dash__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dash__onboarding-reminder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 10px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-color) 30%, var(--border-color));
  font-size: 13px;
  color: #fff;
}

.dash__onboarding-reminder__btn {
  flex-shrink: 0;
  border: 1px solid var(--brand-color);
  background: var(--brand-color);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.dash__onboarding-reminder__btn:hover {
  opacity: 0.9;
}

.dash__header {
  margin-bottom: 32px;
}
.dash__greet {
  font-size: 38px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.5px;
}
.dash__sub {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.calendar-pref {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  gap: 10px;
  justify-content: flex-start;
  margin: 0 0 10px;
}

.calendar-pref__label {
  font-size: 13px;
  font-weight: 600;
}

/* ── Stats chips ──────────────────────────────────────────────────────── */
.dash__intake {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.dash__intake-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dash__locked-action {
  display: inline-flex;
}

.dash__locked-action button:disabled {
  pointer-events: none;
}
.rbtn-sm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}
.rbtn-sm:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
.rbtn-sm:active { transform: scale(0.97); }
.rbtn-sm :deep(.n-icon) { color: var(--brand-color); }
.rbtn-sm--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}
.rbtn-sm--primary:hover {
  background: var(--brand-color);
  border-color: var(--brand-color);
  filter: brightness(1.06);
}
.rbtn-sm--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--border-color);
}

.dash__upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 20px;
  border: 1.5px solid var(--brand-color);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.14), rgba(32, 128, 240, 0.08)), var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(24, 160, 88, 0.12);
  transition: transform 0.12s, box-shadow 0.15s, border-color 0.15s;
}
.dash__upload-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(24, 160, 88, 0.18);
  border-color: var(--brand-color);
}
.dash__upload-btn:active { transform: scale(0.97); }
.dash__upload-btn__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-color);
  color: #fff;
  box-shadow: 0 4px 10px rgba(24, 160, 88, 0.22);
}
.dash__upload-btn__text {
  letter-spacing: 0.02em;
}

@media (max-width: 720px) {
  .dash__intake {
    flex-direction: column;
  }

  .dash__intake-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

.dash__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 15px;
}
.stat {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px 22px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 130px;
}
.stat--link {
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.stat--link:hover,
.stat--link:focus-visible {
  border-color: var(--brand-color);
  background: var(--bg-hover);
  outline: none;
}
.stat > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat__icon {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--brand-color);
  opacity: 0.85;
}
.stat__icon--accent {
  color: var(--brand-color);
}
.stat__icon--warn {
  color: var(--color-warning);
}
.stat__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.stat__num--accent {
  color: var(--brand-color);
}
.stat__num--warn {
  color: var(--color-warning);
}
.stat__label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Section heading ─────────────────────────────────────────────────── */
.dash__section {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

/* ── Module grid ─────────────────────────────────────────────────────── */
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
  margin-bottom: 40px;
}
.module {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 22px;
  cursor: pointer;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    transform var(--transition);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.module:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.module__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.module__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex: 0 0 44px;
  background: rgba(99, 226, 183, 0.14);
  color: var(--brand-color);
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme="light"] .module__icon {
  background: rgba(24, 160, 88, 0.1);
}

.module__heading {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  min-width: 0;
}
.module__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.module__count {
  margin-inline-start: auto;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-color);
  line-height: 1;
}
.module__desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.module__cta {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-color);
}

/* ── Two-column panels ───────────────────────────────────────────────── */
.dash__two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 900px) {
  .dash__two-col {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px 22px;
}
.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.panel__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.panel__more {
  font-size: 13px;
  color: var(--brand-color);
  text-decoration: none;
}

.panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.panel__row:last-child {
  border-bottom: none;
}
.panel__row-title {
  color: var(--text-primary);
  font-size: 13px;
  text-decoration: none;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel__row-title:hover {
  color: var(--brand-color);
}
.panel__row-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.panel__row-date--late {
  color: var(--color-error);
}
.panel__row-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.panel__row-date {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
.panel__empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 18px 0 6px;
  margin: 0;
}

@media (max-width: 680px) {
  .dash {
    max-width: none;
    width: 100%;
  }

  .dash__topbar {
    margin-bottom: 10px;
  }

  /* Three stat cards per row on phones; each stacks its icon above the number so it fits. */
  .dash__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 24px;
  }

  .stat {
    min-width: 0;
    padding: 10px 10px;
    border-radius: 12px;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .stat__icon {
    margin-top: 0;
  }

  .stat__num {
    font-size: 22px;
  }

  /* Two workspace cards per row on phones, with a compact card. */
  .module-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 28px;
  }

  .module {
    padding: 12px;
    gap: 8px;
    border-radius: 14px;
  }

  .module:hover {
    transform: none;
  }

  .module__icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
    border-radius: 10px;
  }

  .module__title {
    font-size: 14px;
  }

  .module__desc {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .module__cta {
    font-size: 12px;
  }

  .panel {
    padding: 16px;
    border-radius: 14px;
  }

  .panel__row {
    align-items: flex-start;
  }

  .panel__row-title {
    flex: 1 1 auto;
    max-width: 100%;
  }
}

@media (max-width: 430px) {
  .dash__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .stat {
    min-height: 0;
    padding: 8px 9px;
    gap: 4px;
  }

  .stat__icon {
    font-size: 15px;
  }

  .stat__num {
    font-size: 20px;
  }

  .stat__label {
    font-size: 11px;
    line-height: 1.3;
  }

  .dash__section {
    font-size: 16px;
  }

  .module__head,
  .module__heading {
    align-items: flex-start;
  }

  .module__heading {
    flex-direction: column;
    gap: 6px;
  }

  .module__count {
    margin-inline-start: 0;
  }

  .panel__head {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .panel__row {
    flex-direction: column;
    gap: 6px;
  }

  .panel__row-date {
    white-space: normal;
  }
}
</style>
