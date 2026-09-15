<template>
  <div class="magic-panel">
    <div class="magic-panel__intro">
      <h2 class="magic-panel__title">Users &amp; magic links</h2>
      <p class="magic-panel__hint">
        Create or edit a user by email and/or username (username-only users sign in via magic link), then optionally issue a one-time link (15 minutes).
      </p>
    </div>

    <n-form class="magic-form" label-placement="top" :show-feedback="false" @submit.prevent="createLink">
      <div class="magic-form__grid">
        <n-form-item label="Email">
          <n-input
            v-model:value="form.email"
            type="email"
            placeholder="user@example.com (optional if username set)"
            :disabled="busy"
            clearable
          />
        </n-form-item>

        <n-form-item label="Username">
          <n-input
            v-model:value="form.username"
            placeholder="optional if email set"
            :disabled="busy"
            clearable
          />
        </n-form-item>

        <n-form-item label="Display name">
          <n-input
            v-model:value="form.name"
            placeholder="Full name"
            :disabled="busy"
            clearable
          />
        </n-form-item>

        <n-form-item label="Plan">
          <n-select
            v-model:value="form.plan"
            :options="planOptions"
            :disabled="busy"
          />
        </n-form-item>

        <n-form-item label="Role / type">
          <n-select
            v-model:value="form.role"
            :options="roleOptions"
            :disabled="busy"
          />
        </n-form-item>

        <n-form-item label="Company">
          <n-input
            v-model:value="form.company_name"
            placeholder="Optional"
            :disabled="busy"
            clearable
          />
        </n-form-item>

        <n-form-item label="Phone">
          <n-input
            v-model:value="form.phone"
            placeholder="Optional"
            :disabled="busy"
            clearable
          />
        </n-form-item>

        <n-form-item label="Picture URL">
          <n-input
            v-model:value="form.picture_url"
            placeholder="Optional"
            :disabled="busy"
            clearable
          />
        </n-form-item>
      </div>

      <div class="magic-form__flags">
        <n-checkbox v-model:checked="form.is_active" :disabled="busy">Active account</n-checkbox>
        <n-checkbox v-model:checked="form.email_verified" :disabled="busy">Email verified</n-checkbox>
      </div>

      <div class="magic-form__actions">
        <n-button secondary :loading="busy" :disabled="!canSubmit" @click="loadUser">
          Load by email / username
        </n-button>
        <n-button type="primary" secondary :loading="busy" :disabled="!canSubmit" @click="saveUser">
          {{ editingUserId ? "Save user" : "Create / upsert user" }}
        </n-button>
        <n-button type="primary" attr-type="submit" :loading="busy" :disabled="!canSubmit || !form.is_active">
          Create magic link
        </n-button>
        <n-button quaternary :disabled="busy" @click="resetForm">Reset</n-button>
      </div>

      <p v-if="editingUserId" class="magic-form__edit-hint">
        Editing user <code>{{ editingUserId }}</code>
      </p>
      <p v-if="loadedUserLoginInfo" class="magic-form__edit-hint">
        Last login: {{ formatLoginTimestamp(loadedUserLoginInfo.last_login_at) }}
        <template v-if="loadedUserLoginInfo.created_at"> · Created: {{ formatLoginTimestamp(loadedUserLoginInfo.created_at) }}</template>
      </p>
    </n-form>

    <div v-if="result" class="magic-result">
      <div class="magic-result__head">
        <n-tag :type="result.isNewUser ? 'success' : 'info'" size="small" round>
          {{ result.isNewUser ? "New user" : "Existing user updated" }}
        </n-tag>
        <span class="magic-result__meta">
          {{ identityLabel(result.user) }} · {{ result.user?.plan }} · {{ result.user?.role }}
          <template v-if="result.expiresInMinutes"> · expires in {{ result.expiresInMinutes }} min</template>
          · last login: {{ formatLoginTimestamp(result.user?.last_login_at ?? null) }}
        </span>
      </div>

      <n-input
        v-if="result.magicLink"
        :value="result.magicLink"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 4 }"
        readonly
        class="magic-result__link"
      />

      <div v-if="result.magicLink" class="magic-result__actions">
        <n-button size="small" type="primary" secondary @click="copyLink">
          <template #icon><n-icon :component="CopyOutline" :size="14" /></template>
          Copy link
        </n-button>
      </div>
    </div>

    <div class="magic-panel__users">
      <div class="magic-panel__users-head">
        <h3 class="magic-panel__users-title">All users — last login</h3>
        <n-button size="small" secondary :loading="loadingUsers" @click="loadAllUsers">Refresh</n-button>
      </div>
      <n-data-table
        :columns="userListColumns"
        :data="allUsers"
        :loading="loadingUsers"
        :pagination="{ pageSize: 25 }"
        :row-key="(u: any) => u.id"
        :row-props="userRowProps"
        size="small"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from "vue";
