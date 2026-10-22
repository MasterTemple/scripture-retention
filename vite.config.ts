import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { Logoxide } from "logoxide";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * What the text logoxide reads from a file depends on (its parsed-book format and version),
 * which saved books record having been read by
 */
export const logoxideTextVersion = (): string => Logoxide.new().textVersion();

export default defineConfig({
  // Relative URLs, so the build works under any path (GitHub Pages serves it at /scripture-retention/)
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // Installable, and working offline: the app is cached by a service worker, and the books
    // it downloads are kept in IndexedDB already
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // Our own service worker (src/sw.ts), which also shows reminders
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Scripture Retention",
        short_name: "Retention",
        description: "Keep the Scripture you've memorized: each verse daily for 7 weeks, weekly for 7 months, then monthly for 7 years.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f7f5f1",
        theme_color: "#f7f5f1",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Review today's verses", url: "./" },
          { name: "Your verses", url: "./?view=verses" },
        ],
      },
      injectManifest: {
        // Every font subset and both WebAssembly modules (logoxide's is over 5 MB)
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  define: { __LOGOXIDE_TEXT_VERSION__: JSON.stringify(logoxideTextVersion()) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Both packages fetch their .wasm next to themselves (`new URL(…, import.meta.url)`),
  // which pre-bundling would break
  optimizeDeps: { exclude: ["logoxide", "topos-bible"] },
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 800 },
  server: { host: true },
});
