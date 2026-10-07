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
      <n-button :disabled="!name.trim()" @click="save">{{ replacing ? l.savedViews.replace : l.savedViews.save }}</n-button>
      <p>{{ l.savedViews.limit }}</p>
    </div>
  </n-modal>
</template>
<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {NButton, NInput, NModal, NSelect, useMessage} from "naive-ui";
import {useAuthStore} from "../stores/auth.js";
import {useI18n} from "../composables/useI18n.js";
import {deleteSavedView, readSavedViews, savedViewsKey, writeSavedView, type SavedView} from "../shared/savedViews";
const props = defineProps<{page: string; snapshot: () => Record<string, unknown>}>();
const emit = defineEmits<{(e: "apply", state: Record<string, unknown>): void}>();
const auth = useAuthStore();
const {l, dir} = useI18n();
const message = useMessage();
const show = ref(false);
const views = ref<SavedView[]>([]);
const name = ref("");
const selected = ref<string | null>(null);
const key = computed(() => auth.user?.id == null ? null : savedViewsKey(auth.user.id, props.page));
const options = computed(() => views.value.map(v => ({label: v.name, value: v.name})));
const replacing = computed(() => views.value.some(v => v.name === name.value.trim()));
watch(key, () => { show.value = false; views.value = []; selected.value = null; name.value = ""; });
function open() {
  try { if (!key.value) return; views.value = readSavedViews(localStorage, key.value); show.value = true; }
  catch { message.error(l.value.savedViews.error); }
}
function select(value: string | null) { name.value = value ?? ""; }
function save() {
  if (!key.value || !name.value.trim()) return;
  try { views.value = writeSavedView(localStorage, key.value, name.value, props.snapshot()); selected.value = name.value.trim(); message.success(l.value.savedViews.saved); }
  catch { message.error(l.value.savedViews.error); }
}
function remove() {
  if (!key.value || !selected.value) return;
  try { views.value = deleteSavedView(localStorage, key.value, selected.value); selected.value = null; name.value = ""; }
  catch { message.error(l.value.savedViews.error); }
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
