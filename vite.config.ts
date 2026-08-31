import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Stamped into the bundle at build time and shown at the foot of Info — the answer to
 * "which version is your phone on?", and the thing to stare at when checking that the
 * auto-update actually updates.
 */
const build = (() => {
  let commit = "dev";
  try {
    commit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    /* not a git checkout, e.g. some CI tarball */
  }
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `${commit} · ${stamp} UTC`;
})();

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
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
    // Node by default; the handicap parser needs a DOM and opts in per file.
    environment: "node",
  },
});
