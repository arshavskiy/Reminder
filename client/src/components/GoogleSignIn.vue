<template>
  <div class="gsi-wrapper">
    <button class="gsi-button" type="button" @click="redirectToGoogle">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="20" height="20" />
      <span>{{ label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import {useLocaleStore} from "../stores/locale.js";

withDefaults(defineProps<{ label?: string }>(), {
  label: "התחבר עם Google",
});
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const localeStore = useLocaleStore();

function redirectToGoogle() {
  const locale = localeStore.locale === "en" ? "en" : "he";
  window.location.href = `${SERVER}/auth/google?locale=${encodeURIComponent(locale)}`;
}
</script>

<style scoped>
.gsi-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.gsi-button {
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

.gsi-button:hover {
  box-shadow: 0 2px 6px rgba(60,64,67,.2);
  background: #f8f9fa;
}
</style>
