/**
 * Atelier COMSOL : ce que l'interface dit des fichiers et propose de faire, en français courant. Description de
 * chaque export (« Ligne verticale le long de z, de −320 à 0 mm »), tracés possibles avec la raison quand ils ne
 * le sont pas, fichiers comparables point à point, passage d'un clic sur l'aperçu aux valeurs des données.
 */
import { FACTEUR_LONGUEUR, geometrie, libelleColonne, parametresDe, type ExportComsol, type UniteLongueur } from "./comsol";
import { combiner } from "./comsolCalcul";
import type { GraphLayout } from "./layout";
import type { GraphDoc } from "./model";
import { project, unproject } from "./ticks";

export type FormeExport = "ligne" | "plan" | "serie" | "nuage" | "point";

export interface Description {
  forme: FormeExport;
  /** « Ligne verticale (le long de z) », « Plan x–z (coupe) », « Signal au cours du temps ». */
  titre: string;
  /** Étendue et nombre de points, dans l'unité de tracé. */
  detail: string;
  /** Noms courts des grandeurs (εzz…). */
  grandeurs: string[];
  /** Paramètres de l'étude (« lc=3, VE=0, Temps=10 s »). */
  etude: string;
  /** Pour un plan : axes horizontal et vertical de la carte (noms des coordonnées). */
  axes?: [string, string];
  /** Ce qui ne marchera pas avec ce fichier, et pourquoi. */
  avertissement?: string;
}

const fr = (v: number) => String(Number(v.toPrecision(4))).replace(".", ",").replace("-", "−");

