import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { Client, ClientDetail, TimelineEvent } from "../../src/shared/types.js";
import type { Document } from "../../src/shared/types.js";

export const useClientsStore = defineStore("clients", () => {
  const rows = ref<Client[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const active = ref<ClientDetail | null>(null);
  const activeDocuments = ref<Document[]>([]);
  const activeTimeline = ref<TimelineEvent[]>([]);

  async function fetch(params?: { q?: string; limit?: number; offset?: number }) {
    loading.value = true;
    try {
      const r = await api.clients.list(params);
      rows.value = r.rows;
      total.value = r.total;
    } finally {
      loading.value = false;
    }
  }

  async function fetchOne(id: string) {
    loading.value = true;
    try {
      [active.value, activeDocuments.value, activeTimeline.value] = await Promise.all([
        api.clients.get(id),
        api.clients.documents(id),
        api.clients.timeline(id) as Promise<TimelineEvent[]>,
      ]);
    } finally {
      loading.value = false;
    }
  }

  async function create(body: Partial<Client>) {
    const created = await api.clients.create(body);
    rows.value.unshift(created);
    total.value++;
    return created;
  }

  async function update(id: string, body: Partial<Client>) {
    const updated = await api.clients.update(id, body);
    const idx = rows.value.findIndex((c) => c.id === id);
    if (idx !== -1) rows.value[idx] = updated;
    if (active.value?.id === id) active.value = { ...active.value, ...updated };
    return updated;
  }

  async function remove(id: string) {
    await api.clients.delete(id);
    rows.value = rows.value.filter((c) => c.id !== id);
    total.value--;
  }

  return { rows, total, loading, active, activeDocuments, activeTimeline, fetch, fetchOne, create, update, remove };
});
