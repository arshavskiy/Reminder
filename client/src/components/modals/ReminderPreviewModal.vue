<template>
  <n-modal
    :show="show"
    preset="card"
    class="reminder-preview-modal"
    :title="title"
    :style="{ width: 'min(860px, calc(100vw - 32px))' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="reminder-preview" dir="rtl">
      <n-spin :show="loading">
        <n-alert v-if="error" type="error" :show-icon="false" class="reminder-preview__alert">
          {{ error }}
        </n-alert>
        <template v-else-if="preview">
          <div class="reminder-preview__meta">
            <span>נושא</span>
            <strong dir="auto">{{ preview.subject || "ללא נושא" }}</strong>
          </div>
          <iframe
            class="reminder-preview__frame"
            sandbox=""
            :srcdoc="preview.html"
            title="תצוגה מקדימה לאימייל תזכורת"
          />
        </template>
      </n-spin>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {NAlert, NModal, NSpin} from "naive-ui";
import {api} from "../../services/apiService.js";

const props = defineProps<{
  show: boolean;
  reminderId: number | string | null;
  reminderTitle?: string | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const loading = ref(false);
const error = ref("");
const preview = ref<{subject: string; html: string} | null>(null);

const title = computed(() => props.reminderTitle ? `תצוגת תזכורת - ${props.reminderTitle}` : "תצוגת תזכורת");

watch(
  () => [props.show, props.reminderId] as const,
  ([show]) => {
    if (!show) return;
    void loadPreview();
  },
  {immediate: true},
);

async function loadPreview() {
  if (!props.reminderId) {
    preview.value = null;
    error.value = "לא נבחרה תזכורת להצגה";
    return;
  }
  loading.value = true;
  error.value = "";
  preview.value = null;
  try {
    preview.value = await api.reminders.previewEmail(props.reminderId);
  } catch {
    preview.value = null;
    error.value = "שגיאה בטעינת תצוגת התזכורת";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.reminder-preview {
  min-height: 320px;
}

.reminder-preview__alert {
  margin-bottom: 12px;
}

.reminder-preview__meta {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.reminder-preview__meta strong {
  color: var(--text-primary);
  font-size: 15px;
}

.reminder-preview__frame {
  width: 100%;
  height: min(620px, 68vh);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
}
</style>
