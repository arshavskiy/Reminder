<template>
  <div class="page2">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="page__head">
      <div>
        <h1 class="page__title">הגדרות ציוד</h1>
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
        <div class="equipment-actions">
          <button class="btn btn--primary" @click="openCreate">+ הוספת ציוד חדש</button>
          <button class="btn btn--ghost" @click="showImport = true">
            <n-icon :component="CloudUploadOutline" class="btn-icon"/>
            ייבוא מ-Excel
          </button>
          <button class="btn btn--ghost" :disabled="loading" @click="load(true)">
            <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon"/>
            רענן
          </button>
          <button class="btn btn--ghost" :disabled="backfilling" @click="backfill">
            {{ backfilling ? 'מקשר...' : 'קשר לתיקים' }}
          </button>
          <button class="btn btn--ghost btn--danger" @click="deleteAll">
            <n-icon :component="TrashOutline" class="btn-icon"/>
            מחק הכל
          </button>
        </div>
      </div>

      <div class="equipment-filters">
        <input
          v-model="search"
          class="search"
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
        />
        <n-select
          v-model:value="filterClientId"
          :options="clientOptions"
          clearable
          filterable
          placeholder="סינון לפי לקוח"
          @update:value="load(true)"
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
                <strong class="row__name">{{ equipmentTitle(r) }}</strong>
                <span class="row__tag">{{ categoryLabel(r.category) }}</span>
                <span v-if="r.client_name" class="row__client">{{ r.client_name }}</span>
              </div>
              <p v-if="equipmentSubtitle(r)" class="row__desc">{{ equipmentSubtitle(r) }}</p>
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
                  {{ r.document_name || 'מסמך מקור' }}
                </router-link>
              </p>
            </div>
            <div class="row__actions">
              <button class="btn btn--xs btn--ghost" @click="openQr(r)">
                <n-icon :component="QrCodeOutline" class="btn-icon"/>
                QR
              </button>
              <button class="btn btn--xs btn--ghost" @click="openHistory(r)">היסטוריה</button>
