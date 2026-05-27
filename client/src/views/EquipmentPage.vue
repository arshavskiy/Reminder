<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div>
        <h1 class="page__title">הגדרות מערכת</h1>
        <p class="page__sub">נהל את הציוד, קטגוריות, יצרנים והצהרות בטיחות</p>
      </div>
    </header>

    <!-- Top "section" tabs — mirrors the spec (ציוד / קטגוריות / יצרנים / הצהרות) -->
    <div class="sectiontabs">
      <button
        v-for="s in sections"
        :key="s.value"
        class="sectionpill"
        :class="{ 'sectionpill--active': section === s.value }"
        @click="section = s.value"
      >
        <n-icon :component="s.icon" :size="14" /> {{ s.label }}
      </button>
    </div>

    <!-- ── ציוד tab body ──────────────────────────────────────────────── -->
    <template v-if="section === 'equipment'">
      <div class="subhead">
        <div>
          <h2 class="subhead__title">ניהול ציוד</h2>
          <p class="subhead__sub">נהל את רשימת הציוד שלך והצהרות הבטיחות המשויכות</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost" :disabled="backfilling" @click="backfill">
            {{ backfilling ? 'מקשר...' : 'קשר לתיקים' }}
          </button>
          <button class="btn btn--primary" @click="openCreate">+ הוספת ציוד חדש</button>
        </div>
      </div>

      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
        <input
          v-model="search"
          class="search"
          style="flex:1;margin-bottom:0"
          type="search"
          placeholder="חפש ציוד..."
          @input="debouncedLoad"
        />
        <n-select
          v-model:value="filterManufacturer"
          :options="manufacturerOptions"
          clearable
          filterable
          placeholder="סינון לפי יצרן"
          style="width:200px"
        />
      </div>

      <!-- Category chips -->
      <div class="catchips">
        <button
          v-for="c in categories"
          :key="c.value"
          class="catchip"
          :class="{ 'catchip--active': category === c.value }"
          @click="category = c.value; if (!filterManufacturer) load()"
        >
          {{ c.label }}
          <span class="catchip__count">{{ displayStats[c.value] ?? 0 }}</span>
        </button>
      </div>

      <!-- List -->
      <n-spin :show="loading">
        <div v-if="filteredRows.length" class="rows">
          <article v-for="r in filteredRows" :key="r.id" class="row">
            <button class="row__icon" :class="`row__icon--${r.category}`" @click="openEdit(r)">
              <n-icon :component="categoryIcon(r.category)" :size="18" />
            </button>
            <div class="row__body">
              <div class="row__title-line">
                <strong class="row__name">{{ r.name }}</strong>
                <span class="row__tag">{{ categoryLabel(r.category) }}</span>
                <span v-if="r.client_name" class="row__client">{{ r.client_name }}</span>
              </div>
              <p v-if="r.description" class="row__desc">{{ r.description }}</p>
              <p class="row__meta">
                <span v-if="r.manufacturer">יצרן: {{ r.manufacturer }}</span>
                <span v-if="r.model">דגם: {{ r.model }}</span>
                <span v-if="r.serial_number">מ"ס: {{ r.serial_number }}</span>
                <span v-if="r.capacity">עומס עבודה: {{ r.capacity }}</span>
                <span v-if="r.load_capacity_test">עומס מבחן: {{ r.load_capacity_test }}</span>
                <span v-if="r.load_radius">רדיוס: {{ r.load_radius }}</span>
              </p>
              <p v-if="r.document_id" class="row__doc">
                <router-link :to="`/documents/${r.document_id}`" class="row__doc-link">
                  {{ r.document_name || r.document_id }}
                </router-link>
              </p>
            </div>
            <div class="row__actions">
              <button class="btn btn--xs btn--ghost" @click="openEdit(r)">ערוך</button>
              <button class="btn btn--xs btn--ghost btn--danger" @click="del(r)">מחק</button>
            </div>
          </article>
        </div>
        <p v-else class="empty">{{ filterManufacturer ? 'אין ציוד עבור יצרן זה.' : 'אין ציוד להצגה. לחץ "הוספת ציוד חדש" כדי להתחיל.' }}</p>
      </n-spin>
    </template>

    <!-- ── יצרנים tab ───────────────────────────────────────────────────── -->
    <template v-else-if="section === 'manufacturers'">
      <div class="subhead">
        <div>
          <h2 class="subhead__title">יצרנים</h2>
          <p class="subhead__sub">רשימת היצרנים הקיימים במערכת לפי מספר פריטי ציוד</p>
        </div>
      </div>
      <n-spin :show="loading">
        <div v-if="manufacturerRows.length" class="rows">
          <article
            v-for="m in manufacturerRows"
            :key="m.name"
            class="row"
            style="cursor:pointer"
            @click="section = 'equipment'; filterManufacturer = m.name"
          >
            <button class="row__icon row__icon--lift" style="pointer-events:none">
              <n-icon :component="BusinessOutline" :size="18" />
            </button>
            <div class="row__body">
              <div class="row__title-line">
                <strong class="row__name">{{ m.name }}</strong>
                <span class="row__tag">{{ m.count }} פריטים</span>
              </div>
              <p class="row__meta">
                <span v-for="cat in m.categories" :key="cat">{{ cat }}</span>
              </p>
            </div>
          </article>
        </div>
        <p v-else class="empty">אין יצרנים במערכת עדיין.</p>
      </n-spin>
    </template>

    <!-- Placeholders for remaining sections -->
    <template v-else>
      <div class="placeholder">
        <p>{{ sectionPlaceholder }}</p>
      </div>
    </template>

    <!-- ── Create/Edit drawer ──────────────────────────────────────────── -->
    <n-drawer v-model:show="showEdit" :width="520" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת ציוד' : 'הוספת ציוד חדש'" closable>
        <n-form v-if="editing" label-placement="top">
          <n-form-item label="שם הציוד" required>
            <n-input v-model:value="editing.name" placeholder="למשל: במת הרמה" />
          </n-form-item>
          <n-form-item label="קטגוריה" required>
            <n-select
              v-model:value="editing.category"
              :options="categoryOptions"
              :virtual-scroll="false"
            />
          </n-form-item>
          <n-grid :cols="2" :x-gap="12">
            <n-gi>
              <n-form-item label="יצרן">
                <n-input v-model:value="editing.manufacturer" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="דגם">
                <n-input v-model:value="editing.model" />
              </n-form-item>
            </n-gi>
            <n-gi :span="2">
              <n-form-item label="מספר סידורי">
                <n-input v-model:value="editing.serial_number" placeholder="לדוגמה: K-G1235JXS" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label='עומס עבודה בטוח (ק"ג)'>
                <n-input v-model:value="editing.capacity" placeholder='3200 ק"ג' />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label='עומס מבחן (ק"ג)'>
                <n-input v-model:value="(editing as any).load_capacity_test" placeholder='2200 ק"ג' />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="רדיוס עומס (מטר)">
                <n-input v-model:value="(editing as any).load_radius" placeholder="--" />
              </n-form-item>
            </n-gi>
          </n-grid>
          <n-form-item label="תיאור">
            <n-input v-model:value="editing.description" type="textarea" :rows="3" />
          </n-form-item>
          <n-form-item label="הערות פנימיות">
            <n-input v-model:value="editing.notes" type="textarea" :rows="2" />
          </n-form-item>
          <n-form-item label="לקוח משויך">
            <n-select
              v-model:value="(editing as any).client_id"
              :options="clientOptions"
              placeholder="בחר לקוח..."
              clearable
              filterable
              :virtual-scroll="false"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button v-if="editing?.id" type="error" quaternary @click="del(editing as Equipment)">מחק</n-button>
            <n-button type="primary" :loading="saving" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import {
  NIcon, NSpin, NDrawer, NDrawerContent, NForm, NFormItem, NInput, NSelect,
  NGrid, NGi, NSpace, NButton, useMessage,
} from "naive-ui";
import type { SelectOption } from "naive-ui";
import {
  ConstructOutline, LayersOutline, BusinessOutline, DocumentTextOutline,
  CubeOutline, GitBranchOutline, BuildOutline, AirplaneOutline,
} from "@vicons/ionicons5";
import { RouterLink } from "vue-router";
import { api } from "../services/apiService.js";
import type { Equipment, EquipmentCategory, Client } from "@shared/types.js";

