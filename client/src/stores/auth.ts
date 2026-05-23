import {defineStore} from "pinia";
import {ref} from "vue";

interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: "admin" | "pro" | "user";
}

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

  async function fetchMe() {
    loading.value = true;
    try {
      const res = await fetch(`${SERVER}/api/auth/me`, { credentials: "include" });
      const data = await res.json() as { user: AuthUser | null };
      user.value = data.user;
      saveCache(data.user);
    } catch {
      // Network error — keep cached user so app stays usable offline
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function logout() {
    try {
      await fetch(`${SERVER}/api/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      user.value = null;
      saveCache(null);
      window.location.href = "/#/login";
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

  return { user, loading, initialized, fetchMe, logout, loginWithGoogle, setUser };
});