<!--              <button class="btn btn&#45;&#45;xs btn&#45;&#45;ghost" @click="api.equipment.downloadReport(r.id)">PDF</button>-->
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

    <!-- ── XLSX Import modal ─────────────────────────────────────────── -->
    <XlsxImportModal v-model="showImport" @imported="load(true)" />

    <!-- ── Create/Edit drawer ──────────────────────────────────────────── -->
    <n-drawer v-model:show="showEdit" :width="520" placement="left">
      <n-drawer-content :title="editing?.id ? 'עריכת ציוד' : 'הוספת ציוד חדש'" closable>
        <n-tabs v-if="editing?.id" v-model:value="drawerTab" animated type="line">
          <n-tab-pane name="details" tab="פרטים">
            <n-form label-placement="top" style="margin-top:12px">
              <n-form-item label="שם הציוד" required>
                <n-input v-model:value="editing.name" placeholder="למשל: במת הרמה" />
              </n-form-item>
              <n-form-item label="קטגוריה" required>
                <n-select v-model:value="editing.category" :options="categoryOptions" :virtual-scroll="false" />
              </n-form-item>
              <n-grid :cols="2" :x-gap="12">
                <n-gi><n-form-item label="יצרן"><n-input v-model:value="editing.manufacturer" /></n-form-item></n-gi>
                <n-gi><n-form-item label="דגם"><n-input v-model:value="editing.model" /></n-form-item></n-gi>
                <n-gi :span="2"><n-form-item label="מספר סידורי"><n-input v-model:value="editing.serial_number" placeholder="לדוגמה: K-G1235JXS" /></n-form-item></n-gi>
                <n-gi><n-form-item label='עומס עבודה בטוח (ק"ג)'><n-input v-model:value="editing.capacity" placeholder='3200 ק"ג' /></n-form-item></n-gi>
                <n-gi><n-form-item label='עומס מבחן (ק"ג)'><n-input v-model:value="(editing as any).load_capacity_test" placeholder='2200 ק"ג' /></n-form-item></n-gi>
                <n-gi><n-form-item label="רדיוס עומס (מטר)"><n-input v-model:value="(editing as any).load_radius" placeholder="--" /></n-form-item></n-gi>
              </n-grid>
              <n-form-item label="תיאור"><n-input v-model:value="editing.description" :rows="3" type="textarea" /></n-form-item>
              <n-form-item label="הערות פנימיות"><n-input v-model:value="editing.notes" :rows="2" type="textarea" /></n-form-item>
              <n-form-item label="לקוח משויך">
                <n-select v-model:value="(editing as any).client_id" :options="clientOptions" :virtual-scroll="false" clearable filterable placeholder="בחר לקוח..." />
              </n-form-item>
            </n-form>
          </n-tab-pane>

          <n-tab-pane name="history" tab="היסטוריה">
            <n-spin :show="historyLoading" style="margin-top:12px">
              <div v-if="timeline.length" class="hist">
                <div v-for="(item, idx) in timeline" :key="idx" class="hist__item">
                  <div class="hist__line" />

                  <!-- Photo entry -->
                  <template v-if="item.kind === 'photo'">
                    <div class="hist__dot hist__dot--photo" />
                    <div class="hist__body">
                      <div class="hist__title-row">
                        <strong>תמונת שטח</strong>
                        <span class="hist__num">{{ formatDateTime(item.photo.taken_at) }}</span>
                      </div>
                      <img
                        :src="item.photo.url"
                        alt="תמונת ציוד"
                        class="hist__photo"
                        @click="lightboxUrl = item.photo.url"
                      />
                    </div>
                  </template>

                  <!-- Inspection entry -->
                  <template v-else>
                    <div :class="`hist__dot--${item.event.status}`" class="hist__dot" />
                    <div class="hist__body">
                      <div class="hist__title-row">
                        <strong>{{ item.event.contract_type ?? 'בדיקה' }}</strong>
                        <span v-if="item.event.contract_number" class="hist__num">{{ item.event.contract_number }}</span>
                        <span :class="`hist__status--${item.event.status}`" class="hist__status">{{ item.event.status }}</span>
                      </div>
                      <div class="hist__dates">
                        <span v-if="item.event.start_date">התחלה: {{ item.event.start_date }}</span>
                        <span v-if="item.event.expiry_date">
                          פקיעה: {{ item.event.expiry_date }}
                          <span v-if="item.event.days_until !== null" :class="item.event.days_until < 0 ? 'hist__overdue' : item.event.days_until <= 30 ? 'hist__warn' : ''">
                            ({{ item.event.days_until < 0 ? `פג לפני ${Math.abs(item.event.days_until)}י` : `${item.event.days_until}י` }})
                          </span>
                        </span>
                      </div>
                      <div v-if="item.event.inspector || item.event.load_capacity_test || item.event.pass_fail" class="hist__meta">
                        <span v-if="item.event.inspector">בודק: {{ item.event.inspector }}</span>
                        <span v-if="item.event.load_capacity_test">עומס מבחן: {{ item.event.load_capacity_test }}</span>
                        <span v-if="item.event.pass_fail">תוצאה: {{ item.event.pass_fail }}</span>
                      </div>
                      <router-link v-if="item.event.document_id" :to="`/documents/${item.event.document_id}`" class="hist__doc-link">
                        {{ item.event.document_name ?? item.event.document_id }}
                      </router-link>
                    </div>
                  </template>
                </div>
              </div>
              <p v-else class="hist__empty">אין היסטוריית בדיקות לציוד זה.</p>
            </n-spin>

            <!-- Lightbox -->
            <div v-if="lightboxUrl" class="hist__lightbox" @click="lightboxUrl = null">
              <img :src="lightboxUrl" class="hist__lightbox-img" />
            </div>
          </n-tab-pane>

          <n-tab-pane name="checklist" tab="צ׳קליסט">
            <div class="checklist" style="margin-top:12px">
              <div class="checklist__head">
                <div>
                  <h3>בדיקת שטח</h3>
                  <p>נשמר על פריט הציוד ומופיע גם במסך שטח.</p>
                </div>
                <n-button secondary size="small" @click="addChecklistItem">
                  <template #icon>
                    <n-icon :component="AddCircleOutline"/>
                  </template>
                  הוסף שורה
                </n-button>
              </div>
              <div v-for="(item, index) in checklistDraft" :key="item.id" class="checklist__row">
                <n-checkbox v-model:checked="item.checked"/>
                <n-input v-model:value="item.label" placeholder="סעיף בדיקה"/>
                <n-input v-model:value="item.note" placeholder="הערה"/>
                <button class="btn btn--xs btn--ghost btn--danger" @click="removeChecklistItem(index)">
                  <n-icon :component="RemoveCircleOutline" class="btn-icon"/>
                </button>
              </div>
              <n-button
                  :loading="savingChecklist"
                  type="primary"
                  @click="saveChecklist"
              >
                שמור צ׳קליסט
              </n-button>
            </div>
          </n-tab-pane>
        </n-tabs>

        <!-- New equipment (no id) — just the form, no tabs -->
        <n-form v-else-if="editing" label-placement="top">
          <n-form-item label="שם הציוד" required>
            <n-input v-model:value="editing.name" placeholder="למשל: במת הרמה" />
          </n-form-item>
          <n-form-item label="קטגוריה" required>
            <n-select v-model:value="editing.category" :options="categoryOptions" :virtual-scroll="false" />
          </n-form-item>
          <n-grid :cols="2" :x-gap="12">
            <n-gi><n-form-item label="יצרן"><n-input v-model:value="editing.manufacturer" /></n-form-item></n-gi>
            <n-gi><n-form-item label="דגם"><n-input v-model:value="editing.model" /></n-form-item></n-gi>
            <n-gi :span="2"><n-form-item label="מספר סידורי"><n-input v-model:value="editing.serial_number" placeholder="לדוגמה: K-G1235JXS" /></n-form-item></n-gi>
            <n-gi><n-form-item label='עומס עבודה בטוח (ק"ג)'><n-input v-model:value="editing.capacity" placeholder='3200 ק"ג' /></n-form-item></n-gi>
            <n-gi><n-form-item label='עומס מבחן (ק"ג)'><n-input v-model:value="(editing as any).load_capacity_test" placeholder='2200 ק"ג' /></n-form-item></n-gi>
            <n-gi><n-form-item label="רדיוס עומס (מטר)"><n-input v-model:value="(editing as any).load_radius" placeholder="--" /></n-form-item></n-gi>
          </n-grid>
          <n-form-item label="תיאור"><n-input v-model:value="editing.description" :rows="3" type="textarea" /></n-form-item>
          <n-form-item label="הערות פנימיות"><n-input v-model:value="editing.notes" :rows="2" type="textarea" /></n-form-item>
          <n-form-item label="לקוח משויך">
            <n-select v-model:value="(editing as any).client_id" :options="clientOptions" :virtual-scroll="false" clearable filterable placeholder="בחר לקוח..." />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space>
            <n-button @click="showEdit = false">ביטול</n-button>
            <n-button v-if="editing?.id" type="error" quaternary @click="del(editing as Equipment)">מחק</n-button>
            <n-button v-if="drawerTab === 'details'" :loading="saving" type="primary" @click="save">שמור</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showQr" class="qr-modal" preset="card" title="QR לציוד">
      <div v-if="qrEquipment" class="qr-card">
        <img :src="qrImageUrl" alt="קוד QR לציוד" class="qr-card__image"/>
        <div class="qr-card__body">
          <strong>{{ qrEquipment.name }}</strong>
          <span v-if="qrEquipment.serial_number">מ״ס {{ qrEquipment.serial_number }}</span>
          <input :value="qrFieldUrl" class="qr-card__link" readonly/>
        </div>
        <div class="qr-card__actions">
          <n-button secondary @click="copyQrLink">
            <template #icon>
              <n-icon :component="ClipboardOutline"/>
            </template>
            העתק קישור
          </n-button>
          <n-button secondary @click="printQr">
            <template #icon>
              <n-icon :component="PrintOutline"/>
            </template>
            הדפס
          </n-button>
          <n-button type="primary" @click="router.push(qrFieldPath)">
            <template #icon>
              <n-icon :component="OpenOutline"/>
            </template>
            פתח בשטח
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import type {SelectOption} from "naive-ui";
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NIcon,
  NInput,
  NCheckbox,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  useMessage,
} from "naive-ui";
import {
  AirplaneOutline,
  AddCircleOutline,
  BuildOutline,
  BusinessOutline,
  ClipboardOutline,
  CloudUploadOutline,
  ConstructOutline,
  CubeOutline,
  GitBranchOutline,
  LayersOutline,
  OpenOutline,
  PrintOutline,
  QrCodeOutline,
  RefreshOutline,
  RemoveCircleOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {RouterLink} from "vue-router";
import {useRouter} from "vue-router";
import type {EquipmentHistoryEvent} from "../services/apiService.js";
import {api} from "../services/apiService.js";
import {useConfirm} from "../composables/useConfirm.js";
import type {Client, Equipment, EquipmentCategory} from "@shared/types.js";
import XlsxImportModal from "../components/XlsxImportModal.vue";

const message = useMessage();
const { confirm } = useConfirm();
const router = useRouter();

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

function equipmentTitle(row: { name?: string | null; manufacturer?: string | null; model?: string | null; serial_number?: string | null }): string {
  const branded = [row.manufacturer, row.model].filter(Boolean).join(" ").trim();
  if (branded) return branded;
  const name = (row.name ?? "").trim();
  if (name && name.length <= 48) return name;
  if (row.serial_number) return `מס׳ ${row.serial_number}`;
  return name ? `${name.slice(0, 40)}…` : "ציוד";
}

function equipmentSubtitle(row: { name?: string | null; description?: string | null; manufacturer?: string | null; model?: string | null }): string {
  const description = (row.description ?? "").trim();
  if (description) return description;
  const name = (row.name ?? "").trim();
  const title = equipmentTitle(row);
  return name && name !== title ? name : "";
}

const categoryOptions = categories
  .filter((c) => c.value !== "all")
  .map((c) => ({ label: c.label, value: c.value }));

const rows = ref<Equipment[]>([]);
const filterManufacturer = ref<string | null>(null);
const filterClientId = ref<string | null>(null);
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
const showImport = ref(false);
const showEdit = ref(false);
const editing = ref<Partial<Equipment> | null>(null);
const saving = ref(false);
const backfilling = ref(false);
const drawerTab = ref<"details" | "history" | "checklist">("details");
const history = ref<EquipmentHistoryEvent[]>([]);
const historyLoading = ref(false);
const photos = ref<{ url: string; key: string; taken_at: string }[]>([]);
const lightboxUrl = ref<string | null>(null);
const checklistDraft = ref<NonNullable<Equipment["inspection_checklist"]>>([]);
const savingChecklist = ref(false);
const showQr = ref(false);
const qrEquipment = ref<Equipment | null>(null);

const clientOptions = computed<SelectOption[]>(() =>
  clients.value.map((c) => ({ label: c.display_name, value: c.id.toString() }))
);

type TimelineItem =
  | { kind: "inspection"; date: string; event: EquipmentHistoryEvent }
  | { kind: "photo";      date: string; photo: { url: string; key: string; taken_at: string } };

const timeline = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = [
    ...history.value.map(e => ({
      kind: "inspection" as const,
      date: e.start_date ?? e.expiry_date ?? "",
      event: e,
    })),
    ...photos.value.map(p => ({
      kind: "photo" as const,
      date: p.taken_at,
      photo: p,
    })),
  ];
  return items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
});

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

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

