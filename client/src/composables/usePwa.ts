import { ref, readonly } from "vue";

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstalled = ref(false);
const updateAvailable = ref(false);
let swRegistration: ServiceWorkerRegistration | null = null;

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt.value = e as BeforeInstallPromptEvent;
});

window.addEventListener("appinstalled", () => {
  isInstalled.value = true;
  deferredPrompt.value = null;
});

if (window.matchMedia("(display-mode: standalone)").matches) {
  isInstalled.value = true;
}

navigator.serviceWorker?.ready.then((reg) => {
  swRegistration = reg;
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        updateAvailable.value = true;
      }
    });
  });
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

  function applyUpdate() {
    swRegistration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }

  return {
    canInstall: readonly(deferredPrompt) as Readonly<typeof deferredPrompt>,
    isInstalled: readonly(isInstalled),
    updateAvailable: readonly(updateAvailable),
    install,
    applyUpdate,
  };
}
