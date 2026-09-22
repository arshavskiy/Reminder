import {ref, type Ref} from "vue";

export type DevModalEntry = {
  id: string;
  label: string;
  open: () => void;
  close: () => void;
};

export type DevModalsApi = {
  list: () => string[];
  entries: () => Array<{id: string; label: string}>;
  open: (id: string) => boolean;
  close: (id: string) => boolean;
  closeAll: () => void;
  openAll: () => string[];
  panel: (show?: boolean) => boolean;
  help: () => void;
};

const registry = new Map<string, DevModalEntry>();
export const panelOpen: Ref<boolean> = ref(false);
export const catalogTick: Ref<number> = ref(0);

function bumpCatalog() {
  catalogTick.value++;
}

export function registerDevModal(entry: DevModalEntry): () => void {
  if (!import.meta.env.DEV) return () => {};
  registry.set(entry.id, entry);
  bumpCatalog();
  return () => {
    if (registry.get(entry.id) === entry) {
      registry.delete(entry.id);
      bumpCatalog();
    }
  };
}

export function unregisterDevModal(id: string) {
  registry.delete(id);
  bumpCatalog();
}

function listIds() {
  return [...registry.keys()].sort();
}

function openById(id: string) {
  const entry = registry.get(id);
  if (!entry) {
    console.warn(`[devModals] unknown id "${id}". Try __remindocr.modals.list()`);
    return false;
  }
  entry.open();
  return true;
}

function closeById(id: string) {
  const entry = registry.get(id);
  if (!entry) return false;
  entry.close();
  return true;
}

function closeAll() {
  for (const entry of registry.values()) entry.close();
}

function openAll() {
  const ids = listIds();
  for (const id of ids) registry.get(id)?.open();
  return ids;
}

function setPanel(show?: boolean) {
  panelOpen.value = show ?? !panelOpen.value;
  return panelOpen.value;
}

function help() {
  console.info(
    [
      "RemindOCR DEV modals  (__remindocr.modals)",
      "  .list()           ids",
      "  .open(id)         open one",
      "  .close(id)",
      "  .closeAll()",
      "  .openAll()        open every registered modal",
      "  .panel()          toggle picker  (Ctrl+Shift+M)",
      "  .help()",
    ].join("\n"),
  );
}

export function installDevModalsWindow() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const api: DevModalsApi = {
    list: listIds,
    entries: () => listIds().map((id) => ({id, label: registry.get(id)?.label ?? id})),
    open: openById,
    close: closeById,
    closeAll,
    openAll,
    panel: setPanel,
    help,
  };
  window.__remindocr = {...window.__remindocr, modals: api};
  help();
}

declare global {
  interface Window {
    __remindocr?: {modals?: DevModalsApi};
  }
}
