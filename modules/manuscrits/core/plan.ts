/**
 * Le plan d'un document (thèse, article, rapport…) : `manuscrits/<projet>/manuscrit.json`, dans l'espace. Il liste les
 * parties dans l'ordre (pages liminaires, chapitres, bibliographie, annexes) ; chaque partie
 * pointe vers son `.docx` (source, voir sources.ts) et porte son statut et son objectif.
 * Les `.docx` restent des fichiers Word ordinaires, édités dans Word.
 */
import { jsonStable } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import { NETTOYAGE_PAR_DEFAUT, type NettoyageFusion } from "./fusion";
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

/** Ce qu'on écrit : la thèse, mais aussi des articles, des comptes rendus ou rapports. Chacun a son plan, ses versions et ses retours. */
export const TYPES_DOCUMENT = [
  ["these", "Thèse"],
  ["article", "Article"],
  ["rapport", "Rapport / compte rendu"],
  ["autre", "Autre document"],
] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number][0];
export const libelleType = (t: TypeDocument) => TYPES_DOCUMENT.find((x) => x[0] === t)![1];

export const GENRES = [
  ["liminaire", "Pages liminaires"],
  ["chapitre", "Chapitre"],
  ["bibliographie", "Bibliographie"],
  ["annexe", "Annexes"],
] as const;
export type Genre = (typeof GENRES)[number][0];

/** Nom d'un genre de partie selon le document : un « chapitre » de thèse est une « section » d'article. */
export function libelleGenre(type: TypeDocument, genre: Genre): string {
  if (type === "these") return GENRES.find((g) => g[0] === genre)![1];
  return { liminaire: "Titre et résumé", chapitre: "Section", bibliographie: "Bibliographie", annexe: "Annexes" }[genre];
}

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

export interface ReglagesFusion {
  /** Début des chapitres, annexes et bibliographie : page suivante, ou page impaire (recto-verso). */
  saut: "nextPage" | "oddPage";
  nettoyage: NettoyageFusion;
}

export interface Manuscrit {
  version: 1;
  type: TypeDocument;
  titre: string;
  parties: Partie[];
  lecture: ReglagesLecture;
  fusion: ReglagesFusion;
}

export const FUSION_PAR_DEFAUT: ReglagesFusion = { saut: "nextPage", nettoyage: NETTOYAGE_PAR_DEFAUT };

export const manuscritVide = (titre: string, type: TypeDocument = "these"): Manuscrit => ({
  version: 1,
  type,
  titre,
  parties: [],
  lecture: structuredClone(LECTURE_PAR_DEFAUT),
  fusion: structuredClone(FUSION_PAR_DEFAUT),
});

/** Identifiant d'un document (nom de dossier) d'après son titre. */
export const idProjet = (titre: string) => slugifier(titre) || "manuscrit";
export const dossierProjet = (projet: string) => `${DOSSIER_MANUSCRITS}/${projet}`;
export const fichierPlan = (projet: string) => `${dossierProjet(projet)}/${FICHIER_PLAN}`;

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const listeTxt = (v: unknown, defaut: string[]) => (Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? (v as string[]) : defaut);

/** Lecture tolérante : champs manquants ou inconnus remplacés par leurs valeurs par défaut. */
export function lireManuscrit(brut: unknown): Manuscrit {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const l = (typeof b.lecture === "object" && b.lecture !== null ? b.lecture : {}) as Record<string, unknown>;
  const fu = (typeof b.fusion === "object" && b.fusion !== null ? b.fusion : {}) as Record<string, unknown>;
  const nt = (typeof fu.nettoyage === "object" && fu.nettoyage !== null ? fu.nettoyage : {}) as Record<string, unknown>;
  const statuts = STATUTS.map((s) => s[0]) as string[];
  const genres = GENRES.map((g) => g[0]) as string[];
  const types = TYPES_DOCUMENT.map((t) => t[0]) as string[];
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
    type: types.includes(txt(b.type)) ? (txt(b.type) as TypeDocument) : "these",
    titre: txt(b.titre) || "Manuscrit",
    parties,
    lecture: {
      consignes: listeTxt(l.consignes, LECTURE_PAR_DEFAUT.consignes),
      miniSommaires: listeTxt(l.miniSommaires, LECTURE_PAR_DEFAUT.miniSommaires),
      debutARediger: txt(l.debutARediger) || LECTURE_PAR_DEFAUT.debutARediger,
    },
    fusion: {
      saut: fu.saut === "oddPage" ? "oddPage" : "nextPage",
      nettoyage: {
        toujours: listeTxt(nt.toujours, NETTOYAGE_PAR_DEFAUT.toujours),
        consignes: listeTxt(nt.consignes, NETTOYAGE_PAR_DEFAUT.consignes),
        miniSommaires: listeTxt(nt.miniSommaires, NETTOYAGE_PAR_DEFAUT.miniSommaires),
      },
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

/**
 * Ordre de la fusion : le document maître (la première partie « pages liminaires ») vient d'abord, car
 * c'est lui qui porte les repères « ◆ Insérer ici » et les styles du document ; les autres suivent l'ordre du plan.
 */
export function ordreFusion(m: Manuscrit): Partie[] {
  const i = m.parties.findIndex((p) => p.genre === "liminaire");
  return i <= 0 ? m.parties : [m.parties[i]!, ...m.parties.filter((_, j) => j !== i)];
}

/** Nom du fichier produit : « these-l-david.docx » (d'après le titre du document). */
export const nomSortie = (m: Manuscrit) => `${slugifier(m.titre) || "document"}.docx`;
export const dossierSorties = (projet: string) => `${dossierProjet(projet)}/sorties`;
