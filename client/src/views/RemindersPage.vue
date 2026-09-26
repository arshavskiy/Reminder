<template>
  <div class="reminders-page" :dir="dir">
    <header class="reminders-hero">
      <div class="reminders-hero__copy">
        <h1>{{ l.reminders.title }}</h1>
        <p>{{ l.reminders.subtitle }}</p>
      </div>
      <div class="reminders-actions">
        <button class="rbtn rbtn--ghost" :disabled="store.loading" @click="load">
          <n-icon :class="{ 'refresh-icon--spin': store.loading }" :component="RefreshOutline" class="btn-icon"/>
          {{ l.common.refresh }}
        </button>
        <button
            v-if="!reminderCreatesAllowed"
            class="rbtn rbtn--primary"
            type="button"
            @click="goToSubscription"
        >
          {{ l.profile.upgradePlan }}
        </button>
        <button
            v-else
            :disabled="loadingEmailTemplates"
            class="rbtn rbtn--primary"
            @click="openCreate"
        >
          + {{ l.reminders.newReminder }}
        </button>
        <button v-if="reminderCreatesAllowed" class="rbtn rbtn--ghost" type="button" @click="showImportModal = true">
          <n-icon :component="DocumentTextOutline" class="btn-icon"/>
          {{ l.uploadModal.importRemindersTitle }}
        </button>
        <div class="bulk-action-anchor">
          <button
            class="rbtn rbtn--ghost"
            :class="{ 'rbtn--ghost-active': bulkMode }"
            :title="l.reminders.multiSelect"
            @click="toggleBulkMode"
          >
            <n-icon :component="CheckboxOutline" class="btn-icon"/>
            {{ l.reminders.multiSelect }}
          </button>
          <div v-if="bulkMode && selectedReminderKeys.length > 0" class="bulk-action-anchor__actions">
            <button
              class="bulk-action-item bulk-action-item--primary"
              :class="{ 'bulk-action-item--loading': bulkSending }"
              :disabled="bulkSending"
              @click="bulkSendSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="PaperPlaneOutline" />
              <span class="bulk-action-item__text">{{ l.common.sendSelected }}</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
            <button
              class="bulk-action-item"
              :class="{ 'bulk-action-item--loading': bulkDismissing }"
              :disabled="bulkDismissing"
              @click="bulkDismissSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="CloseCircleOutline" />
              <span class="bulk-action-item__text">{{ l.common.dismissSelected }}</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
            <button
              class="bulk-action-item bulk-action-item--danger"
              :class="{ 'bulk-action-item--loading': bulkDeleting }"
              :disabled="bulkDeleting"
              @click="bulkDeleteSelected"
            >
              <n-icon class="bulk-action-item__icon" :component="TrashOutline" />
              <span class="bulk-action-item__text">{{ l.common.deleteSelected }}</span>
              <span class="bulk-action-item__count">{{ selectedReminderKeys.length }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <n-alert
      v-if="!testEmail"
      type="warning"
      class="reminders-alert"
      :show-icon="false"
    >
      {{ l.remindersMsg.testSetupHint }}
      <router-link to="/settings" style="color: #63e2b7">{{ l.remindersMsg.emailSettings }}</router-link>
    </n-alert>

    <section class="reminders-summary">
      <button
        v-for="item in reminderStats"
        :key="item.key"
        class="summary-card"
        :class="`summary-card--${item.tone}`"
        type="button"
        @click="applySummaryFilter(item)"
      >
        <span class="summary-card__label">{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </button>
    </section>

    <section class="reminders-panel">
      <div class="reminders-panel__head">
        <div>
          <h2>{{ l.reminders.listTitle }}</h2>
          <p>{{ t("reminders.listCount", {shown: filteredRows.length, total: store.rows.length}) }}</p>
        </div>
      </div>

      <div class="reminders-controls">
        <n-input
          v-model:value="search"
          class="reminders-search"
          clearable
          :placeholder="l.reminders.searchPlaceholder"
        />
        <n-select
          v-model:value="statusFilter"
          class="reminders-status-select"
          :options="statusOptions"
          :virtual-scroll="false"
          :placeholder="l.reminders.allStatuses"
          clearable
          @update:value="load"
        />
      </div>

      <div class="quick-filterbar">
        <button
          v-for="f in dueFilters"
          :key="f.value"
          class="quick-pill"
          :class="{ 'quick-pill--active': dueFilter === f.value }"
          type="button"
          @click="dueFilter = f.value"
        >
          {{ f.label }}
          <span>{{ f.count }}</span>
        </button>
      </div>

      <div v-if="categoryViewActive" class="reminders-body">
        <aside class="reminders-categories">
          <button
            class="quick-pill"
            :class="{ 'quick-pill--active': categoryFilter === null }"
            type="button"
            @click="selectCategory(null)"
          >
            {{ l.common.all }}
            <span>{{ reminderCategories.reduce((sum, c) => sum + c.count, 0) }}</span>
          </button>
          <button
            v-for="c in reminderCategories"
            :key="c.name"
            class="quick-pill"
            :class="{ 'quick-pill--active': categoryFilter === c.name }"
            type="button"
            @click="selectCategory(c.name)"
          >
            {{ categoryLabel(c.name, locale) }}
            <span>{{ c.count }}</span>
          </button>
        </aside>
        <n-data-table
          :columns="columns"
          :data="filteredRows"
          :loading="store.loading"
          :pagination="{ pageSize: 20 }"
          :row-key="(r: any) => r.id"
          :row-props="rowProps"
          :checked-row-keys="selectedReminderKeys"
          :scroll-x="1600"
          class="reminders-table reminders-table--with-sidebar"
          size="small"
          @update:checked-row-keys="onSelectedReminderKeys"
        />
      </div>
      <n-data-table
        v-else
        :columns="columns"
        :data="filteredRows"
        :loading="store.loading"
        :pagination="{ pageSize: 20 }"
        :row-key="(r: any) => r.id"
        :row-props="rowProps"
        :checked-row-keys="selectedReminderKeys"
        :scroll-x="1600"
        class="reminders-table"
        size="small"
        @update:checked-row-keys="onSelectedReminderKeys"
      />
    </section>

    <!-- Quick-test modal -->
    <n-modal v-model:show="showQuickTest" :title="l.remindersMsg.quickTestTitle" :show-icon="false" preset="dialog" style="width: 420px; max-width: 95vw">
      <n-form label-placement="top">
        <n-form-item :label="l.remindersMsg.recipient">
          <n-input :value="testEmail" disabled />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" :label="l.remindersMsg.emailTemplate">
          <n-select
            v-model:value="quickTestTemplateId"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            :placeholder="l.remindersMsg.defaultTemplate"
            clearable
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showQuickTest = false">{{ l.remindersMsg.cancel }}</n-button>
        <n-button type="primary" :loading="testing" @click="doQuickTest">{{ l.common.send }}</n-button>
      </template>
    </n-modal>

    <!-- Create reminder modal -->
    <n-modal v-model:show="showCreate" :title="l.reminders.newReminder" :show-icon="false" preset="dialog" style="width: 520px; max-width: 95vw">
      <n-form label-placement="top" v-if="newReminder">
        <n-form-item :label="l.reminders.reminderKindLabel">
          <n-radio-group :value="isPersonalReminder ? 'personal' : 'client'" name="reminder-kind" @update:value="onReminderKindChange">
            <n-radio-button value="client">{{ l.reminders.reminderKindClient }}</n-radio-button>
            <n-radio-button value="personal">{{ l.reminders.reminderKindPersonal }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <p v-if="isPersonalReminder" class="personal-reminder-hint">{{ l.reminders.personalReminderHint }}</p>

        <!-- ── Personal reminder: title + date + category + optional self-email ── -->
        <template v-if="isPersonalReminder">
          <n-form-item :label="l.remindersMsg.title" required>
            <n-input v-model:value="newReminder.title" :placeholder="l.notifications.quickAddTitlePlaceholder" />
          </n-form-item>
          <n-form-item :label="l.reminders.targetDate" required>
            <n-date-picker v-model:value="personalTargetDateMs" type="date" style="width: 100%" />
          </n-form-item>
          <n-form-item :label="l.notifications.quickAddCategoryLabel">
            <n-select
              v-model:value="newReminder.category"
              :options="newReminderCategoryOptions"
              :placeholder="l.notifications.quickAddCategoryPlaceholder"
              clearable
              filterable
              tag
              :virtual-scroll="false"
            />
          </n-form-item>
          <n-form-item :label="l.notifications.quickAddRemindBeforeLabel">
            <n-input
              v-model:value="personalRemindBeforeDays"
              :placeholder="l.notifications.quickAddRemindBeforePlaceholder"
            />
          </n-form-item>
          <n-form-item>
            <n-checkbox v-model:checked="personalAlsoEmailSelf">{{ l.reminders.alsoEmailSelf }}</n-checkbox>
          </n-form-item>
        </template>

        <!-- ── Normal (client/category) reminder ── -->
        <template v-else>
        <n-form-item :label="l.remindersMsg.clientOptional">
          <n-select
            v-model:value="newReminder.client_id"
            :options="clientOptions"
            :virtual-scroll="false"
            :placeholder="l.remindersMsg.pickClient"
            filterable
            clearable
            @update:value="onPickClient"
          />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.contractOptional">
          <n-select
            v-model:value="newReminderContractId"
            :options="contractOptions"
            :virtual-scroll="false"
            :loading="loadingContracts"
            :disabled="!newReminder.client_id"
            :placeholder="l.remindersMsg.pickContract"
            filterable
            clearable
            @update:value="onPickContract"
          />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.title" required>
          <n-input v-model:value="newReminder.title" :placeholder="l.remindersMsg.titlePlaceholder" />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.nextReminder" required>
          <n-select v-model:value="reminderDateMode" :options="reminderDateModeOptions" />
        </n-form-item>
        <n-form-item v-if="reminderDateMode === 'months'" :label="l.remindersMsg.inMonths" required>
          <n-select v-model:value="reminderIntervalMonths" :options="reminderIntervalOptions" />
        </n-form-item>
        <n-form-item v-else :label="l.remindersMsg.customDate" required>
          <n-date-picker v-model:value="reminderCustomDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item :label="newReminder.client_id ? l.reminders.recipientEmail : l.reminders.recipientEmailOptional" :required="Boolean(newReminder.client_id)">
          <n-input
            v-model:value="newReminder.email_to"
            :placeholder="emailPlaceholder"
          />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" :label="l.remindersMsg.emailTemplate">
          <n-select
            v-model:value="newReminder.email_template_id"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            :loading="loadingEmailTemplates"
            :placeholder="l.remindersMsg.defaultTemplate"
            clearable
          />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.categoryOptional">
          <n-select
            v-model:value="newReminder.category"
            :options="newReminderCategoryOptions"
            :placeholder="l.remindersMsg.noCategory"
            clearable
            filterable
            tag
            :virtual-scroll="false"
          />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.attachmentOptional">
          <n-select
            v-model:value="attachMode"
            :options="[
              { label: l.remindersMsg.attachNone, value: 'none' },
              { label: l.remindersMsg.attachReference, value: 'reference' },
              { label: l.remindersMsg.attachUpload, value: 'upload' },
            ]"
          />
        </n-form-item>
        <n-form-item v-if="attachMode === 'reference'" :label="l.remindersMsg.referenceLabel">
          <n-input v-model:value="attachReference" :placeholder="l.remindersMsg.referencePlaceholder" />
        </n-form-item>
        <n-form-item v-if="attachMode === 'upload'" :label="l.remindersMsg.chooseFile">
          <input ref="attachFileInput" type="file" @change="onAttachFileChange" />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.body">
          <n-input v-model:value="newReminder.body" type="textarea" :rows="3" />
        </n-form-item>
        </template>

        <n-form-item>
          <n-checkbox v-model:checked="createSyncCalendar">{{ l.reminders.syncToGoogleCalendar }}</n-checkbox>
        </n-form-item>
        <n-form-item v-if="createSyncCalendar" :label="l.reminders.calendarItemType">
          <n-radio-group v-model:value="createCalendarKind" name="calendar-kind">
            <n-radio-button value="task">{{ l.reminders.calendarKindTask }}</n-radio-button>
            <n-radio-button value="event">{{ l.reminders.calendarKindEvent }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item v-if="createSyncCalendar && createCalendarKind === 'event'" :label="l.reminders.calendarEventTime">
          <n-time-picker v-model:value="createEventTimeMs" format="HH:mm" style="width: 100%" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreate = false">{{ l.remindersMsg.cancel }}</n-button>
        <n-button type="primary" :loading="creating" @click="doCreate">{{ l.remindersMsg.create }}</n-button>
      </template>
    </n-modal>

    <!-- Edit reminder modal -->
    <n-modal v-model:show="showEditDate" :title="l.remindersMsg.editTitle" :show-icon="false" preset="dialog" style="width: 420px; max-width: 95vw">
      <n-form label-placement="top" v-if="editingReminder">
        <n-form-item :label="l.remindersMsg.title">
          <n-input :value="editingReminder.title" disabled />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.sendDate" required>
          <n-date-picker v-model:value="editDateMs" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.sendTo" required>
          <n-input v-model:value="editEmailTo" :placeholder="l.remindersMsg.sendToPlaceholder" />
        </n-form-item>
        <n-form-item :label="l.remindersMsg.sender">
          <n-input :value="senderLabel" disabled :placeholder="l.remindersMsg.noSender" />
        </n-form-item>
        <n-form-item v-if="canSelectEmailTemplates" :label="l.remindersMsg.emailTemplate">
          <n-select
            v-model:value="editEmailTemplateId"
            :options="emailTemplateOptions"
            :virtual-scroll="false"
            :placeholder="l.remindersMsg.defaultTemplate"
            clearable
          />
        </n-form-item>

      </n-form>
      <template #action>
        <n-button @click="showEditDate = false">{{ l.remindersMsg.cancel }}</n-button>
        <n-button type="primary" :loading="savingDate" @click="doSaveDate">{{ l.remindersMsg.save }}</n-button>
      </template>
    </n-modal>
    <ReminderPreviewModal
      v-model:show="showReminderPreview"
      :reminder-id="previewReminderId"
      :reminder-title="previewReminderTitle"
    />
    <ExtractRemindersModal v-model="showImportModal" @reminders-saved="onTableImported" />
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, ref, type Component} from "vue";
import {useRouter} from "vue-router";
import {NAlert, NButton, NCheckbox, NDataTable, NDatePicker, NDropdown, NForm, NFormItem, NIcon, NInput, NModal, NRadioButton, NRadioGroup, NSelect, NTimePicker, NTooltip, useMessage,} from "naive-ui";
import {CalendarOutline, CheckboxOutline, CloseCircleOutline, CreateOutline, DocumentTextOutline, EllipsisVerticalOutline, EyeOutline, PaperPlaneOutline, RefreshOutline, TrashOutline,} from "@vicons/ionicons5";
import {useRemindersStore} from "../stores/reminders.js";
import {useSettingsStore} from "../stores/settings.js";
import {useClientsStore} from "../stores/clients.js";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {api} from "../services/apiService.js";
import {categoryLabel} from "../utils/reminderCategoryLabels.js";
import {useConfirm} from "../composables/useConfirm.js";
import {useDevModal} from "../composables/useDevModal.js";
import ExtractRemindersModal from "../components/ExtractRemindersModal.vue";
import StatusBadge from "../components/StatusBadge.vue";
import ReminderPreviewModal from "../components/modals/ReminderPreviewModal.vue";
import {FEATURES} from "../shared/features.js";
import {resolveUserPlan} from "../shared/pricingPlans.js";
import {useI18n} from "../composables/useI18n.js";
import {useNotifications} from "../composables/useNotifications.js";
import type {Client, ContractWithClient, EmailTemplate, EquipmentCategory, ReminderWithContext} from "@shared/types.js";

// Date-only strings (YYYY-MM-DD) must round-trip through the date picker using
// local calendar days, not UTC — new Date("2026-08-01").getTime() parses as
// UTC midnight, which n-date-picker then displays in local time. In any
// timezone behind UTC that silently shows (and can save) the previous day.
function localDateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function addMonths(ms: number, months: number): number {
  const date = new Date(ms);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

function msToLocalDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const store = useRemindersStore();
const {l, href, t, dir, locale} = useI18n();
const { refresh: refreshNotifications } = useNotifications();
const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const authStore = useAuthStore();
const reminderCreatesAllowed = computed(() => resolveUserPlan(authStore.user) !== "expired");

function goToSubscription() {
  router.push({path: href("/profile"), query: {section: "subscription"}});
}
const featuresStore = useFeaturesStore();
const { confirm } = useConfirm();

// testEmail: admin can configure a custom address in settings; all others default to their own email
const testEmail = ref<string | null>(authStore.user?.email || "");
const router = useRouter();
const message = useMessage();

const statusFilter = ref<string | null>(null);
type DueFilter = "all" | "overdue" | "month" | "sent" | "no_email";
const dueFilter = ref<DueFilter>("all");
const search = ref("");
const reminderCategories = ref<{ name: string; count: number }[]>([]);
const categoryFilter = ref<string | null>(null);
const categoryViewActive = computed(() => reminderCategories.value.length > 0);
const bulkMode = ref(false);
const selectedReminderKeys = ref<Array<string | number>>([]);
const bulkSending = ref(false);
const bulkDismissing = ref(false);
const bulkDeleting = ref(false);
const sendingReminderId = ref<number | null>(null);
const showCreate = ref(false);
const showQuickTest = ref(false);
useDevModal("reminders.create", showCreate);
useDevModal("reminders.quickTest", showQuickTest);
const quickTestTemplateId = ref<string | null>(null);
const creating = ref(false);
const testing = ref(false);
const triggerDateMs = ref<number | null>(Date.now());
const reminderDateMode = ref<"months" | "date">("months");
const reminderCustomDateMs = ref<number | null>(null);
const reminderIntervalMonths = ref<4 | 6 | 12 | 14>(4);
const reminderDateModeOptions = computed(() => [
  { label: l.value.remindersMsg.modeMonths, value: "months" },
  { label: l.value.remindersMsg.modeDate, value: "date" },
]);
const reminderIntervalOptions = computed(() =>
  ([4, 6, 12, 14] as const).map((months) => ({ label: t("remindersMsg.monthsCount", {months}), value: months }))
);
const emailTemplates = ref<EmailTemplate[]>([]);
const loadingEmailTemplates = ref(false);
let emailTemplatesPromise: Promise<void> | null = null;
const canSelectEmailTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.emailTemplates));
const newReminder = ref<{
  client_id: string | null;
  title: string;
  email_to: string;
  body: string;
  email_template_id: string | null;
  category: string | null;
} | null>(null);
const isPersonalReminder = ref(false);
const createSyncCalendar = ref(true);
const createCalendarKind = ref<"task" | "event">("event");
const createEventTimeMs = ref<number | null>(defaultEventTimeMs());

function defaultEventTimeMs(): number {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function clockFromMs(ms: number | null): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const personalTargetDateMs = ref<number | null>(null);
const personalAlsoEmailSelf = ref(false);
const personalRemindBeforeDays = ref("");
const newReminderContractId = ref<string | null>(null);
const newReminderContracts = ref<ContractWithClient[]>([]);
const loadingContracts = ref(false);
type AttachMode = "none" | "reference" | "upload";
const attachMode = ref<AttachMode>("none");
const attachReference = ref("");
const attachFile = ref<File | null>(null);
const attachFileInput = ref<HTMLInputElement | null>(null);
function onAttachFileChange(event: Event) {
  attachFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

const clientOptions = computed(() =>
  clientsStore.rows.map((c: Client) => ({
    label: c.email ? `${c.display_name}  ·  ${c.email}` : c.display_name,
    value: c.id,
  }))
);

const newReminderCategoryOptions = computed(() => {
  const options = reminderCategories.value.map((c) => ({ label: categoryLabel(c.name, locale.value), value: c.name }));
  // "Personal" always offered even with zero existing reminders in it yet —
  // every other option only appears once a reminder in that category exists.
  if (!options.some((o) => o.value === "Personal")) {
    options.push({ label: categoryLabel("Personal", locale.value), value: "Personal" });
  }
  return options;
});

const emailTemplateOptions = computed(() =>
  emailTemplates.value.length
    ? emailTemplates.value.map((t) => ({
    label: t.is_default ? `${t.name}  (${l.value.remindersMsg.defaultTemplate})` : t.name,
    value: t.id,
  }))
    : [{ label: l.value.remindersMsg.noTemplates, value: "__empty__", disabled: true }]
);

const contractOptions = computed(() =>
  {
    if (loadingContracts.value) {
      return [{ label: l.value.remindersMsg.loadingContracts, value: "__loading__", disabled: true }];
    }
    if (newReminder.value?.client_id && newReminderContracts.value.length === 0) {
      return [{ label: l.value.remindersMsg.noContracts, value: "__empty__", disabled: true }];
    }
    return newReminderContracts.value.map((c) => {
    const parts = [
      c.contract_number || l.value.remindersMsg.noNumber,
      c.contract_type || l.value.remindersMsg.contract,
      c.expiry_date ? t("remindersMsg.validUntil", {date: c.expiry_date}) : null,
      contractEquipmentLabel(c),
    ].filter(Boolean);
    return {
      label: parts.join(" · "),
      value: String(c.id),
    };
    });
  }
);

const emailPlaceholder = computed(() => {
  if (!newReminder.value?.client_id) return l.value.remindersMsg.emailAuto;
  const c = clientsStore.rows.find((x) => x.id === newReminder.value!.client_id);
  return c?.email ?? testEmail.value ?? l.value.remindersMsg.clientNoEmail;
});

const statusOptions = computed(() => [
  { label: l.value.common.pending, value: "pending" },
  { label: l.value.common.triggered, value: "triggered" },
  { label: l.value.common.sent, value: "sent" },
  { label: l.value.common.snoozed, value: "snoozed" },
  { label: l.value.common.dismissed, value: "dismissed" },
  { label: l.value.common.missingEmail, value: "no_email" },
  { label: l.value.common.error, value: "error" },
]);

function todayIso(): string {
  return msToLocalDateStr(Date.now());
}

function monthRangeIso() {
  const now = new Date();
  return {
    from: msToLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1).getTime()),
    to: msToLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()),
  };
}

