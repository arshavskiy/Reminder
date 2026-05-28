import {defineConfig} from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import {resolve} from "path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: "src",
  envDir: "../",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "src/shared"),
      "@client": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3737",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://127.0.0.1:3737",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3737",
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
