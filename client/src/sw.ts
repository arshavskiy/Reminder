/// <reference lib="webworker" />
/* Custom service worker — Workbox precache (injectManifest) + Web Push handlers. */
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);

// API requests always hit the network — no cache layer that could go stale.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event: ExtendableEvent) => event.waitUntil(self.clients.claim()));

// ── Web Push ──
self.addEventListener("push", (event: PushEvent) => {
  let payload: { title?: string; body?: string; data?: Record<string, unknown> } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "בודק ציוד", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "בודק ציוד";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: "/icon-192-v2.png",
    badge: "/icon-192-v2.png",
    tag: (payload.data?.tag as string) || "admin-alert",
    data: payload.data || {},
    dir: "rtl",
    lang: "he",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          (client as WindowClient).navigate(url);
          return (client as WindowClient).focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
