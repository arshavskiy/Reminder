import { createApp } from "vue";
import { createPinia } from "pinia";
import { router } from "./router";
import App from "./App.vue";
import "vfonts/Lato.css";
import "./styles/global.css";
import { useAuthStore } from "./stores/auth.js";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

const authStore = useAuthStore();

if (authStore.user) {
  // Cached user exists — mount immediately, validate session in background
  authStore.initialized = true;
  app.mount("#app");
  authStore.fetchMe().then(() => {
    // If server says session is invalid, redirect to login
    if (!authStore.user) {
      window.location.href = "/login";
    }
  });
} else {
  // No cache — must wait for server response before mounting
  authStore.fetchMe().finally(() => {
    app.mount("#app");
  });
}