import {
  NButton,
  NCheckbox,
  NDataTable,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NSelect,
  NTag,
  useMessage,
} from "naive-ui";
import { CopyOutline } from "@vicons/ionicons5";
import { api } from "../services/apiService.js";

const emit = defineEmits<{
  created: [user: any];
}>();

const message = useMessage();

// No "Free"/"Expired" option: expired is what a lapsed trial resolves to, not a
// plan to put an account into.
const planOptions = [
  { label: "Trial", value: "trial" },
  { label: "Digital", value: "digital" },
  { label: "Basic", value: "basic" },
  { label: "Business", value: "business" },
];

const roleOptions = [
  { label: "User", value: "user" },
  { label: "Pro", value: "pro" },
  { label: "Admin", value: "admin" },
];

function emptyForm() {
  return {
    email: "",
    username: "",
    name: "",
    plan: "trial" as "trial" | "digital" | "basic" | "business",
    role: "user" as "user" | "pro" | "admin",
    company_name: "",
    phone: "",
    picture_url: "",
    is_active: true,
    email_verified: true,
  };
}

const form = reactive(emptyForm());
const editingUserId = ref<string | null>(null);
const loadedUserLoginInfo = ref<{ last_login_at: string | null; created_at: string | null } | null>(null);
const allUsers = ref<any[]>([]);
const loadingUsers = ref(false);
const busy = ref(false);
const result = ref<{
  isNewUser: boolean;
  expiresInMinutes: number | null;
  magicLink: string | null;
  user: any;
} | null>(null);

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function normalizedEmail() {
  return form.email.trim().toLowerCase();
}

function normalizedUsername() {
  return form.username.trim().toLowerCase();
}

function emailOk(email: string) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function usernameOk(username: string) {
  return Boolean(username && USERNAME_RE.test(username) && !username.includes("@"));
}

const canSubmit = computed(() => {
  const email = normalizedEmail();
  const username = normalizedUsername();
  if (email && !emailOk(email)) return false;
  if (username && !usernameOk(username)) return false;
  return emailOk(email) || usernameOk(username);
});

function identityLabel(user: any) {
  return user?.email || user?.username || user?.id || "—";
}

function formatLoginTimestamp(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "never";
}

// "Online" is a heuristic, not a fact — there is no logout timestamp or live
// session tracking, only last_login_at. A user counts as recently active if
// they signed in within this window; nothing here proves they're still there.
const RECENTLY_ACTIVE_MS = 15 * 60 * 1000;

function minutesSinceLogin(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return (Date.now() - time) / 60000;
}

function isRecentlyActive(value: string | null): boolean {
  const minutes = minutesSinceLogin(value);
  return minutes !== null && minutes * 60000 <= RECENTLY_ACTIVE_MS;
}

