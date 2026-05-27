import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../services/apiService.js";
import type { Contract, ContractWithClient } from "../../src/shared/types.js";

export const useContractsStore = defineStore("contracts", () => {
  const rows = ref<ContractWithClient[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const expiringSoon = ref<ContractWithClient[]>([]);

  async function fetch(params?: { clientId?: string; status?: string; limit?: number; kind?: "contract" | "inspection" | "all" }, force = false) {
    loading.value = true;
    try {
      const r = await api.contracts.list(params, force);
      rows.value = r.rows;
      total.value = r.total;
    } finally {
      loading.value = false;
    }
  }

  async function fetchExpiring(days = 30) {
    expiringSoon.value = await api.contracts.expiring(days);
  }

  async function create(body: Partial<Contract>) {
    const created = await api.contracts.create(body);
    rows.value.unshift(created as ContractWithClient);
    total.value++;
    return created;
  }

  async function update(id: string, body: Partial<Contract>) {
    const updated = await api.contracts.update(id, body);
    const idx = rows.value.findIndex((c) => c.id === id);
    if (idx !== -1) rows.value[idx] = { ...rows.value[idx], ...updated };
    return updated;
  }

  async function remove(id: string) {
    await api.contracts.delete(id);
    rows.value = rows.value.filter((c) => c.id !== id);
    total.value--;
  }

  return { rows, total, loading, expiringSoon, fetch, fetchExpiring, create, update, remove };
});
