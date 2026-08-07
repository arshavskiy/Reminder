/// <reference types="vite-plugin-pwa/client" />

import { readonly, ref } from "vue";
import { registerSW } from "virtual:pwa-register";

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstalled = ref(false);
const isUpdating = ref(false);
let swRegistration: ServiceWorkerRegistration | null = null;
let updateCheckInterval: number | null = null;
let visibilityListenerBound = false;

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt.value = event as BeforeInstallPromptEvent;
});

window.addEventListener("appinstalled", () => {
  isInstalled.value = true;
  deferredPrompt.value = null;
});

if (window.matchMedia("(display-mode: standalone)").matches) {
  isInstalled.value = true;
}

function applyUpdate() {
  if (isUpdating.value) return;

  isUpdating.value = true;

  if (swRegistration?.waiting) {
    updateServiceWorker(true).catch(() => {
      isUpdating.value = false;
    });
    return;
  }

  swRegistration?.update().catch(() => {
    isUpdating.value = false;
  });
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    applyUpdate();
  },
  onRegisteredSW(_swUrl, registration) {
    swRegistration = registration ?? null;
    if (!registration) return;

    const checkForUpdates = () => {
      registration.update().catch(() => {});
    };

    checkForUpdates();

    if (updateCheckInterval !== null) {
      window.clearInterval(updateCheckInterval);
    }

    updateCheckInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    }, 60_000);

    if (!visibilityListenerBound) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          checkForUpdates();
        }
      });
      visibilityListenerBound = true;
    }
  },
});

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  window.location.reload();
});

export function usePwa() {
  async function install() {
    if (!deferredPrompt.value) return;
    await deferredPrompt.value.prompt();
    const { outcome } = await deferredPrompt.value.userChoice;
    if (outcome === "accepted") {
      isInstalled.value = true;
      deferredPrompt.value = null;
    }
  }

  return {
    canInstall: readonly(deferredPrompt) as Readonly<typeof deferredPrompt>,
    isInstalled: readonly(isInstalled),
    isUpdating: readonly(isUpdating),
    install,
  };
}
