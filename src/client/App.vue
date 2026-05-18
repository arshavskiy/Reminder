<template>
  <n-config-provider :theme="darkTheme">
    <n-message-provider>
      <n-dialog-provider>
        <n-layout has-sider style="height: 100vh">
          <n-layout-sider
            bordered
            collapse-mode="width"
            :collapsed-width="64"
            :width="220"
            :collapsed="collapsed"
            show-trigger
            @collapse="collapsed = true"
            @expand="collapsed = false"
          >
            <div style="padding: 16px; font-weight: bold; font-size: 15px; color: #63e2b7; white-space: nowrap; overflow: hidden">
              {{ collapsed ? "📋" : "📋 Client Reminder" }}
            </div>
            <n-menu
              :collapsed="collapsed"
              :collapsed-width="64"
              :collapsed-icon-size="22"
              :options="menuOptions"
              :value="activeKey"
              @update:value="navigate"
            />
          </n-layout-sider>

          <n-layout>
            <n-layout-content style="padding: 24px; overflow-y: auto; height: 100vh">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>

        <WsConnector />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { darkTheme, NConfigProvider, NLayout, NLayoutSider, NLayoutContent, NMenu, NMessageProvider, NDialogProvider } from "naive-ui";
import { h } from "vue";
import WsConnector from "./components/WsConnector.vue";

const router = useRouter();
const route = useRoute();
const collapsed = ref(false);

const activeKey = computed(() => route.path.split("/")[1] || "dashboard");

function navigate(key: string) {
  router.push(key === "dashboard" ? "/" : `/${key}`);
}

const menuOptions = [
  { label: "לוח בקרה", key: "dashboard", icon: () => h("span", "🏠") },
  { label: "מסמכים", key: "documents", icon: () => h("span", "📄") },
  { label: "לקוחות", key: "clients", icon: () => h("span", "👥") },
  { label: "חוזים", key: "contracts", icon: () => h("span", "📝") },
  { label: "תזכורות", key: "reminders", icon: () => h("span", "⏰") },
  { label: "חיפוש", key: "search", icon: () => h("span", "🔍") },
  { label: "הגדרות", key: "settings", icon: () => h("span", "⚙️") },
];
</script>

<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Lato', Arial, sans-serif; direction: rtl; }
</style>
