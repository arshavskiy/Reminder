<template>
  <div>

    <n-space style="margin-bottom: 16px" align="center">
      <n-tabs
        v-model:value="kind"
        type="segment"
        size="small"
        style="min-width: 280px"
        @update:value="load"
      >
        <n-tab-pane name="contract" tab="חוזים" />
        <n-tab-pane name="inspection" tab="תסקירים" />
        <n-tab-pane name="all" tab="הכל" />
      </n-tabs>
      <n-select
        v-model:value="statusFilter"
        :options="statusOptions"
        placeholder="כל הסטטוסים"
        clearable
        style="width: 160px"
        @update:value="load"
      />
      <n-tag v-if="store.expiringSoon.length" type="warning">
        {{ store.expiringSoon.length }} פגים בתוך 30 יום
      </n-tag>
    </n-space>

    <n-data-table
      :columns="columns"
      :data="store.rows"
      :loading="store.loading"
      :pagination="{ pageSize: 20 }"
      :row-key="(r: any) => r.id"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, h } from "vue";
import { useRouter } from "vue-router";
import { NH2, NSpace, NSelect, NDataTable, NTag, NTabs, NTabPane } from "naive-ui";
import { useContractsStore } from "../stores/contracts.js";
import ExpiryBadge from "../components/ExpiryBadge.vue";
import StatusBadge from "../components/StatusBadge.vue";
import type { ContractWithClient } from "@shared/types.js";

const store = useContractsStore();
const router = useRouter();
const statusFilter = ref<string | null>(null);
const kind = ref<"contract" | "inspection" | "all">("contract");

const statusOptions = [
  { label: "פעיל", value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל", value: "cancelled" },
  { label: "חודש", value: "renewed" },
];

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 100, kind: kind.value });
}

onMounted(() => {
  load();
  store.fetchExpiring(30);
});

const numberColumnTitle = computed(() =>
  kind.value === "inspection" ? "מספר תסקיר" : kind.value === "all" ? "מספר" : "מספר חוזה"
);
const typeColumnTitle = computed(() =>
  kind.value === "inspection" ? "סוג תסקיר" : "סוג חוזה"
);

const columns = computed(() => [
  { title: numberColumnTitle.value, key: "contract_number", width: 140 },
  {
    title: "לקוח",
    key: "client_name",
    render: (row: ContractWithClient) =>
      row.client_id
        ? h("a", {
            style: "cursor:pointer;color:var(--brand-color)",
            onClick: () => router.push(`/clients/${row.client_id}`),
          }, row.client_name ?? "—")
        : (row.client_name ?? "—"),
  },
  { title: typeColumnTitle.value, key: "contract_type", width: 130 },
  { title: "תאריך התחלה", key: "start_date", width: 130 },
  { title: "תאריך פקיעה", key: "expiry_date", width: 130 },
  {
    title: "מצב פקיעה",
    key: "expiry_badge",
    width: 160,
    render: (row: ContractWithClient) => h(ExpiryBadge, { date: row.expiry_date }),
  },
  {
    title: "סטטוס",
    key: "status",
    width: 100,
    render: (row: ContractWithClient) => h(StatusBadge, { status: row.status }),
  },
  {
    title: "מסמך",
    key: "document_name",
    render: (row: ContractWithClient) =>
      h("a", {
        style: "cursor:pointer;color:var(--brand-color)",
        onClick: () => router.push(`/documents/${row.document_id}`),
      }, row.document_name ?? "—"),
  },
]);
</script>
