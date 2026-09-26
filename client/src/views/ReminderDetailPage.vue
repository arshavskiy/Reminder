<template>
  <div class="reminder-detail" :dir="dir">
    <PageHeader :title="form.title || l.reminders.editReminder" :subtitle="typeLabel">
      <template #breadcrumb>
        <router-link :to="href('/reminders')">{{ l.reminders.title }}</router-link>
        <span class="sep">/</span>
        <span>{{ form.title || l.reminders.editReminder }}</span>
      </template>
      <template #actions>
        <button class="btn btn--ghost" type="button" @click="router.push(href('/reminders'))">
          <n-icon :component="ArrowForwardOutline" class="btn-icon" />
          {{ l.common.back }}
        </button>
        <button
          v-if="row && row.status !== 'dismissed' && hasDeliveryTarget"
          class="btn btn--ghost"
          type="button"
          :disabled="sending || (!isPersonal && !form.emailTo.trim()) || (isPersonal && !form.alsoEmailSelf)"
          @click="sendNow"
        >
          <n-icon :component="PaperPlaneOutline" class="btn-icon" />
          {{ l.reminders.sendReminder }}
        </button>
        <button class="btn btn--primary" type="button" :disabled="saving || !form.title.trim()" @click="save">
          {{ l.common.save }}
        </button>
      </template>
    </PageHeader>

    <n-spin :show="loading">
      <p v-if="loadError" class="reminder-detail__error">{{ loadError }}</p>
      <form v-else-if="row" class="reminder-detail__grid" @submit.prevent="save">
        <section class="rd-card">
          <h2>{{ l.reminders.detailBasics }}</h2>
          <n-form label-placement="top">
            <n-form-item :label="l.reminders.reminderKindLabel">
              <div class="rd-chips">
                <StatusBadge :status="row.status" />
                <span class="rd-chip">{{ typeLabel }}</span>
              </div>
            </n-form-item>
            <n-form-item :label="l.notifications.quickAddTitleLabel" required>
              <n-input v-model:value="form.title" />
            </n-form-item>
            <n-form-item :label="l.notifications.quickAddCategoryLabel">
              <n-select
                v-model:value="form.category"
                :options="categoryOptions"
                :placeholder="l.notifications.quickAddCategoryPlaceholder"
                clearable
                filterable
                tag
                :virtual-scroll="false"
              />
            </n-form-item>
            <n-form-item :label="l.reminders.detailNotes">
              <n-input v-model:value="form.body" type="textarea" :rows="3" />
            </n-form-item>
          </n-form>
        </section>

        <section class="rd-card">
          <h2>{{ l.reminders.detailSchedule }}</h2>
          <n-form label-placement="top">
            <n-form-item :label="isPersonal ? l.reminders.targetDate : l.reminders.dateColumn" required>
              <n-date-picker v-model:value="form.targetMs" type="date" style="width: 100%" />
            </n-form-item>
            <n-form-item :label="l.reminders.daysBefore">
              <n-input-number
                v-model:value="form.advanceDays"
                :min="0"
                :max="365"
                :show-button="false"
                :placeholder="l.notifications.quickAddRemindBeforePlaceholder"
                style="width: 100%"
              />
            </n-form-item>
            <n-form-item :label="l.reminders.detailSendDate">
              <n-date-picker v-model:value="form.triggerMs" type="date" style="width: 100%" />
            </n-form-item>
          </n-form>
        </section>

        <section v-if="isPersonal" class="rd-card">
          <h2>{{ l.reminders.detailDelivery }}</h2>
          <n-form label-placement="top">
            <n-form-item>
              <n-checkbox v-model:checked="form.alsoEmailSelf">{{ l.reminders.alsoEmailSelf }}</n-checkbox>
            </n-form-item>
            <p class="rd-hint">{{ l.reminders.personalReminderHint }}</p>
          </n-form>
        </section>

        <section class="rd-card rd-card--calendar rd-card--wide">
          <div class="rd-cal">
            <span
              class="rd-cal__media"
              :class="row.calendar_synced ? 'rd-cal__media--on' : 'rd-cal__media--off'"
            >
              <n-icon
                :component="row.calendar_task_id ? CheckboxOutline : CalendarOutline"
                :size="20"
              />
            </span>
            <div class="rd-cal__text">
              <div class="rd-cal__title">
                <h2>{{ l.reminders.detailCalendar }}</h2>
                <span
                  class="tag"
                  :class="row.calendar_synced ? 'tag--success' : 'tag--neutral'"
                >
                  {{ row.calendar_synced ? l.reminders.detailCalendarOn : l.reminders.detailCalendarNotSynced }}
                </span>
              </div>
              <p class="rd-cal__desc">
                <template v-if="row.calendar_synced && row.calendar_task_id">
                  {{ l.reminders.calendarSyncedAsTask }}
                </template>
                <template v-else>{{ l.reminders.detailCalendarHint }}</template>
              </p>
              <p v-if="row.contract_number" class="rd-meta">{{ l.reminders.inspection }}: {{ row.contract_number }}</p>
              <p v-if="row.document_name" class="rd-meta">{{ l.dashboard.statDocuments }}: {{ row.document_name }}</p>
            </div>
            <button
              class="btn rd-cal__action"
              :class="[
                row.calendar_synced ? 'btn--ghost' : 'btn--primary',
                { 'btn--loading': syncing },
              ]"
              type="button"
              :disabled="syncing"
              @click="syncCalendar"
            >
              <n-icon :component="RefreshOutline" :size="16" class="btn-icon" />
              {{ l.reminders.detailSyncCalendar }}
            </button>
          </div>
        </section>

        <div class="rd-footer">
          <button v-if="hasDeliveryTarget" class="btn btn--ghost" type="button" @click="openPreview">
            <n-icon :component="EyeOutline" :size="16" class="btn-icon" />
            {{ l.common.preview }}
          </button>
          <button
            v-if="row.status === 'pending'"
            class="btn btn--ghost"
            type="button"
            @click="dismiss"
          >
            {{ l.reminders.dismissReminder }}
          </button>
          <button class="btn btn--danger" type="button" @click="remove">
            <n-icon :component="TrashOutline" :size="16" class="btn-icon" />
            {{ l.common.delete }}
          </button>
        </div>
      </form>
    </n-spin>

    <ReminderPreviewModal
      v-model:show="showPreview"
      :reminder-id="row?.id ?? null"
      :reminder-title="form.title"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NCheckbox,
  NDatePicker,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSpin,
  useMessage,
} from "naive-ui";
import {
  ArrowForwardOutline,
  CalendarOutline,
  CheckboxOutline,
  EyeOutline,
  PaperPlaneOutline,
  RefreshOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import StatusBadge from "../components/StatusBadge.vue";
import ReminderPreviewModal from "../components/modals/ReminderPreviewModal.vue";
import { api } from "../services/apiService.js";
import { useI18n } from "../composables/useI18n.js";
import { useAuthStore } from "../stores/auth.js";
import { useClientsStore } from "../stores/clients.js";
import { useFeaturesStore } from "../stores/features.js";
import { useConfirm } from "../composables/useConfirm.js";
import { FEATURES } from "../shared/features.js";
import { categoryLabel } from "../utils/reminderCategoryLabels.js";
import type { Client, EmailTemplate, ReminderWithContext } from "@shared/types.js";

function localDateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function msToLocalDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { l, href, dir, locale } = useI18n();
const authStore = useAuthStore();
const clientsStore = useClientsStore();
const featuresStore = useFeaturesStore();
const { confirm } = useConfirm();

const loading = ref(true);
const saving = ref(false);
const sending = ref(false);
const syncing = ref(false);
const loadError = ref("");
const row = ref<ReminderWithContext | null>(null);
const showPreview = ref(false);
const categories = ref<{ name: string; count: number }[]>([]);
const emailTemplates = ref<EmailTemplate[]>([]);

const form = reactive({
  title: "",
  body: "",
  category: null as string | null,
  targetMs: null as number | null,
  triggerMs: null as number | null,
  advanceDays: null as number | null,
  emailTo: "",
  emailTemplateId: null as string | null,
  clientId: null as string | null,
  alsoEmailSelf: false,
});

const canSelectEmailTemplates = computed(() => featuresStore.hasFeature(FEATURES.pages.emailTemplates));
const isPersonal = computed(() => row.value?.source_type === "personal");
const hasDeliveryTarget = computed(() => isPersonal.value || Boolean(form.clientId) || Boolean(form.emailTo.trim()));

const typeLabel = computed(() => {
  const t = row.value?.source_type;
  if (t === "personal") return l.value.reminders.sourcePersonal;
  if (t === "contract_expiry") return l.value.reminders.sourceContract;
  if (t === "task") return l.value.reminders.sourceTask;
  if (t === "table_import") return l.value.reminders.sourceImport;
  return l.value.reminders.sourceManual;
});

const categoryOptions = computed(() => {
  const options = categories.value.map((c) => ({ label: categoryLabel(c.name, locale.value), value: c.name }));
  if (!options.some((o) => o.value === "Personal")) {
    options.push({ label: categoryLabel("Personal", locale.value), value: "Personal" });
  }
  return options;
});

const clientOptions = computed(() =>
  clientsStore.rows.map((c: Client) => ({
    label: c.email ? `${c.display_name}  ·  ${c.email}` : c.display_name,
    value: c.id,
  })),
);

const emailTemplateOptions = computed(() =>
  emailTemplates.value.map((t) => ({
    label: t.is_default ? `${t.name}` : t.name,
    value: t.id,
  })),
);

function displayEmailTo(emailTo: string | null | undefined): string {
  if (!emailTo) return "";
  try {
    const parsed = JSON.parse(emailTo);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return emailTo;
  }
}

function applyRow(r: ReminderWithContext) {
  row.value = r;
  form.title = r.title ?? "";
  form.body = r.body ?? "";
  form.category = r.reminder_category || r.contract_type || null;
  const target = r.expiry_date || r.trigger_date;
  form.targetMs = target ? localDateToMs(target.slice(0, 10)) : null;
  form.triggerMs = r.trigger_date ? localDateToMs(r.trigger_date.slice(0, 10)) : null;
  form.advanceDays = r.advance_days ?? null;
  form.emailTo = displayEmailTo(r.email_to || r.client_email);
  form.emailTemplateId = r.email_template_id != null ? String(r.email_template_id) : null;
  form.clientId = r.client_id != null ? String(r.client_id) : null;
  form.alsoEmailSelf = Boolean(r.email_to) && r.source_type === "personal";
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const id = String(route.params.id);
    const [reminder] = await Promise.all([
      api.reminders.get(id),
      clientsStore.fetch().catch(() => {}),
      api.reminders.categories().then((d) => { categories.value = d.categories; }).catch(() => {}),
      canSelectEmailTemplates.value
        ? api.emailTemplates.list().then((t) => { emailTemplates.value = t; }).catch(() => {})
        : Promise.resolve(),
    ]);
    applyRow(reminder);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!row.value || !form.title.trim() || !form.targetMs) {
    message.warning(l.value.reminders.missingTitleAndDate);
    return;
  }
  saving.value = true;
  try {
    const targetDate = msToLocalDateStr(form.targetMs);
    const triggerDate = isPersonal.value
      ? targetDate
      : (form.triggerMs ? msToLocalDateStr(form.triggerMs) : targetDate);
    const emailTo = isPersonal.value
      ? (form.alsoEmailSelf ? (authStore.user?.email ?? null) : null)
      : (form.emailTo.trim() || null);
    const updated = await api.reminders.update(row.value.id, {
      title: form.title.trim(),
      body: form.body.trim() || null,
      reminder_category: form.category,
      trigger_date: triggerDate,
      expiry_date: targetDate,
      advance_days: form.advanceDays ?? 0,
      email_to: emailTo,
      email_template_id: canSelectEmailTemplates.value ? form.emailTemplateId : undefined,
      client_id: isPersonal.value ? null : form.clientId,
    } as any);
    applyRow(updated);
    message.success(l.value.reminders.detailSaved);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function syncCalendar() {
  if (!row.value) return;
  syncing.value = true;
  try {
    const result = await api.reminders.syncCalendar(row.value.id);
    if (result.reminder) applyRow(result.reminder);
    if (result.synced) message.success(l.value.reminders.detailSyncCalendarDone);
    else message.warning(l.value.reminders.detailSyncCalendarFailed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("calendar_not_connected")) {
      message.info(l.value.reminders.detailSyncCalendarNeedConnect);
      try {
        const { url } = await api.calendar.authUrl(route.fullPath);
        window.location.assign(url);
        return;
      } catch {
        /* fall through */
      }
    }
    message.error(msg || l.value.reminders.detailSyncCalendarFailed);
  } finally {
    syncing.value = false;
  }
}

async function sendNow() {
  if (!row.value) return;
  sending.value = true;
  try {
    await save();
    const result = await api.reminders.sendNow(row.value.id);
    if (result.success === false) throw new Error(result.error || l.value.reminders.detailSendFailed);
    message.success(l.value.common.sent);
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    sending.value = false;
  }
}

function openPreview() {
  showPreview.value = true;
}

function dismiss() {
  if (!row.value) return;
  confirm({
    title: l.value.reminders.dismissReminder,
    content: form.title,
    confirmText: l.value.reminders.dismissReminder,
    onConfirm: async () => {
      await api.reminders.dismiss(row.value!.id);
      message.success(l.value.reminders.dismissReminder);
      await load();
    },
  });
}

function remove() {
  if (!row.value) return;
  confirm({
    title: l.value.common.delete,
    content: form.title,
    confirmText: l.value.common.delete,
    onConfirm: async () => {
      await api.reminders.delete(row.value!.id);
      message.success(l.value.reminders.detailDeleted);
      router.push(href("/reminders"));
    },
  });
}

onMounted(async () => {
  await featuresStore.fetchFeatures().catch(() => {});
  await load();
});

watch(() => route.params.id, () => {
  if (route.params.id) void load();
});

watch([() => form.targetMs, () => form.advanceDays], ([target, days]) => {
  if (target && days != null && days > 0) {
    const d = new Date(target);
    d.setDate(d.getDate() - days);
    form.triggerMs = d.getTime();
  }
});
</script>

<style scoped>
.reminder-detail {
  max-width: 1100px;
}
.reminder-detail__error {
  color: var(--color-error);
}
.reminder-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.rd-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 18px 20px 8px;
}
.rd-card h2 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
}
.rd-card--calendar {
  padding: 16px 18px;
}
.rd-card--calendar h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.rd-chips {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rd-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}
.rd-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.rd-card--wide {
  grid-column: 1 / -1;
}
.rd-cal {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 14px;
}
.rd-cal__media {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.rd-cal__media--on {
  color: var(--brand-color);
  border-color: color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
}
.rd-cal__media--off {
  opacity: 0.85;
}
.rd-cal__text {
  min-width: 0;
}
.rd-cal__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.rd-cal__desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}
.rd-cal__action {
  flex-shrink: 0;
}
.rd-meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.rd-footer {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
@media (max-width: 800px) {
  .reminder-detail__grid {
    grid-template-columns: 1fr;
  }
  .rd-cal {
    grid-template-columns: 40px minmax(0, 1fr);
    row-gap: 12px;
  }
  .rd-cal__action {
    grid-column: 1 / -1;
    width: 100%;
    justify-content: center;
  }
}
</style>
