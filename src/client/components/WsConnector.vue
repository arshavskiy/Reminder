<template></template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useMessage } from "naive-ui";
import { connectWs, onWsEvent } from "../services/apiService.js";
import { useDocumentsStore } from "../stores/documents.js";
import type { WsEvent } from "@shared/types.js";

const message = useMessage();
const docsStore = useDocumentsStore();

let unsub: (() => void) | null = null;

onMounted(() => {
  connectWs();
  unsub = onWsEvent((e: WsEvent) => {
    if (e.type === "document:done") {
      if (e.status === "done") {
        message.success(`מסמך עובד בהצלחה (#${e.documentId})`);
      } else {
        message.error(`שגיאה בעיבוד מסמך #${e.documentId}: ${e.error ?? ""}`);
      }
      docsStore.fetch();
    }
    if (e.type === "reminder:fired") {
      message.success(`תזכורת נשלחה: ${e.title}`);
    }
    if (e.type === "reminder:error") {
      message.error(`שגיאה בשליחת תזכורת: ${e.error}`);
    }
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>
