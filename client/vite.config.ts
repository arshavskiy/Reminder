import {defineConfig} from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import {resolve} from "path";
import {VitePWA} from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: ".",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
      includeAssets: ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"],
      manifest: {
        name: "RemindOCR",
        short_name: "RemindOCR",
        description: "מערכת לניהול התראות תסקירים",
        theme_color: "#18181b",
        background_color: "#18181b",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        dir: "rtl",
        lang: "he",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
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
    port: 4173,
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
  preview: {
    port: 4173,
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
