/**
 * Sorties du numériseur : CSV (point décimal, « ; », lisibles par Excel, numpy et ChaussSpec),
 * texte à coller dans Excel, graphe pour Figures, chargement pour ChaussSpec.
 */
import type { Coupe } from "./carte";
import type { Pt } from "./image";
import type { Cellule, Rectangle } from "./maillage";

const n = (v: number) => (Number.isNaN(v) ? "nan" : String(Number(v.toPrecision(10))));

export function csvPoints(points: Pt[], nomX = "x", nomY = "y"): string {
  return [`${nomX};${nomY}`, ...points.map(([x, y]) => `${n(x)};${n(y)}`)].join("\n") + "\n";
}

/** Tableau à coller dans Excel (tabulations, virgule décimale). */
export function textePourExcel(lignes: number[][]): string {
  return lignes.map((l) => l.map((v) => (Number.isNaN(v) ? "" : String(Number(v.toPrecision(10))).replace(".", ","))).join("\t")).join("\n");
}

export function csvCoupe(c: Coupe, unite = ""): string {
  return ["s;x;y;valeur" + (unite ? ` (${unite})` : ""), ...c.s.map((s, i) => `${n(s)};${n(c.x[i]!)};${n(c.y[i]!)};${n(c.v[i]!)}`)].join("\n") + "\n";
}

/** Cellules d'un maillage : centre, aire, valeur, nombre de pixels. */
export function csvCellules(c: Cellule[]): string {
  return ["x;y;aire;valeur;pixels", ...c.map((k) => `${n(k.centre[0])};${n(k.centre[1])};${n(k.aire)};${n(k.valeur)};${k.n}`)].join("\n") + "\n";
}

/** Matrice d'un maillage rectangulaire : lignes = y, colonnes = x (cellules rangées ligne par ligne). */
export function matrice(c: Cellule[], m: Rectangle): { x: number[]; y: number[]; P: number[][] } {
  const x = c.slice(0, m.nx).map((k) => k.centre[0]);
  const y = Array.from({ length: m.ny }, (_, j) => c[j * m.nx]!.centre[1]);
  const P = y.map((_, j) => c.slice(j * m.nx, (j + 1) * m.nx).map((k) => k.valeur));
  return { x, y, P };
}

/**
 * Matrice au format des cartes de pression de ChaussSpec (et de np.loadtxt) : 1re ligne les x
 * (1re case ignorée), 1re colonne les y. Les cellules sans valeur valent 0 (hors empreinte).
 */
export function csvMatrice(c: Cellule[], m: Rectangle, entete = ""): string {
  const { x, y, P } = matrice(c, m);
  const lignes = [`nan;${x.map(n).join(";")}`, ...y.map((yy, j) => `${n(yy)};${P[j]!.map((v) => n(Number.isNaN(v) ? 0 : v)).join(";")}`)];
  return (entete ? `# ${entete}\n` : "") + lignes.join("\n") + "\n";
}

/** Unités vers le SI pour ChaussSpec (longueurs en m, pressions en Pa). */
export interface VersSI {
  /** Longueur d'une unité des axes, en m (1 pour m, 0,001 pour mm). */
  longueur: number;
  /** Pression d'une unité des valeurs, en Pa (1e6 pour MPa). */
  pression: number;
}

/** Roues d'un cas ChaussSpec (format JSON de chausspec). */
export type RoueChausspec = { x0: number; y0: number; footprint: Record<string, unknown> };

/**
 * Empreinte hétérogène → ensemble de charges circulaires uniformes : une roue par disque, de
 * pression la valeur moyenne du disque. Disques sans valeur ou de valeur ≤ seuil écartés.
 */
export function chargementDisques(c: Cellule[], R: number, si: VersSI, seuil = 0): RoueChausspec[] {
  return c
    .filter((k) => !Number.isNaN(k.valeur) && k.valeur > seuil)
    .map((k) => ({ x0: k.centre[0] * si.longueur, y0: k.centre[1] * si.longueur, footprint: { type: "circle", R: R * si.longueur, p: k.valeur * si.pression } }));
}

/** Maillage rectangulaire → une carte de pression ChaussSpec (constante par cellule). */
export function chargementCarte(c: Cellule[], m: Rectangle, si: VersSI): RoueChausspec[] {
  const { x, y, P } = matrice(c, m);
  return [{ x0: 0, y0: 0, footprint: { type: "map", x: x.map((v) => v * si.longueur), y: y.map((v) => v * si.longueur), P: P.map((l) => l.map((v) => (Number.isNaN(v) ? 0 : v))), unit: si.pression } }];
}

/** graph.json (format de Figures) de séries de points. */
export function grapheFigures(xLabel: string, yLabel: string, series: { name: string; x: number[]; y: number[]; type?: "line" | "points" | "linepoints" }[]) {
  return {
    format: "figurine-graph/1",
    width: 120,
    height: 80,
    theme: "these",
    x: { label: xLabel, log: false },
    y: { label: yLabel, log: false },
    legend: series.length > 1 ? "north east" : "none",
    grid: false,
    bar_width: 3,
    series: series.map((s) => ({ name: s.name, type: s.type ?? "linepoints", x: s.x, y: s.y, legend: series.length > 1 })),
  };
}
