/**
 * Publie la version construite comme mise à jour (docs/MISES_A_JOUR.md) : release
 * `v<version>` dans le dépôt public LucasDavidTPE/These-versions, avec l'installeur NSIS,
 * sa signature et `latest.json` (lu par l'application au démarrage).
 *
 * Suppose `npm run construire -- these --config src-tauri/publication.json` déjà fait, avec
 * TAURI_SIGNING_PRIVATE_KEY. Utilise `gh` (GH_TOKEN = jeton du dépôt These-versions).
 * `--essai` : prépare les fichiers sans rien publier.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEPOT = "LucasDavidTPE/These-versions";
const essai = process.argv.includes("--essai");
const version = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const nsis = "src-tauri/target/release/bundle/nsis";

/** Contenu de latest.json (format de tauri-plugin-updater v2). */
export function latestJson({ version, notes, date, signature, url }) {
  return { version, notes, pub_date: date, platforms: { "windows-x86_64": { signature, url } } };
}

const exe = readdirSync(nsis).find((f) => f.endsWith(`_${version}_x64-setup.exe`));
if (!exe) throw new Error(`Installeur ${version} introuvable dans ${nsis}.`);
const signature = readFileSync(join(nsis, `${exe}.sig`), "utf8").trim();

// Nom ASCII : GitHub altère les accents dans les noms de fichiers publiés.
const nom = `These_${version}_x64-setup.exe`;
const sortie = "publication";
mkdirSync(sortie, { recursive: true });
copyFileSync(join(nsis, exe), join(sortie, nom));
writeFileSync(join(sortie, `${nom}.sig`), signature);
const notes = (process.env.NOTES ?? "").split("\n")[0] || `Thèse ${version}`;
const latest = latestJson({ version, notes, date: new Date().toISOString(), signature, url: `https://github.com/${DEPOT}/releases/download/v${version}/${nom}` });
writeFileSync(join(sortie, "latest.json"), JSON.stringify(latest, null, 2));
console.log(JSON.stringify(latest, null, 2));

if (!essai) {
  execFileSync(
    "gh",
    ["release", "create", `v${version}`, "--repo", DEPOT, "--target", "main", "--title", `Thèse ${version}`, "--notes", notes, join(sortie, nom), join(sortie, `${nom}.sig`), join(sortie, "latest.json")],
    { stdio: "inherit" },
  );
  console.log(`Publié : https://github.com/${DEPOT}/releases/tag/v${version}`);
}