const message = useMessage();

const section = ref<"equipment" | "categories" | "manufacturers" | "declarations">("equipment");
const sections = [
  { value: "equipment",     label: "ציוד",            icon: ConstructOutline },
  // { value: "categories",    label: "קטגוריות",        icon: LayersOutline },
  { value: "manufacturers", label: "יצרנים",          icon: BusinessOutline },
  // { value: "declarations",  label: "הצהרות בטיחות",   icon: DocumentTextOutline },
];

const sectionPlaceholder = computed(() => {
  const map: Record<string, string> = {
    categories:    "ניהול קטגוריות יבוא בקרוב.",
    manufacturers: "ניהול יצרנים יבוא בקרוב.",
    declarations:  "הצהרות בטיחות יבוא בקרוב.",
  };
  return map[section.value] ?? "";
});

const category = ref<EquipmentCategory | "all">("all");
const categories: Array<{ value: EquipmentCategory | "all"; label: string }> = [
  { value: "all",       label: "כל הסוגים" },
  { value: "lift",      label: "מכונות הרמה" },
  { value: "accessory", label: "אביזרי הרמה" },
  { value: "scaffold",  label: "פיגומים" },
  { value: "ladder",    label: "מעליות" },
  { value: "balloon",   label: "מעלונים" },
  { value: "intake",    label: "קולטי אוויר" },
  { value: "extractor", label: "קולטי קיטור" },
  { value: "other",     label: "אחר" },
];

