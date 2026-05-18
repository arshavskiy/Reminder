<template>
  <div>
    <n-h2>חוזים</n-h2>

    <n-space style="margin-bottom: 16px">
      <n-select
        v-model:value="statusFilter"
        :options="statusOptions"
        placeholder="כל הסטטוסים"
        clearable
        style="width: 160px"
        @update:value="load"
      />
      <n-tag v-if="store.expiringSoon.length" type="warning">
        ⚠️ {{ store.expiringSoon.length }} חוזים פגים בתוך 30 יום
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
import { onMounted, ref, h } from "vue";
import { useRouter } from "vue-router";
import { NH2, NSpace, NSelect, NDataTable, NTag } from "naive-ui";
import { useContractsStore } from "../stores/contracts.js";
import ExpiryBadge from "../components/ExpiryBadge.vue";
import StatusBadge from "../components/StatusBadge.vue";
import type { ContractWithClient } from "@shared/types.js";

const store = useContractsStore();
const router = useRouter();
const statusFilter = ref<string | null>(null);

const statusOptions = [
  { label: "פעיל", value: "active" },
  { label: "פג תוקף", value: "expired" },
  { label: "בוטל", value: "cancelled" },
  { label: "חודש", value: "renewed" },
];

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 100 });
}

onMounted(() => {
  load();
  store.fetchExpiring(30);
});

const columns = [
  { title: "מספר חוזה", key: "contract_number", width: 140 },
  {
    title: "לקוח",
    key: "client_name",
    render: (row: ContractWithClient) =>
      row.client_id
        ? h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/clients/${row.client_id}`) }, row.client_name ?? "—")
        : (row.client_name ?? "—"),
  },
  { title: "סוג חוזה", key: "contract_type", width: 130 },
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
      h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/documents/${row.document_id}`) }, row.document_name ?? "—"),
  },
];
</script>
