<template></template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useMessage } from "naive-ui";
import { useDocumentsStore } from "../stores/documents.js";
import { useRemindersStore } from "../stores/reminders.js";

const message = useMessage();
const docsStore = useDocumentsStore();
const remindersStore = useRemindersStore();

let prevDocStatuses: Record<string, string> = {};
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function poll() {
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

    // Check for fired reminders
    await remindersStore.fetch({ status: "sent" });
  } catch {
    // silent — server may be temporarily unreachable
  }
}

onMounted(() => {
  poll();
  pollTimer = setInterval(poll, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
