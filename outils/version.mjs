/**
 * Change la version de l'application partout où elle est écrite (package.json,
 * src-tauri/Cargo.toml, src-tauri/tauri.conf.json) : `npm run version -- 0.2.0`.
 * Ensuite : commit, tag `v0.2.0`, push du tag → la CI publie la mise à jour.
 */
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) {
  console.error("Usage : npm run version -- 0.2.0");
  process.exit(1);
}
const maj = (chemin, f) => writeFileSync(chemin, f(readFileSync(chemin, "utf8")));
maj("package.json", (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
maj("src-tauri/tauri.conf.json", (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
maj("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${v}"`));
console.log(`Version ${v} écrite. Puis : git commit -am "Version ${v}" && git tag v${v} && git push --follow-tags`);
