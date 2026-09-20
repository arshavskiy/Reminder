import { ref } from "vue";
import { api } from "../services/apiService";
import type { NotificationItem } from "@shared/types.js";

const items = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const loading = ref(false);
const POLL_MS = 45_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const data = await api.notifications.list();
    items.value = data.items;
    unreadCount.value = data.unreadCount;
    if ((data.triggered_count ?? 0) > 0) {
      const { useRemindersStore } = await import("../stores/reminders.js");
      await useRemindersStore().refetchLast();
    }
  } finally {
    loading.value = false;
  }
}

async function markRead(id: string): Promise<void> {
  await api.notifications.markRead(id);
  const item = items.value.find((n) => n.id === id);
  if (item && !item.read_at) {
    item.read_at = new Date().toISOString();
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }
}

async function markAllRead(): Promise<void> {
  await api.notifications.markAllRead();
  const now = new Date().toISOString();
  for (const item of items.value) {
    if (!item.read_at) item.read_at = now;
  }
  unreadCount.value = 0;
}

function startPolling(): void {
  if (started) return;
  started = true;
  void refresh();
  pollTimer = setInterval(() => {
    void refresh();
  }, POLL_MS);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  started = false;
}

// Shared module-level state so the bell badge and any open panel always
// agree, the same singleton pattern useAdminPush.ts uses for its refs.
export function useNotifications() {
  return { items, unreadCount, loading, refresh, markRead, markAllRead, startPolling, stopPolling };
}