function reminderMatchesDueFilter(row: ReminderWithContext, filter: DueFilter): boolean {
  const trigger = row.trigger_date?.slice(0, 10);
  if (filter === "overdue") return row.status === "pending" && Boolean(trigger && trigger < todayIso());
  if (filter === "month") {
    const range = monthRangeIso();
    return Boolean(trigger && trigger >= range.from && trigger <= range.to);
  }
  if (filter === "sent") return row.status === "sent";
  if (filter === "no_email") return row.status === "no_email" || !effectiveEmailTo(row);
  return true;
}

const dueFilters = computed(() => {
  const rows = store.rows ?? [];
  return [
    { label: l.value.common.all, value: "all" as DueFilter, count: rows.length },
    { label: l.value.reminders.overdue, value: "overdue" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "overdue")).length },
    { label: l.value.reminders.thisMonth, value: "month" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "month")).length },
    { label: l.value.reminders.sentPlural, value: "sent" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "sent")).length },
    { label: l.value.common.missingEmail, value: "no_email" as DueFilter, count: rows.filter((row) => reminderMatchesDueFilter(row, "no_email")).length },
  ];
});

type ReminderStat = {
  key: string;
  label: string;
  count: number;
  tone: "neutral" | "warning" | "success" | "danger";
  due?: DueFilter;
  status?: string | null;
};

