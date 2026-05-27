import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import type {Document} from "../../src/shared/types.js";

export const useDocumentsStore = defineStore("documents", () => {
  const rows = ref<Document[]>([]);
  const total = ref(0);           // filtered total (for pagination)
  const totalAll = ref(0);        // scanned_count from user_settings
  const documentLimit = ref(25);  // document_limit from user_settings
  const loading = ref(false);

  const hasInProgress = computed(() =>
    rows.value.some(r => r.processing_status === "queued" || r.processing_status === "processing")
  );

  async function fetch(params?: { status?: string; limit?: number; offset?: number }) {
    loading.value = true;
    try {
      const r = await api.documents.list(params);
      rows.value = r.rows;
      total.value = r.total;
      totalAll.value = r.totalAll ?? 0;
      documentLimit.value = r.documentLimit ?? 25;
    } finally {
      loading.value = false;
    }
  }

  async function importFile(filePath: string) {
    return api.documents.import(filePath);
  }

  async function deleteDoc(id: number) {
    await api.documents.delete(id);
    await fetch();
  }

  return { rows, total, totalAll, documentLimit, loading, hasInProgress, fetch, importFile, deleteDoc };
});
