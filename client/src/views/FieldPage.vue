<template>
  <div class="field">
    <!-- Search bar -->
    <div class="field__search-wrap">
      <input
        v-model="query"
        autofocus
        class="field__search"
        placeholder="חפש ציוד לפי שם / מספר סידורי / יצרן..."
        type="search"
        @input="onSearch"
      />
    </div>

    <!-- Results list -->
    <div v-if="query && results.length" class="field__results">
      <button
        v-for="r in results"
        :key="r.id"
        class="field__result"
        @click="select(r)"
      >
        <span class="field__result-name">{{ r.name }}</span>
        <span v-if="r.serial_number" class="field__result-serial">{{ r.serial_number }}</span>
        <span v-if="r.manufacturer" class="field__result-mfr">{{ r.manufacturer }}</span>
      </button>
    </div>
    <p v-else-if="query && !loading && !results.length" class="field__empty">לא נמצא ציוד</p>

    <!-- Equipment detail card -->
    <div v-if="selected" class="field__card">
      <div class="field__card-head">
        <h2 class="field__card-name">{{ selected.name }}</h2>
        <span v-if="selected.client_name" class="field__card-client">{{ selected.client_name }}</span>
        <button class="field__card-close" @click="selected = null">✕</button>
      </div>

      <div class="field__card-meta">
        <div v-if="selected.manufacturer" class="field__meta-row">
          <span class="field__meta-label">יצרן</span>
          <span>{{ selected.manufacturer }}</span>
        </div>
        <div v-if="selected.model" class="field__meta-row">
          <span class="field__meta-label">דגם</span>
          <span>{{ selected.model }}</span>
        </div>
        <div v-if="selected.serial_number" class="field__meta-row">
          <span class="field__meta-label">מ"ס</span>
          <span>{{ selected.serial_number }}</span>
        </div>
        <div v-if="selected.capacity" class="field__meta-row">
          <span class="field__meta-label">עומס עבודה</span>
          <span>{{ selected.capacity }}</span>
        </div>
        <div v-if="selected.load_capacity_test" class="field__meta-row">
          <span class="field__meta-label">עומס מבחן</span>
          <span>{{ selected.load_capacity_test }}</span>
        </div>
      </div>

      <!-- Inspection history preview -->
      <div v-if="historyLoading" class="field__loading">טוען היסטוריה...</div>
      <div v-else-if="history.length" class="field__hist">
        <h3 class="field__hist-title">בדיקות אחרונות</h3>
        <div v-for="ev in history.slice(0, 5)" :key="ev.id" class="field__hist-item">
          <span :class="`field__hist-dot--${ev.status}`" class="field__hist-dot"></span>
          <div class="field__hist-body">
            <span class="field__hist-type">{{ ev.contract_type ?? 'בדיקה' }}</span>
            <span v-if="ev.expiry_date" :class="expiryClass(ev)" class="field__hist-expiry">
              פקיעה: {{ ev.expiry_date }}
              <span v-if="ev.days_until !== null">
                ({{ ev.days_until < 0 ? `פג לפני ${Math.abs(ev.days_until)}י` : `${ev.days_until}י` }})
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="field__actions">
        <button class="field__btn field__btn--pdf" @click="api.equipment.downloadReport(selected.id)">
          הפק דוח PDF
        </button>
        <label class="field__btn field__btn--photo">
          צלם תמונה
          <input accept="image/*" capture="environment" style="display:none" type="file" @change="onPhoto" />
        </label>
      </div>

      <!-- Photo preview -->
      <div v-if="photoUrl" class="field__photo-wrap">
        <img :src="photoUrl" alt="תמונת ציוד" class="field__photo" />
      </div>
    </div>

    <!-- Offline indicator -->
    <div v-if="!online" class="field__offline">מצב לא מקוון — מוצגים נתונים מהמטמון</div>
  </div>
</template>

<script lang="ts" setup>
import {onMounted, onUnmounted, ref} from "vue";
import type {EquipmentHistoryEvent} from "../services/apiService.js";
import {api} from "../services/apiService.js";
import type {Equipment} from "../shared/types.js";

