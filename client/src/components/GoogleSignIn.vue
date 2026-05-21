<template>
  <div class="gsi-wrapper">
    <div ref="btn"></div>
    <!-- Shown while the GIS iframe hasn't rendered yet -->
    <button v-if="!rendered" class="gsi-fallback" @click="fallbackRedirect">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" height="20" />
      <span>התחבר עם Google</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useRouter } from 'vue-router';

const btn = ref<HTMLElement | null>(null);
const rendered = ref(false);
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

function fallbackRedirect() {
  window.location.href = '/auth/google';
}

const authStore = useAuthStore();
const router = useRouter();

const emit = defineEmits<{
  (e: 'error', msg: string): void;
}>();

async function handleCredentialResponse(response: { credential: string }) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential: response.credential }),
  });

  const data = await res.json() as { user?: { id: number; email: string; name: string | null; picture_url: string | null; role: 'admin' | 'user' }; error?: string };

  if (!res.ok || data.error) {
    emit('error', data.error ?? 'auth_failed');
    return;
  }

  if (data.user) {
    authStore.user = data.user;
    router.replace('/');
  }
}

onMounted(() => {
  if (!CLIENT_ID) {
    console.error('[GoogleSignIn] VITE_GOOGLE_CLIENT_ID is not set');
    return;
  }

  // Wait for GIS script to load
  const init = () => {
    (window as any).google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredentialResponse,
    });
    if (btn.value) {
      (window as any).google.accounts.id.renderButton(btn.value, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'he',
        width: 320,
      });
      rendered.value = true;
    }
  };

  if ((window as any).google?.accounts?.id) {
    init();
  } else {
    // GIS script still loading — poll until available (max 10s)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if ((window as any).google?.accounts?.id) {
        clearInterval(interval);
        init();
      } else if (attempts >= 100) {
        clearInterval(interval);
        console.error('[GoogleSignIn] GIS script failed to load after 10s');
      }
    }, 100);
  }
});
</script>

<style scoped>
.gsi-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.gsi-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  max-width: 320px;
  padding: 11px 20px;
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: #fff;
  color: #3c4043;
  font-family: 'Google Sans', Roboto, Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 2px rgba(60,64,67,.1);
}

.gsi-fallback:hover {
  box-shadow: 0 2px 6px rgba(60,64,67,.2);
  background: #f8f9fa;
}
</style>
