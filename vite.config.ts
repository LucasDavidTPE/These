/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { produitVite } from "./outils/produit-vite.ts";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const dossier = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// Configuration recommandée par Tauri 2 : port fixe, pas d'ouverture de navigateur.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), produitVite()],
  resolve: {
    alias: {
      "@noyau": dossier("./packages/noyau/src"),
      "@interface": dossier("./packages/interface/src"),
    },
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView2 (Chromium récent) sous Windows.
    target: "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ["packages/**/*.test.ts", "modules/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
