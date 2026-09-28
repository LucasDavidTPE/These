/**
 * Étalonnage des axes d'un graphique : deux points connus sur l'axe des x (X1, X2) et deux sur
 * l'axe des y (Y1, Y2), cliqués sur l'image, avec leurs valeurs. Échelles linéaires ou
 * logarithmiques ; l'image peut être tournée ou les axes non perpendiculaires (scan de travers).
 *
 * Principe : un point p de l'image s'écrit p − X1 = s·(X2 − X1) + t·(Y2 − Y1). La coordonnée
 * s est la fraction « le long de l'axe des x » : x = x1 + s (x2 − x1) (en log10 pour une échelle
 * log). De même pour y à partir de Y1. Les lignes de x constant sont donc parallèles à l'axe des
 * y du graphique, comme sur le papier.
 */
import type { Pt } from "./image";

export interface Axe {
  /** Deux points de l'image (pixels) et leurs valeurs. */
  p1: Pt;
  p2: Pt;
  v1: number;
  v2: number;
  log: boolean;
}

export interface Etalonnage {
  x: Axe;
  y: Axe;
}

/** Ce qui empêche d'utiliser l'étalonnage (liste vide : utilisable). */
export function defauts(e: Etalonnage): string[] {
  const out: string[] = [];
  for (const [nom, a] of [
    ["x", e.x],
    ["y", e.y],
  ] as const) {
    if (Math.hypot(a.p2[0] - a.p1[0], a.p2[1] - a.p1[1]) < 2) out.push(`Axe des ${nom} : les deux points sont confondus.`);
    if (!Number.isFinite(a.v1) || !Number.isFinite(a.v2) || a.v1 === a.v2) out.push(`Axe des ${nom} : deux valeurs différentes sont nécessaires.`);
    if (a.log && (a.v1 <= 0 || a.v2 <= 0)) out.push(`Axe des ${nom} : une échelle logarithmique demande des valeurs positives.`);
  }
  const ux = sub(e.x.p2, e.x.p1),
    uy = sub(e.y.p2, e.y.p1);
  if (Math.abs(cross(ux, uy)) < 1e-6 * Math.hypot(...ux) * Math.hypot(...uy)) out.push("Les axes des x et des y sont parallèles : vérifier les points.");
  return out;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

/** (s, t) tels que v = s·ux + t·uy. */
function decompose(v: Pt, ux: Pt, uy: Pt): Pt {
  const d = cross(ux, uy);
  return [cross(v, uy) / d, cross(ux, v) / d];
}

const versValeur = (a: Axe, f: number) => (a.log ? 10 ** (Math.log10(a.v1) + f * (Math.log10(a.v2) - Math.log10(a.v1))) : a.v1 + f * (a.v2 - a.v1));
const versFraction = (a: Axe, v: number) => (a.log ? (Math.log10(v) - Math.log10(a.v1)) / (Math.log10(a.v2) - Math.log10(a.v1)) : (v - a.v1) / (a.v2 - a.v1));

/** Pixel → valeurs (x, y) du graphique. */
export function versDonnees(e: Etalonnage, p: Pt): Pt {
  const ux = sub(e.x.p2, e.x.p1),
    uy = sub(e.y.p2, e.y.p1);
  const [s] = decompose(sub(p, e.x.p1), ux, uy);
  const [, t] = decompose(sub(p, e.y.p1), ux, uy);
  return [versValeur(e.x, s), versValeur(e.y, t)];
}

/** Valeurs (x, y) du graphique → pixel. */
export function versPixel(e: Etalonnage, d: Pt): Pt {
  const ux = sub(e.x.p2, e.x.p1),
    uy = sub(e.y.p2, e.y.p1);
  const s = versFraction(e.x, d[0]);
  const ty = versFraction(e.y, d[1]);
  // p = X1 + s ux + t uy, et p − Y1 = s' ux + ty uy : t = ty − b, où X1 − Y1 = a ux + b uy
  const [, b] = decompose(sub(e.x.p1, e.y.p1), ux, uy);
  const t = ty - b;
  return [e.x.p1[0] + s * ux[0] + t * uy[0], e.x.p1[1] + s * ux[1] + t * uy[1]];
}

/**
 * Coordonnées « le long des axes » d'un pixel, en pixels : u le long de l'axe des x, w le long
 * de l'axe des y (même repère oblique que l'étalonnage). Sert au suivi de courbe, qui avance
 * selon x quelle que soit l'orientation de l'image.
 */
export function coordonneesAxes(e: Etalonnage, p: Pt): Pt {
  const ux = sub(e.x.p2, e.x.p1),
    uy = sub(e.y.p2, e.y.p1);
  const [s, t] = decompose(sub(p, e.x.p1), ux, uy);
  return [s * Math.hypot(...ux), t * Math.hypot(...uy)];
}

/** Inverse de coordonneesAxes. */
export function depuisCoordonneesAxes(e: Etalonnage, [u, w]: Pt): Pt {
  const ux = sub(e.x.p2, e.x.p1),
    uy = sub(e.y.p2, e.y.p1);
  const s = u / Math.hypot(...ux),
    t = w / Math.hypot(...uy);
  return [e.x.p1[0] + s * ux[0] + t * uy[0], e.x.p1[1] + s * ux[1] + t * uy[1]];
}