/** Description en clair d'un export, longueurs dans l'unité de tracé. */
export function decrireExport(e: ExportComsol, longueur: UniteLongueur): Description {
  const g = geometrie(e);
  const grandeurs = e.colonnes.map((c) => libelleColonne(c).court);
  const etude = Object.entries(parametresDe(e))
    .filter(([k]) => k !== "Point")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const f = FACTEUR_LONGUEUR[longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  const etendue = (k: number) => {
    let a = Infinity;
    let b = -Infinity;
    for (const v of e.valeurs[k]!)
      if (Number.isFinite(v)) {
        a = Math.min(a, v * f);
        b = Math.max(b, v * f);
      }
    return `de ${fr(a)} à ${fr(b)} ${longueur}`;
  };
  const nom = (k: number) => e.coordonnees[k]!.toLowerCase();
  if (g.genre === "serie") {
    const t = e.valeurs[0]!;
    return {
      forme: "serie",
      titre: "Signal au cours du temps (table)",
      detail: `${e.lignes} instants, de ${fr(t[0]!)} à ${fr(t[e.lignes - 1]!)} ${e.uniteArgument || "s"}${e.colonnes[0]?.parametres.Point ? `, au point ${e.colonnes[0].parametres.Point}` : ""}`,
      grandeurs,
      etude,
    };
  }
  if (g.genre === "profil") {
    const k = g.varient[0]!;
    const vertical = /^z$/i.test(e.coordonnees[k]!);
    return { forme: "ligne", titre: `Ligne ${vertical ? "verticale" : "horizontale"} (le long de ${nom(k)})`, detail: `${nom(k)} ${etendue(k)}, ${e.lignes} points`, grandeurs, etude };
  }
  if (g.genre === "coupe") {
    const [kx, ky] = g.varient as [number, number];
    return {
      forme: "plan",
      titre: `Plan ${nom(kx)}–${nom(ky)} (coupe)`,
      detail: `${nom(kx)} ${etendue(kx)} ; ${nom(ky)} ${etendue(ky)} ; ${g.reguliere ? `grille ${g.grilles[0]!.length} × ${g.grilles[1]!.length}` : `${e.lignes} points sans grille régulière`}`,
      grandeurs,
      etude,
      axes: [nom(kx), nom(ky)],
      ...(g.reguliere ? {} : { avertissement: "Points du maillage, pas une grille régulière : pas de carte ni de profils interpolés. Réexporter le plan de coupe sur une grille régulière." }),
    };
  }
  if (g.genre === "volume") return { forme: "nuage", titre: "Nuage de points 3D", detail: `${e.lignes} points`, grandeurs, etude, avertissement: "Trois coordonnées varient : exporter plutôt une ligne ou un plan de coupe." };
  return { forme: "point", titre: "Un seul point", detail: `${e.lignes} ligne(s)`, grandeurs, etude, avertissement: "Aucune coordonnée ne varie : rien à tracer en courbe." };
}

export type ModeAtelier = "profils" | "carte" | "coupe-profils" | "temps" | "comparer" | "synthese";

export const MODES: { id: ModeAtelier; titre: string; explication: string }[] = [
  { id: "profils", titre: "Comparer des profils", explication: "Des courbes le long d'une ligne (εzz en profondeur…), un fichier ou une grandeur par courbe." },
  { id: "carte", titre: "Carte d'une coupe", explication: "Les valeurs d'un plan en couleurs, avec barre de couleurs, isolignes, couches." },
  { id: "coupe-profils", titre: "Profils dans une coupe", explication: "Cliquer sur la carte pour placer des lignes ; leurs profils sont superposés." },
  { id: "temps", titre: "Signal dans le temps", explication: "Courbes au cours du temps (tables), référence élastique, pic et décalage." },
  { id: "comparer", titre: "Comparer deux cas", explication: "A / B, A − B ou écart en % point à point (VE / EL, het / circ…)." },
  { id: "synthese", titre: "Tableau de synthèse", explication: "Max, min et positions de chaque cas ; LaTeX booktabs ; barres groupées." },
];

/** Pour chaque tracé : null s'il est possible avec les fichiers ouverts, sinon ce qu'il manque. */
export function modesDisponibles(exports: readonly ExportComsol[]): Record<ModeAtelier, string | null> {
  const genres = exports.map((e) => geometrie(e));
  const lignes = genres.filter((g) => g.genre === "profil").length;
  const plans = genres.filter((g) => g.genre === "coupe" && g.reguliere).length;
  const tables = genres.filter((g) => g.genre === "serie").length;
  const aucun = "Ouvrez d'abord des fichiers.";
  return {
    profils: lignes ? null : exports.length ? "Aucune ligne parmi les fichiers (les profils d'une coupe : « Profils dans une coupe »)." : aucun,
    carte: plans ? null : exports.length ? "Aucun plan de coupe sur grille régulière." : aucun,
    "coupe-profils": plans ? null : exports.length ? "Aucun plan de coupe sur grille régulière." : aucun,
    temps: tables ? null : exports.length ? "Aucune table (signal en un point au cours du temps)." : aucun,
    comparer: exports.length >= 2 ? null : "Il faut au moins deux fichiers de même grille.",
    synthese: exports.some((_, i) => genres[i]!.genre !== "point") ? null : aucun,
  };
}

/** Peut-on calculer A ∘ B point à point ? null si oui, sinon la raison (grilles différentes…). */
export function comparables(a: ExportComsol, b: ExportComsol): string | null {
  if (a === b) return "A et B sont le même fichier.";
  try {
    combiner(a, b, "difference");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Point de l'aperçu (en mm depuis le coin haut gauche du graphe) → valeurs des données, axes inversés compris ;
 * `dedans` : le point est dans la boîte des axes.
 */
export function versDonnees(doc: Pick<GraphDoc, "x" | "y">, l: Pick<GraphLayout, "box" | "xs" | "ys">, mx: number, my: number): { x: number; y: number; dedans: boolean } {
  const tx = (mx - l.box.x) / l.box.w;
  const ty = 1 - (my - l.box.y) / l.box.h;
  return {
    x: unproject(l.xs, doc.x.inverse ? 1 - tx : tx),
    y: unproject(l.ys, doc.y.inverse ? 1 - ty : ty),
    dedans: tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1,
  };
}

/** Inverse de versDonnees : position en mm d'une valeur sur l'axe x (ou y). */
export function versAperçu(doc: Pick<GraphDoc, "x" | "y">, l: Pick<GraphLayout, "box" | "xs" | "ys">, axe: "x" | "y", v: number): number {
  if (axe === "x") return l.box.x + (doc.x.inverse ? 1 - project(l.xs, v) : project(l.xs, v)) * l.box.w;
  return l.box.y + (doc.y.inverse ? project(l.ys, v) : 1 - project(l.ys, v)) * l.box.h;
}

/** Valeur arrondie « propre » d'un clic : 3 chiffres significatifs de l'étendue de l'axe (pas de 1 mm sur 900 mm). */
export function arrondirClic(v: number, etendue: number): number {
  const pas = 10 ** (Math.floor(Math.log10(Math.abs(etendue) || 1)) - 2);
  return Number((Math.round(v / pas) * pas).toPrecision(10));
}

/** Point où une grandeur est la plus forte en valeur absolue : valeur et coordonnées (unité du fichier). */
export function positionExtremum(e: ExportComsol, expression: string): { valeur: number; coordonnees: number[] } | null {
  const j = e.colonnes.findIndex((c) => c.expression === expression);
  if (j < 0) return null;
  const v = e.valeurs[e.coordonnees.length + j]!;
  let best = -1;
  for (let i = 0; i < e.lignes; i++) if (Number.isFinite(v[i]!) && (best < 0 || Math.abs(v[i]!) > Math.abs(v[best]!))) best = i;
  return best < 0 ? null : { valeur: v[best]!, coordonnees: e.coordonnees.map((_, k) => e.valeurs[k]![best]!) };
}
