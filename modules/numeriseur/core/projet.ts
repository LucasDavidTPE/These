/**
 * Projet du numériseur : une image et tout ce qu'on y a placé (étalonnage, séries de points,
 * légende, coupes, maillage). Rangé dans `numeriseur/<nom>.json` de l'espace, l'image à côté
 * (`numeriseur/<nom>.<ext>`). Un étalonnage peut être incomplet (en cours de saisie).
 */
import type { Etalonnage } from "./etalonnage";
import type { Pt, Zone } from "./image";
import type { Legende } from "./carte";
import type { Maillage } from "./maillage";

export const FORMAT = "numeriseur/1";

export interface AxeSaisi {
  p1: Pt | null;
  p2: Pt | null;
  v1: number | null;
  v2: number | null;
  log: boolean;
  /** Titre de l'axe, avec son unité (« Fréquence (Hz) »). */
  titre: string;
}

export interface Serie {
  nom: string;
  /** #rrvvbb */
  couleur: string;
  /** Ligne continue ou symboles isolés. */
  mode: "ligne" | "symboles";
  points: Pt[];
}

export interface LegendeSaisie {
  p1: Pt | null;
  p2: Pt | null;
  v1: number | null;
  v2: number | null;
  log: boolean;
  /** Unité des valeurs (« MPa »). */
  unite: string;
  /** Échelle de couleurs connue (« jet », « viridis »…) au lieu de la barre lue sur l'image ; « » sinon. */
  echelle?: string;
  /** Échelle connue lue de sa fin à son début (barre inversée). */
  inverse?: boolean;
}

export interface Projet {
  format: typeof FORMAT;
  mode: "courbe" | "carte";
  /** Nom du fichier image, à côté du projet. */
  image: string;
  axes: { x: AxeSaisi; y: AxeSaisi };
  /** Zone de recherche (courbes) ou de la carte (pixels). */
  zone: Zone | null;
  /** Écart de couleur admis (ΔE). */
  tolerance: number;
  /** Pas du relevé automatique (pixels). */
  pas: number;
  series: Serie[];
  legende: LegendeSaisie;
  coupes: { a: Pt; b: Pt }[];
  maillage: Maillage;
}

export const axeVide = (titre = ""): AxeSaisi => ({ p1: null, p2: null, v1: null, v2: null, log: false, titre });

export function projetVide(image = ""): Projet {
  return {
    format: FORMAT,
    mode: "courbe",
    image,
    axes: { x: axeVide("x"), y: axeVide("y") },
    zone: null,
    tolerance: 15,
    pas: 4,
    series: [{ nom: "Série 1", couleur: "#d62728", mode: "ligne", points: [] }],
    legende: { p1: null, p2: null, v1: null, v2: null, log: false, unite: "" },
    coupes: [],
    maillage: { type: "rectangle", x0: 0, x1: 1, nx: 10, y0: 0, y1: 1, ny: 10 },
  };
}

/** L'étalonnage, s'il est complet. */
export function etalonnageDe(p: Projet): Etalonnage | null {
  const a = (s: AxeSaisi) => (s.p1 && s.p2 && s.v1 !== null && s.v2 !== null ? { p1: s.p1, p2: s.p2, v1: s.v1, v2: s.v2, log: s.log } : null);
  const x = a(p.axes.x),
    y = a(p.axes.y);
  return x && y ? { x, y } : null;
}

/** L'échelle connue choisie, si ses deux valeurs sont saisies. */
export function echelleConnueDe(p: Projet): { nom: string; v1: number; v2: number; log: boolean; inverse: boolean } | null {
  const l = p.legende;
  return l.echelle && l.v1 !== null && l.v2 !== null ? { nom: l.echelle, v1: l.v1, v2: l.v2, log: l.log, inverse: !!l.inverse } : null;
}

/** La légende, si elle est complète. */
export function legendeDe(p: Projet): Legende | null {
  const l = p.legende;
  return l.p1 && l.p2 && l.v1 !== null && l.v2 !== null ? { p1: l.p1, p2: l.p2, v1: l.v1, v2: l.v2, log: l.log } : null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lecture d'un projet enregistré ; les champs absents reprennent leur valeur par défaut. */
export function lireProjet(texte: string): Projet {
  const raw: unknown = JSON.parse(texte);
  if (!estObjet(raw) || raw.format !== FORMAT) throw new Error(`Ce fichier n'est pas un projet du numériseur (format ${FORMAT} attendu).`);
  const d = projetVide(typeof raw.image === "string" ? raw.image : "");
  return { ...d, ...(raw as Partial<Projet>), format: FORMAT };
}
