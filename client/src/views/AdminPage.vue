<template>
  <div class="admin-shell">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="admin-sidebar">
      <div class="admin-sidebar__brand" @click="router.push('/')">
        <n-icon :component="BriefcaseOutline" :size="20" />
        <span>ReminderOCR</span>
      </div>

      <nav class="admin-sidebar__nav">
        <button
          v-for="item in sidebarItems"
          :key="item.key"
          class="admin-sidebar__item"
          :class="{ 'admin-sidebar__item--active': activeSection === item.key }"
          type="button"
          @click="activeSection = item.key"
        >
          <n-icon :component="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="admin-sidebar__footer">
        <button class="admin-sidebar__item" type="button" @click="router.push('/')">
          <n-icon :component="ArrowBackOutline" :size="18" />
          <span>חזור לאפליקציה</span>
        </button>
      </div>
    </aside>

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <div class="admin-main">
      <header class="admin-main__header">
        <h1 class="admin-main__title">{{ currentItem?.label }}</h1>
        <div class="admin-main__meta">לוח ניהול מערכת</div>
      </header>

      <!-- Users section -->
      <section v-if="activeSection === 'users'" class="admin-section">
        <div class="admin-section__toolbar">
          <n-input
            v-model:value="userSearch"
            placeholder="חיפוש לפי שם / אימייל..."
            clearable
            dir="rtl"
            style="max-width: 280px"
          >
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
          <n-button :loading="usersLoading" @click="loadUsers">↻ רענן</n-button>
        </div>

        <n-data-table
          :columns="userColumns"
          :data="filteredUsers"
          :loading="usersLoading"
          :bordered="false"
          :pagination="{ pageSize: 20 }"
          dir="rtl"
          size="small"
          style="margin-top: 16px"
        />
      </section>

      <!-- Stats section -->
      <section v-if="activeSection === 'stats'" class="admin-section">
        <div class="admin-stats-grid">
          <div v-for="s in systemStats" :key="s.label" class="admin-stat-card">
            <n-icon :component="s.icon" :size="28" class="admin-stat-card__icon" />
            <div class="admin-stat-card__body">
              <div class="admin-stat-card__num">{{ s.value }}</div>
              <div class="admin-stat-card__label">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Role edit modal -->
    <n-modal v-model:show="showRoleModal" preset="dialog" title="שינוי תפקיד משתמש" style="width: 360px" :mask-closable="false">
      <div dir="rtl" style="padding: 8px 0">
        <p style="margin: 0 0 12px; font-size: 14px">
          <strong>{{ editingUser?.email }}</strong>
        </p>
        <n-select
          v-model:value="editingRole"
          :options="roleOptions"
          placeholder="בחר תפקיד"
          dir="rtl"
        />
      </div>
      <template #action>
        <n-button @click="showRoleModal = false">ביטול</n-button>
        <n-button type="primary" :loading="savingRole" @click="saveRole">שמור</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NButton, NDataTable, NIcon, NInput, NModal, NSelect, NTag, useMessage,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import {
  ArrowBackOutline,
  BriefcaseOutline,
  PeopleOutline,
  SearchOutline,
  StatsChartOutline,
} from "@vicons/ionicons5";
import { api } from "../services/apiService.js";

const router = useRouter();
const message = useMessage();

// ── Sidebar ────────────────────────────────────────────────────────────────
const sidebarItems = [
  { key: "users",  label: "משתמשים",    icon: PeopleOutline },
  { key: "stats",  label: "סטטיסטיקות", icon: StatsChartOutline },
];
const activeSection = ref("users");
const currentItem = computed(() => sidebarItems.find((i) => i.key === activeSection.value));

// ── Users ──────────────────────────────────────────────────────────────────
const users = ref<any[]>([]);
const usersLoading = ref(false);
const userSearch = ref("");

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q),
  );
});

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await api.admin.listUsers();
  } catch (e) {
    message.error("שגיאה בטעינת משתמשים");
  } finally {
    usersLoading.value = false;
  }
}

const roleOptions = [
  { label: "משתמש רגיל", value: "user" },
  { label: "Pro",        value: "pro"  },
  { label: "מנהל",       value: "admin"},
];

const roleTagType: Record<string, "default" | "info" | "warning"> = {
  user:  "default",
  pro:   "info",
  admin: "warning",
};
const roleLabel: Record<string, string> = {
  user:  "משתמש",
  pro:   "Pro",
  admin: "מנהל",
};

