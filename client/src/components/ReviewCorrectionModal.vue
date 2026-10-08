<template>
  <n-modal :show="Boolean(item)" preset="card" :title="l.review.editDetails" :style="{width: 'min(1000px, 96vw)'}" :mask-closable="!saving" :closable="!saving" @update:show="close">
    <div class="review-editor" :dir="dir">
      <section class="review-preview">
        <n-spin v-if="previewLoading" />
        <iframe v-else-if="previewUrl && isPdf" :src="previewUrl" :title="item?.file_name" />
        <img v-else-if="previewUrl && isImage" :src="previewUrl" :alt="item?.file_name" />
        <p v-else>{{ l.review.previewUnavailable }}</p>
        <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener">{{ l.review.open }}</a>
      </section>
      <n-form label-placement="top" @submit.prevent>
        <n-tag v-for="reason in item?.reasons" :key="reason" size="small" type="warning">{{ l.review.reasons[reason] }}</n-tag>
        <n-form-item :label="l.common.supplier" required><n-input v-model:value="draft.supplier_name" :disabled="saving" /></n-form-item>
        <n-form-item :label="l.common.amount" required><n-input-number v-model:value="draft.amount" :disabled="saving" style="width: 100%" /></n-form-item>
        <n-form-item :label="l.invoicesMsg.currency" required><n-input v-model:value="draft.currency" :maxlength="3" :disabled="saving" /></n-form-item>
        <n-form-item :label="l.common.date" required><input v-model="draft.issue_date" type="date" :aria-label="l.common.date" :disabled="saving" class="review-date" /></n-form-item>
        <div class="review-editor__actions">
          <n-button :disabled="saving" @click="close">{{ l.review.cancel }}</n-button>
          <n-button :loading="saving" :disabled="!valid" @click="save(false)">{{ l.review.saveChanges }}</n-button>
          <n-button type="primary" :loading="saving" :disabled="!valid" @click="save(true)">{{ l.review.saveApprove }}</n-button>
        </div>
      </n-form>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref, watch} from "vue";
import {NButton, NForm, NFormItem, NInput, NInputNumber, NModal, NSpin, NTag, useMessage} from "naive-ui";
import {api, type ReviewItem} from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";
const props = defineProps<{item: ReviewItem | null}>();
const emit = defineEmits<{(e: "close"): void; (e: "saved"): void}>();
const {l, dir} = useI18n();
const message = useMessage();
const saving = ref(false);
const previewUrl = ref("");
const previewLoading = ref(false);
const draft = reactive({supplier_name: "", amount: null as number | null, currency: "ILS", issue_date: ""});
const valid = computed(() => draft.supplier_name.trim() && draft.amount !== null && Number.isFinite(draft.amount) && /^[A-Za-z]{3}$/.test(draft.currency.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(draft.issue_date));
const isPdf = computed(() => /\.pdf$/i.test(props.item?.file_name ?? ""));
const isImage = computed(() => /\.(png|jpe?g|webp|gif)$/i.test(props.item?.file_name ?? ""));
let request = 0;
function clearPreview() {
  if (previewUrl.value.startsWith("blob:")) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}
watch(() => props.item, async (item) => {
  const current = ++request;
  clearPreview();
  previewLoading.value = false;
  if (!item) return;
  Object.assign(draft, {supplier_name: item.supplier ?? "", amount: item.amount, currency: item.currency, issue_date: item.issue_date ?? ""});
  previewLoading.value = true;
  try {
    const response = await fetch(api.documents.downloadUrl(item.id), {credentials: "include"});
    if (!response.ok) throw new Error("preview");
    const url = response.headers.get("content-type")?.includes("application/json")
      ? (await response.json()).url : URL.createObjectURL(await response.blob());
    if (current === request) previewUrl.value = typeof url === "string" ? url : "";
    else if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
  } catch { /* The editor remains usable when the original file is unavailable. */ }
  finally { if (current === request) previewLoading.value = false; }
}, {immediate: true});
onBeforeUnmount(() => { request++; clearPreview(); });
function close() { if (!saving.value) emit("close"); }
async function save(approve: boolean) {
  if (!props.item || !valid.value || saving.value) return;
  saving.value = true;
  try {
    await api.review.correct(props.item.id, {...draft, amount: draft.amount!, supplier_name: draft.supplier_name.trim(), currency: draft.currency.trim().toUpperCase()});
    if (approve) await api.review.approve([props.item.id]);
    message.success(approve ? l.value.review.approved : l.value.review.changesSaved);
    emit("saved");
    emit("close");
  } catch (err) { message.error(err instanceof Error ? err.message : String(err)); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.review-editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr); gap: 20px; }
.review-preview { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.review-preview iframe { width: 100%; height: 60vh; border: 1px solid var(--border-color); border-radius: 8px; }
.review-preview img { width: 100%; max-height: 60vh; object-fit: contain; }
.review-editor__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.review-date { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); font: inherit; }
@media (max-width: 640px) { .review-editor { grid-template-columns: minmax(0, 1fr); } .review-preview iframe { height: 35vh; } }
</style>
