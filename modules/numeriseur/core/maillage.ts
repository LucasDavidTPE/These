/**
 * Moyennes d'une carte de couleurs sur un maillage que l'on choisit :
 * - rectangulaire : une matrice (lignes = y, colonnes = x), au format des cartes de pression de
 *   ChaussSpec ;
 * - disques : des disques de rayon R centrés sur une trame carrée ou hexagonale ; une empreinte
 *   hétérogène devient un ensemble de charges circulaires uniformes (solution connue) ;
 * - polaire : anneaux × secteurs autour d'un centre.
 * La valeur d'une cellule est la moyenne des pixels de la carte dont le centre y tombe (pixels
 * sans valeur exclus). Les axes sont supposés linéaires (pixels d'aire égale).
 */
import type { Champ } from "./carte";
import { versDonnees, type Etalonnage } from "./etalonnage";
import type { Pt } from "./image";

export interface Cellule {
  /** Centre (valeurs du graphique). */
  centre: Pt;
  /** Aire (unités du graphique au carré). */
  aire: number;
  /** Valeur moyenne ; NaN si aucun pixel de la cellule n'a de valeur. */
  valeur: number;
  /** Nombre de pixels moyennés. */
  n: number;
}

export interface Rectangle {
  type: "rectangle";
  x0: number;
  x1: number;
  nx: number;
  y0: number;
  y1: number;
  ny: number;
}

export interface Disques {
  type: "disques";
  /** Domaine couvert par les centres. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  R: number;
  /** Distance entre centres voisins (2R : disques tangents). */
  pas: number;
  trame: "carree" | "hexagonale";
}

export interface Polaire {
  type: "polaire";
  xc: number;
  yc: number;
  /** Rayons des bords des anneaux, croissants (le premier vaut en général 0). */
  rayons: number[];
  secteurs: number;
}

export type Maillage = Rectangle | Disques | Polaire;

/** Forme d'une cellule : test d'appartenance et boîte englobante (valeurs du graphique). */
interface Forme {
  centre: Pt;
  aire: number;
  boite: [number, number, number, number];
  contient(x: number, y: number): boolean;
}

export function formes(m: Maillage): Forme[] {
  if (m.type === "rectangle") {
    if (m.nx < 1 || m.ny < 1) throw new Error("Maillage : au moins une cellule selon x et selon y.");
    // bornes remises dans l'ordre : lignes selon y croissant, colonnes selon x croissant
    const [xa, xb] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
    const [ya, yb] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
    const dx = (xb - xa) / m.nx,
      dy = (yb - ya) / m.ny;
    const out: Forme[] = [];
    for (let j = 0; j < m.ny; j++)
      for (let i = 0; i < m.nx; i++) {
        const [a, b] = [xa + i * dx, xa + (i + 1) * dx];
        const [c, d] = [ya + j * dy, ya + (j + 1) * dy];
        out.push({ centre: [(a + b) / 2, (c + d) / 2], aire: (b - a) * (d - c), boite: [a, c, b, d], contient: (x, y) => x >= a && x < b && y >= c && y < d });
      }
    return out;
  }
  if (m.type === "disques") {
    if (!(m.R > 0) || !(m.pas > 0)) throw new Error("Disques : rayon et pas strictement positifs.");
    const out: Forme[] = [];
    const dyr = m.trame === "hexagonale" ? (m.pas * Math.sqrt(3)) / 2 : m.pas;
    const [xa, xb] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
    const [ya, yb] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
    for (let j = 0, y = ya; y <= yb + 1e-9 * (yb - ya + 1); j++, y = ya + j * dyr) {
      const decalage = m.trame === "hexagonale" && j % 2 === 1 ? m.pas / 2 : 0;
      for (let x = xa + decalage; x <= xb + 1e-9 * (xb - xa + 1); x += m.pas) {
        const [cx, cy, R] = [x, y, m.R];
        out.push({ centre: [cx, cy], aire: Math.PI * R * R, boite: [cx - R, cy - R, cx + R, cy + R], contient: (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= R * R });
      }
    }
    return out;
  }
  const r = m.rayons;
  if (r.length < 2 || r.some((v, i) => i > 0 && !(v > r[i - 1]!))) throw new Error("Maillage polaire : rayons croissants, au moins deux.");
  if (m.secteurs < 1) throw new Error("Maillage polaire : au moins un secteur.");
  const out: Forme[] = [];
  for (let k = 0; k + 1 < r.length; k++)
    for (let s = 0; s < m.secteurs; s++) {
      const [ri, re] = [r[k]!, r[k + 1]!];
      const [t0, t1] = [(2 * Math.PI * s) / m.secteurs, (2 * Math.PI * (s + 1)) / m.secteurs];
      const rm = (ri + re) / 2,
        tm = (t0 + t1) / 2;
      out.push({
        centre: m.secteurs === 1 ? [m.xc, m.yc] : [m.xc + rm * Math.cos(tm), m.yc + rm * Math.sin(tm)],
        aire: ((t1 - t0) / 2) * (re * re - ri * ri),
        boite: [m.xc - re, m.yc - re, m.xc + re, m.yc + re],
        contient: (x, y) => {
          const d = Math.hypot(x - m.xc, y - m.yc);
          if (d < ri || d >= re) return false;
          if (m.secteurs === 1) return true;
          const t = (Math.atan2(y - m.yc, x - m.xc) + 2 * Math.PI) % (2 * Math.PI);
          return t >= t0 && t < t1;
        },
      });
    }
  return out;
}

/** Pixels de la carte qui ont une valeur : position (valeurs du graphique) et valeur. */
function echantillons(ch: Champ, e: Etalonnage): { x: Float64Array; y: Float64Array; v: Float64Array } {
  const [x0, y0, x1, y1] = ch.zone;
  const xs: number[] = [],
    ys: number[] = [],
    vs: number[] = [];
  for (let j = y0; j < y1; j++)
    for (let i = x0; i < x1; i++) {
      const v = ch.valeurs[j * ch.width + i]!;
      if (Number.isNaN(v)) continue;
      const [x, y] = versDonnees(e, [i + 0.5, j + 0.5]);
      xs.push(x);
      ys.push(y);
      vs.push(v);
    }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), v: Float64Array.from(vs) };
}

