import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import type {Document} from "../../src/shared/types.js";

export const useDocumentsStore = defineStore("documents", () => {
  const rows = ref<Document[]>([]);
  const total = ref(0);
  const totalAll = ref(0);
  const documentLimit = ref(25);
  const loading = ref(false);
  const counts = ref<{ all: number; done: number; in_progress: number; error: number }>({ all: 0, done: 0, in_progress: 0, error: 0 });

  const hasInProgress = computed(() =>
    rows.value.some(r => r.processing_status === "queued" || r.processing_status === "processing")
  );

  async function fetch(params?: { status?: string; limit?: number; offset?: number; clientId?: string }, force = false) {
    loading.value = true;
    try {
      const r = await api.documents.list(params, force);
      rows.value = r.rows;
      total.value = r.total;
      totalAll.value = r.totalAll ?? 0;
      documentLimit.value = r.documentLimit ?? 25;
      if (r.counts) counts.value = r.counts;
    } finally {
      loading.value = false;
    }
  }

  async function importFile(filePath: string) {
    return api.documents.import(filePath);
  }

  async function deleteDoc(id: number) {
    await api.documents.delete(id);
    await fetch({ limit: 500 }, true);
  }

  return { rows, total, totalAll, documentLimit, loading, hasInProgress, counts, fetch, importFile, deleteDoc };
});
