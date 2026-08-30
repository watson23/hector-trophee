import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "Hector Trophée 2026",
        short_name: "Hector",
        description: "Live scoring for Hector Trophée 2026, Konopiště",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#020617",
        theme_color: "#020617",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
  },
});
