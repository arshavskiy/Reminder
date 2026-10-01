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
        // Vite does not empty dist/ for assets it no longer emits, so files
        // from earlier builds get swept into the precache manifest. Vercel
        // answers its own injected `_live-*` assets with a 307 to vercel.com,
        // which sends no CORS header — the precache fetch then throws and the
        // whole service worker install fails.
        globIgnores: ["**/_live-*", "**/_vercel/**"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
      includeAssets: [
        "favicon-v2.svg",
        "favicon-32-v2.png",
        "favicon-fullcolor.png",
        "apple-touch-icon-v2.png",
        "icon-192-v2.png",
        "icon-512-v2.png",
        "icon-maskable-512-v2.png",
        "remindocr-logo.png",
        "remindocr-logo-light.png",
        "remindocr-logo-dark.png",
      ],
      manifest: {
        name: "RemindOCR",
        short_name: "RemindOCR",
        description: "מערכת לניהול תסקירי בדיקה, מסמכים, לקוחות ותזכורות — עם Gmail, Google Calendar ו-Google Drive",
        theme_color: "#18a058",
        background_color: "#ffffff",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        dir: "rtl",
        lang: "he",
        // The app lives on its own subdomain now, so the installed app should
        // open straight into it. "/" renders the login page and only bounces a
        // signed-in user onward once fetchMe() resolves, which flashes the login
        // screen on every launch; the router guard sends anyone unauthenticated
        // to /login anyway. scope keeps in-app navigation inside the PWA window.
        start_url: "/dashboard",
        // Lets the installed app appear in the Android share sheet for PDFs and
        // photos. sw.ts receives the POST and hands the files to the dashboard.
        // iOS Safari does not support Web Share Target.
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            files: [{
              name: "files",
              accept: ["application/pdf", "image/png", "image/jpeg", "image/tiff"],
            }],
          },
        },
        scope: "/",
        id: "/",
        icons: [
          { src: "/icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
