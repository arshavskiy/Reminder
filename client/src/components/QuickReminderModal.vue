<template>
  <n-modal
    :show="show"
    :title="l.reminders.newReminder"
    :show-icon="false"
    preset="dialog"
    style="width: 480px; max-width: 95vw"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <n-form label-placement="top" :dir="dir" :show-feedback="false" class="reminder-create-form">
      <p class="quick-reminder__hint">{{ l.reminders.personalReminderHint }}</p>
      <n-form-item :label="l.remindersMsg.title" required>
        <n-input v-model:value="title" :placeholder="l.notifications.quickAddTitlePlaceholder" @keydown.enter.prevent="submit" />
      </n-form-item>
      <n-form-item :label="l.reminders.targetDate" required>
        <n-date-picker v-model:value="targetDateMs" type="date" style="width: 100%" />
      </n-form-item>
      <n-form-item :label="l.notifications.quickAddCategoryLabel">
        <ReminderCategorySelect
          v-model:value="category"
          :options="categoryOptions"
          :placeholder="l.notifications.quickAddCategoryPlaceholder"
        />
      </n-form-item>
      <n-form-item :label="l.notifications.quickAddRemindBeforeLabel">
        <n-input v-model:value="remindBeforeDays" :placeholder="l.notifications.quickAddRemindBeforePlaceholder" />
      </n-form-item>
      <div class="reminder-checkbox-row">
        <n-checkbox v-model:checked="alsoEmailSelf">{{ l.reminders.alsoEmailSelf }}</n-checkbox>
      </div>
    </n-form>
    <template #action>
      <div class="quick-reminder__actions">
        <n-button text type="primary" @click="openFullForm">{{ l.reminders.newClientReminderLink }}</n-button>
        <span class="quick-reminder__spacer" />
        <n-button @click="emit('update:show', false)">{{ l.remindersMsg.cancel }}</n-button>
        <n-button type="primary" :loading="saving" @click="submit">{{ l.notifications.quickAddSubmit }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import ReminderCategorySelect from "./ReminderCategorySelect.vue";
import {computed, ref, watch} from "vue";
import {useRouter} from "vue-router";
import {NButton, NCheckbox, NDatePicker, NForm, NFormItem, NInput, NModal, useMessage} from "naive-ui";
import {api} from "../services/apiService.js";
import {useAuthStore} from "../stores/auth.js";
import {useI18n} from "../composables/useI18n.js";

/**
 * Quick way to add a personal reminder (title, date, optional category and lead time)
 * from any page. A reminder to a client or by email needs the full form, which lives on
 * the Reminders page, so the modal links there.
 */
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "created"): void;
}>();

const {l, href, dir} = useI18n();
const router = useRouter();
const message = useMessage();
const authStore = useAuthStore();

const title = ref("");
const targetDateMs = ref<number | null>(null);
const category = ref<string | null>("Personal");
const remindBeforeDays = ref("");
const alsoEmailSelf = ref(false);
const saving = ref(false);
const knownCategories = ref<string[]>([]);

const categoryOptions = computed(() => {
  const names = new Set<string>(["Personal", ...knownCategories.value]);
  return [...names].map((name) => ({label: name, value: name}));
});

function reset() {
  title.value = "";
  targetDateMs.value = null;
  category.value = "Personal";
  remindBeforeDays.value = "";
  alsoEmailSelf.value = false;
}

// Refresh saved user categories each time the form opens.
watch(() => props.show, async (open) => {
  if (!open) return;
  reset();
  knownCategories.value = [];
  try {
    knownCategories.value = (await api.reminders.categories(true)).categories.map((item) => item.name).filter(Boolean);
  } catch { /* the list just offers "Personal" */ }
});

function dateString(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function submit() {
  if (!title.value.trim() || !targetDateMs.value) {
    message.warning(l.value.reminders.missingTitleAndDate);
    return;
  }
  saving.value = true;
  try {
    await api.reminders.createPersonal({
      title: title.value.trim(),
      target_date: dateString(targetDateMs.value),
      reminder_category: category.value?.trim() || "Personal",
      email_to: alsoEmailSelf.value ? (authStore.user?.email ?? null) : null,
      remind_before_days: remindBeforeDays.value.trim() || null,
      sync_calendar: true,
      calendar_kind: "task",
      calendar_time: null,
    });
    message.success(l.value.notifications.quickAddSuccess);
    emit("update:show", false);
    emit("created");
  } catch (err) {
    message.error(err instanceof Error ? err.message : l.value.notifications.quickAddError);
  } finally {
    saving.value = false;
  }
}

function openFullForm() {
  emit("update:show", false);
  void router.push({path: href("/reminders"), query: {new: "client"}});
}
</script>

<style scoped>
.quick-reminder__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.quick-reminder__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  flex-wrap: wrap;
}
.quick-reminder__spacer {
  flex: 1 1 auto;
}
</style>
