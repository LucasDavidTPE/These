/**
 * Un dossier de comparaison (comme celui du script) : `COMSOL/*.csv` et
 * `VISCOROUTE/Vitesse_<v>/<grandeur>.json`. La racine « viscocompare » du poste en contient un, ou
 * plusieurs dans ses sous-dossiers directs. Ce qui ne se lit pas est listé, pas ignoré en
 * silence (le script taisait ces erreurs).
 */
import type { Fichiers } from "@noyau/stockage";
import { assembler, type Cas, type ProfilViscoroute } from "./comparaison";
import { convertirViscoroute, grandeurDuFichier, lireCsvComsol, lireJsonViscoroute, profilEnX0, vitesseComsol, vitesseViscoroute, CONVENTIONS_SCRIPT, type Conventions, type Grandeur, type Tableau } from "./lecture";

type Lecture = Pick<Fichiers, "listDir" | "readText">;

const joindre = (...p: string[]) => p.filter(Boolean).join("/");

async function sousDossier(fs: Lecture, dossier: string, nom: string): Promise<string | null> {
  const e = (await fs.listDir(dossier)).find((x) => x.kind === "dir" && x.name.toUpperCase() === nom);
  return e ? joindre(dossier, e.name) : null;
}

/** Études trouvées : la racine elle-même (« ») et/ou ses sous-dossiers directs. */
export async function trouverEtudes(fs: Lecture): Promise<string[]> {
  const estEtude = async (d: string) => (await sousDossier(fs, d, "COMSOL")) !== null && (await sousDossier(fs, d, "VISCOROUTE")) !== null;
  const out: string[] = [];
  if (await estEtude("")) out.push("");
  for (const e of await fs.listDir("")) {
    if (e.kind !== "dir" || e.name.startsWith(".") || ["COMSOL", "VISCOROUTE", "EXCEL_OUTPUT"].includes(e.name.toUpperCase())) continue;
    if (await estEtude(e.name).catch(() => false)) out.push(e.name);
  }
  return out;
}

export interface Etude {
  cas: Cas[];
  vitessesComsol: number[];
  vitessesViscoroute: number[];
  /** Fichiers ou dossiers écartés, avec la raison. */
  ecartes: { chemin: string; raison: string }[];
}

const tri = (s: Iterable<number>) => [...s].sort((a, b) => a - b);

export async function chargerEtude(fs: Lecture, etude: string, c: Conventions = CONVENTIONS_SCRIPT): Promise<Etude> {
  const ecartes: Etude["ecartes"] = [];
  const dComsol = await sousDossier(fs, etude, "COMSOL");
  const dVisco = await sousDossier(fs, etude, "VISCOROUTE");
  if (!dComsol || !dVisco) throw new Error(`Dossiers COMSOL et VISCOROUTE attendus dans « ${etude || "."} ».`);

  const comsol = new Map<number, Tableau>();
  for (const f of (await fs.listDir(dComsol)).filter((e) => e.kind === "file" && /\.csv$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = joindre(dComsol, f.name);
    const v = vitesseComsol(f.name);
    if (v === null) {
      ecartes.push({ chemin, raison: "vitesse non trouvée dans le nom (« V=… » attendu)" });
      continue;
    }
    try {
      comsol.set(v, lireCsvComsol(await fs.readText(chemin), c));
    } catch (e) {
      ecartes.push({ chemin, raison: e instanceof Error ? e.message : String(e) });
    }
  }

  const visco = new Map<number, Map<Grandeur, ProfilViscoroute>>();
  for (const d of (await fs.listDir(dVisco)).filter((e) => e.kind === "dir").sort((a, b) => a.name.localeCompare(b.name))) {
    const dossier = joindre(dVisco, d.name);
    const v = vitesseViscoroute(d.name);
    if (v === null) {
      ecartes.push({ chemin: dossier, raison: "vitesse non trouvée dans le nom (« Vitesse_… » attendu)" });
      continue;
    }
    const jsons = (await fs.listDir(dossier)).filter((e) => e.kind === "file" && /\.json$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!jsons.length) ecartes.push({ chemin: dossier, raison: "aucun fichier .json" });
    for (const f of jsons) {
      const g = grandeurDuFichier(f.name);
      if (!g) continue;
      const chemin = joindre(dossier, f.name);
      try {
        const p = profilEnX0(lireJsonViscoroute(await fs.readText(chemin)));
        if (!visco.has(v)) visco.set(v, new Map());
        visco.get(v)!.set(g, { y: p.y, v: convertirViscoroute(g, p.v, c) });
      } catch (e) {
        ecartes.push({ chemin, raison: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return { cas: assembler(comsol, visco), vitessesComsol: tri(comsol.keys()), vitessesViscoroute: tri(visco.keys()), ecartes };
}
