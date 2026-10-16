/**
 * Profils le long de segments quelconques d'une coupe (de A à B, posés de deux clics sur la carte) : la valeur
 * interpolée dans la maille, en fonction de la distance parcourue depuis A — une ligne oblique sous le bord du
 * pneu, une diagonale dans une couche, ce que les lignes verticales et horizontales ne donnent pas.
 */
import {
  grilleCoupe,
  libelleColonne,
  type ExportComsol,
  type UniteLongueur,
} from "./comsol";
import { valeurCarte } from "./comsolInstants";
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

/** Segment de A (x0, y0) à B (x1, y1), dans l'unité de tracé et les axes de la carte. */
export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const fr = (x: number) =>
  String(Number(x.toPrecision(4)))
    .replace(".", ",")
    .replace("-", "−");

/** Valeurs le long d'un segment : `n` + 1 points régulièrement espacés ; s = distance depuis A. */
export function profilSegment(
  g: Pick<ReturnType<typeof grilleCoupe>, "x" | "y" | "v">,
  s: Segment,
  n = 200,
): { s: number[]; v: (number | null)[] } {
  const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  const pas = Array.from({ length: n + 1 }, (_, i) => i / n);
  return {
    s: pas.map((t) => Number((t * L).toPrecision(10))),
    v: pas.map((t) =>
      valeurCarte(g, s.x0 + t * (s.x1 - s.x0), s.y0 + t * (s.y1 - s.y0)),
    ),
  };
}

/** Graphe des profils le long des segments (a, b, c…), en fonction de la distance parcourue depuis A. */
export function grapheSegments(
  p: ExportComsol,
  expression: string,
  segments: readonly Segment[],
  longueur: UniteLongueur,
): GraphDoc {
  const g = grilleCoupe(p, expression, longueur);
  const lib = libelleColonne(
    p.colonnes.find((c) => c.expression === expression)!,
  );
  const lettre = (i: number) => String.fromCharCode(97 + (i % 26));
  const series: Series[] = segments.map((s, i) => {
    const pr = profilSegment(g, s);
    const pts = pr.s
      .map((x, k) => [x, pr.v[k]] as const)
      .filter((q): q is readonly [number, number] => q[1] !== null);
    return {
      name: `${lettre(i)}. (${fr(s.x0)} ; ${fr(s.y0)}) → (${fr(s.x1)} ; ${fr(s.y1)})`,
      type: "line",
      x: pts.map((q) => q[0]),
      y: pts.map((q) => Number(q[1].toPrecision(8))),
      legend: true,
    };
  });
  if (!series.some((s) => s.x.length))
    throw new Error("Les segments sont hors de la carte.");
  return {
    format: GRAPH_FORMAT,
    width: 130,
    height: 80,
    theme: "these",
    x: {
      label: `Distance le long du segment, depuis A (${longueur})`,
      log: false,
      min: 0,
    },
    y: { label: `${lib.grandeur} (${lib.unite})`, log: false },
    legend: "north east",
    grid: true,
    bar_width: 3,
    series: series.filter((s) => s.x.length),
  };
}
