/**
 * L'espace Thèse (SPEC §4.1) : le dossier OneDrive partagé entre les deux PC, où vit tout
 * ce qui est saisi dans l'application. Il est reconnu à son fichier `espace.json`.
 */
import { estDateIso } from "../dates";
import { detecterCopieConflit, estTemporaireOrphelin } from "../stockage/conflits";
import { jsonStable, type Fichiers } from "../stockage/fichiers";
import type { Probleme } from "../stockage/problemes";

export const FICHIER_ESPACE = "espace.json";
/** Version du format de l'espace. Une version plus récente est refusée (écrite par une appli plus neuve). */
export const FORMAT_ESPACE = 1;

export interface InfoEspace {
  format: number;
  /** Date de création (ISO avec fuseau) et poste qui l'a créé : pour s'y retrouver. */
  cree: string;
  creePar: string;
}

export type EtatEspace =
  | { etat: "ok"; info: InfoEspace }
  /** Dossier vide (ou absent) : on peut y créer l'espace sans hésiter. */
  | { etat: "vide" }
  /** Dossier qui contient déjà autre chose, sans `espace.json` : à confirmer avant de l'adopter. */
  | { etat: "autre-contenu"; exemples: string[] }
  /** Espace créé par une version plus récente de l'application. */
  | { etat: "trop-recent"; format: number }
  | { etat: "illisible"; detail: string };

export function lireInfoEspace(texte: string): InfoEspace {
  const brut: unknown = JSON.parse(texte);
  if (typeof brut !== "object" || brut === null) throw new Error("espace.json ne contient pas un objet.");
  const { format, cree, creePar } = brut as Record<string, unknown>;
  if (typeof format !== "number" || !Number.isInteger(format) || format < 1) throw new Error("Champ « format » absent ou invalide.");
  return {
    format,
    cree: typeof cree === "string" && estDateIso(cree) ? cree : "",
    creePar: typeof creePar === "string" ? creePar : "",
  };
}

/** Examine le dossier choisi comme espace. `fs` a pour racine ce dossier. */
export async function examinerEspace(fs: Fichiers): Promise<EtatEspace> {
  if (!(await fs.exists(""))) return { etat: "vide" };
  if (await fs.exists(FICHIER_ESPACE)) {
    let info: InfoEspace;
    try {
      info = lireInfoEspace(await fs.readText(FICHIER_ESPACE));
    } catch (e) {
      return { etat: "illisible", detail: e instanceof Error ? e.message : String(e) };
    }
    if (info.format > FORMAT_ESPACE) return { etat: "trop-recent", format: info.format };
    return { etat: "ok", info };
  }
  // desktop.ini et fichiers cachés : posés par Windows ou OneDrive, sans signification.
  const visibles = (await fs.listDir("")).map((e) => e.name).filter((n) => !n.startsWith(".") && n.toLowerCase() !== "desktop.ini");
  return visibles.length === 0 ? { etat: "vide" } : { etat: "autre-contenu", exemples: visibles.slice(0, 5) };
}

/** Crée `espace.json`. Échoue si un autre poste vient de le créer (on l'ouvre alors tel quel). */
export async function initialiserEspace(fs: Fichiers, poste: string, maintenant: string): Promise<InfoEspace> {
  const info: InfoEspace = { format: FORMAT_ESPACE, cree: maintenant, creePar: poste };
  await fs.writeTextNew(FICHIER_ESPACE, jsonStable(info));
  return info;
}

/** Problèmes à la racine de l'espace : copie de conflit d'`espace.json`, écriture interrompue. */
export async function problemesRacine(fs: Fichiers): Promise<Probleme[]> {
  const out: Probleme[] = [];
  for (const e of await fs.listDir("")) {
    if (e.kind !== "file") continue;
    if (estTemporaireOrphelin(e.name)) out.push({ type: "temporaire", chemin: e.name });
    const conflit = detecterCopieConflit(e.name, [FICHIER_ESPACE]);
    if (conflit) out.push({ type: "conflit", dossier: "", conflit });
  }
  return out;
}
