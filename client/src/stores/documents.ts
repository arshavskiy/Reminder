import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { Document } from "../../src/shared/types.js";

export const useDocumentsStore = defineStore("documents", () => {
  const rows = ref<Document[]>([]);
  const total = ref(0);
  const loading = ref(false);

  async function fetch(params?: { status?: string; limit?: number; offset?: number }) {
    loading.value = true;
    try {
      const r = await api.documents.list(params);
      rows.value = r.rows;
      total.value = r.total;
    } finally {
      loading.value = false;
    }
  }

  async function importFile(filePath: string) {
    return api.documents.import(filePath);
  }

  async function deleteDoc(id: number) {
    await api.documents.delete(id);
    rows.value = rows.value.filter((d) => d.id !== id);
    total.value--;
  }

  return { rows, total, loading, fetch, importFile, deleteDoc };
});
