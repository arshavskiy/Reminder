import { ref } from "vue";
import { api } from "../services/apiService";

const supported = ref(
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window,
);
const permission = ref<NotificationPermission>(
  typeof Notification !== "undefined" ? Notification.permission : "denied",
);
const subscribed = ref(false);
const busy = ref(false);

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// serviceWorker.ready never resolves without a registered SW — fail fast.
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) =>
      setTimeout(() => reject(new Error("Service worker not registered (is the PWA built?)")), 5000),
    ),
  ]);
}

async function refreshState(): Promise<void> {
  if (!supported.value) return;
  permission.value = Notification.permission;
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    subscribed.value = !!sub;
  } catch {
    subscribed.value = false;
  }
}

async function enablePush(): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error("Push דורש HTTPS. פתח את האפליקציה דרך https:// (LAN IP over http לא יעבוד).");
  }
  if (!supported.value) {
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (iOS) throw new Error("ב-iPhone התקן קודם את האפליקציה למסך הבית (שיתוף → הוסף למסך הבית), ואז הפעל התראות.");
    throw new Error("התראות Push אינן נתמכות במכשיר זה");
  }
  busy.value = true;
  try {
    permission.value = await Notification.requestPermission();
    if (permission.value === "denied") {
      throw new Error("ההתראות חסומות. אפשר אותן לאתר זה בהגדרות הדפדפן ונסה שוב.");
    }
    if (permission.value !== "granted") throw new Error("לא ניתן אישור להתראות");

    const { key } = await api.push.vapidKey();
    if (!key) throw new Error("חסר מפתח VAPID בשרת");

    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const json = sub.toJSON();
    await api.push.subscribe({ endpoint: json.endpoint!, keys: json.keys as { p256dh: string; auth: string } });
    subscribed.value = true;
  } finally {
    busy.value = false;
  }
}

async function disablePush(): Promise<void> {
  busy.value = true;
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.push.unsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    subscribed.value = false;
  } finally {
    busy.value = false;
  }
}

export function useAdminPush() {
  return { supported, permission, subscribed, busy, refreshState, enablePush, disablePush };
}

// Push is no longer admin-only; regular users subscribe through /api/push/*.
export const usePush = useAdminPush;
