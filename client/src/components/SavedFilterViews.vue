<template>
  <n-button @click="open">{{ l.savedViews.title }}</n-button>
  <n-modal v-model:show="show" preset="card" :title="l.savedViews.title" style="width: 420px; max-width: 95vw">
    <div class="saved-views" :dir="dir">
      <p>{{ l.savedViews.hint }}</p>
      <n-select v-model:value="selected" :options="options" :placeholder="l.savedViews.pick" clearable @update:value="select" />
      <div class="saved-views__actions">
        <n-button type="primary" :disabled="!selected" @click="apply">{{ l.savedViews.apply }}</n-button>
        <n-button :disabled="!selected" @click="remove">{{ l.savedViews.remove }}</n-button>
      </div>
      <n-input v-model:value="name" :maxlength="60" :placeholder="l.savedViews.name" :input-props="{'aria-label': l.savedViews.name}" @keydown.enter.prevent="save" />
      <n-button :disabled="!name.trim() || saving" :loading="saving" @click="save">{{ replacing ? l.savedViews.replace : l.savedViews.save }}</n-button>
      <p>{{ l.savedViews.limit }}</p>
    </div>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NButton, NInput, NModal, NSelect, useMessage } from "naive-ui";
import { useAuthStore } from "../stores/auth.js";
import { useI18n } from "../composables/useI18n.js";
import { api } from "../services/apiService.js";

interface SavedView { name: string; state: Record<string, unknown> }

const props = defineProps<{ page: string; snapshot: () => Record<string, unknown> }>();
const emit = defineEmits<{ (e: "apply", state: Record<string, unknown>): void }>();
const auth = useAuthStore();
const { l, dir } = useI18n();
const message = useMessage();
const show = ref(false);
const views = ref<SavedView[]>([]);
const name = ref("");
const selected = ref<string | null>(null);
const saving = ref(false);
const options = computed(() => views.value.map(v => ({ label: v.name, value: v.name })));
const replacing = computed(() => views.value.some(v => v.name === name.value.trim()));

watch(() => auth.user?.id, () => { show.value = false; views.value = []; selected.value = null; name.value = ""; });

async function open() {
  try {
    const result = await api.invoices.savedViews.list(props.page);
    views.value = result.views;
    show.value = true;
  } catch {
    message.error(l.value.savedViews.error);
  }
}

function select(value: string | null) { name.value = value ?? ""; }

async function save() {
  if (!name.value.trim() || saving.value) return;
  saving.value = true;
  try {
    const result = await api.invoices.savedViews.save(props.page, name.value, props.snapshot());
    views.value = result.views;
    selected.value = name.value.trim();
    message.success(l.value.savedViews.saved);
  } catch {
    message.error(l.value.savedViews.error);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!selected.value) return;
  try {
    const result = await api.invoices.savedViews.remove(props.page, selected.value);
    views.value = result.views;
    selected.value = null;
    name.value = "";
  } catch {
    message.error(l.value.savedViews.error);
  }
}

function apply() {
  const view = views.value.find(v => v.name === selected.value);
  if (!view) return;
  emit("apply", JSON.parse(JSON.stringify(view.state)));
  show.value = false;
}
</script>
<style scoped>
.saved-views { display: grid; gap: 12px; }
.saved-views p { margin: 0; color: var(--text-secondary); font-size: 13px; }
.saved-views__actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
