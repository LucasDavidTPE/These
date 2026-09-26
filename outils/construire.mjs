/**
 * Construit l'installeur d'un produit (SPEC §3.1) : `node outils/construire.mjs figurine`.
 * Pose THESE_PRODUIT pour Vite et passe la surcharge Tauri du produit. Fonctionne de la
 * même façon sous Windows et sous Linux (pas de syntaxe de variable propre au shell).
 * Les arguments suivants sont transmis à `tauri build` (par exemple `--debug`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [produit = "these", ...reste] = process.argv.slice(2);
const surcharge = `src-tauri/produits/${produit}.json`;
const args = ["tauri", "build", ...(produit !== "these" ? ["--config", surcharge] : []), ...reste];
if (produit !== "these" && !existsSync(surcharge)) {
  console.error(`Produit inconnu : « ${produit} » (pas de ${surcharge}).`);
  process.exit(1);
}
console.log(`> THESE_PRODUIT=${produit} npx ${args.join(" ")}`);
const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, THESE_PRODUIT: produit } });
process.exit(r.status ?? 1);
