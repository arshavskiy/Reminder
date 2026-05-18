<template>
  <div>
    <n-h2>תזכורות</n-h2>

    <n-space style="margin-bottom: 16px">
      <n-select
        v-model:value="statusFilter"
        :options="statusOptions"
        placeholder="כל הסטטוסים"
        clearable
        style="width: 160px"
        @update:value="load"
      />
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
import { NH2, NSpace, NSelect, NDataTable, NButton, useMessage } from "naive-ui";
import { useRemindersStore } from "../stores/reminders.js";
import StatusBadge from "../components/StatusBadge.vue";
import type { ReminderWithContext } from "@shared/types.js";

const store = useRemindersStore();
const router = useRouter();
const message = useMessage();
const statusFilter = ref<string | null>("pending");

const statusOptions = [
  { label: "ממתין", value: "pending" },
  { label: "נשלח", value: "sent" },
  { label: "נדחה", value: "snoozed" },
  { label: "בוטל", value: "dismissed" },
  { label: "שגיאה", value: "error" },
];

function load() {
  store.fetch({ status: statusFilter.value ?? undefined, limit: 100 });
}

onMounted(load);

const columns = [
  { title: "כותרת", key: "title" },
  {
    title: "לקוח",
    key: "client_name",
    render: (row: ReminderWithContext) =>
      row.client_id
        ? h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/clients/${row.client_id}`) }, row.client_name ?? "—")
        : (row.client_name ?? "—"),
  },
  { title: "תאריך תזכורת", key: "trigger_date", width: 140 },
  { title: "ימים מראש", key: "advance_days", width: 100 },
  {
    title: "סטטוס",
    key: "status",
    render: (row: ReminderWithContext) => h(StatusBadge, { status: row.status }),
  },
  {
    title: "פעולות",
    key: "actions",
    width: 200,
    render: (row: ReminderWithContext) =>
      h(NSpace, { size: "small" }, {
        default: () => [
          row.status === "pending"
            ? h(NButton, {
                size: "small",
                type: "primary",
                onClick: async () => {
                  const r = await store.sendNow(row.id);
                  if (r.success) { message.success("נשלח בהצלחה"); load(); }
                  else message.error(r.error ?? "שגיאה");
                },
              }, { default: () => "שלח עכשיו" })
            : null,
          row.status === "pending"
            ? h(NButton, {
                size: "small",
                type: "error",
                onClick: async () => { await store.dismiss(row.id); load(); },
              }, { default: () => "בטל" })
            : null,
        ],
      }),
  },
];
</script>
