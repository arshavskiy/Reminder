<template>
  <div>
    <n-h2>לוח בקרה</n-h2>

    <n-spin :show="store.loading">
      <n-grid :cols="3" :x-gap="16" :y-gap="16" style="margin-bottom: 24px">
        <n-gi>
          <n-statistic label="מסמכים" :value="stats?.total_documents ?? 0" />
        </n-gi>
        <n-gi>
          <n-statistic label="לקוחות" :value="stats?.total_clients ?? 0" />
        </n-gi>
        <n-gi>
          <n-statistic label="חוזים פעילים" :value="stats?.active_contracts ?? 0" />
        </n-gi>
        <n-gi>
          <n-statistic label="תזכורות ממתינות" :value="stats?.pending_reminders ?? 0" />
        </n-gi>
        <n-gi>
          <n-statistic label="פגי תוקף ב-30 יום" :value="stats?.expiring_soon ?? 0" />
        </n-gi>
      </n-grid>

      <n-grid :cols="2" :x-gap="24">
        <n-gi>
          <n-card title="מסמכים אחרונים">
            <n-list v-if="stats?.recent_documents?.length">
              <n-list-item v-for="doc in stats.recent_documents" :key="doc.id">
                <router-link :to="`/documents/${doc.id}`">{{ doc.file_name }}</router-link>
                <StatusBadge :status="doc.processing_status" style="margin-right: 8px" />
              </n-list-item>
            </n-list>
            <n-empty v-else description="אין מסמכים עדיין" />
          </n-card>
        </n-gi>

        <n-gi>
          <n-card title="תזכורות קרובות">
            <n-list v-if="stats?.upcoming_reminders?.length">
              <n-list-item v-for="r in stats.upcoming_reminders" :key="r.id">
                <div>
                  <strong>{{ r.title }}</strong>
                  <span v-if="r.client_name" style="color: #aaa; margin-right: 8px">{{ r.client_name }}</span>
                </div>
                <div style="font-size: 12px; color: #888">{{ r.trigger_date }}</div>
              </n-list-item>
            </n-list>
            <n-empty v-else description="אין תזכורות קרובות" />
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from "vue";
import { NH2, NGrid, NGi, NStatistic, NCard, NList, NListItem, NSpin, NEmpty } from "naive-ui";
import { useDashboardStore } from "../stores/dashboard.js";
import StatusBadge from "../components/StatusBadge.vue";

const store = useDashboardStore();
const stats = computed(() => store.stats);
onMounted(() => store.fetch());
</script>
