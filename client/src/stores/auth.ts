import { defineStore } from "pinia";
import { ref } from "vue";
import type { User } from "../../src/shared/types.js";

interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: "admin" | "user";
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const initialized = ref(false);

  async function fetchMe() {
    loading.value = true;
    try {
      const res = await fetch("/auth/me", { credentials: "include" });
      const data = await res.json() as { user: AuthUser | null };
      user.value = data.user;
    } catch {
      user.value = null;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function logout() {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      user.value = null;
      window.location.href = "/#/login";
    }
  }

  function loginWithGoogle() {
    window.location.href = "/auth/google";
  }

  return { user, loading, initialized, fetchMe, logout, loginWithGoogle };
});
