/**
 * Traceur de courbes commun (SPEC §3), sans DOM : graduations « rondes », format des
 * nombres, couleurs, et le rendu en SVG autonome d'un ou plusieurs panneaux (un par
 * famille d'unités, jamais deux échelles sur un axe). Sert à l'écran (composant Courbes)
 * et aux figures régénérées depuis les données : même dessin, mêmes octets.
 */
import { echapperXml } from "./texte";

export interface Trace {
  nom: string;
  x: number[];
  y: number[];
}

export interface Panneau {
  titre: string;
  unite: string;
  traces: Trace[];
}

export const COULEURS = ["#2f5f8a", "#b0602c", "#2e7d4f", "#a8326e", "#6b4fa0", "#8a5a00", "#4f7a8a", "#777777"];

/** Graduations « rondes » entre a et b (environ n). */
export function graduer(a: number, b: number, n = 5): number[] {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a === b) return [a];
  const brut = (b - a) / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= brut) ?? brut;
  const out: number[] = [];
  for (let v = Math.ceil(a / pas) * pas; v <= b + pas * 1e-9; v += pas) out.push(Number(v.toPrecision(12)));
  return out;
}

export const formaterNombre = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(4))));

/** Ce que l'utilisateur regarde : voies masquées (par nom) et plage d'abscisses zoomée. */
export interface Vue {
  masquees: string[];
  plage: [number, number] | null;
}

export const VUE_ENTIERE: Vue = { masquees: [], plage: null };

/** Cadre d'un panneau : traces restreintes à la plage, bornes des axes (5 % de marge en y). */
export function cadrer(p: Panneau, vue: Vue): { traces: Trace[]; x0: number; x1: number; y0: number; y1: number } {
  const masquees = new Set(vue.masquees);
  const dans = (x: number) => !vue.plage || (x >= vue.plage[0] && x <= vue.plage[1]);
  const traces = p.traces.map((t) => {
    const i = t.x.map((x, j) => (dans(x) ? j : -1)).filter((j) => j >= 0);
    return { ...t, x: i.map((j) => t.x[j]!), y: i.map((j) => t.y[j]!) };
  });
  const visibles = traces.filter((t) => !masquees.has(t.nom) && t.x.length);
  const toutes = visibles.length ? visibles : traces;
  const xs = toutes.flatMap((t) => t.x);
  const ys = toutes.flatMap((t) => t.y).filter(Number.isFinite);
  const [x0, x1] = vue.plage ?? [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const pad = (y1 - y0) * 0.05;
  return { traces, x0, x1, y0: y0 - pad, y1: y1 + pad };
}

const POLICE = "font-family=\"'Segoe UI', Arial, sans-serif\"";
const r1 = (v: number) => String(Math.round(v * 10) / 10);

export interface OptionsSvg {
  largeur?: number;
  /** Hauteur de la zone tracée de chaque panneau. */
  hauteur?: number;
  titre?: string;
  xLibelle: string;
  vue?: Vue;
}

/** Les panneaux empilés en un SVG autonome (styles en ligne, fond blanc). Déterministe. */
export function courbesSvg(panneaux: Panneau[], o: OptionsSvg): string {
  const L = o.largeur ?? 900;
  const H = o.hauteur ?? 190;
  const vue = o.vue ?? VUE_ENTIERE;
  const masquees = new Set(vue.masquees);
  const M = { g: 64, d: 14, h: 30, b: 24 };
  const marge = 12;
  const hTitre = o.titre ? 28 : 0;
  const hauteurTotale = marge * 2 + hTitre + panneaux.length * H;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L + marge * 2}" height="${hauteurTotale}" viewBox="0 0 ${L + marge * 2} ${hauteurTotale}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ];
  if (o.titre) out.push(`<text x="${marge}" y="${marge + 17}" ${POLICE} font-size="15" font-weight="600" fill="#1d1d1b">${echapperXml(o.titre)}</text>`);
  panneaux.forEach((p, k) => {
    const oy = marge + hTitre + k * H;
    const ox = marge;
    const c = cadrer(p, vue);
    const W = L - M.g - M.d;
    const px = (v: number) => ox + M.g + ((v - c.x0) / (c.x1 - c.x0 || 1)) * W;
    const py = (v: number) => oy + M.h + (1 - (v - c.y0) / (c.y1 - c.y0)) * (H - M.h - M.b);
    // En-tête : titre du panneau et légende des voies affichées.
    let xl = ox + M.g;
    out.push(`<text x="${xl}" y="${oy + 16}" ${POLICE} font-size="12" font-weight="600" fill="#1d1d1b">${echapperXml(`${p.titre} (${p.unite})`)}</text>`);
    xl += 12 + (p.titre.length + p.unite.length + 3) * 7;
    p.traces.forEach((t, i) => {
      if (masquees.has(t.nom)) return;
      out.push(`<rect x="${r1(xl)}" y="${oy + 8}" width="14" height="3" fill="${COULEURS[i % COULEURS.length]}"/>`);
      out.push(`<text x="${r1(xl + 18)}" y="${oy + 14}" ${POLICE} font-size="11" fill="#444444">${echapperXml(t.nom)}</text>`);
      xl += 30 + t.nom.length * 6.2;
    });
    for (const v of graduer(c.y0, c.y1, 4)) {
      out.push(`<line x1="${ox + M.g}" x2="${ox + L - M.d}" y1="${r1(py(v))}" y2="${r1(py(v))}" stroke="#e4e4e4" stroke-width="1"/>`);
      out.push(`<text x="${ox + M.g - 6}" y="${r1(py(v) + 4)}" text-anchor="end" ${POLICE} font-size="10" fill="#555555">${formaterNombre(v)}</text>`);
    }
    for (const v of graduer(c.x0, c.x1, 8)) out.push(`<text x="${r1(px(v))}" y="${oy + H - 8}" text-anchor="middle" ${POLICE} font-size="10" fill="#555555">${formaterNombre(v)}</text>`);
    out.push(`<text x="${ox + L - M.d}" y="${oy + H - 8}" text-anchor="end" ${POLICE} font-size="10" fill="#555555">${echapperXml(o.xLibelle)}</text>`);
    c.traces.forEach((t, i) => {
      if (masquees.has(t.nom)) return;
      const pts = t.x.map((x, j) => (Number.isFinite(t.y[j]!) ? `${px(x).toFixed(1)},${py(t.y[j]!).toFixed(1)}` : "")).filter(Boolean).join(" ");
      if (pts) out.push(`<polyline fill="none" stroke="${COULEURS[i % COULEURS.length]}" stroke-width="1.2" points="${pts}"/>`);
    });
  });
  out.push("</svg>");
  return out.join("\n") + "\n";
}