const reminderStats = computed<ReminderStat[]>(() => {
  const rows = store.rows ?? [];
  return [
    { key: "all", label: l.value.reminders.total, count: rows.length, tone: "neutral", due: "all", status: null },
    { key: "pending", label: l.value.reminders.pendingCount, count: rows.filter((row) => row.status === "pending").length, tone: "warning", status: "pending" },
    { key: "overdue", label: l.value.reminders.overdue, count: rows.filter((row) => reminderMatchesDueFilter(row, "overdue")).length, tone: "danger", due: "overdue", status: null },
    { key: "sent", label: l.value.reminders.sentPlural, count: rows.filter((row) => row.status === "sent").length, tone: "success", due: "sent", status: null },
  ];
});

function applySummaryFilter(item: ReminderStat) {
  dueFilter.value = item.due ?? "all";
  statusFilter.value = item.status ?? null;
  selectedReminderKeys.value = [];
  load();
}

const filteredRows = computed(() =>
  (store.rows ?? [])
    .filter((row) => reminderMatchesDueFilter(row, dueFilter.value))
    .filter((row) => {
      const q = search.value.trim().toLowerCase();
      if (!q) return true;
      return [
        row.title,
        row.client_name,
        row.contract_number,
        row.document_name,
        displayEmailTo(effectiveEmailTo(row)),
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    }),
);

function load() {
  selectedReminderKeys.value = selectedReminderKeys.value.filter((id) =>
    filteredRows.value.some((row) => row.id === id)
  );
  store.fetch({ status: statusFilter.value ?? undefined, limit: 5000, category: categoryFilter.value ?? undefined }, true);
  loadReminderCategories(true);
}

async function loadReminderCategories(force = false) {
  try {
    reminderCategories.value = (await api.reminders.categories(force)).categories;
  } catch {
    reminderCategories.value = [];
  }
}

function selectCategory(name: string | null) {
  categoryFilter.value = name;
  selectedReminderKeys.value = [];
  load();
}

function onTableImported() {
  loadReminderCategories();
  load();
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedReminderKeys.value = [];
}

function onSelectedReminderKeys(keys: Array<string | number>) {
  selectedReminderKeys.value = keys;
}

function selectedReminders(): ReminderWithContext[] {
  const selected = new Set(selectedReminderKeys.value);
  return filteredRows.value.filter((row) => selected.has(row.id));
}

function toggleReminderSelection(row: ReminderWithContext) {
  const selected = new Set(selectedReminderKeys.value);
  if (selected.has(row.id)) selected.delete(row.id);
  else selected.add(row.id);
  selectedReminderKeys.value = [...selected];
}

async function loadEmailTemplates() {
  if (!canSelectEmailTemplates.value) {
    emailTemplates.value = [];
    return;
  }
  if (emailTemplates.value.length) return;
  if (!emailTemplatesPromise) {
    loadingEmailTemplates.value = true;
    emailTemplatesPromise = api.emailTemplates.list()
      .then((templates) => {
        emailTemplates.value = templates;
      })
      .finally(() => {
        loadingEmailTemplates.value = false;
        emailTemplatesPromise = null;
      });
  }
  await emailTemplatesPromise;
}

onMounted(async () => {
  await featuresStore.fetchFeatures().catch(() => {});
  await Promise.all([
    clientsStore.rows.length ? Promise.resolve() : clientsStore.fetch({ limit: 500 }),
    loadEmailTemplates(),
    loadSenderInfo(),
    loadReminderCategories(),
  ]);
  load();
});

async function loadSenderInfo() {
  try {
    senderInfo.value = await api.reminders.senderInfo();
  } catch {
    senderInfo.value = null;
  }
}

// ── Create new reminder ─────────────────────────────────────────────────────
function onReminderKindChange(kind: string) {
  isPersonalReminder.value = kind === "personal";
  createCalendarKind.value = kind === "personal" ? "task" : "event";
  if (kind === "personal" && newReminder.value && !newReminder.value.category) {
    newReminder.value.category = "Personal";
  }
}

async function openCreate() {
  if (!reminderCreatesAllowed.value) return;
  await loadEmailTemplates();
  // Default to the periodic-inspection template, since that's what most
  // manually-created reminders are for; fall back to whichever template is
  // marked is_default if it isn't found.
  newReminder.value = {
    client_id: null,
    title: "",
    // No client picked yet — treat this as a self reminder by default.
    email_to: testEmail.value ?? "",
    body: "",
    email_template_id: canSelectEmailTemplates.value ? pickEmailTemplate()?.id ?? null : null,
    category: null,
  };
  newReminderContractId.value = null;
  newReminderContracts.value = [];
  triggerDateMs.value = Date.now();
  reminderDateMode.value = "months";
  reminderCustomDateMs.value = null;
  reminderIntervalMonths.value = 4;
  attachMode.value = "none";
  attachReference.value = "";
  attachFile.value = null;
  isPersonalReminder.value = false;
  createSyncCalendar.value = true;
  createCalendarKind.value = "event";
  createEventTimeMs.value = defaultEventTimeMs();
  personalTargetDateMs.value = null;
  personalAlsoEmailSelf.value = false;
  personalRemindBeforeDays.value = "";
  showCreate.value = true;
}

// When the user picks a client, fetch their contracts and auto-fill email/title/body.
async function onPickClient(clientId: string | null) {
  if (!newReminder.value) return;
  if (!clientId) {
    // No client selected — this is a self reminder, default the recipient to
    // the account's own address instead of leaving it blank.
    if (testEmail.value && !newReminder.value.email_to.trim()) newReminder.value.email_to = testEmail.value;
    newReminderContractId.value = null;
    newReminderContracts.value = [];
    return;
  }
  const c = clientsStore.rows.find((x) => x.id === clientId);
  if (!c) return;
  if (c.email) newReminder.value.email_to = c.email;
  if (!newReminder.value.title.trim()) newReminder.value.title = `${l.value.remindersMsg.reminderFor} ${c.display_name}`;
  if (!newReminder.value.body.trim() && c.notes) newReminder.value.body = c.notes;

  // Fetch contracts for this client
  newReminderContractId.value = null;
  newReminderContracts.value = [];
  loadingContracts.value = true;
  try {
    const result = await api.contracts.list({ clientId: String(clientId), limit: 100 });
    newReminderContracts.value = result.rows;
  } catch {
    newReminderContracts.value = [];
  } finally {
    loadingContracts.value = false;
  }
}

// When the user picks a contract, auto-populate reminder fields from contract data.
function onPickContract(contractId: string | null) {
  if (!newReminder.value || !contractId) return;
  const contract = newReminderContracts.value.find((c) => String(c.id) === contractId);
  if (!contract) return;

  // Use contract type + number as default title if user hasn't typed one
  if (!newReminder.value.title.trim() || newReminder.value.title.startsWith(l.value.remindersMsg.reminderFor)) {
    const number = contract.contract_number ? ` ${contract.contract_number}` : "";
    newReminder.value.title = `${contract.contract_type || l.value.remindersMsg.inspectionOrContract}${number}`.trim();
  }
  if (contract.expiry_date) {
    reminderDateMode.value = "date";
    reminderCustomDateMs.value = localDateToMs(contract.expiry_date);
  }
  if (contract.contact_email) newReminder.value.email_to = contract.contact_email;
  newReminder.value.email_template_id = canSelectEmailTemplates.value
    ? pickEmailTemplate(contract)?.id ?? newReminder.value.email_template_id
    : null;
  if (!newReminder.value.body.trim()) {
    newReminder.value.body = contractBody(contract);
  }
}

function pickEmailTemplate(contract?: ContractWithClient | null): EmailTemplate | null {
  const text = `${contract?.contract_type ?? ""} ${contract?.document_name ?? ""}`;
  const isInspection = /תסקיר|בדיקה|inspection/i.test(text);
  const isContract = /חוזה|contract/i.test(text);
  if (isInspection) {
    return emailTemplates.value.find((t) => t.name.includes("תסקיר בדיקה תקופתית")) ??
      emailTemplates.value.find((t) => t.name.includes("תסקיר")) ??
      emailTemplates.value.find((t) => t.is_default) ??
      emailTemplates.value[0] ??
      null;
  }
  if (isContract) {
    return emailTemplates.value.find((t) => t.name.includes("חוזה")) ??
      emailTemplates.value.find((t) => t.is_default) ??
      emailTemplates.value[0] ??
      null;
  }
  return emailTemplates.value.find((t) => t.name.includes("תסקיר בדיקה תקופתית")) ??
    emailTemplates.value.find((t) => t.is_default) ??
    emailTemplates.value[0] ??
    null;
}

function contractEquipmentLabel(contract: ContractWithClient): string | null {
  const first = contract._equipment?.[0];
  return first?.name || contract.equipment_description || first?.model || first?.serial_number || null;
}

function contractBody(contract: ContractWithClient): string {
  const lines = [
    contract.contract_type ? `${l.value.remindersMsg.bodyType} ${contract.contract_type}` : null,
    contract.contract_number ? `${l.value.remindersMsg.bodyNumber} ${contract.contract_number}` : null,
    contract.start_date ? `${l.value.remindersMsg.bodyInspectionDate} ${contract.start_date}` : null,
    contract.expiry_date ? `${l.value.remindersMsg.bodyExpiry} ${contract.expiry_date}` : null,
    contractEquipmentLabel(contract) ? `${l.value.remindersMsg.bodyEquipment} ${contractEquipmentLabel(contract)}` : null,
    contract.summary,
  ].filter(Boolean);
  return lines.join("\n");
}

function selectedContract(): ContractWithClient | null {
  if (!newReminderContractId.value) return null;
  return newReminderContracts.value.find((c) => String(c.id) === newReminderContractId.value) ?? null;
}

function firstContractEquipment(contract: ContractWithClient | null) {
  return contract?._equipment?.[0] ?? null;
}

function normalizeEmailTo(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (t.startsWith("[")) return t;
  const list = t.split(",").map((s) => s.trim()).filter(Boolean);
  return JSON.stringify(list);
}

async function doCreate() {
  if (isPersonalReminder.value) {
    if (!newReminder.value?.title.trim() || !personalTargetDateMs.value) {
      message.warning(l.value.reminders.missingTitleAndDate);
      return;
    }
    creating.value = true;
    try {
      const targetDate = msToLocalDateStr(personalTargetDateMs.value);
      await api.reminders.createPersonal({
        title: newReminder.value.title.trim(),
        target_date: targetDate,
        reminder_category: newReminder.value.category || "Personal",
        email_to: personalAlsoEmailSelf.value ? (authStore.user?.email ?? null) : null,
        remind_before_days: personalRemindBeforeDays.value.trim() || null,
        sync_calendar: createSyncCalendar.value,
        calendar_kind: createCalendarKind.value,
        calendar_time: createCalendarKind.value === "event" ? clockFromMs(createEventTimeMs.value) : null,
      });
      message.success(l.value.notifications.quickAddSuccess);
      showCreate.value = false;
      load();
      void refreshNotifications();
    } catch (e) {
      message.error(String(e));
    } finally {
      creating.value = false;
    }
    return;
  }

  if (!newReminder.value) return;
  if (!newReminder.value.title.trim()) {
    message.warning(l.value.remindersMsg.needTitleDate);
    return;
  }
  if (reminderDateMode.value === "date" && !reminderCustomDateMs.value) {
    message.warning(l.value.remindersMsg.needDate);
    return;
  }
  if (newReminder.value.client_id && !newReminder.value.email_to.trim()) {
    message.warning(l.value.remindersMsg.needEmail);
    return;
  }
  if (attachMode.value === "upload" && !attachFile.value) {
    message.warning(l.value.remindersMsg.needFile);
    return;
  }
  creating.value = true;
  try {
    const triggerDateMsValue = reminderDateMode.value === "date"
      ? reminderCustomDateMs.value!
      : addMonths(Date.now(), reminderIntervalMonths.value);
    const triggerDate = msToLocalDateStr(triggerDateMsValue);
    const contract = selectedContract();
    const equipment = firstContractEquipment(contract);
    let attachedDocumentId: string | null = contract?.document_id ?? null;
    if (attachMode.value === "upload" && attachFile.value) {
      const result = await api.documents.uploadOne(attachFile.value, {
        doAi: false, doEntities: false, doReminders: false, skipCloudStorage: true,
      });
      attachedDocumentId = result.id;
    }
    await api.reminders.create({
      source_type: contract ? "contract_expiry" : "manual",
      source_id: contract?.id ?? null,
      client_id: newReminder.value.client_id,
      document_id: attachedDocumentId,
      document_reference: attachMode.value === "reference" ? attachReference.value.trim() || null : null,
      reminder_category: newReminder.value.category,
      trigger_date: triggerDate,
      advance_days: 0,
      title: newReminder.value.title,
      body: newReminder.value.body || null,
      email_to: normalizeEmailTo(newReminder.value.email_to),
      email_template_id: canSelectEmailTemplates.value ? newReminder.value.email_template_id : null,
      equipment_type: (equipment?.category as EquipmentCategory | undefined) ?? null,
      manufacturer: equipment?.manufacturer ?? null,
      model: equipment?.model ?? null,
      serial_number: equipment?.serial_number ?? null,
      license_number: equipment?.license_number ?? null,
      sync_calendar: createSyncCalendar.value,
      calendar_kind: createCalendarKind.value,
      calendar_time: createCalendarKind.value === "event" ? clockFromMs(createEventTimeMs.value) : null,
    } as any);
    message.success(l.value.remindersMsg.created);
    showCreate.value = false;
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    creating.value = false;
  }
}

// ── Edit reminder (trigger_date + email_to) ─────────────────────────────────
const showEditDate = ref(false);
useDevModal("reminders.editDate", showEditDate);
const showReminderPreview = ref(false);
const showImportModal = ref(false);
const previewReminderId = ref<number | string | null>(null);
const previewReminderTitle = ref<string | null>(null);
const savingDate = ref(false);
const editingReminder = ref<ReminderWithContext | null>(null);
const editDateMs = ref<number | null>(null);
const editEmailTo = ref("");
const editEmailTemplateId = ref<string | null>(null);
const senderInfo = ref<{ email: string | null; name: string } | null>(null);

const senderLabel = computed(() => {
  if (!senderInfo.value?.email) return "";
  return senderInfo.value.name
    ? `${senderInfo.value.name} <${senderInfo.value.email}>`
    : senderInfo.value.email;
});

function displayEmailTo(emailTo: string | null | undefined): string {
  if (!emailTo) return "";
  try {
    const parsed = JSON.parse(emailTo);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return emailTo;
  }
}

function effectiveEmailTo(row: ReminderWithContext): string | null {
  return row.email_to || row.client_email || null;
}

async function openEditDate(row: ReminderWithContext) {
  editingReminder.value = row;
  editDateMs.value = row.trigger_date ? localDateToMs(row.trigger_date) : Date.now();
  editEmailTo.value = displayEmailTo(effectiveEmailTo(row));
  editEmailTemplateId.value = canSelectEmailTemplates.value ? row.email_template_id ?? null : null;
  showEditDate.value = true;
}

async function doSaveDate() {
  if (!editingReminder.value || !editDateMs.value) return;
  if (!editEmailTo.value.trim()) {
    message.warning(l.value.remindersMsg.needEmail);
    return;
  }
  savingDate.value = true;
  try {
    const triggerDate = msToLocalDateStr(editDateMs.value);
    await api.reminders.update(editingReminder.value.id, {
      trigger_date: triggerDate,
      email_to: normalizeEmailTo(editEmailTo.value),
      email_template_id: canSelectEmailTemplates.value ? editEmailTemplateId.value : null,
    });
    message.success(l.value.remindersMsg.updated);
    showEditDate.value = false;
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    savingDate.value = false;
  }
}

function confirmDelete(row: ReminderWithContext) {
  confirm({
    title: l.value.remindersMsg.deleteTitle,
    content: t("remindersMsg.deleteConfirm", {title: row.title}),
    confirmText: l.value.fieldPage.delete,
    onConfirm: async () => {
      try {
        await store.remove(row.id);
        message.success(l.value.remindersMsg.deleted);
        load();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

async function sendReminderRow(row: ReminderWithContext) {
  if (!effectiveEmailTo(row)?.trim()) {
    message.warning(l.value.remindersMsg.missingEmail);
    return;
  }
  sendingReminderId.value = row.id;
  try {
    const res = await store.sendNow(row.id);
    if (res.success) {
      message.success(row.status === "sent" ? l.value.remindersMsg.resent : l.value.remindersMsg.sent);
      await load();
    } else {
      message.error(res.error ?? l.value.remindersMsg.sendError);
    }
  } catch (e) {
    message.error(String(e));
  } finally {
    sendingReminderId.value = null;
  }
}

function dismissReminderRow(row: ReminderWithContext) {
  confirm({
    title: l.value.remindersMsg.cancelTitle,
    content: t("remindersMsg.cancelConfirm", {title: row.title}),
    confirmText: l.value.remindersMsg.cancelReminder,
    onConfirm: async () => {
      try {
        await store.dismiss(row.id);
        message.success(l.value.remindersMsg.cancelled);
        load();
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

function doDeleteFiltered() {
  const rowsToDelete = [...filteredRows.value];
  const count = rowsToDelete.length;
  if (!count) return;
  confirm({
    title: l.value.remindersMsg.deleteManyTitle,
    content: t("remindersMsg.deleteFilteredConfirm", {count}),
    confirmText: l.value.fieldPage.delete,
    onConfirm: async () => {
      try {
        await Promise.all(rowsToDelete.map((row) => store.remove(row.id)));
        message.success(t("remindersMsg.deletedMany", {count}));
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

async function bulkSendSelected() {
  const rows = selectedReminders().filter((row) => row.status !== "dismissed");
  if (!rows.length) {
    message.warning(l.value.remindersMsg.noneSelectedToSend);
    return;
  }
  bulkSending.value = true;
  try {
    const results = await Promise.allSettled(rows.map((row) => store.sendNow(row.id)));
    const sent = results.filter((result) => result.status === "fulfilled" && (result.value as any).success).length;
    const failed = results.length - sent;
    if (sent) message.success(t("remindersMsg.sentMany", {count: sent}));
    if (failed) message.error(t("remindersMsg.failedMany", {count: failed}));
    selectedReminderKeys.value = [];
    load();
  } finally {
    bulkSending.value = false;
  }
}

function bulkDismissSelected() {
  const rows = selectedReminders().filter((row) => row.status === "pending");
  const count = rows.length;
  if (!count) {
    message.warning(l.value.remindersMsg.noneToCancel);
    return;
  }
  confirm({
    title: l.value.remindersMsg.cancelManyTitle,
    content: t("remindersMsg.cancelManyConfirm", {count}),
    confirmText: l.value.remindersMsg.cancelMany,
    onConfirm: async () => {
      bulkDismissing.value = true;
      try {
        await Promise.all(rows.map((row) => store.dismiss(row.id)));
        message.success(t("remindersMsg.cancelledMany", {count}));
        selectedReminderKeys.value = [];
        load();
      } catch (e) {
        message.error(String(e));
      } finally {
        bulkDismissing.value = false;
      }
    },
  });
}

function bulkDeleteSelected() {
  const rows = selectedReminders();
  const count = rows.length;
  if (!count) return;
  confirm({
    title: l.value.remindersMsg.deleteManyTitle,
    content: t("remindersMsg.deleteSelectedConfirm", {count}),
    confirmText: l.value.fieldPage.delete,
    onConfirm: async () => {
      bulkDeleting.value = true;
      try {
        await Promise.all(rows.map((row) => store.remove(row.id)));
        message.success(t("remindersMsg.deletedMany", {count}));
        selectedReminderKeys.value = [];
        load();
      } catch (e) {
        message.error(String(e));
      } finally {
        bulkDeleting.value = false;
      }
    },
  });
}

// ── Quick test: open modal to pick template, then send ─────────────────────
function quickTest() {
  if (!testEmail.value) return;
  const defaultTpl = emailTemplates.value.find((t) => t.is_default) ?? emailTemplates.value[0] ?? null;
  quickTestTemplateId.value = canSelectEmailTemplates.value ? defaultTpl?.id ?? null : null;
  showQuickTest.value = true;
}

async function doQuickTest() {
  if (!testEmail.value) return;
  testing.value = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const created = await api.reminders.create({
      source_type: "manual",
      trigger_date: today,
      advance_days: 0,
      title: `${l.value.remindersMsg.testPrefix} — ${new Date().toLocaleString(locale.value === "en" ? "en-US" : "he-IL")}`,
      body: l.value.remindersMsg.testBody,
      email_to: JSON.stringify([testEmail.value]),
      email_template_id: canSelectEmailTemplates.value ? quickTestTemplateId.value : null,
    });
    const sendResult = await api.reminders.sendNow(created.id);
    showQuickTest.value = false;
    if (sendResult.success) {
      message.success(t("remindersMsg.testSent", {email: testEmail.value ?? ""}));
    } else {
      message.error(sendResult.error ?? l.value.remindersMsg.sendError);
    }
    load();
  } catch (e) {
    message.error(String(e));
  } finally {
    testing.value = false;
  }
}

function columnTextSort(a: string | null | undefined, b: string | null | undefined): number {
  const lang = locale.value === "he" ? "he" : "en";
  return String(a ?? "").localeCompare(String(b ?? ""), lang, { numeric: true, sensitivity: "base" });
}

function columnDateSort(a: string | null | undefined, b: string | null | undefined): number {
  const left = a?.slice(0, 10) ?? "";
  const right = b?.slice(0, 10) ?? "";
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function uniqueColumnOptions(items: { value: string; label: string }[]) {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const item of items) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    options.push(item);
  }
  const lang = locale.value === "he" ? "he" : "en";
  options.sort((a, b) => a.label.localeCompare(b.label, lang));
  return options;
}

function reminderCategoryKey(row: ReminderWithContext): string {
  return row.reminder_category || row.contract_type || "__empty__";
}

function reminderInspectionKey(row: ReminderWithContext): string {
  return row.contract_number || row.document_name || "__empty__";
}

function reminderDateBucket(row: ReminderWithContext): string {
  const trigger = row.trigger_date?.slice(0, 10);
  if (!trigger) return "__empty__";
  if (trigger < todayIso()) return "overdue";
  const range = monthRangeIso();
  if (trigger >= range.from && trigger <= range.to) return "month";
  return "later";
}

const categoryColumnFilters = computed(() =>
  uniqueColumnOptions(
    (store.rows ?? []).map((row) => {
      const value = reminderCategoryKey(row);
      return {
        value,
        label: value === "__empty__"
          ? l.value.reminders.columnFilterNoCategory
          : categoryLabel(value, locale.value) || value,
      };
    }),
  ),
);

const clientColumnFilters = computed(() =>
  uniqueColumnOptions(
    (store.rows ?? []).map((row) => ({
      value: row.client_id ? String(row.client_id) : "__empty__",
      label: row.client_id
        ? (row.client_name || String(row.client_id))
        : l.value.reminders.columnFilterNoClient,
    })),
  ),
);

const inspectionColumnFilters = computed(() =>
  uniqueColumnOptions(
    (store.rows ?? []).map((row) => {
      const value = reminderInspectionKey(row);
      return {
        value,
        label: value === "__empty__" ? l.value.reminders.columnFilterNoInspection : value,
      };
    }),
  ),
);

function openReminderPreview(row: ReminderWithContext) {
  previewReminderId.value = row.id;
  previewReminderTitle.value = row.title ?? null;
  showReminderPreview.value = true;
}

// ── Table columns ───────────────────────────────────────────────────────────
function formatReminderDate(value: string | null | undefined): string {
  if (!value) return "—";
  const part = value.includes("T") ? value.split("T")[0] : value;
  const [y, m, d] = part.split("-");
  if (!y || !m || !d) return value;
  return locale.value === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = localDateToMs(value.slice(0, 10));
  const today = localDateToMs(todayIso());
  return Math.round((target - today) / 86400000);
}

function dueTone(row: ReminderWithContext): string {
  const days = daysUntil(row.trigger_date);
  if (row.status === "sent") return "sent";
  if (days == null) return "muted";
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "future";
}

function rowProps(row: ReminderWithContext) {
  return {
    class: `reminder-row reminder-row--${dueTone(row)} reminder-row--clickable${bulkMode.value ? " reminder-row--selectable" : ""}`,
    style: "cursor: pointer",
    onClick: (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, .n-checkbox, .n-dropdown, .n-popover")) return;
      if (bulkMode.value) {
        toggleReminderSelection(row);
        return;
      }
      router.push(href(`/reminders/${row.id}`));
    },
  };
}

const hasInspectionData = computed(() =>
  (store.rows ?? []).some((r: ReminderWithContext) => r.contract_number || r.document_name)
);

const baseColumns = computed(() => [
  {
    title: l.value.common.name,
    key: "title",
    width: 200,
    minWidth: 200,
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => columnTextSort(a.title, b.title),
    render: (row: ReminderWithContext) =>
      h("button", {
        class: "link-button",
        type: "button",
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          router.push(href(`/reminders/${row.id}`));
        },
      }, row.title || "—"),
  },
  {
    title: l.value.common.category,
    key: "reminder_category",
    width: 140,
    minWidth: 140,
    filterMultiple: true,
    filterOptions: categoryColumnFilters.value,
    filter: (value: string | number, row: ReminderWithContext) => reminderCategoryKey(row) === String(value),
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => columnTextSort(
      categoryLabel(a.reminder_category || a.contract_type, locale.value),
      categoryLabel(b.reminder_category || b.contract_type, locale.value),
    ),
    render: (row: ReminderWithContext) =>
      h("span", categoryLabel(row.reminder_category || row.contract_type, locale.value) || "—"),
  },
  {
    title: l.value.common.email,
    key: "email_to",
    width: 240,
    minWidth: 240,
    filterMultiple: true,
    filterOptions: [
      { label: l.value.reminders.columnFilterHasEmail, value: "has" },
      { label: l.value.common.noEmail, value: "none" },
    ],
    filter: (value: string | number, row: ReminderWithContext) => {
      const has = Boolean(effectiveEmailTo(row)?.trim());
      return value === "has" ? has : !has;
    },
    sorter: (a: ReminderWithContext, b: ReminderWithContext) =>
      columnTextSort(displayEmailTo(effectiveEmailTo(a)), displayEmailTo(effectiveEmailTo(b))),
    render: (row: ReminderWithContext) =>
      h("span", { class: "reminder-email-cell" }, displayEmailTo(effectiveEmailTo(row)) || l.value.common.noEmail),
  },
  {
    title: l.value.common.client,
    key: "client_name",
    width: 220,
    minWidth: 220,
    filterMultiple: true,
    filterOptions: clientColumnFilters.value,
    filter: (value: string | number, row: ReminderWithContext) =>
      (row.client_id ? String(row.client_id) : "__empty__") === String(value),
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => columnTextSort(a.client_name, b.client_name),
    render: (row: ReminderWithContext) =>
      h("div", { class: "reminder-client-cell" }, [
        row.client_id
          ? h("button", {
              class: "link-button",
              onClick: (event: MouseEvent) => {
                event.stopPropagation();
                router.push(href(`/clients/${row.client_id}`));
              },
            }, row.client_name ?? "—")
          : h("span", row.client_name ?? "—"),
      ]),
  },
  ...(hasInspectionData.value ? [{
    title: l.value.reminders.inspection,
    key: "contract_number",
    width: 180,
    minWidth: 180,
    filterMultiple: true,
    filterOptions: inspectionColumnFilters.value,
    filter: (value: string | number, row: ReminderWithContext) => reminderInspectionKey(row) === String(value),
    sorter: (a: ReminderWithContext, b: ReminderWithContext) =>
      columnTextSort(reminderInspectionKey(a), reminderInspectionKey(b)),
    render: (row: ReminderWithContext) =>
      h("span", { class: "reminder-source-cell" }, row.contract_number || row.document_name || "—"),
  }] : []),
  {
    title: l.value.reminders.dateColumn,
    key: "trigger_date",
    width: 130,
    minWidth: 130,
    filterMultiple: true,
    filterOptions: [
      { label: l.value.reminders.overdue, value: "overdue" },
      { label: l.value.reminders.thisMonth, value: "month" },
      { label: l.value.reminders.columnFilterLater, value: "later" },
    ],
    filter: (value: string | number, row: ReminderWithContext) => reminderDateBucket(row) === String(value),
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => columnDateSort(a.trigger_date, b.trigger_date),
    defaultSortOrder: "ascend" as const,
    render: (row: ReminderWithContext) =>
      h("div", { class: "reminder-date-cell" }, [
        h("span", { class: "reminder-date-cell__date" }, formatReminderDate(row.trigger_date)),
      ]),
  },
  {
    title: l.value.reminders.daysBefore,
    key: "advance_days",
    width: 90,
    minWidth: 90,
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => (a.advance_days ?? 0) - (b.advance_days ?? 0),
    render: (row: ReminderWithContext) =>
      h("span", row.advance_days != null ? String(row.advance_days) : "—"),
  },
  {
    title: l.value.common.status,
    key: "status",
    width: 80,
    filterMultiple: true,
    filterOptions: statusOptions.value,
    filter: (value: string | number, row: ReminderWithContext) => row.status === value,
    sorter: (a: ReminderWithContext, b: ReminderWithContext) => columnTextSort(a.status, b.status),
    render: (row: ReminderWithContext) => h(StatusBadge, { status: row.status }),
  },
  {
    key: "calendar",
    width: 60,
    sorter: (a: ReminderWithContext, b: ReminderWithContext) =>
      Number(Boolean(a.calendar_synced)) - Number(Boolean(b.calendar_synced)),
    render: (row: ReminderWithContext) =>
      h("div", {
        class: "reminder-actions-cell",
        onClick: (event: MouseEvent) => event.stopPropagation(),
      }, [
        h(NTooltip, { placement: "top" }, {
          trigger: () => h("span", {
            class: ["reminder-sync-icon", row.calendar_synced ? "reminder-sync-icon--on" : "reminder-sync-icon--off"],
          }, [
            h(NIcon, {
              component: row.source_type === "personal" ? CheckboxOutline : CalendarOutline,
              size: 16,
            }),
          ]),
          default: () => {
            if (!row.calendar_synced) return l.value.reminders.detailCalendarNotSynced;
            return row.calendar_task_id || row.source_type === "personal"
              ? l.value.reminders.calendarSyncedAsTask
              : l.value.calendar.synced;
          },
        }),
      ]),
  },
  {
    title: l.value.common.actions,
    key: "actions",
    width: 72,
    minWidth: 72,
    render: (row: ReminderWithContext) =>
      h("div", {
        class: "reminder-actions-cell",
        onClick: (event: MouseEvent) => event.stopPropagation(),
      }, [
        h(NDropdown, {
          options: rowActionsFor(row),
          placement: "bottom-end",
          trigger: "click",
          onSelect: (key: string) => handleRowAction(key, row),
        }, {
          default: () => h("button", {
            class: "btn btn--ghost btn--xs icon-btn",
            title: l.value.common.actions,
            type: "button",
          }, [h(NIcon, { component: EllipsisVerticalOutline, class: "btn-icon" })]),
        }),
      ]),
  },
]);

function renderActionIcon(icon: Component) {
  return () => h(NIcon, { component: icon });
}

function rowActionsFor(row: ReminderWithContext) {
  const c = l.value;
  const hasEmail = Boolean(effectiveEmailTo(row)?.trim());
  const actions: Array<Record<string, unknown>> = [];
  if (row.status !== "dismissed") {
    actions.push({
      label: row.status === "sent" ? c.common.sendAgain : c.reminders.sendReminder,
      key: "send",
      icon: renderActionIcon(PaperPlaneOutline),
      disabled: !hasEmail,
      props: hasEmail ? undefined : { title: c.reminders.missingEmailSend },
    });
  }
  actions.push({ label: c.common.preview, key: "preview", icon: renderActionIcon(EyeOutline) });
  actions.push({ label: c.reminders.editReminder, key: "edit", icon: renderActionIcon(CreateOutline) });
  if (row.status === "pending") {
    actions.push({ label: c.reminders.dismissReminder, key: "dismiss", icon: renderActionIcon(CloseCircleOutline) });
  }
  actions.push({ type: "divider", key: "d1" });
  actions.push({
    label: c.common.delete,
    key: "delete",
    icon: renderActionIcon(TrashOutline),
    props: { style: "color: var(--color-error, #d03050)" },
  });
  return actions;
}

function handleRowAction(key: string, row: ReminderWithContext) {
  if (key === "send") { if (sendingReminderId.value !== row.id) sendReminderRow(row); return; }
  if (key === "preview") { openReminderPreview(row); return; }
  if (key === "edit") { router.push(href(`/reminders/${row.id}`)); return; }
  if (key === "dismiss") { dismissReminderRow(row); return; }
  if (key === "delete") { confirmDelete(row); return; }
}

const columns = computed(() =>
  bulkMode.value
    ? [{ type: "selection", width: 46, fixed: "right" }, ...baseColumns.value]
    : baseColumns.value
);
</script>

<style scoped>
.reminders-page {
  max-width: 100%;
  display: grid;
  gap: 16px;
  font-family: inherit;
}

.reminders-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 8px;
}

.reminders-hero__copy h1 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.reminders-hero__copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.reminders-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover:not(.rbtn--primary):not(.rbtn--danger):not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--primary:hover:not(:disabled) {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}

.rbtn--primary:active:not(:disabled) {
  background: var(--brand-color-pressed);
  border-color: var(--brand-color-pressed);
}

.rbtn--danger {
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.bulk-action-anchor {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.bulk-action-anchor > .rbtn {
  width: 100%;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item + .bulk-action-item {
  border-top: 1px solid var(--border-color);
  border-radius: 0;
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.bulk-action-item--primary {
  color: var(--brand-color);
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.bulk-action-item--loading .bulk-action-item__icon {
  width: 14px;
  height: 14px;
  margin-inline: 4px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  color: inherit;
  font-size: 0;
}

.bulk-action-item--loading .bulk-action-item__icon :deep(svg) {
  display: none;
}

.refresh-icon {
  display: inline-flex;
  line-height: 1;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reminders-alert {
  margin: 0;
}

.reminders-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: start;
  transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}

.summary-card:hover {
  border-color: var(--brand-color);
  box-shadow: var(--shadow-sm);
}

.summary-card__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.summary-card strong {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.summary-card--warning strong { color: #b7791f; }
.summary-card--success strong { color: #18a058; }
.summary-card--danger strong { color: #d03050; }

.reminders-panel {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.reminders-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.reminders-panel__head h2 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 700;
}

.reminders-panel__head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.reminders-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px;
  gap: 10px;
  align-items: center;
}

.reminders-search :deep(.n-input),
.reminders-status-select :deep(.n-base-selection) {
  border-radius: 12px;
}

.quick-filterbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: transparent;
}

.quick-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 6px 13px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.quick-pill span {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-primary);
  text-align: center;
  font-weight: 700;
}

.quick-pill:hover,
.quick-pill--active {
  color: var(--text-primary);
}

.quick-pill--active {
  background: var(--bg-card);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.reminders-body {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 14px;
  align-items: start;
}

.reminders-categories {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: transparent;
}

.reminders-categories .quick-pill {
  justify-content: space-between;
  width: 100%;
}

.reminders-table {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.reminders-table--with-sidebar {
  min-width: 0;
}

.reminders-table :deep(.n-data-table-th) {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  justify-content: flex-start;
  gap: 4px;
}

.reminders-table :deep(.n-data-table-th__title-wrapper) {
  flex: 0 1 auto;
  justify-content: flex-start;
  gap: 4px;
}

.reminders-table :deep(.n-data-table-th__title) {
  flex: 0 0 auto;
  margin-inline-end: 0;
  white-space: nowrap;
}

.reminders-table :deep(.n-data-table-filter) {
  margin-inline-start: 0;
  color: var(--text-secondary);
}

.reminders-table :deep(.n-data-table-filter--active) {
  color: var(--brand-color);
}

.reminders-table :deep(.n-data-table-sorter) {
  margin-inline-start: 0;
  color: var(--text-secondary);
}

.reminders-table :deep(.n-data-table-sorter--asc),
.reminders-table :deep(.n-data-table-sorter--desc) {
  color: var(--brand-color);
}

.reminders-table :deep(.n-data-table-td) {
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: top;
}

.icon-btn {
  padding: 4px 6px;
  min-width: 32px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

.reminders-table :deep(.reminder-row--clickable) {
  cursor: pointer;
}

.reminders-table :deep(.reminder-row--clickable:hover td) {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
  cursor: pointer;
}

.reminders-table :deep(.reminder-row--selectable) {
  cursor: pointer;
}

.reminders-table :deep(.reminder-row--selectable:hover td) {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.personal-reminder-hint {
  margin: -4px 0 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.reminder-client-cell,
.reminder-date-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.reminder-actions-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.reminder-sync-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-inline: 8px;
  border-radius: 8px;
}

.reminder-sync-icon--on {
  color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 20%, transparent);
}

.reminder-sync-icon--off {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text-muted) 18%, var(--bg-elevated));
}

.reminder-email-cell,
.reminder-source-cell {
  display: block;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-email-cell {
  direction: ltr;
  text-align: start;
}

.reminder-source-cell {
  color: var(--text-secondary);
  font-weight: 600;
}

.link-button {
  width: fit-content;
  max-width: 100%;
  border: 0;
  background: transparent;
  color: var(--brand-color);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  padding: 0;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-button:hover {
  text-decoration: underline;
}

.reminder-date-cell__date {
  display: block;
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.45;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .reminders-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .reminders-actions,
  .rbtn {
    width: 100%;
  }

  .reminders-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reminders-controls {
    grid-template-columns: 1fr;
  }

  .quick-filterbar {
    width: 100%;
  }

  .quick-filterbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .quick-filterbar::-webkit-scrollbar {
    display: none;
  }

  .quick-pill {
    flex: 0 0 auto;
  }

  .reminders-table :deep(.n-data-table-wrapper) {
    overflow-x: auto;
  }

  .reminders-body {
    grid-template-columns: 1fr;
  }

  .reminders-categories {
    flex-direction: row;
    flex-wrap: wrap;
    overflow-x: auto;
  }

  :deep(.n-dialog__action) {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  :deep(.n-dialog__action .n-button) {
    width: 100%;
  }
}

@media (max-width: 460px) {
  .reminders-summary {
    grid-template-columns: 1fr;
  }
}
</style>
