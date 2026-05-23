<template></template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useMessage } from "naive-ui";
import { useDocumentsStore } from "../stores/documents.js";
import { useRemindersStore } from "../stores/reminders.js";
import { useAuthStore } from "../stores/auth.js";

const message = useMessage();
const docsStore = useDocumentsStore();
const remindersStore = useRemindersStore();
const authStore = useAuthStore();

let prevDocStatuses: Record<string, string> = {};
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function poll() {
  if (!authStore.user) return;
  try {
    // Check for document status changes
    await docsStore.fetch();
    for (const doc of docsStore.rows) {
      const prev = prevDocStatuses[doc.id];
      if (prev && prev !== doc.processing_status) {
        if (doc.processing_status === "done") {
          message.success(`מסמך עובד בהצלחה: ${doc.file_name}`);
        } else if (doc.processing_status === "error") {
          message.error(`שגיאה בעיבוד מסמך: ${doc.file_name}`);
        }
      }
      prevDocStatuses[doc.id] = doc.processing_status;
    }

    // Refresh all reminders
    await remindersStore.fetch();
  } catch {
    // silent — server may be temporarily unreachable
  }
}

onMounted(() => {
  poll();
  pollTimer = setInterval(poll, 15 * 60 * 1000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
