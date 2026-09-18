import {defineStore} from "pinia";
import {computed, ref} from "vue";
import {api} from "../services/apiService.js";
import type {User} from "../shared/types.js";
import {loginPath} from "../stores/locale.js";

// /api/auth/me returns the whole user document (minus credentials), engineer
// and company fields included — so this is the one source for all of it.
type AuthUser = User;

const STORAGE_KEY = "auth_user";
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

function loadCached(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveCache(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const useAuthStore = defineStore("auth", () => {
  // Restore from cache immediately — avoids redirect-to-login on refresh
  const user = ref<AuthUser | null>(loadCached());
  const loading = ref(false);
  const initialized = ref(false);
  // Admin "view as" target. Server-side state (stored on the session), so this
  // is only a mirror for the UI — never the source of truth.
  const actingAs = ref<AuthUser | null>(null);

  const isAdmin = computed(() => user.value?.role === "admin");
  const saving = ref(false);
  const inspectorNumber = computed(() => user.value?.inspector_number?.trim() ?? "");

  /** Writes a partial profile update; only the keys passed are changed. */
  async function save(updates: Partial<User>): Promise<User | null> {
    saving.value = true;
    try {
      const row = await api.profile.saveUser(updates);
      if (row) setUser({...(user.value ?? {}), ...row} as User);
      return user.value;
    } finally {
      saving.value = false;
    }
  }

  /** Local-only merge, for a field the server already persisted (e.g. a logo upload). */
  function patch(partial: Partial<User>) {
    if (user.value) setUser({...user.value, ...partial});
  }

  async function fetchMe() {
    loading.value = true;
    try {
      const res = await fetch(`${SERVER}/api/auth/me`, { credentials: "include" });
      const data = await res.json() as { user: AuthUser | null; actingAs?: AuthUser | null };
      user.value = data.user;
      actingAs.value = data.actingAs ?? null;
      saveCache(data.user);
    } catch {
      // Network error — keep cached user so app stays usable offline
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  /**
   * Switch which user's data the whole app shows (admin only). Reloads the page
   * so every store refetches under the new identity instead of showing a mix of
   * the previous user's cached data.
   */
  async function setActingAs(userId: string | null) {
    const res = await fetch(`${SERVER}/api/auth/act-as`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? `Failed to switch user (${res.status})`);
    }
    window.location.reload();
  }

  async function logout() {
    try {
      await fetch(`${SERVER}/api/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      user.value = null;
      saveCache(null);
      window.location.href = loginPath();
    }
  }

  function loginWithGoogle() {
    window.location.href = `${SERVER}/auth/google`;
  }

  function setUser(u: AuthUser) {
    user.value = u;
    saveCache(u);
    initialized.value = true;
  }

  return { user, actingAs, isAdmin, loading, saving, initialized, inspectorNumber, fetchMe, save, patch, logout, loginWithGoogle, setUser, setActingAs };
});
