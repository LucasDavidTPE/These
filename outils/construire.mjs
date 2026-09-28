/**
 * Construit l'installeur d'un produit (SPEC §3.1) : `node outils/construire.mjs figurine`.
 * Pose THESE_PRODUIT pour Vite et passe la surcharge Tauri du produit. Fonctionne de la
 * même façon sous Windows et sous Linux (pas de syntaxe de variable propre au shell).
 * Les arguments suivants sont transmis à `tauri build` (par exemple `--debug`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Arguments Cargo propres à un produit : le code natif des modules absents n'est pas
 * compilé (le produit Traitement n'a ni détourage ni ONNX Runtime).
 */
const CARGO = { traitement: ["--no-default-features"] };

const [produit = "these", ...reste] = process.argv.slice(2);
const surcharge = `src-tauri/produits/${produit}.json`;
const cargo = CARGO[produit] ?? [];
const tiret = reste.indexOf("--");
const avant = tiret < 0 ? reste : reste.slice(0, tiret);
const apres = tiret < 0 ? [] : reste.slice(tiret + 1);
const args = ["tauri", "build", ...(produit !== "these" ? ["--config", surcharge] : []), ...avant, ...(cargo.length || apres.length ? ["--", ...cargo, ...apres] : [])];
if (produit !== "these" && !existsSync(surcharge)) {
  console.error(`Produit inconnu : « ${produit} » (pas de ${surcharge}).`);
  process.exit(1);
}
console.log(`> THESE_PRODUIT=${produit} npx ${args.join(" ")}`);
const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, THESE_PRODUIT: produit } });
process.exit(r.status ?? 1);