// Role edit modal
const showRoleModal = ref(false);
const editingUser = ref<any>(null);
const editingRole = ref<string>("");
const savingRole = ref(false);

function openRoleModal(user: any) {
  editingUser.value = user;
  editingRole.value = user.role;
  showRoleModal.value = true;
}

async function saveRole() {
  if (!editingUser.value) return;
  savingRole.value = true;
  try {
    const updated = await api.admin.updateUser(editingUser.value.id, { role: editingRole.value });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    showRoleModal.value = false;
    message.success("התפקיד עודכן");
  } catch {
    message.error("שגיאה בעדכון התפקיד");
  } finally {
    savingRole.value = false;
  }
}

async function toggleActive(user: any) {
  const newActive = user.is_active === 0 ? 1 : 0;
  try {
    const updated = await api.admin.updateUser(user.id, { is_active: newActive });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    message.success(newActive ? "המשתמש הופעל" : "המשתמש הושבת");
  } catch {
    message.error("שגיאה בעדכון הסטטוס");
  }
}

const userColumns: DataTableColumns<any> = [
  {
    title: "אימייל",
    key: "email",
    align: "right",
    ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.email ?? "—"),
  },
  {
    title: "שם",
    key: "name",
    align: "right",
    ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.name ?? "—"),
  },
  {
    title: "תפקיד",
    key: "role",
    align: "right",
    width: 100,
    render: (row) =>
      h(NTag, { type: roleTagType[row.role] ?? "default", size: "small", round: true }, { default: () => roleLabel[row.role] ?? row.role }),
  },
  {
    title: "סטטוס",
    key: "is_active",
    align: "right",
    width: 90,
    render: (row) =>
      h(NTag, { type: row.is_active === 0 ? "error" : "success", size: "small", round: true }, { default: () => row.is_active === 0 ? "מושבת" : "פעיל" }),
  },
  {
    title: "נרשם",
    key: "created_at",
    align: "right",
    width: 110,
    render: (row) => h("span", { style: "font-size:12px; color: var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("he-IL") : "—"),
  },
  {
    title: "פעולות",
    key: "actions",
    align: "center",
    width: 160,
    render: (row) =>
      h("div", { style: "display:flex; gap:6px; justify-content:center" }, [
        h(NButton, { size: "tiny", onClick: () => openRoleModal(row) }, { default: () => "שנה תפקיד" }),
        h(NButton, {
          size: "tiny",
          type: row.is_active === 0 ? "primary" : "error",
          ghost: true,
          onClick: () => toggleActive(row),
        }, { default: () => row.is_active === 0 ? "הפעל" : "השבת" }),
      ]),
  },
];

// ── Stats ──────────────────────────────────────────────────────────────────
const systemStats = computed(() => [
  { label: "סה\"כ משתמשים",  value: users.value.length,                               icon: PeopleOutline },
  { label: "מנהלים",         value: users.value.filter((u) => u.role === "admin").length, icon: PeopleOutline },
  { label: "משתמשי Pro",     value: users.value.filter((u) => u.role === "pro").length,   icon: PeopleOutline },
  { label: "מושבתים",        value: users.value.filter((u) => u.is_active === 0).length,  icon: PeopleOutline },
]);

onMounted(loadUsers);
</script>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  background: var(--bg-body);
  overflow: hidden;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.admin-sidebar {
  width: 220px;
  flex: 0 0 220px;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.admin-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-color);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.admin-sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 4px;
}

.admin-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  text-align: right;
  width: 100%;
  transition: background 0.15s, color 0.15s;
}

.admin-sidebar__item:hover {
  background: var(--bg-hover, rgba(99, 226, 183, 0.08));
  color: var(--text-primary);
}

.admin-sidebar__item--active {
  background: rgba(24, 160, 88, 0.12);
  color: var(--brand-color);
  font-weight: 600;
}

.admin-sidebar__footer {
  padding: 10px;
  border-top: 1px solid var(--border-color);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-main__header {
  padding: 24px 28px 16px;
  border-bottom: 1px solid var(--border-color);
  flex: 0 0 auto;
}

.admin-main__title {
  margin: 0 0 2px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.admin-main__meta {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Section ─────────────────────────────────────────────────────────────── */
.admin-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
}

.admin-section__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Stats grid ──────────────────────────────────────────────────────────── */
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.admin-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.admin-stat-card__icon {
  color: var(--brand-color);
  flex: 0 0 auto;
}

.admin-stat-card__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.admin-stat-card__label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}
</style>