/** Moyenne de la carte sur chaque cellule du maillage. */
export function moyennes(ch: Champ, e: Etalonnage, m: Maillage): Cellule[] {
  const f = formes(m);
  const E = echantillons(ch, e);
  // index des échantillons par cases carrées, pour ne tester que ceux proches d'une cellule
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < E.x.length; i++) {
    xa = Math.min(xa, E.x[i]!);
    xb = Math.max(xb, E.x[i]!);
    ya = Math.min(ya, E.y[i]!);
    yb = Math.max(yb, E.y[i]!);
  }
  const nCases = Math.max(1, Math.round(Math.sqrt(E.x.length / 16)));
  const cx = (xb - xa) / nCases || 1,
    cy = (yb - ya) / nCases || 1;
  const cases = new Map<number, number[]>();
  const caseDe = (i: number, j: number) => j * (nCases + 1) + i;
  for (let k = 0; k < E.x.length; k++) {
    const c = caseDe(Math.floor((E.x[k]! - xa) / cx), Math.floor((E.y[k]! - ya) / cy));
    const l = cases.get(c);
    if (l) l.push(k);
    else cases.set(c, [k]);
  }
  return f.map((forme) => {
    const [bx0, by0, bx1, by1] = forme.boite;
    let s = 0,
      n = 0;
    const [i0, i1] = [Math.max(0, Math.floor((bx0 - xa) / cx)), Math.min(nCases, Math.floor((bx1 - xa) / cx))];
    const [j0, j1] = [Math.max(0, Math.floor((by0 - ya) / cy)), Math.min(nCases, Math.floor((by1 - ya) / cy))];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        for (const k of cases.get(caseDe(i, j)) ?? []) {
          if (!forme.contient(E.x[k]!, E.y[k]!)) continue;
          s += E.v[k]!;
          n++;
        }
    return { centre: forme.centre, aire: forme.aire, valeur: n ? s / n : NaN, n };
  });
}

/** Résultante Σ valeur × aire (cellules sans valeur exclues) : une force si la valeur est une pression. */
export function resultante(c: Cellule[]): number {
  return c.reduce((s, x) => (Number.isNaN(x.valeur) ? s : s + x.valeur * x.aire), 0);
}
