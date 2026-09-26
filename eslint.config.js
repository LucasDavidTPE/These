import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import frontieres from "./outils/eslint-frontieres.js";

export default tseslint.config(
  // modules/*/statique : pages reprises telles quelles (JavaScript sans empaquetage), avec
  // leurs propres tests (node --test).
  { ignores: ["dist", "node_modules", "src-tauri/target", "src-tauri/gen", "modules/*/statique/**", "modules/*/tests/**/*.js"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022 },
    plugins: { these: frontieres },
    rules: { "these/frontieres": "error" },
  },
  {
    files: ["app/**/*.{ts,tsx}", "modules/**/*.{ts,tsx}", "packages/interface/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // Les manifestes exportent un objet qui contient des composants : c'est voulu.
    files: ["modules/*/manifeste.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Le noyau est du TypeScript pur, sans DOM ni Tauri ni React : 100 % testable sous Linux.
    files: ["packages/noyau/**/*.ts", "modules/*/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "react-dom/*"], message: "Le noyau ne dépend pas de React." },
            { group: ["@tauri-apps/*"], message: "Le noyau ne dépend pas de Tauri." },
            { group: ["zustand", "zustand/*"], message: "Le noyau ne dépend pas du store d'interface." },
            { group: ["node:*"], message: "Le noyau ne dépend pas de Node (sauf dans les tests)." },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Pas de DOM dans le noyau." },
        { name: "document", message: "Pas de DOM dans le noyau." },
        { name: "navigator", message: "Pas de DOM dans le noyau." },
        { name: "localStorage", message: "Pas de DOM dans le noyau." },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["*.config.{js,ts}", "eslint.config.js", "outils/**/*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