const categoryOptions = categories
  .filter((c) => c.value !== "all")
  .map((c) => ({ label: c.label, value: c.value }));

const rows = ref<Equipment[]>([]);
const filterManufacturer = ref<string | null>(null);
const stats = ref<Record<string, number>>({});
const clients = ref<Client[]>([]);
const loading = ref(false);
const search = ref("");

const manufacturerOptions = computed<SelectOption[]>(() => {
  const names = [...new Set(rows.value.map((r) => r.manufacturer).filter(Boolean))] as string[];
  return names.sort().map((m) => ({ label: m, value: m }));
});

const manufacturerRows = computed(() => {
  const map = new Map<string, { name: string; count: number; categories: Set<string> }>();
  for (const r of rows.value) {
    if (!r.manufacturer) continue;
    if (!map.has(r.manufacturer)) {
      map.set(r.manufacturer, { name: r.manufacturer, count: 0, categories: new Set() });
    }
    const entry = map.get(r.manufacturer)!;
    entry.count++;
    if (r.category) entry.categories.add(categoryLabel(r.category));
  }
  return [...map.values()]
    .map((e) => ({ ...e, categories: [...e.categories] }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
});

const filteredRows = computed(() => {
  let result = rows.value;
  if (filterManufacturer.value) {
    result = result.filter((r) => r.manufacturer === filterManufacturer.value);
    if (category.value !== "all") {
      result = result.filter((r) => r.category === category.value);
    }
  }
  return result;
});

const displayStats = computed(() => {
  if (!filterManufacturer.value) return stats.value;
  const counts: Record<string, number> = { all: filteredRows.value.length };
  for (const r of filteredRows.value) {
    counts[r.category] = (counts[r.category] ?? 0) + 1;
  }
  return counts;
});
const showEdit = ref(false);
const editing = ref<Partial<Equipment> | null>(null);
const saving = ref(false);
const backfilling = ref(false);

const clientOptions = computed<SelectOption[]>(() =>
  clients.value.map((c) => ({ label: c.display_name, value: c.id.toString() }))
);

function categoryLabel(c: string): string {
  return categories.find((x) => x.value === c)?.label ?? c;
}

const ICONS: Record<string, unknown> = {
  lift: ConstructOutline,
  accessory: CubeOutline,
  scaffold: GitBranchOutline,
  ladder: LayersOutline,
  balloon: AirplaneOutline,
  intake: BuildOutline,
  extractor: BuildOutline,
  other: CubeOutline,
};
function categoryIcon(c: string) {
  return ICONS[c] ?? CubeOutline;
}

let debounce: ReturnType<typeof setTimeout>;
function debouncedLoad() {
  clearTimeout(debounce);
  debounce = setTimeout(load, 200);
}

async function load() {
  loading.value = true;
  try {
    const [list, st, cl] = await Promise.all([
      api.equipment.list({
        category: category.value === "all" ? undefined : category.value,
        q: search.value || undefined,
      }),
      api.equipment.stats(),
      api.clients.list({ limit: 500 }),
    ]);
    rows.value = list;
    stats.value = st;
    clients.value = cl.rows;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── CRUD ───────────────────────────────────────────────────────────────────
function openCreate() {
  editing.value = {
    name: "",
    category: "lift",
    manufacturer: "",
    model: "",
    capacity: "",
    description: "",
    notes: "",
    is_active: 1,
  };
  showEdit.value = true;
}

function openEdit(r: Equipment) {
  editing.value = { ...r };
  showEdit.value = true;
}

async function save() {
  if (!editing.value) return;
  if (!editing.value.name?.trim()) {
    message.warning("יש להזין שם");
    return;
  }
  saving.value = true;
  try {
    if (editing.value.id) {
      await api.equipment.update(editing.value.id, editing.value);
      message.success("הציוד עודכן");
    } else {
      await api.equipment.create(editing.value);
      message.success("הציוד נוסף");
    }
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function backfill() {
  backfilling.value = true;
  try {
    const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
    const r = await fetch(`${SERVER}/api/equipment/backfill`, { method: "POST", credentials: "include" }).then(x => x.json());
    message.success(`קושרו ${r.patched} פריטים`);
    await load();
  } catch (e) {
    message.error(String(e));
  } finally {
    backfilling.value = false;
  }
}

async function del(r: Equipment) {
  if (!r.id) return;
  if (!confirm(`למחוק את "${r.name}"?`)) return;
  try {
    await api.equipment.delete(r.id);
    message.success("נמחק");
    showEdit.value = false;
    await load();
  } catch (e) {
    message.error(String(e));
  }
}
</script>

<style scoped>
/* ── Page header ────────────────────────────────────────────────────────── */
.page__head { margin-bottom: 24px; }
.page__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.4px;
}
.page__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* ── Top section tabs (ציוד / קטגוריות / יצרנים / הצהרות) ───────────────── */
.sectiontabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.sectionpill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.sectionpill:hover { color: var(--text-primary); background: var(--bg-hover); }
.sectionpill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

/* ── Subhead ────────────────────────────────────────────────────────────── */
.subhead {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 18px;
}
.subhead__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
}
.subhead__sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* ── Search + category chips ────────────────────────────────────────────── */
.search {
  width: 100%;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
  direction: rtl;
  margin-bottom: 14px;
}
.search:focus { border-color: var(--brand-color); outline: none; }

.catchips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.catchip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.catchip:hover { background: var(--bg-hover); color: var(--text-primary); }
.catchip--active {
  background: var(--brand-color);
  color: var(--text-inverse, #fff);
  border-color: var(--brand-color);
  font-weight: 600;
}
.catchip__count {
  background: rgba(255, 255, 255, 0.25);
  color: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
}
.catchip:not(.catchip--active) .catchip__count {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

/* ── Equipment rows ─────────────────────────────────────────────────────── */
.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 18px;
  transition: border-color var(--transition);
}
.row:hover { border-color: var(--brand-color); }

.row__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.row__icon--lift      { background: rgba(99, 226, 183, 0.15); color: var(--brand-color); }
html[data-theme="light"] .row__icon--lift { background: rgba(24, 160, 88, 0.10); }
.row__icon--accessory { background: rgba(32, 128, 240, 0.10); color: #2080f0; }

.row__body { flex: 1; min-width: 0; }
.row__title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.row__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.row__tag {
  font-size: 11px;
  color: var(--brand-color);
  background: rgba(99, 226, 183, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
html[data-theme="light"] .row__tag { background: rgba(24, 160, 88, 0.10); }

.row__desc, .row__meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__meta span + span::before { content: "·"; margin: 0 6px; color: var(--text-muted); }

.row__client {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: 999px;
}

.row__doc {
  font-size: 12px;
  margin: 3px 0 0;
}
.row__doc-link {
  color: var(--brand-color);
  text-decoration: none;
}
.row__doc-link:hover { text-decoration: underline; }

.row__actions { display: flex; gap: 6px; flex-shrink: 0; }

/* ── Buttons ────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast);
  white-space: nowrap;
}
.btn:hover { background: var(--bg-hover); }
.btn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}
.btn--primary:hover { background: var(--brand-color-hover); border-color: var(--brand-color-hover); }
.btn--ghost { background: transparent; }
.btn--xs { padding: 4px 10px; font-size: 12px; }
.btn--danger { color: var(--color-error); }
.btn--danger:hover { background: rgba(208, 48, 80, 0.08); }

/* ── Placeholder / empty ────────────────────────────────────────────────── */
.placeholder,
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: 14px;
}
</style>
