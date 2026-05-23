<template>
  <div v-if="store.active">
    <n-space align="center" style="margin-bottom: 16px">
      <n-button text @click="$router.back()">← חזרה</n-button>
      <n-h2 style="margin: 0">{{ store.active.display_name }}</n-h2>
      <n-tag type="info">{{ store.active.entity_type === "company" ? "חברה" : "אדם פרטי" }}</n-tag>
      <n-button size="small" @click="showEdit = true">✏️ עריכה</n-button>
    </n-space>

    <n-grid :cols="3" :x-gap="16" style="margin-bottom: 24px">
      <n-gi><n-statistic label="מסמכים" :value="store.active.doc_count" /></n-gi>
      <n-gi><n-statistic label="חוזים" :value="store.active.contract_count" /></n-gi>
      <n-gi><n-statistic label="תזכורות פתוחות" :value="store.active.open_reminder_count" /></n-gi>
    </n-grid>

    <!-- Contact info row -->
    <n-card style="margin-bottom: 16px">
      <n-space>
        <span v-if="store.active.email">📧 {{ store.active.email }}</span>
        <span v-if="store.active.phone">📞 {{ store.active.phone }}</span>
        <span v-if="store.active.id_number">🪪 {{ store.active.id_number }}</span>
      </n-space>
      <div v-if="store.active.notes" style="margin-top: 8px; color: #aaa">{{ store.active.notes }}</div>
    </n-card>

    <n-tabs>
      <n-tab-pane name="docs" tab="מסמכים">
        <n-list v-if="store.activeDocuments.length">
          <n-list-item v-for="doc in store.activeDocuments" :key="doc.id">
            <div style="display:flex;align-items:center;gap:8px">
              <router-link :to="`/documents/${doc.id}`">{{ doc.file_name }}</router-link>
              <StatusBadge :status="doc.processing_status" />
              <span style="font-size:12px;color:#888">{{ formatDate(doc.import_date) }}</span>
            </div>
          </n-list-item>
        </n-list>
        <n-empty v-else description="אין מסמכים" />
      </n-tab-pane>

      <n-tab-pane name="equipment" tab="ציוד">
        <n-spin :show="loadingEquipment">
          <n-list v-if="equipment.length">
            <n-list-item v-for="eq in equipment" :key="eq.id">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="flex:1">
                  <strong style="font-size:14px">{{ eq.name }}</strong>
                  <span style="font-size:11px;color:#888;margin-right:8px">{{ categoryLabel(eq.category) }}</span>
                  <div style="font-size:12px;color:#aaa;margin-top:2px">
                    <span v-if="eq.manufacturer">יצרן: {{ eq.manufacturer }}</span>
                    <span v-if="eq.model" style="margin-right:8px">דגם: {{ eq.model }}</span>
                    <span v-if="eq.serial_number" style="margin-right:8px">מ"ס: {{ eq.serial_number }}</span>
                    <span v-if="eq.capacity" style="margin-right:8px">עומס: {{ eq.capacity }}</span>
                  </div>
                </div>
                <router-link v-if="eq.document_id" :to="`/documents/${eq.document_id}`" style="font-size:12px;color:var(--brand-color)">
                  {{ eq.document_name || 'מסמך מקור' }}
                </router-link>
              </div>
            </n-list-item>
          </n-list>
          <n-empty v-else description="אין ציוד משויך ללקוח זה" />
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="timeline" tab="ציר זמן">
        <n-timeline v-if="store.activeTimeline.length">
          <n-timeline-item
            v-for="event in store.activeTimeline"
            :key="event.id"
            :title="event.title"
            :time="event.event_date"
            :type="eventType(event.event_type)"
          >
            {{ event.description }}
          </n-timeline-item>
        </n-timeline>
        <n-empty v-else description="אין אירועים" />
      </n-tab-pane>
    </n-tabs>

    <!-- Edit modal -->
    <n-modal v-model:show="showEdit" title="עריכת לקוח" preset="dialog" style="width: 480px">
      <n-form label-placement="top" v-if="editForm">
        <n-form-item label="שם"><n-input v-model:value="editForm.display_name" /></n-form-item>
        <n-form-item label="אימייל"><n-input v-model:value="editForm.email" /></n-form-item>
        <n-form-item label="טלפון"><n-input v-model:value="editForm.phone" /></n-form-item>
        <n-form-item label="הערות"><n-input v-model:value="editForm.notes" type="textarea" :rows="3" /></n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showEdit = false">ביטול</n-button>
        <n-button type="primary" :loading="saving" @click="doSave">שמור</n-button>
      </template>
    </n-modal>
  </div>

  <n-spin v-else :show="store.loading" style="margin-top: 60px; display: flex; justify-content: center" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  NH2, NSpace, NButton, NGrid, NGi, NStatistic, NTag, NTabs, NTabPane,
  NList, NListItem, NTimeline, NTimelineItem, NSpin, NEmpty, NCard,
  NModal, NForm, NFormItem, NInput, useMessage,
} from "naive-ui";
import { useClientsStore } from "../stores/clients.js";
import { api } from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import type { EventType, Equipment, EquipmentCategory } from "@shared/types.js";

const route = useRoute();
const store = useClientsStore();
const message = useMessage();

const showEdit = ref(false);
const saving = ref(false);
const editForm = ref<{ display_name: string; email: string; phone: string; notes: string } | null>(null);
const equipment = ref<Equipment[]>([]);
const loadingEquipment = ref(false);

const CATEGORY_LABELS: Record<string, string> = {
  lift: "מכונות הרמה", accessory: "אביזרי הרמה", scaffold: "פיגומים",
  ladder: "מעליות", balloon: "מעלונים", intake: "קולטי אוויר",
  extractor: "קולטי קיטור", other: "אחר",
};
function categoryLabel(c: string) { return CATEGORY_LABELS[c] ?? c; }

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("he-IL");
}

watch(showEdit, (open) => {
  if (open && store.active) {
    editForm.value = {
      display_name: store.active.display_name,
      email: store.active.email ?? "",
      phone: store.active.phone ?? "",
      notes: store.active.notes ?? "",
    };
  }
});

async function doSave() {
  if (!editForm.value || !store.active) return;
  saving.value = true;
  try {
    await store.update(store.active.id, editForm.value);
    message.success("פרטי הלקוח עודכנו");
    showEdit.value = false;
    store.fetchOne(store.active.id);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

function eventType(type: EventType): "default" | "success" | "warning" | "info" {
  if (type === "email_sent") return "success";
  if (type === "reminder_fired") return "warning";
  if (type === "document_added") return "info";
  return "default";
}

async function loadEquipment(clientId: string) {
  loadingEquipment.value = true;
  try {
    equipment.value = await api.equipment.list({ client_id: clientId });
  } finally {
    loadingEquipment.value = false;
  }
}

onMounted(() => {
  const id = route.params.id as string;
  store.fetchOne(id);
  loadEquipment(id);
});
</script>
