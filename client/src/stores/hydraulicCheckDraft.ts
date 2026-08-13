import {defineStore} from "pinia";
import {computed, ref} from "vue";
import type {HydraulicCheckRequest} from "../services/apiService.js";
import type {EquipmentCategory} from "@shared/types.js";

export interface HydraulicDraftEquipmentRow {
  id: string;
  selected_equipment_id: string | null;
  category: EquipmentCategory;
  name: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  license_number: string;
  load_capacity_work: string;
  load_capacity_test: string;
  load_radius: string;
  description: string;
}

export interface HydraulicCheckDraftState {
  form: HydraulicCheckRequest;
  clientId: string | null;
  prevReportNumber: string;
  equipmentRows: HydraulicDraftEquipmentRow[];
  reminderMode: "months" | "date";
  reminderDateMs: number | null;
  intervalMonths: 4 | 6 | 12 | 14;
  templateId: string | null;
  templateValues: Record<string, string>;
  savedAt: string;
}

const STORAGE_KEY = "reminder.hydraulicCheckDraft.v1";

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readStoredDraft(): HydraulicCheckDraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HydraulicCheckDraftState;
    return parsed?.form ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredDraft(value: HydraulicCheckDraftState | null) {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can fail in private mode or when quota is full; the in-memory draft still works.
  }
}

export const useHydraulicCheckDraftStore = defineStore("hydraulicCheckDraft", () => {
  const draft = ref<HydraulicCheckDraftState | null>(readStoredDraft());
  const hasDraft = computed(() => Boolean(draft.value));

  function save(payload: Omit<HydraulicCheckDraftState, "savedAt">) {
    draft.value = {
      ...cloneDraft(payload),
      savedAt: new Date().toISOString(),
    };
    writeStoredDraft(draft.value);
  }

  function clear() {
    draft.value = null;
    writeStoredDraft(null);
  }

  return {
    draft,
    hasDraft,
    save,
    clear,
  };
});
