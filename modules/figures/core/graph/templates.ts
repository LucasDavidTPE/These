/**
 * Modèles de graphes : des points de départ typiques d'une thèse sur les enrobés, avec des
 * valeurs vraisemblables mais **inventées** (à remplacer par ses données). Choisir un modèle
 * donne un graphe complet (axes, échelles, légende, style) qu'on retouche ensuite.
 */
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";
import { STYLE_PRESETS } from "./style";

export interface GraphTemplate {
  id: string;
  name: string;
  /** Une ligne : ce que montre le modèle. */
  note: string;
  doc: GraphDoc;
}

const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (a + ((b - a) * i) / (n - 1)));
const round = (v: number, d = 3) => Number(v.toPrecision(d));
const style = (id: string) => STYLE_PRESETS.find((p) => p.id === id)?.style ?? undefined;

function graph(p: Partial<GraphDoc> & Pick<GraphDoc, "x" | "y" | "series">): GraphDoc {
  const doc: GraphDoc = { format: GRAPH_FORMAT, width: 120, height: 80, theme: "these", legend: "north east", grid: false, bar_width: 3, ...p };
  if (!doc.style) delete doc.style;
  return doc;
}

/** Module d'un enrobé typique (forme 2S2P1D simplifiée) à une fréquence réduite. */
function moduleTypique(fr: number): number {
  const E00 = 60,
    E0 = 36000,
    x = 2 * Math.PI * fr * 0.05;
  const re = 1 + 2.2 * x ** -0.19 * Math.cos(0.19 * Math.PI / 2) + x ** -0.58 * Math.cos(0.58 * Math.PI / 2);
  const im = 2.2 * x ** -0.19 * Math.sin(0.19 * Math.PI / 2) + x ** -0.58 * Math.sin(0.58 * Math.PI / 2) + 1 / (x * 400);
  return E00 + (E0 - E00) / Math.hypot(re, im);
}

function courbeMaitresse(): GraphDoc {
  const series: Series[] = [];
  const aT: [number, number][] = [
    [-10, 2.2e3],
    [0, 1.3e2],
    [10, 5.5],
    [20, 0.2],
    [30, 1.1e-2],
    [40, 8e-4],
  ];
  for (const [T, a] of aT) {
    const f = [0.1, 0.3, 1, 3, 10].map((v) => v * a);
    series.push({ name: `${T} °C`, type: "points", x: f.map((v) => round(v)), y: f.map((v) => round(moduleTypique(v) * (1 + 0.01 * Math.sin(v * 7)))), legend: true });
  }
  const fr = logspace(-5, 5, 41);
  series.push({ name: "2S2P1D", type: "line", x: fr.map((v) => round(v, 4)), y: fr.map((v) => round(moduleTypique(v), 4)), legend: true });
  return graph({ x: { label: "$f \\cdot a_T$ (Hz)", log: true }, y: { label: "$|E^*|$ (MPa)", log: true }, legend: "south east", style: style("sequentiel"), series });
}

function ornierage(): GraphDoc {
  const N = [100, 300, 1000, 3000, 10000, 30000, 100000];
  const s = (name: string, A: number, b: number): Series => ({ name, type: "linepoints", x: N, y: N.map((n) => round(A * (n / 1000) ** b, 3)), legend: true });
  return graph({ x: { label: "Nombre de cycles", log: true }, y: { label: "Ornière (%)", log: false, min: 0 }, legend: "north west", grid: true, style: style("couleur"), series: [s("BBSG 0/10", 3.1, 0.22), s("EME2 0/14", 2.2, 0.17), s("BBA 0/10", 4.2, 0.26)] });
}

function fatigue(): GraphDoc {
  const N = logspace(5, 7, 5);
  const loi = (e6: number, b: number) => N.map((n) => round(e6 * (n / 1e6) ** b, 3));
  const pts = [
    [1.4e5, 158],
    [3.1e5, 139],
    [8.5e5, 118],
    [1.9e6, 106],
    [4.6e6, 96],
    [7.8e6, 90],
  ];
  return graph({
    x: { label: "Durée de vie $N_f$ (cycles)", log: true },
    y: { label: "$\\varepsilon$ (µm/m)", log: true },
    legend: "north east",
    style: style("article"),
    series: [
      { name: "Essais", type: "points", x: pts.map((p) => p[0]!), y: pts.map((p) => p[1]!), legend: true },
      { name: "$\\varepsilon_6 = 115$ µm/m, $b = -0{,}2$", type: "line", x: N.map((v) => round(v)), y: loi(115, -0.2), legend: true },
    ],
  });
}

