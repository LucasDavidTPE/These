/**
 * Le plan d'un manuscrit : `manuscrits/<projet>/manuscrit.json`, dans l'espace. Il liste les
 * parties dans l'ordre (pages liminaires, chapitres, bibliographie, annexes) ; chaque partie
 * pointe vers son `.docx` (source, voir sources.ts) et porte son statut et son objectif.
 * Les `.docx` restent des fichiers Word ordinaires, édités dans Word.
 */
import { jsonStable } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import { LECTURE_PAR_DEFAUT, type ReglagesLecture } from "./inventaire";

export const DOSSIER_MANUSCRITS = "manuscrits";
export const FICHIER_PLAN = "manuscrit.json";

export const STATUTS = [
  ["squelette", "Squelette"],
  ["redaction", "En rédaction"],
  ["relecture", "En relecture"],
  ["fige", "Figé"],
] as const;
export type Statut = (typeof STATUTS)[number][0];

export const GENRES = [
  ["liminaire", "Pages liminaires"],
  ["chapitre", "Chapitre"],
  ["bibliographie", "Bibliographie"],
  ["annexe", "Annexes"],
] as const;
export type Genre = (typeof GENRES)[number][0];

export interface Partie {
  /** Identifiant stable (sert de nom de dossier pour les versions et les retours). */
  id: string;
  /** Nom affiché si le document n'a pas de titre. */
  nom: string;
  /** `racine:chemin`, voir sources.ts. */
  source: string;
  genre: Genre;
  statut: Statut;
  objectifMots: number | null;
}

export interface Manuscrit {
  version: 1;
  titre: string;
  parties: Partie[];
  lecture: ReglagesLecture;
}

export const manuscritVide = (titre: string): Manuscrit => ({ version: 1, titre, parties: [], lecture: structuredClone(LECTURE_PAR_DEFAUT) });

/** Identifiant d'un projet de manuscrit (nom de dossier) d'après son titre. */
export const idProjet = (titre: string) => slugifier(titre) || "manuscrit";
export const dossierProjet = (projet: string) => `${DOSSIER_MANUSCRITS}/${projet}`;
export const fichierPlan = (projet: string) => `${dossierProjet(projet)}/${FICHIER_PLAN}`;

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const listeTxt = (v: unknown, defaut: string[]) => (Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? (v as string[]) : defaut);

/** Lecture tolérante : champs manquants ou inconnus remplacés par leurs valeurs par défaut. */
export function lireManuscrit(brut: unknown): Manuscrit {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const l = (typeof b.lecture === "object" && b.lecture !== null ? b.lecture : {}) as Record<string, unknown>;
  const statuts = STATUTS.map((s) => s[0]) as string[];
  const genres = GENRES.map((g) => g[0]) as string[];
  const vus = new Set<string>();
  const parties: Partie[] = [];
  for (const p of Array.isArray(b.parties) ? b.parties : []) {
    const o = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
    const id = txt(o.id);
    const source = txt(o.source);
    if (!id || !source || vus.has(id)) continue;
    vus.add(id);
    parties.push({
      id,
      nom: txt(o.nom) || id,
      source,
      genre: genres.includes(txt(o.genre)) ? (txt(o.genre) as Genre) : "chapitre",
      statut: statuts.includes(txt(o.statut)) ? (txt(o.statut) as Statut) : "squelette",
      objectifMots: typeof o.objectifMots === "number" && o.objectifMots > 0 ? Math.round(o.objectifMots) : null,
    });
  }
  return {
    version: 1,
    titre: txt(b.titre) || "Manuscrit",
    parties,
    lecture: {
      consignes: listeTxt(l.consignes, LECTURE_PAR_DEFAUT.consignes),
      miniSommaires: listeTxt(l.miniSommaires, LECTURE_PAR_DEFAUT.miniSommaires),
      debutARediger: txt(l.debutARediger) || LECTURE_PAR_DEFAUT.debutARediger,
    },
  };
}

export const ecrireManuscrit = (m: Manuscrit): string => jsonStable(m);

/** Nom lisible d'un fichier : « 01_Chapitre1_Etat_de_l_art.docx » → « Chapitre1 Etat de l art ». */
export function nomLisible(fichier: string): string {
  return fichier
    .replace(/\.(docx|docm)$/i, "")
    .replace(/^\d+[_\s.-]+/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

/** Genre le plus probable d'après le nom du fichier. */
export function genreProbable(fichier: string): Genre {
  const n = slugifier(fichier.replace(/\.(docx|docm)$/i, ""));
  if (/(^|-)(maitre|liminaire|liminaires|page-de-garde|front)(-|$)/.test(n)) return "liminaire";
  if (/(^|-)(bibliographie|references|biblio)(-|$)/.test(n)) return "bibliographie";
  if (/(^|-)annexes?(-|$)/.test(n)) return "annexe";
  return "chapitre";
}

/** Identifiant libre pour une nouvelle partie (le nom du fichier, sans numéro de tri, rendu unique). */
export function idPartie(fichier: string, pris: ReadonlySet<string>): string {
  const base = slugifier(nomLisible(fichier)) || "partie";
  let id = base;
  for (let i = 2; pris.has(id); i++) id = `${base}-${i}`;
  return id;
}

/** Tri « naturel » des fichiers : 2 avant 10, accents et casse ignorés. */
export const ordreNaturel = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });

/** Ajoute des parties à la fin du plan ; une source déjà présente n'est pas ajoutée deux fois. */
export function ajouterParties(m: Manuscrit, nouvelles: { fichier: string; source: string }[]): Manuscrit {
  const pris = new Set(m.parties.map((p) => p.id));
  const sources = new Set(m.parties.map((p) => p.source.toLowerCase()));
  const parties = [...m.parties];
  for (const n of nouvelles) {
    if (sources.has(n.source.toLowerCase())) continue;
    const id = idPartie(n.fichier, pris);
    pris.add(id);
    sources.add(n.source.toLowerCase());
    parties.push({ id, nom: nomLisible(n.fichier) || id, source: n.source, genre: genreProbable(n.fichier), statut: "squelette", objectifMots: null });
  }
  return { ...m, parties };
}

export function modifierPartie(m: Manuscrit, id: string, champs: Partial<Omit<Partie, "id">>): Manuscrit {
  return { ...m, parties: m.parties.map((p) => (p.id === id ? { ...p, ...champs } : p)) };
}

export function retirerPartie(m: Manuscrit, id: string): Manuscrit {
  return { ...m, parties: m.parties.filter((p) => p.id !== id) };
}

/** Décale une partie de `delta` places (−1 = plus haut) ; sans effet aux extrémités. */
export function deplacerPartie(m: Manuscrit, id: string, delta: number): Manuscrit {
  const i = m.parties.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= m.parties.length) return m;
  const parties = [...m.parties];
  [parties[i], parties[j]] = [parties[j]!, parties[i]!];
  return { ...m, parties };
}
