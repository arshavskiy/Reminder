<template>
  <main class="review-page" :dir="dir">
    <header class="review-head">
      <div>
        <h1>{{ r.title }}</h1>
        <p class="muted">{{ r.subtitle }}</p>
      </div>
      <n-button v-if="items.length" type="primary" :loading="bulkApproving" @click="approveAll">
        <template #icon><n-icon :component="CheckmarkDoneOutline" /></template>
        {{ t("review.approveAll", {n: items.length}) }}
      </n-button>
    </header>

    <n-spin :show="loading">
      <p v-if="!loading && !items.length" class="review-empty">
        <n-icon :component="ShieldCheckmarkOutline" :size="28" />
        {{ r.empty }}
      </p>

      <ul v-else class="review-list">
        <li v-for="item in items" :key="item.id" class="review-item">
          <div class="review-item__main">
            <router-link class="review-item__title" :to="href(`/documents/${item.id}`)" dir="auto">{{ item.file_name || r.untitled }}</router-link>
            <div class="review-item__meta">
              <span v-if="item.supplier" dir="auto">{{ item.supplier }}</span>
              <span v-if="item.amount_display" dir="ltr">{{ item.amount_display }}</span>
              <span v-if="item.issue_date" dir="ltr">{{ item.issue_date }}</span>
              <n-tag size="small" :bordered="false">{{ sourceLabel(item.source) }}</n-tag>
            </div>
            <div class="review-item__reasons">
              <n-tag v-for="reason in item.reasons" :key="reason" size="small" type="warning" :bordered="false">
                {{ reasonLabel(reason) }}
              </n-tag>
            </div>
          </div>
          <div class="review-item__actions">
            <n-button v-if="item.invoice_id" size="small" :disabled="bulkApproving || busyId === item.id" @click="editingItem = item">{{ r.editDetails }}</n-button>
            <n-button size="small" :loading="busyId === item.id" type="primary" ghost @click="approve(item)">{{ r.approve }}</n-button>
            <n-button size="small" @click="router.push(href(`/documents/${item.id}`))">{{ r.open }}</n-button>
            <n-button size="small" quaternary type="error" :disabled="busyId === item.id" @click="dismiss(item)">{{ r.dismiss }}</n-button>
          </div>
        </li>
      </ul>
    </n-spin>

    <n-pagination v-if="total > pageSize" v-model:page="page" :item-count="total" :page-size="pageSize" @update:page="load" />
    <ReviewCorrectionModal :item="editingItem" @close="editingItem = null" @saved="load" />
  </main>
</template>

<script lang="ts" setup>
import ReviewCorrectionModal from "../components/ReviewCorrectionModal.vue";
import {computed, onMounted, ref} from "vue";
import {useRouter} from "vue-router";
import {NButton, NIcon, NPagination, NSpin, NTag, useMessage} from "naive-ui";
import {CheckmarkDoneOutline, ShieldCheckmarkOutline} from "@vicons/ionicons5";
import {api, type ReviewItem} from "../services/apiService.js";
import {useI18n} from "../composables/useI18n.js";
import {useConfirm} from "../composables/useConfirm.js";
import {useReviewQueueStore} from "../stores/reviewQueue.js";

const {l, t, href, dir} = useI18n();
const r = computed(() => l.value.review);
const router = useRouter();
const message = useMessage();
const {confirm} = useConfirm();
const queue = useReviewQueueStore();

const editingItem = ref<ReviewItem | null>(null);
const items = ref<ReviewItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(true);
const busyId = ref<string | null>(null);
const bulkApproving = ref(false);

function reasonLabel(reason: string): string {
  return (r.value.reasons as Record<string, string>)[reason] ?? reason;
}

function sourceLabel(source: string): string {
  return (r.value.sources as Record<string, string>)[source] ?? source;
}

async function load() {
  loading.value = true;
  try {
    const result = await api.review.list({status: "pending", limit: pageSize, offset: (page.value - 1) * pageSize});
    items.value = result.items;
    total.value = result.total;
    queue.set(result.total);
    // Approving the last item of a later page leaves it empty: step back.
    if (!result.items.length && page.value > 1) {
      page.value -= 1;
      await load();
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

async function approve(item: ReviewItem) {
  busyId.value = item.id;
  try {
    await api.review.approve([item.id]);
    message.success(r.value.approved);
    await load();
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  } finally {
    busyId.value = null;
  }
}

async function approveAll() {
  bulkApproving.value = true;
  try {
    const result = await api.review.approve(items.value.map((item) => item.id));
    message.success(t("review.approvedMany", {n: result.approved}));
    await load();
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  } finally {
    bulkApproving.value = false;
  }
}

function dismiss(item: ReviewItem) {
  confirm({
    title: r.value.dismissTitle,
    content: r.value.dismissBody,
    confirmText: r.value.dismiss,
    cancelText: r.value.cancel,
    type: "warning",
    onConfirm: async () => {
      busyId.value = item.id;
      try {
        await api.review.dismiss(item.id);
        message.success(r.value.dismissed);
        await load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : String(err));
      } finally {
        busyId.value = null;
      }
    },
  });
}

onMounted(load);
</script>

<style scoped>
.review-page { max-width: 960px; margin: 0 auto; display: grid; gap: 16px; }
.review-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.review-head h1 { margin: 0 0 4px; font-size: 22px; }
.muted { margin: 0; color: var(--text-secondary); font-size: 13px; }
.review-empty { display: flex; align-items: center; gap: 10px; padding: 28px; border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-secondary); }
.review-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.review-item { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card); }
.review-item__main { min-width: 0; display: grid; gap: 6px; }
.review-item__title { font-weight: 600; color: var(--text-primary); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.review-item__title:hover { color: var(--brand-color); }
.review-item__meta, .review-item__reasons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; color: var(--text-secondary); }
.review-item__actions { display: flex; gap: 8px; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 640px) {
  .review-item { flex-direction: column; align-items: stretch; }
  .review-item__actions { justify-content: flex-start; }
}
</style>
