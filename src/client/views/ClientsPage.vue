<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
<!--      <n-h2 style="margin: 0">לקוחות</n-h2>-->
      <n-button type="primary" @click="showCreate = true">+ לקוח חדש</n-button>
    </n-space>

    <n-input
      v-model:value="search"
      placeholder="חפש לפי שם / אימייל..."
      clearable
      style="margin-bottom: 16px; max-width: 360px"
      @update:value="onSearch"
    />

    <n-data-table
      :columns="columns"
      :data="store.rows"
      :loading="store.loading"
      :pagination="{ pageSize: 20 }"
      :row-key="(r: any) => r.id"
    />

    <!-- Create client modal -->
    <n-modal v-model:show="showCreate" title="לקוח חדש" preset="dialog" style="width: 480px">
      <n-form label-placement="top">
        <n-form-item label="שם מלא / שם חברה" required>
          <n-input v-model:value="form.display_name" placeholder="ישראל ישראלי" />
        </n-form-item>
        <n-form-item label="סוג">
          <n-radio-group v-model:value="form.entity_type">
            <n-radio value="person">אדם פרטי</n-radio>
            <n-radio value="company">חברה</n-radio>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="אימייל">
          <n-input v-model:value="form.email" placeholder="israel@example.com" />
        </n-form-item>
        <n-form-item label="טלפון">
          <n-input v-model:value="form.phone" placeholder="050-0000000" />
        </n-form-item>
        <n-form-item label="מספר ת.ז / ח.פ">
          <n-input v-model:value="form.id_number" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreate = false">ביטול</n-button>
        <n-button type="primary" :loading="creating" @click="doCreate">צור לקוח</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, h } from "vue";
import { useRouter } from "vue-router";
import {
  NH2, NSpace, NInput, NDataTable, NButton, NModal, NForm, NFormItem,
  NRadioGroup, NRadio, useMessage,
} from "naive-ui";
import { useClientsStore } from "../stores/clients.js";
import type { Client } from "@shared/types.js";

const store = useClientsStore();
const router = useRouter();
const message = useMessage();

const search = ref("");
const showCreate = ref(false);
const creating = ref(false);
const form = ref({ display_name: "", entity_type: "person", email: "", phone: "", id_number: "" });

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch(val: string) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.fetch({ q: val, limit: 100 }), 300);
}

onMounted(() => store.fetch({ limit: 100 }));

async function doCreate() {
  if (!form.value.display_name.trim()) return;
  creating.value = true;
  try {
    const client = await store.create(form.value);
    message.success(`לקוח "${client.display_name}" נוצר`);
    showCreate.value = false;
    form.value = { display_name: "", entity_type: "person", email: "", phone: "", id_number: "" };
  } catch (e) {
    message.error(String(e));
  } finally {
    creating.value = false;
  }
}

const columns = [
  {
    title: "שם",
    key: "display_name",
    render: (row: Client) =>
      h("a", { style: "cursor:pointer;color:#63e2b7", onClick: () => router.push(`/clients/${row.id}`) }, row.display_name),
  },
  { title: "סוג", key: "entity_type", width: 110,
    render: (row: Client) => row.entity_type === "company" ? "חברה" : "אדם פרטי" },
  { title: "אימייל", key: "email", width: 220 },
  { title: "טלפון", key: "phone", width: 140 },
  {
    title: "",
    key: "actions",
    width: 90,
    render: (row: Client) =>
      h(NButton, { size: "small", onClick: () => router.push(`/clients/${row.id}`) }, { default: () => "פרטים" }),
  },
];
</script>
