/**
 * Un graphique du traitement en graphe Figures (graph.json, format « figurine-graph/1 ») :
 * données, échelles et titres d'axes ; la mise en forme (taille, légende, thème) se règle
 * ensuite dans Figures, qui l'exporte en pgfplots. Le format est recopié ici plutôt
 * qu'importé : un module n'importe pas un autre module, Figures le valide à la réception.
 */
import type { Serie } from "@noyau/graphe";
import type { Vue } from "./vues";

export interface SerieFigurine {
  name: string;
  type: "line" | "points" | "linepoints";
  x: number[];
  y: number[];
  legend: boolean;
  /** Couleur de l'écran (#rrggbb), gardée dans Figures ; retouchable là-bas. */
  color?: string;
}

export interface GrapheFigurine {
  format: "figurine-graph/1";
  width: number;
  height: number;
  theme: string;
  x: { label: string; log: boolean };
  y: { label: string; log: boolean };
  legend: "north east" | "north west" | "south east" | "south west" | "none";
  grid: boolean;
  bar_width: number;
  series: SerieFigurine[];
}

/** Au-delà, une courbe est allégée (un point sur k) : pgfplots peine sur les très longues séries. */
export const POINTS_MAX = 2000;

/** « #0b5f5c » ou « rgb(12,34,56) » → « #0c2238 » ; undefined sinon (variable CSS…). */
export function enHex(c: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return m ? "#" + m.slice(1, 4).map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("") : undefined;
}

function serie(s: Serie, xLog: boolean, yLog: boolean, nom: string): SerieFigurine {
  const x: number[] = [],
    y: number[] = [];
  const pas = Math.max(1, Math.ceil(s.points.length / POINTS_MAX));
  for (let i = 0; i < s.points.length; i += pas) {
    const [a, b] = s.points[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b) || (xLog && a <= 0) || (yLog && b <= 0)) continue;
    x.push(a);
    y.push(b);
  }
  const color = enHex(s.couleur);
  return { name: nom, type: s.mode === "points" ? "points" : "line", x, y, legend: false, ...(color ? { color } : {}) };
}

export function vueEnGraphe(vue: Vue, legende: GrapheFigurine["legend"] = "south east"): GrapheFigurine {
  const { spec } = vue;
  const xLog = !!spec.xLog,
    yLog = !!spec.yLog;
  const vus = new Set<string>();
  const series: SerieFigurine[] = [];
  spec.series.forEach((s, i) => {
    const nom = s.libelle ?? `série ${i + 1}`;
    const r = serie(s, xLog, yLog, nom);
    if (!r.x.length) return;
    // Mêmes données en ligne et en points (écarts entre capteurs) : une seule série « linepoints ».
    const avant = series.find((a) => s.libelle && a.name === nom && a.type !== r.type && a.x.length === r.x.length && a.x.every((v, k) => v === r.x[k] && a.y[k] === r.y[k]));
    if (avant) {
      avant.type = "linepoints";
      return;
    }
    r.legend = !!s.libelle && !vus.has(nom);
    vus.add(nom);
    series.push(r);
  });
  return {
    format: "figurine-graph/1",
    width: 120,
    height: 80,
    theme: "these",
    x: { label: spec.xTitre ?? "", log: xLog },
    y: { label: spec.yTitre ?? "", log: yLog },
    legend: series.some((s) => s.legend) ? legende : "none",
    grid: false,
    bar_width: 3,
    series,
  };
}