const query = ref("");
const results = ref<Equipment[]>([]);
const selected = ref<Equipment | null>(null);
const history = ref<EquipmentHistoryEvent[]>([]);
const historyLoading = ref(false);
const loading = ref(false);
const photoUrl = ref<string | null>(null);
const online = ref(navigator.onLine);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 280);
}

async function doSearch() {
  if (!query.value.trim()) { results.value = []; return; }
  loading.value = true;
  try {
    results.value = await api.equipment.list({ q: query.value });
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

async function select(r: Equipment) {
  selected.value = r;
  results.value = [];
  query.value = "";
  photoUrl.value = null;
  history.value = [];
  historyLoading.value = true;
  try {
    history.value = await api.equipment.history(r.id);
  } catch {} finally {
    historyLoading.value = false;
  }
}

function expiryClass(ev: EquipmentHistoryEvent) {
  if (ev.days_until === null) return "";
  if (ev.days_until < 0) return "field__hist-expiry--overdue";
  if (ev.days_until <= 30) return "field__hist-expiry--critical";
  if (ev.days_until <= 90) return "field__hist-expiry--warning";
  return "";
}

function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) photoUrl.value = URL.createObjectURL(file);
}

function updateOnline() { online.value = navigator.onLine; }
onMounted(() => {
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
});
onUnmounted(() => {
  window.removeEventListener("online", updateOnline);
  window.removeEventListener("offline", updateOnline);
});
</script>

<style scoped>
.field {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px;
  direction: rtl;
}

.field__search-wrap {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-body);
  padding: 8px 0 12px;
}
.field__search {
  width: 100%;
  font-size: 18px;
  padding: 14px 18px;
  border-radius: 14px;
  border: 2px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  outline: none;
  direction: rtl;
  box-sizing: border-box;
}
.field__search:focus { border-color: var(--brand-color); }

.field__results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.field__result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  text-align: right;
  transition: border-color 0.12s;
  width: 100%;
}
.field__result:hover { border-color: var(--brand-color); }
.field__result-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.field__result-serial { font-size: 13px; color: var(--text-muted); }
.field__result-mfr { font-size: 13px; color: var(--text-secondary); }
.field__empty { text-align: center; color: var(--text-muted); padding: 32px 0; }

/* Equipment card */
.field__card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  position: relative;
}
.field__card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}
.field__card-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
}
.field__card-client {
  font-size: 13px;
  color: var(--text-muted);
  align-self: center;
}
.field__card-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
}

.field__card-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.field__meta-row {
  display: flex;
  gap: 12px;
  font-size: 15px;
  color: var(--text-primary);
}
.field__meta-label {
  color: var(--text-muted);
  min-width: 100px;
  flex-shrink: 0;
}

/* Inspection history */
.field__loading { color: var(--text-muted); font-size: 13px; margin-bottom: 16px; }
.field__hist { margin-bottom: 20px; }
.field__hist-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); margin: 0 0 10px; }
.field__hist-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}
.field__hist-item:last-child { border-bottom: none; }
.field__hist-dot {
  width: 12px; height: 12px; border-radius: 50%; margin-top: 3px; flex-shrink: 0;
  background: var(--text-muted);
}
.field__hist-dot--active   { background: #18a058; }
.field__hist-dot--expired  { background: #d03050; }
.field__hist-dot--renewed  { background: #2080f0; }
.field__hist-body { display: flex; flex-direction: column; gap: 2px; }
.field__hist-type { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.field__hist-expiry { font-size: 13px; color: var(--text-secondary); }
.field__hist-expiry--overdue  { color: #d03050; font-weight: 600; }
.field__hist-expiry--critical { color: #f0a020; font-weight: 600; }
.field__hist-expiry--warning  { color: #e8c84a; }

/* Actions */
.field__actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.field__btn {
  flex: 1;
  padding: 14px 20px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
}
.field__btn--pdf {
  background: var(--brand-color);
  color: #fff;
}
.field__btn--photo {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

/* Photo preview */
.field__photo-wrap { margin-top: 12px; }
.field__photo { width: 100%; border-radius: 10px; }

/* Offline banner */
.field__offline {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #f0a020;
  color: #fff;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  z-index: 100;
}

@media (max-width: 480px) {
  .field { padding: 10px; }
  .field__card-name { font-size: 18px; }
}
</style>
