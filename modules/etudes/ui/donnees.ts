/** Lecture des études de l'espace : fiche, arborescence, exécutions tracées, sorties. */
import { joindre, jsonStable, type Fichiers, type Probleme } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import { depuisStudyToml, DOSSIER, lireEtude, lireExecution, type Etude, type Execution } from "../core/modele";
import { OUTIL, script } from "../core/python";

export interface Noeud {
  nom: string;
  chemin: string;
  dossier: boolean;
  enfants: Noeud[];
}

export interface EtudeChargee {
  dossier: string;
  /** « json » : créée par l'application ; « lgcb » : reprise de these-lgcb (study.toml). */
  format: "json" | "lgcb";
  etude: Etude;
  arbre: Noeud[];
  executions: Execution[];
  /** Sorties à plat (outputs/ de these-lgcb), avec leur provenance si elle existe. */
  sortiesLgcb: { nom: string; provenance: boolean }[];
}

/** Dossiers jamais montrés dans l'arborescence : sorties (listées à part), caches. */
const IGNORES = new Set(["sorties", "outputs", "__pycache__", ".venv", ".git", ".ipynb_checkpoints"]);

async function arbre(fs: Fichiers, chemin: string, profondeur = 0): Promise<Noeud[]> {
  if (profondeur > 4) return [];
  const out: Noeud[] = [];
  for (const e of await fs.listDir(chemin)) {
    if (e.name.startsWith(".") || IGNORES.has(e.name)) continue;
    const c = joindre(chemin, e.name);
    out.push({ nom: e.name, chemin: c, dossier: e.kind === "dir", enfants: e.kind === "dir" ? await arbre(fs, c, profondeur + 1) : [] });
  }
  return out.sort((a, b) => Number(b.dossier) - Number(a.dossier) || a.nom.localeCompare(b.nom));
}

export async function chargerEtudes(fs: Fichiers): Promise<{ etudes: EtudeChargee[]; problemes: Probleme[] }> {
  const problemes: Probleme[] = [];
  const etudes: EtudeChargee[] = [];
  if (!(await fs.exists(DOSSIER))) return { etudes, problemes };
  for (const d of (await fs.listDir(DOSSIER)).filter((e) => e.kind === "dir" && !e.name.startsWith("."))) {
    const base = joindre(DOSSIER, d.name);
    const noms = (await fs.listDir(base)).map((e) => e.name);
    let etude: Etude;
    let format: EtudeChargee["format"];
    try {
      if (noms.includes("etude.json")) {
        etude = lireEtude(JSON.parse(await fs.readText(joindre(base, "etude.json"))));
        format = "json";
      } else if (noms.includes("study.toml")) {
        etude = depuisStudyToml(await fs.readText(joindre(base, "study.toml")));
        format = "lgcb";
      } else continue;
    } catch (e) {
      problemes.push({ type: "illisible", chemin: base, detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const executions: Execution[] = [];
    if (noms.includes("sorties")) {
      for (const s of (await fs.listDir(joindre(base, "sorties"))).filter((e) => e.kind === "dir")) {
        const f = joindre(base, "sorties", s.name, "execution.json");
        if (await fs.exists(f)) {
          try {
            executions.push(lireExecution(s.name, JSON.parse(await fs.readText(f))));
          } catch {
            problemes.push({ type: "illisible", chemin: f, detail: "Trace d'exécution illisible (exécution interrompue ?)." });
          }
        }
      }
    }
    executions.sort((a, b) => (a.dossier < b.dossier ? 1 : -1));
    const sortiesLgcb = noms.includes("outputs")
      ? (await fs.listDir(joindre(base, "outputs")))
          .filter((e) => e.kind === "file" && !e.name.endsWith(".prov.json") && !e.name.startsWith("."))
          .map((e) => ({ nom: e.name, provenance: false }))
      : [];
    if (noms.includes("outputs")) {
      const tout = new Set((await fs.listDir(joindre(base, "outputs"))).map((e) => e.name));
      for (const s of sortiesLgcb) s.provenance = tout.has(`${s.nom}.prov.json`);
    }
    etudes.push({ dossier: d.name, format, etude, arbre: await arbre(fs, base), executions, sortiesLgcb });
  }
  etudes.sort((a, b) => (a.dossier < b.dossier ? 1 : -1));
  return { etudes, problemes };
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Nouvelle étude : dossier daté, fiche, script modèle et outil de traçabilité. */
export async function creerEtude(fs: Fichiers, titre: string, question: string, campagnes: string[]): Promise<string> {
  await fs.ensureDir(DOSSIER);
  const base = `${aujourdhui()}_${slugifier(titre) || "etude"}`;
  for (let i = 1; i < 50; i++) {
    const nom = i === 1 ? base : `${base}-${i}`;
    try {
      await fs.createDir(joindre(DOSSIER, nom));
    } catch {
      continue;
    }
    const etude: Etude = { titre, question, conclusion: "", statut: "en cours", date: aujourdhui(), campagnes, tags: [], entrees: {} };
    await fs.writeTextNew(joindre(DOSSIER, nom, "etude.json"), jsonStable(etude));
    await fs.writeTextNew(joindre(DOSSIER, nom, "run.py"), script(titre, question));
    await fs.writeTextAtomic(joindre(DOSSIER, nom, "these_etude.py"), OUTIL);
    return nom;
  }
  throw new Error("Impossible de créer le dossier de l'étude.");
}

export const enregistrerEtude = (fs: Fichiers, dossier: string, e: Etude) => fs.writeTextAtomic(joindre(DOSSIER, dossier, "etude.json"), jsonStable(e));

/** Remet l'outil à jour (et le pose dans une étude these-lgcb qui voudrait s'en servir). */
export const poserOutil = (fs: Fichiers, dossier: string) => fs.writeTextAtomic(joindre(DOSSIER, dossier, "these_etude.py"), OUTIL);