function tsrst(): GraphDoc {
  // Refroidissement à 10 °C/h depuis 5 °C, rupture vers −27 °C à 4,6 MPa
  const T = Array.from({ length: 17 }, (_, i) => 5 - 2 * i);
  const sigma = T.map((t) => round(Math.max(0, 0.012 * Math.exp(-0.2 * t) - 0.012 * Math.exp(-1)) * 1.7, 3));
  return graph({ x: { label: "Température (°C)", log: false }, y: { label: "Contrainte thermique (MPa)", log: false, min: 0 }, legend: "north east", grid: true, style: style("couleur"), series: [{ name: "TSRST, 10 °C/h", type: "line", x: T, y: sigma, legend: true }] });
}

function barres(): GraphDoc {
  return graph({
    x: { label: "Matériau (1 : BBSG, 2 : GB3, 3 : EME2, 4 : BBA)", log: false },
    y: { label: "$|E^*|$ à 15 °C, 10 Hz (MPa)", log: false, min: 0 },
    legend: "north west",
    bar_width: 5,
    style: style("presentation"),
    series: [
      { name: "Laboratoire", type: "bar", x: [1, 2, 3, 4], y: [11200, 13400, 16800, 8900], legend: true },
      { name: "Carottes", type: "bar", x: [1, 2, 3, 4], y: [10300, 12100, 15200, 8100], legend: true },
    ],
  });
}

function cole(): GraphDoc {
  const fr = logspace(-5, 6, 45);
  const pts = fr.map((f) => {
    const E = moduleTypique(f);
    const phi = (Math.PI / 180) * (38 * Math.exp(-((Math.log10(f) + 1.5) ** 2) / 18) + 2);
    return [round(E * Math.cos(phi), 4), round(E * Math.sin(phi), 4)] as const;
  });
  return graph({ x: { label: "$E_1$ (MPa)", log: false, min: 0 }, y: { label: "$E_2$ (MPa)", log: false, min: 0 }, legend: "none", width: 100, height: 60, series: [{ name: "Cole-Cole", type: "linepoints", x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), legend: false }] });
}

function temporel(): GraphDoc {
  const t = Array.from({ length: 25 }, (_, i) => i * 0.5);
  return graph({
    x: { label: "Temps (h)", log: false },
    y: { label: "Température (°C)", log: false },
    legend: "north east",
    style: style("minimal"),
    series: [
      { name: "Consigne", type: "line", x: t, y: t.map((v) => round(20 - Math.min(v, 10) * 3, 3)), legend: true },
      { name: "Éprouvette", type: "line", x: t, y: t.map((v) => round(20 - Math.min(v, 10) * 3 + 2.4 * (1 - Math.exp(-v / 1.2)) * (v < 10 ? 1 : Math.exp(-(v - 10))), 3)), legend: true },
    ],
  });
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  { id: "maitresse", name: "Courbe maîtresse", note: "|E*| en fonction de f·a_T, isothermes et modèle (log-log)", doc: courbeMaitresse() },
  { id: "cole", name: "Plan Cole-Cole", note: "E₂ en fonction de E₁", doc: cole() },
  { id: "ornierage", name: "Orniérage", note: "ornière (%) en fonction du nombre de cycles (semi-log)", doc: ornierage() },
  { id: "fatigue", name: "Droite de fatigue", note: "ε en fonction de N_f, essais et loi (log-log)", doc: fatigue() },
  { id: "tsrst", name: "TSRST", note: "contrainte thermique en fonction de la température", doc: tsrst() },
  { id: "temporel", name: "Suivi temporel", note: "consigne et mesure en fonction du temps", doc: temporel() },
  { id: "barres", name: "Comparaison en barres", note: "modules de plusieurs matériaux, deux séries", doc: barres() },
];