async function load(force = false) {
  loading.value = true;
  try {
    const [list, st, cl] = await Promise.all([
      api.equipment.list({
        category: category.value === "all" ? undefined : category.value,
        q: search.value || undefined,
        client_id: filterClientId.value || undefined,
      }, force),
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

function loadHistoryData(id: string | number) {
  historyLoading.value = true;
  photos.value = [];
  Promise.all([
    api.equipment.history(id).then(h => { history.value = h; }),
    api.equipment.getSignedPhotos(String(id)).then(({ photos: p }) => { photos.value = p; }),
  ]).catch(() => {}).finally(() => { historyLoading.value = false; });
}

function openEdit(r: Equipment) {
  editing.value = { ...r };
  drawerTab.value = "details";
  checklistDraft.value = checklistFromEquipment(r);
  history.value = [];
  showEdit.value = true;
  if (r.id) loadHistoryData(r.id);
}

function openHistory(r: Equipment) {
  editing.value = { ...r };
  drawerTab.value = "history";
  checklistDraft.value = checklistFromEquipment(r);
  history.value = [];
  showEdit.value = true;
  if (r.id) loadHistoryData(r.id);
}

function checklistFromEquipment(r: Equipment): NonNullable<Equipment["inspection_checklist"]> {
  return (r.inspection_checklist?.length ? r.inspection_checklist : defaultChecklist()).map((item) => ({...item}));
}

function defaultChecklist(): NonNullable<Equipment["inspection_checklist"]> {
  return [
    {id: "visual", label: "בדיקה חזותית", checked: false, note: null},
    {id: "serial", label: "אימות מספר סידורי / רישוי", checked: false, note: null},
    {id: "load", label: "בדיקת עומס והתאמה", checked: false, note: null},
    {id: "safety", label: "בדיקת אמצעי בטיחות", checked: false, note: null},
    {id: "photos", label: "צילום מצב הציוד", checked: false, note: null},
  ];
}

function addChecklistItem() {
  checklistDraft.value.push({id: `custom-${Date.now()}`, label: "", checked: false, note: null});
}

function removeChecklistItem(index: number) {
  checklistDraft.value.splice(index, 1);
}

async function saveChecklist() {
  if (!editing.value?.id) return;
  savingChecklist.value = true;
  try {
    const checklist = checklistDraft.value.filter((item) => item.label.trim());
    const saved = await api.equipment.saveChecklist(String(editing.value.id), checklist);
    checklistDraft.value = saved.checklist.map((item) => ({...item}));
    const row = rows.value.find((item) => String(item.id) === String(editing.value?.id));
    if (row) row.inspection_checklist = saved.checklist;
    message.success("הצ׳קליסט נשמר");
  } catch {
    message.error("שגיאה בשמירת הצ׳קליסט");
  } finally {
    savingChecklist.value = false;
  }
}

const qrFieldPath = computed(() => qrEquipment.value ? `/field?equipment=${encodeURIComponent(String(qrEquipment.value.id))}` : "/field");
const qrFieldUrl = computed(() => `${window.location.origin}${qrFieldPath.value}`);
const qrImageUrl = computed(() => `https://quickchart.io/qr?size=240&margin=2&text=${encodeURIComponent(qrFieldUrl.value)}`);

function openQr(r: Equipment) {
  qrEquipment.value = r;
  showQr.value = true;
}

async function copyQrLink() {
  await navigator.clipboard.writeText(qrFieldUrl.value);
  message.success("הקישור הועתק");
}

function printQr() {
  window.print();
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
    await load(true);
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
    await load(true);
  } catch (e) {
    message.error(String(e));
  } finally {
    backfilling.value = false;
  }
}

function deleteAll() {
  confirm({
    title: "מחק הכל",
    content: "למחוק את כל הציוד? פעולה זו אינה הפיכה.",
    confirmText: "מחק הכל",
    onConfirm: async () => {
      try {
        await api.equipment.deleteAll();
        message.success("כל הציוד נמחק");
        await load(true);
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}

function del(r: Equipment) {
  if (!r.id) return;
  confirm({
    title: "מחיקת ציוד",
    content: `למחוק את "${equipmentTitle(r)}"?`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await api.equipment.delete(r.id!);
        message.success("נמחק");
        showEdit.value = false;
        await load(true);
      } catch (e) {
        message.error(String(e));
      }
    },
  });
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
.equipment-filters {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(180px, 220px) minmax(180px, 220px);
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
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
}
.search:focus { border-color: var(--brand-color); outline: none; }
.equipment-filters :deep(.n-select) {
  width: 100%;
}

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
.refresh-icon { display: inline-block; transition: transform 0.4s; }
.refresh-icon--spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

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

/* ── History timeline ────────────────────────────────────────────────────── */
.hist { display: flex; flex-direction: column; gap: 0; }
.hist__item {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 20px;
}
.hist__item:last-child { padding-bottom: 0; }
.hist__line {
  position: absolute;
  left: 7px;
  top: 20px;
  bottom: 0;
  width: 2px;
  background: var(--border-color);
}
.hist__item:last-child .hist__line { display: none; }
.hist__dot {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  flex-shrink: 0;
  margin-top: 2px;
  background: var(--brand-color);
  border: 2px solid var(--bg-card);
  z-index: 1;
}
.hist__dot--expired  { background: #d03050; }
.hist__dot--active   { background: #18a058; }
.hist__dot--renewed  { background: #2080f0; }
.hist__dot--cancelled { background: var(--text-muted); }

.hist__body { flex: 1; min-width: 0; }
.hist__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 3px;
}
.hist__num {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
}
.hist__status {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
}
.hist__status--active   { background: rgba(24,160,88,.12); color: #18a058; }
.hist__status--expired  { background: rgba(208,48,80,.10); color: #d03050; }
.hist__status--renewed  { background: rgba(32,128,240,.10); color: #2080f0; }
.hist__status--cancelled { background: var(--bg-elevated); color: var(--text-muted); }

.hist__dates {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 3px;
}
.hist__overdue { color: #d03050; font-weight: 600; }
.hist__warn    { color: #f0a020; font-weight: 600; }

.hist__meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.hist__meta span + span::before { content: "·"; margin-left: 4px; }
.hist__doc-link {
  font-size: 12px;
  color: var(--brand-color);
  text-decoration: none;
  display: block;
  margin-top: 3px;
}
.hist__doc-link:hover { text-decoration: underline; }
.hist__empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 32px 0;
}

.hist__dot--photo { background: #8855ff; }

.hist__photo {
  margin-top: 8px;
  width: 100%;
  max-width: 260px;
  border-radius: 8px;
  object-fit: cover;
  aspect-ratio: 4/3;
  cursor: zoom-in;
  display: block;
  border: 1px solid var(--border-color);
}

.hist__lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.hist__lightbox-img {
  max-width: 95vw;
  max-height: 90vh;
  border-radius: 8px;
  object-fit: contain;
}

.checklist {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checklist__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.checklist__head h3 {
  margin: 0 0 2px;
  color: var(--text-primary);
  font-size: 16px;
}

.checklist__head p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.checklist__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1.1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.qr-modal {
  max-width: 420px;
}

.qr-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.qr-card__image {
  width: 240px;
  height: 240px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
}

.qr-card__body {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.qr-card__body strong {
  color: var(--text-primary);
  font-size: 16px;
}

.qr-card__body span {
  color: var(--text-secondary);
  font-size: 12px;
}

.qr-card__link {
  margin-top: 6px;
  width: 100%;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.qr-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .page__title {
    font-size: 23px;
  }

  .sectiontabs,
  .catchips {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .sectiontabs::-webkit-scrollbar,
  .catchips::-webkit-scrollbar {
    display: none;
  }

  .sectionpill,
  .catchip {
    flex: 0 0 auto;
  }

  .subhead {
    align-items: stretch;
    flex-direction: column;
  }

  .equipment-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .equipment-actions .btn {
    justify-content: center;
  }

  .equipment-filters {
    align-items: stretch;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .equipment-filters .search {
    margin-bottom: 0;
  }

  .equipment-filters :deep(.n-select) {
    width: 100% !important;
  }

  .row {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 14px;
  }

  .row__body {
    flex: 1 1 calc(100% - 56px);
  }

  .row__title-line,
  .row__meta {
    flex-wrap: wrap;
    white-space: normal;
  }

  .row__desc,
  .row__meta {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .row__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .row__actions .btn {
    justify-content: center;
  }

  :deep(.n-drawer) {
    max-width: 100vw;
  }

  :deep(.n-drawer-body-content-wrapper) {
    padding: 16px;
  }

  .checklist__head {
    flex-direction: column;
  }

  .checklist__row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .checklist__row :deep(.n-input):nth-of-type(2) {
    grid-column: 2;
  }
}

@media (max-width: 420px) {
  .equipment-actions,
  .row__actions {
    grid-template-columns: 1fr;
  }
}

@media print {
  body * {
    visibility: hidden;
  }

  .qr-modal,
  .qr-modal * {
    visibility: visible;
  }

  .qr-modal {
    position: fixed;
    inset: 0;
    max-width: none;
  }
}
</style>
