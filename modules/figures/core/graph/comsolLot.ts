/**
 * Déclinaison d'une recette sur tous les cas : la même carte (ou les mêmes profils dans une coupe) pour chaque
 * plan ouvert, rangés en **matrice** d'après les mots des noms de fichiers (lignes = matériau, colonnes =
 * empreinte…), puis assemblés en planche avec titres de lignes et de colonnes et échelle de couleurs commune.
 */
import { geometrie, type Correspondance, type ExportComsol } from "./comsol";
import { motsDuNom } from "./comsolCalcul";
import type { Trace, TraceCarte, TraceCoupeProfils } from "./comsolEtude";
import { plancheVide, type PlancheDoc, type StyleEtiquette } from "./planche";

/** Recettes qui se déclinent : une par plan. */
export type TraceDeclinable = TraceCarte | TraceCoupeProfils;
export const estDeclinable = (t: Trace): t is TraceDeclinable => t.mode === "carte" || t.mode === "coupe-profils";

/** Plans qui peuvent recevoir la recette (grille régulière, avec la grandeur demandée). */
export function ciblesDeclinaison(t: TraceDeclinable, exports: readonly ExportComsol[]): ExportComsol[] {
  return exports.filter((e) => {
    const g = geometrie(e);
    return g.genre === "coupe" && g.reguliere && (!t.expression || e.colonnes.some((c) => c.expression === t.expression));
  });
}

/** La recette pour chacun des plans choisis (même grandeur, mêmes réglages, autre plan). */
export function decliner(t: TraceDeclinable, plans: readonly string[]): { plan: string; trace: TraceDeclinable }[] {
  return plans.map((plan) => ({ plan, trace: { ...t, plan } }));
}

export interface Matrice {
  lignes: string[];
  colonnes: string[];
  /** Nom de fichier de chaque case [ligne][colonne] ; null : case vide. */
  cases: (string | null)[][];
}

/**
 * Range des fichiers en matrice d'après deux mots de leur nom (n° `ligne` et `colonne`, comptés depuis 0 ; null :
 * une seule ligne / colonne). Ordre d'apparition gardé. Deux fichiers dans la même case : erreur explicite.
 */
export function ranger(noms: readonly string[], ligne: number | null, colonne: number | null): Matrice {
  const mot = (n: string, k: number | null) => (k === null ? "" : (motsDuNom(n)[k] ?? "?"));
  const lignes = [...new Set(noms.map((n) => mot(n, ligne)))];
  const colonnes = [...new Set(noms.map((n) => mot(n, colonne)))];
  const cases: (string | null)[][] = lignes.map(() => colonnes.map(() => null));
  for (const n of noms) {
    const i = lignes.indexOf(mot(n, ligne));
    const j = colonnes.indexOf(mot(n, colonne));
    const deja = cases[i]![j];
    if (deja) throw new Error(`« ${deja} » et « ${n} » tombent dans la même case (${[lignes[i], colonnes[j]].filter(Boolean).join(" × ")}) : choisir d'autres mots du nom pour les lignes et les colonnes.`);
    cases[i]![j] = n;
  }
  return { lignes, colonnes, cases };
}

/** Mots qui varient d'un nom de fichier à l'autre (n°, exemples) : les seuls utiles pour ranger. */
export function motsVariables(noms: readonly string[]): { k: number; valeurs: string[] }[] {
  const mots = noms.map(motsDuNom);
  const n = Math.max(0, ...mots.map((m) => m.length));
  return Array.from({ length: n }, (_, k) => ({ k, valeurs: [...new Set(mots.map((m) => m[k] ?? "?"))] })).filter((x) => x.valeurs.length > 1);
}

/** Planche en matrice : une case par plan (dossier de sa figure), titres traduits par les correspondances. */
export function plancheMatrice(
  m: Matrice,
  dossiers: ReadonlyMap<string, string>,
  o: { correspondances?: readonly Correspondance[]; memeEchelle?: boolean; etiquettes?: StyleEtiquette; taille?: { largeur: number; hauteur: number } | null } = {},
): PlancheDoc {
  const table = new Map((o.correspondances ?? []).map((c) => [c.de.replace(/\s+/g, "").toLowerCase(), c.vers]));
  const traduire = (t: string) => table.get(t.toLowerCase()) ?? t;
  const avecTitres = (l: string[]) => (l.length > 1 || l[0] ? l.map(traduire) : []);
  return {
    ...plancheVide(),
    colonnes: Math.min(6, Math.max(1, m.colonnes.length)),
    espacement: 4,
    etiquettes: o.etiquettes ?? "(a)",
    taille: o.taille ?? null,
    ...(o.memeEchelle !== false ? { memeEchelle: true } : {}),
    entetes: { lignes: avecTitres(m.lignes), colonnes: avecTitres(m.colonnes) },
    panneaux: m.cases.flat().map((n) => ({ dossier: n ? (dossiers.get(n) ?? "") : "" })),
  };
}