function formatRelativeActivity(value: string | null): string {
  const minutes = minutesSinceLogin(value);
  if (minutes === null) return "never logged in";
  if (minutes < 1) return "active now";
  if (minutes < 60) return `active ${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `active ${Math.round(hours)}h ago`;
  const days = hours / 24;
  return `active ${Math.round(days)}d ago`;
}

function userRowProps(row: any) {
  return isRecentlyActive(row.last_login_at ?? null)
    ? { class: "admin-user-row--online" }
    : {};
}

async function loadAllUsers() {
  loadingUsers.value = true;
  try {
    allUsers.value = await api.admin.listUsers();
  } catch (err: any) {
    message.error(err?.message ?? "Failed to load users");
  } finally {
    loadingUsers.value = false;
  }
}

function loadUserFromList(user: any) {
  applyUser(user);
  message.info(`Loaded ${identityLabel(user)} into the form above`);
}

function nullableTimeSort(a: string | null | undefined, b: string | null | undefined): number {
  const at = a ? new Date(a).getTime() : -Infinity;
  const bt = b ? new Date(b).getTime() : -Infinity;
  return at - bt;
}

const userListColumns = [
  {
    title: "User",
    key: "identity",
    sorter: (a: any, b: any) => identityLabel(a).localeCompare(identityLabel(b)),
    render: (row: any) => identityLabel(row),
  },
  {
    title: "Plan",
    key: "plan",
    sorter: (a: any, b: any) => String(a.plan ?? "").localeCompare(String(b.plan ?? "")),
    filterOptions: planOptions.map((o) => ({ label: o.label, value: o.value })),
    filter: (value: string | number, row: any) => row.plan === value,
  },
  { title: "Role", key: "role", sorter: (a: any, b: any) => String(a.role ?? "").localeCompare(String(b.role ?? "")) },
  {
    title: "Last login",
    key: "last_login_at",
    sorter: (a: any, b: any) => nullableTimeSort(a.last_login_at, b.last_login_at),
    defaultSortOrder: "descend" as const,
    render: (row: any) => {
      const value = row.last_login_at ?? null;
      return h("span", null, [
        formatLoginTimestamp(value),
        h("span", { style: "color: var(--text-secondary); margin-inline-start: 6px" }, `(${formatRelativeActivity(value)})`),
      ]);
    },
  },
  {
    title: "Created",
    key: "created_at",
    sorter: (a: any, b: any) => nullableTimeSort(a.created_at, b.created_at),
    render: (row: any) => formatLoginTimestamp(row.created_at ?? null),
  },
  {
    title: "",
    key: "actions",
    render: (row: any) =>
      h(NButton, { size: "small", secondary: true, onClick: () => loadUserFromList(row) }, { default: () => "Load" }),
  },
];

onMounted(loadAllUsers);

function payload() {
  return {
    email: normalizedEmail() || null,
    username: normalizedUsername() || null,
    name: form.name.trim() || null,
    plan: form.plan,
    role: form.role,
    company_name: form.company_name.trim() || null,
    phone: form.phone.trim() || null,
    picture_url: form.picture_url.trim() || null,
    is_active: form.is_active,
    email_verified: form.email_verified,
  };
}

function applyUser(user: any) {
  editingUserId.value = user?.id ?? null;
  loadedUserLoginInfo.value = user
    ? { last_login_at: user.last_login_at ?? null, created_at: user.created_at ?? null }
    : null;
  form.email = user?.email ?? "";
  form.username = user?.username ?? "";
  form.name = user?.name ?? "";
  form.plan = (user?.plan ?? "trial") as typeof form.plan;
  form.role = (user?.role ?? "user") as typeof form.role;
  form.company_name = user?.company_name ?? "";
  form.phone = user?.phone ?? "";
  form.picture_url = user?.picture_url ?? "";
  form.is_active = user?.is_active !== 0;
  form.email_verified = user?.email_verified !== 0 && user?.email_verified !== false;
}

function resetForm() {
  Object.assign(form, emptyForm());
  editingUserId.value = null;
  loadedUserLoginInfo.value = null;
  result.value = null;
}

async function loadUser() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  try {
    const users = await api.admin.listUsers();
    const email = normalizedEmail();
    const username = normalizedUsername();
    const found = users.find((u: any) => {
      const uEmail = String(u.email ?? "").toLowerCase();
      const uUsername = String(u.username ?? "").toLowerCase();
      return (email && uEmail === email) || (username && uUsername === username);
    });
    if (!found) {
      editingUserId.value = null;
      message.info("No existing user with that email/username — fill fields and create");
      return;
    }
    applyUser(found);
    message.success("User loaded");
  } catch (err: any) {
    message.error(err?.message ?? "Failed to load user");
  } finally {
    busy.value = false;
  }
}

async function saveUser() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  result.value = null;
  try {
    if (editingUserId.value) {
      const updated = await api.admin.updateUser(editingUserId.value, payload());
      applyUser(updated);
      emit("created", updated);
      message.success("User saved");
    } else {
      const res = await api.admin.createMagicLink({ ...payload(), issue_link: false });
      applyUser(res.user);
      result.value = {
        isNewUser: res.isNewUser,
        expiresInMinutes: null,
        magicLink: null,
        user: res.user,
      };
      emit("created", res.user);
      message.success(res.isNewUser ? "User created" : "User updated");
    }
    loadAllUsers();
  } catch (err: any) {
    message.error(err?.message ?? "Failed to save user");
  } finally {
    busy.value = false;
  }
}

async function createLink() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  result.value = null;
  try {
    const res = await api.admin.createMagicLink({ ...payload(), issue_link: true });
    applyUser(res.user);
    result.value = {
      isNewUser: res.isNewUser,
      expiresInMinutes: res.expiresInMinutes,
      magicLink: res.magicLink,
      user: res.user,
    };
    emit("created", res.user);
    message.success(res.isNewUser ? "User created and magic link ready" : "User updated and magic link ready");
    loadAllUsers();
  } catch (err: any) {
    message.error(err?.message ?? "Failed to create magic link");
  } finally {
    busy.value = false;
  }
}

async function copyLink() {
  if (!result.value?.magicLink) return;
  try {
    await navigator.clipboard.writeText(result.value.magicLink);
    message.success("Link copied");
  } catch {
    message.error("Could not copy link");
  }
}
</script>

<style scoped>
.magic-panel {
  max-width: 1100px;
}

.magic-panel__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.magic-panel__hint {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.magic-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.magic-form__flags {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 8px 0 18px;
}

.magic-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.magic-form__edit-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.magic-result {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: var(--bg-card, rgba(255, 255, 255, 0.03));
}

.magic-result__head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.magic-result__meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.magic-result__link {
  margin-bottom: 12px;
}

.magic-result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.magic-panel__users {
  margin-top: 28px;
}

.magic-panel__users-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.magic-panel__users-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.magic-panel__users :deep(.admin-user-row--online td) {
  background: color-mix(in srgb, #18a058 12%, transparent);
}

@media (max-width: 700px) {
  .magic-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
