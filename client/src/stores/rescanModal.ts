import {defineStore} from "pinia";
import {computed, ref} from "vue";

export interface RescanRowState {
  id: string | number;
  file_name: string;
  processing_status: string;
  reminder_status?: string | null;
  reminder_date?: string | null;
  document_type?: string | null;
  error_message?: string | null;
  duplicate?: boolean;
}

export const useRescanModalStore = defineStore("rescanModal", () => {
  const queued = ref(0);
  const remaining = ref(0);
  const ids = ref<string[]>([]);
  const duplicateIds = ref<string[]>([]);
  const rows = ref<RescanRowState[]>([]);
  const done = ref(false);
  const mode = ref<"all" | "missing" | null>(null);
  const kind = ref<"rescan" | "upload">("rescan");
  const startedAt = ref<string | null>(null);

  const hasSession = computed(() => queued.value > 0 || ids.value.length > 0);
  const assigned = computed(() => rows.value.filter((row) => row.reminder_status === "assigned").length);
  const missing = computed(() => rows.value.filter((row) => row.reminder_status === "missing").length);
  const failed = computed(() => rows.value.filter((row) => row.processing_status === "error").length);
  const duplicates = computed(() => duplicateIds.value.length);
  const completed = computed(() => rows.value.filter((row) => row.processing_status === "done").length);

  function start(payload: { queued: number; ids: string[]; mode?: "all" | "missing" | null; kind?: "rescan" | "upload"; duplicates?: string[] }) {
    queued.value = payload.queued;
    remaining.value = payload.queued;
    ids.value = payload.ids.map(String);
    duplicateIds.value = (payload.duplicates ?? []).map(String);
    rows.value = [];
    done.value = false;
    mode.value = payload.mode ?? null;
    kind.value = payload.kind ?? "rescan";
    startedAt.value = new Date().toISOString();
  }

  function updateRows(nextRows: RescanRowState[]) {
    const duplicateSet = new Set(duplicateIds.value);
    rows.value = nextRows.map((row) => ({ ...row, duplicate: duplicateSet.has(String(row.id)) }));
  }

  function setRemaining(nextRemaining: number) {
    remaining.value = nextRemaining;
  }

  function markDone() {
    remaining.value = 0;
    done.value = true;
  }

  function markBackground() {
    done.value = false;
  }

  function clear() {
    queued.value = 0;
    remaining.value = 0;
    ids.value = [];
    duplicateIds.value = [];
    rows.value = [];
    done.value = false;
    mode.value = null;
    kind.value = "rescan";
    startedAt.value = null;
  }

  return {
    queued,
    remaining,
    ids,
    duplicateIds,
    rows,
    done,
    mode,
    kind,
    startedAt,
    hasSession,
    assigned,
    missing,
    failed,
    duplicates,
    completed,
    start,
    updateRows,
    setRemaining,
    markDone,
    markBackground,
    clear,
  };
});
