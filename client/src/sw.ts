/// <reference lib="webworker" />
/* Custom service worker — Workbox precache (injectManifest) + Web Push handlers. */
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const manifest = self.__WB_MANIFEST ?? [];
precacheAndRoute(manifest);

// Serve the app shell for navigations. Without this, precaching index.html is
// not enough: an installed PWA opening at its start_url (/dashboard) has no
// cached response for that path and fails offline. Vue routes on the client, so
// every in-app path resolves from the same shell.
//
// /api and /auth are excluded — they are proxied to the API and must reach the
// network rather than being answered with HTML.
//
// Guarded on the manifest actually containing the shell: in dev the manifest is
// empty, and createHandlerBoundToURL throws non-precached-url for a URL that was
// never precached, which aborts the whole worker before the push handlers below
// are registered.
if (manifest.some((entry) => entry.url === "index.html")) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/auth\//],
  }));
}

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
