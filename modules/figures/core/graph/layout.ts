/**
 * Mise en page d'un graphe en primitives (mm, y vers le bas), rendues en SVG par le même
 * code que les schémas. Les bornes et graduations viennent de ticks.ts, partagées avec
 * l'export pgfplots.
 */
import { measureLabel } from "../math/tex";
import type { Primitive } from "../schema/geometry";
import type { Theme } from "../schema/theme";
import type { Pt } from "../schema/types";
import { fitCorner, fitLabel, fitPoints, fitSample, fitSeries, type FitResult } from "./fit";
import { bordCellule, bornesCarte, couleursCarte, isoligne, palier, placeEtiquette } from "./carte";
import type { GraphDoc, Series } from "./model";
import { graphTheme } from "./style";
import { formatTick, linearScale, logScale, project, type AxisScale } from "./ticks";

export interface GraphLayout {
  /** Boîte des axes (mm). */
  box: { x: number; y: number; w: number; h: number };
  xs: AxisScale;
  ys: AxisScale;
  primitives: Primitive[];
}

/** Marges autour de la boîte des axes (mm) : graduations et titres. */
export const MARGINS = { left: 16, right: 3, top: 3, bottom: 12 };

/** Marges d'un graphe : elles suivent la taille du texte de son style. */
export function marginsOf(doc: GraphDoc): typeof MARGINS {
  const k = doc.style?.fontScale ?? 1;
  // une carte a sa barre de couleurs à droite : barre, graduations, titre
  const right = doc.carte ? MARGINS.right + BARRE.ecart + BARRE.largeur + 11 * k + (doc.carte.legende ? 5 * k : 0) : MARGINS.right;
  return { left: MARGINS.left * k, right, top: MARGINS.top, bottom: MARGINS.bottom * k };
}

/** Barre de couleurs d'une carte (mm). */
export const BARRE = { ecart: 3, largeur: 3.5 };

function dashOf(d: "dashed" | "dotted" | null): boolean | "dotted" | undefined {
  return d === "dotted" ? "dotted" : d === "dashed" ? true : undefined;
}

function extent(values: number[]): [number, number] {
  const v = values.filter(Number.isFinite);
  return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
}

export function scales(doc: GraphDoc): { xs: AxisScale; ys: AxisScale } {
  // la carte compte dans l'étendue des axes (bords de ses cellules)
  const cx = doc.carte ? [doc.carte.x[0]!, doc.carte.x.at(-1)!] : [];
  const cy = doc.carte ? [doc.carte.y[0]!, doc.carte.y.at(-1)!] : [];
  // les repères (valeur de référence…) restent visibles : ils comptent dans l'étendue
  const rx = (doc.reperes ?? []).filter((r) => r.axe === "x").map((r) => r.valeur);
  const ry = (doc.reperes ?? []).filter((r) => r.axe === "y").map((r) => r.valeur);
  const [x0, x1] = extent([...doc.series.flatMap((s) => s.x), ...cx, ...(!doc.x.log && (doc.series.length || doc.carte) ? rx : [])]);
  let [y0, y1] = extent([...doc.series.flatMap((s) => s.y), ...cy, ...(!doc.y.log && (doc.series.length || doc.carte) ? ry : [])]);
  // Les barres partent de 0 : on l'inclut en échelle linéaire.
  if (!doc.y.log && doc.series.some((s) => s.type === "bar")) {
    y0 = Math.min(y0, 0);
    y1 = Math.max(y1, 0);
  }
  const hasBars = doc.series.some((s) => s.type === "bar");
  const xs = doc.x.log ? logScale(x0, x1, doc.x) : hasBars ? barScale(doc) : linearScale(x0, x1, doc.x);
  const ys = doc.y.log ? logScale(y0, y1, doc.y) : linearScale(y0, y1, doc.y, 5);
  return { xs, ys };
}

/**
 * Axe des x d'un diagramme en barres : graduations sur les catégories (valeurs de x
 * distinctes) et une demi-catégorie de marge de chaque côté, pour que les barres tiennent.
 */
export function barScale(doc: GraphDoc): AxisScale {
  const xsAll = [...new Set(doc.series.flatMap((s) => s.x))].sort((a, b) => a - b);
  const gaps = xsAll.slice(1).map((v, i) => v - xsAll[i]!);
  const gap = gaps.length ? Math.min(...gaps) : 1;
  const min = doc.x.min ?? xsAll[0]! - gap / 2;
  const max = doc.x.max ?? xsAll.at(-1)! + gap / 2;
  if (xsAll.length > 25) return linearScale(min, max, { min, max });
  const dec = Math.max(0, ...xsAll.map((v) => (String(v).split(".")[1] ?? "").length));
  const ticks = xsAll.filter((v) => v >= min && v <= max);
  const cat = doc.x.categories;
  const label = (t: number) => (cat && Number.isInteger(t) && cat[t - 1] !== undefined ? cat[t - 1]! : formatTick(t, Math.min(dec, 6), ticks.some((v) => Math.abs(v) >= 10000)));
  return { min, max, ticks, labels: ticks.map(label), log: false };
}

/**
 * Hauteur d'un graphe à échelles égales (1 unité en x = 1 unité en y) pour sa largeur : la boîte des axes
 * prend les proportions des bornes des axes (bornée à 20…1000 mm).
 */
export function hauteurEgale(doc: GraphDoc): number {
  const M = marginsOf(doc);
  const { xs, ys } = scales(doc);
  if (xs.log || ys.log || !(xs.max > xs.min) || !(ys.max > ys.min)) return doc.height;
  const w = doc.width - M.left - M.right;
  const h = (w * (ys.max - ys.min)) / (xs.max - xs.min);
  return Math.round(Math.min(1000, Math.max(20, h + M.top + M.bottom)) * 10) / 10;
}

/** Découpe d'un segment par la boîte (Liang-Barsky) ; null s'il est dehors. */
export function clipSegment(a: Pt, b: Pt, box: { x: number; y: number; w: number; h: number }): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] - box.x],
    [dx, box.x + box.w - a[0]],
    [-dy, a[1] - box.y],
    [dy, box.y + box.h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function mark(kind: string, c: Pt, size: number, color: string, filled = false): Primitive[] {
  const h = size / 2;
  const [x, y] = c;
  const fond = filled ? color : "white";
  const path = (pts: Pt[], closed: boolean): Primitive => ({
    kind: "path",
    segs: [...pts.map((p, i) => (i === 0 ? { op: "M" as const, p } : { op: "L" as const, p })), ...(closed ? [{ op: "Z" as const }] : [])],
    stroke: "trait fin",
    fill: "none",
    color,
    fillColor: closed ? fond : undefined,
  });
  switch (kind) {
    case "o":
      return [{ kind: "circle", c, r: h, stroke: "trait fin", fill: "none", color, fillColor: fond }];
    case "square":
      return [path([[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]], true)];
    case "triangle":
      return [path([[x, y - h * 1.15], [x + h, y + h * 0.6], [x - h, y + h * 0.6]], true)];
    case "diamond":
      return [path([[x, y - h * 1.2], [x + h, y], [x, y + h * 1.2], [x - h, y]], true)];
    case "x":
      return [path([[x - h, y - h], [x + h, y + h]], false), path([[x - h, y + h], [x + h, y - h]], false)];
    default:
      return [path([[x - h, y], [x + h, y]], false), path([[x, y - h], [x, y + h]], false)];
  }
}

export function graphLayout(doc: GraphDoc): GraphLayout {
  const theme: Theme = graphTheme(doc);
  const M = marginsOf(doc);
  const box = { x: M.left, y: M.top, w: doc.width - M.left - M.right, h: doc.height - M.top - M.bottom };
  const { xs, ys } = scales(doc);
  const X = (v: number) => box.x + (doc.x.inverse ? 1 - project(xs, v) : project(xs, v)) * box.w;
  const Y = (v: number) => box.y + (doc.y.inverse ? project(ys, v) : 1 - project(ys, v)) * box.h;
  const out: Primitive[] = [];
  const line = (pts: Pt[], extra: Partial<Extract<Primitive, { kind: "path" }>> = {}): Primitive => ({
    kind: "path",
    segs: pts.map((p, i) => (i === 0 ? { op: "M", p } : { op: "L", p })),
    stroke: "trait fin",
    fill: "none",
    ...extra,
  });

  // Carte en couleurs (sous la grille et les courbes).
  if (doc.carte) out.push(...carte(doc, X, Y, box));

  // Grille.
  if (doc.grid) {
    for (const t of xs.ticks) out.push(line([[X(t), box.y], [X(t), box.y + box.h]], { color: theme.graph.gridSvg }));
    for (const t of ys.ticks) out.push(line([[box.x, Y(t)], [box.x + box.w, Y(t)]], { color: theme.graph.gridSvg }));
  }

  // Séries (barres d'abord, sous les courbes).
  const bars = doc.series.map((s, i) => ({ s, i })).filter(({ s }) => s.type === "bar");
  const base = Y(ys.log ? ys.min : Math.min(Math.max(0, ys.min), ys.max));
  bars.forEach(({ s, i }, k) => {
    const st = theme.graph.series[i % theme.graph.series.length]!;
    const shift = (k - (bars.length - 1) / 2) * doc.bar_width;
    s.x.forEach((xv, j) => {
      const cx = X(xv) + shift;
      const top = Y(s.y[j]!);
      out.push({ kind: "rect", x: cx - doc.bar_width / 2, y: Math.min(top, base), w: doc.bar_width, h: Math.abs(base - top), stroke: "trait fin", fill: "none", fillColor: st.barSvg });
    });
  });
  doc.series.forEach((s, i) => {
    if (s.type === "bar") return;
    const st = theme.graph.series[i % theme.graph.series.length]!;
    const pts: Pt[] = s.x.map((xv, j) => [X(xv), Y(s.y[j]!)]);
    if (s.type === "line" || s.type === "linepoints") {
      for (let j = 0; j + 1 < pts.length; j++) {
        const seg = clipSegment(pts[j]!, pts[j + 1]!, box);
        if (seg) out.push(line(seg, { stroke: "trait", color: st.svg, dash: dashOf(st.dash) }));
      }
    }
    if ((s.type === "points" || s.type === "linepoints") && !(st.noMark && s.type === "linepoints")) {
      for (const p of pts) {
        if (p[0] >= box.x - 1e-6 && p[0] <= box.x + box.w + 1e-6 && p[1] >= box.y - 1e-6 && p[1] <= box.y + box.h + 1e-6) {
          out.push(...mark(st.mark, p, theme.graph.markSize, st.svg, st.filled));
        }
      }
    }
  });

  // Isolignes de la carte (par-dessus les couleurs et les courbes), valeur écrite au milieu de la plus longue.
  if (doc.carte?.isolignes?.length) {
    for (const niveau of doc.carte.isolignes) {
      const lignes = isoligne(doc.carte, niveau);
      for (const l of lignes) {
        const pts: Pt[] = l.map(([a, b]) => [X(a), Y(b)]);
        for (let j = 0; j + 1 < pts.length; j++) {
          const seg = clipSegment(pts[j]!, pts[j + 1]!, box);
          if (seg) out.push(line(seg, { color: "#000000" }));
        }
      }
      const at = placeEtiquette(lignes, ([a, b]) => [X(a), Y(b)]);
      if (at && X(at[0]) >= box.x && X(at[0]) <= box.x + box.w && Y(at[1]) >= box.y && Y(at[1]) <= box.y + box.h) {
        out.push({ kind: "text", at: [X(at[0]), Y(at[1])], text: formatTick(niveau, decimales(niveau), false), anchor: "center", halo: true, size: "petit" });
      }
    }
  }

  // Repères (lignes) et annotations (points commentés).
  out.push(...reperes(doc, theme, box, X, Y, xs, ys));

  // Régressions : courbe en tirets de la couleur de la série.
  const fits = graphFits(doc, xs, ys);
  for (const f of fits) {
    const st = theme.graph.series[f.i % theme.graph.series.length]!;
    const pts: Pt[] = f.points.map(([xv, yv]) => [X(xv), Y(yv)]);
    for (let j = 0; j + 1 < pts.length; j++) {
      const seg = clipSegment(pts[j]!, pts[j + 1]!, box);
      if (seg) out.push(line(seg, { stroke: "trait", color: st.svg, dash: st.dash === "dashed" ? "dotted" : true }));
    }
  }

  // Cadre, graduations (intérieures, en bas et à gauche) et libellés.
  if (doc.style?.frame === "axes") {
    out.push(line([[box.x, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]));
  } else out.push({ kind: "rect", x: box.x, y: box.y, w: box.w, h: box.h, stroke: "trait fin", fill: "none" });
  const tick = 1;
  xs.ticks.forEach((t, i) => {
    out.push(line([[X(t), box.y + box.h], [X(t), box.y + box.h - tick]]));
    out.push({ kind: "text", at: [X(t), box.y + box.h + 1], text: xs.labels[i]!, anchor: "north", halo: false });
  });
  // Petites graduations des axes logarithmiques (2 à 9 × 10^k), comme pgfplots.
  const minor = (s: AxisScale) => {
    if (!s.log) return [];
    const vals: number[] = [];
    for (let k = Math.floor(Math.log10(s.min)); k < Math.ceil(Math.log10(s.max)); k++) {
      for (let m = 2; m <= 9; m++) {
        const v = m * 10 ** k;
        if (v > s.min && v < s.max) vals.push(v);
      }
    }
    return vals;
  };
  for (const v of minor(xs)) out.push(line([[X(v), box.y + box.h], [X(v), box.y + box.h - tick * 0.6]]));
  for (const v of minor(ys)) out.push(line([[box.x, Y(v)], [box.x + tick * 0.6, Y(v)]]));
  ys.ticks.forEach((t, i) => {
    out.push(line([[box.x, Y(t)], [box.x + tick, Y(t)]]));
    out.push({ kind: "text", at: [box.x - 1, Y(t)], text: ys.labels[i]!, anchor: "east", halo: false });
  });
  if (doc.x.label) out.push({ kind: "text", at: [box.x + box.w / 2, doc.height - 1], text: doc.x.label, anchor: "south", halo: false });
  if (doc.y.label) out.push({ kind: "text", at: [1, box.y + box.h / 2], text: doc.y.label, anchor: "north", halo: false, rotate: 90 });

  // Légende (dans un coin de la boîte).
  const entries = doc.series.map((s, i) => ({ s, i })).filter(({ s }) => s.legend);
  if (doc.legend !== "none" && entries.length > 0) out.push(...legend(doc, theme, box, entries));
  const labels = fits.filter((f) => f.label);
  if (labels.length > 0) out.push(...fitBox(doc, theme, box, labels));
  return { box, xs, ys, primitives: out };
}

/** Décimales utiles d'une valeur saisie (0,25 → 2), pour l'écrire telle quelle. */
export function decimales(v: number): number {
  return Math.min(6, (String(Number(v.toPrecision(10))).split(".")[1] ?? "").length);
}

const dansAxe = (s: AxisScale, v: number) => Number.isFinite(v) && v >= Math.min(s.min, s.max) && v <= Math.max(s.min, s.max) && (!s.log || v > 0);

/** Lignes de repère (étiquette au bout, côté haut / droite) et annotations (point + texte dans un coin). */
function reperes(doc: GraphDoc, theme: Theme, box: GraphLayout["box"], X: (v: number) => number, Y: (v: number) => number, xs: AxisScale, ys: AxisScale): Primitive[] {
  const out: Primitive[] = [];
  for (const r of doc.reperes ?? []) {
    if (!dansAxe(r.axe === "x" ? xs : ys, r.valeur)) continue;
    const dash = r.trait === "dotted" ? ("dotted" as const) : r.trait === "dashed" ? true : undefined;
    if (r.axe === "y") {
      const y = Y(r.valeur);
      out.push({ kind: "path", segs: [{ op: "M", p: [box.x, y] }, { op: "L", p: [box.x + box.w, y] }], stroke: "trait fin", fill: "none", color: theme.ink, dash });
      if (r.texte) out.push({ kind: "text", at: [box.x + box.w - 1, y - 0.6], text: r.texte, anchor: "south east", halo: true, size: "petit" });
    } else {
      const x = X(r.valeur);
      out.push({ kind: "path", segs: [{ op: "M", p: [x, box.y] }, { op: "L", p: [x, box.y + box.h] }], stroke: "trait fin", fill: "none", color: theme.ink, dash });
      if (r.texte) out.push({ kind: "text", at: [x + 0.8, box.y + 1], text: r.texte, anchor: "north west", halo: true, size: "petit" });
    }
  }
  for (const a of doc.annotations ?? []) {
    if (!dansAxe(xs, a.x) || !dansAxe(ys, a.y)) continue;
    const p: Pt = [X(a.x), Y(a.y)];
    out.push({ kind: "circle", c: p, r: 0.6, stroke: null, fill: "none", fillColor: theme.ink });
    if (!a.texte) continue;
    const est = a.position.includes("east");
    const nord = a.position.includes("north");
    const anchor = `${nord ? "south" : "north"} ${est ? "west" : "east"}` as const;
    out.push({ kind: "text", at: [p[0] + (est ? 1.2 : -1.2), p[1] + (nord ? -1.2 : 1.2)], text: a.texte, anchor, halo: true, size: "petit" });
  }
  return out;
}

/**
 * Cellules de la carte (plages contiguës de même palier fusionnées, coupées à la boîte des axes) et barre
 * de couleurs graduée à droite de la boîte.
 */
function carte(doc: GraphDoc, X: (v: number) => number, Y: (v: number) => number, box: GraphLayout["box"]): Primitive[] {
  const c = doc.carte!;
  const out: Primitive[] = [];
  const bornes = bornesCarte(c);
  const couleurs = couleursCarte(c);
  const clipX = (v: number) => Math.max(box.x, Math.min(box.x + box.w, v));
  const clipY = (v: number) => Math.max(box.y, Math.min(box.y + box.h, v));
  c.y.forEach((_, j) => {
    const [ya, yb] = bordCellule(c.y, j);
    const y0 = clipY(Math.min(Y(ya), Y(yb)));
    const y1 = clipY(Math.max(Y(ya), Y(yb)));
    if (y1 - y0 <= 1e-9) return;
    let i = 0;
    while (i < c.x.length) {
      const v = c.v[j]![i];
      if (v === null || v === undefined) {
        i++;
        continue;
      }
      const k = palier(c, bornes, v);
      let fin = i;
      while (fin + 1 < c.x.length && c.v[j]![fin + 1] !== null && palier(c, bornes, c.v[j]![fin + 1]!) === k) fin++;
      const [xa, xb] = [X(bordCellule(c.x, i)[0]), X(bordCellule(c.x, fin)[1])];
      const x0 = clipX(Math.min(xa, xb));
      const x1 = clipX(Math.max(xa, xb));
      // léger recouvrement : pas de liseré blanc entre cellules
      if (x1 - x0 > 1e-9) out.push({ kind: "rect", x: x0, y: y0, w: x1 - x0 + 0.05, h: y1 - y0 + 0.05, stroke: null, fill: "none", fillColor: couleurs[k] });
      i = fin + 1;
    }
  });
  // barre de couleurs
  const bx = box.x + box.w + BARRE.ecart;
  const h = box.h / c.niveaux;
  couleurs.forEach((col, k) => out.push({ kind: "rect", x: bx, y: box.y + box.h - (k + 1) * h, w: BARRE.largeur, h: h + 0.05, stroke: null, fill: "none", fillColor: col }));
  out.push({ kind: "rect", x: bx, y: box.y, w: BARRE.largeur, h: box.h, stroke: "trait fin", fill: "none" });
  const s = linearScale(bornes[0], bornes[1], { min: bornes[0], max: bornes[1] }, 5);
  s.ticks.forEach((t, i) => {
    const y = box.y + box.h - ((t - bornes[0]) / (bornes[1] - bornes[0] || 1)) * box.h;
    out.push({ kind: "path", segs: [{ op: "M", p: [bx + BARRE.largeur, y] }, { op: "L", p: [bx + BARRE.largeur + 0.8, y] }], stroke: "trait fin", fill: "none" });
    out.push({ kind: "text", at: [bx + BARRE.largeur + 1.2, y], text: s.labels[i]!, anchor: "west", halo: false });
  });
  if (c.legende) out.push({ kind: "text", at: [doc.width - 0.5, box.y + box.h / 2], text: c.legende, anchor: "south", halo: false, rotate: 90 });
  return out;
}

export interface GraphFit {
  /** Indice de la série. */
  i: number;
  result: FitResult;
  /** Points de la courbe, en données. */
  points: [number, number][];
  /** Équation à écrire sur la figure (null si masquée). */
  label: string | null;
}

/** Régressions des séries qui en demandent une (hors barres), pour le SVG et pgfplots. */
export function graphFits(doc: GraphDoc, xs: AxisScale, ys: AxisScale): GraphFit[] {
  const out: GraphFit[] = [];
  doc.series.forEach((s, i) => {
    if (!s.fit || s.type === "bar") return;
    const pts = fitSample(s.x, s.y, s.fit);
    const result = fitSeries(pts.x, pts.y, s.fit.kind, s.fit.degre);
    if (!result) return;
    // Courbe sur la plage des points retenus, ou prolongée sur toute la série.
    const etendue = s.fit.prolonger ? s.x : pts.x;
    out.push({ i, result, points: fitPoints(result, etendue, xs.log, ys.log), label: s.fit.label ? fitLabel(result) : null });
  });
  return out;
}

/** Hauteur d'une ligne de légende (mm). */
export function legendRow(theme: Theme): number {
  return Math.max(theme.text.sizeMm * 1.4, 3.6);
}

/** Encadré des équations : un échantillon du trait de la régression puis l'équation. */
/**
 * Lignes de l'encadré des équations : « équation   R² = … » sur une ligne, ou, quand c'est
 * trop large pour le graphe (polynôme de degré élevé), R² sur la ligne suivante.
 * `trait` : la ligne porte l'échantillon du trait de la régression.
 */
export function fitRows(fits: GraphFit[], theme: Theme, boxW: number): { i: number; text: string; trait: boolean }[] {
  const size = theme.text.sizeMm;
  const large = Math.max(...fits.map((f) => measureLabel(f.label!, size).w));
  if (large <= boxW - 3 - (1.5 + 6 + 1.5 + 1.5)) return fits.map((f) => ({ i: f.i, text: f.label!, trait: true }));
  return fits.flatMap((f) => {
    const [eq, r2] = f.label!.slice(1, -1).split(" \\quad ");
    return r2 ? [{ i: f.i, text: `$${eq}$`, trait: true }, { i: f.i, text: `$${r2}$`, trait: false }] : [{ i: f.i, text: f.label!, trait: true }];
  });
}

function fitBox(doc: GraphDoc, theme: Theme, box: GraphLayout["box"], fits: GraphFit[]): Primitive[] {
  const size = theme.text.sizeMm;
  const rowH = legendRow(theme) * 1.15;
  const sample = 6;
  const rows = fitRows(fits, theme, box.w);
  const textW = Math.max(...rows.map((r) => measureLabel(r.text, size).w));
  const w = 1.5 + sample + 1.5 + textW + 1.5;
  const h = rowH * rows.length + 1;
  const pad = 1.5;
  const corner = fitCorner(doc.fit_pos, doc.legend);
  // Même coin que la légende : on se place juste en dessous (ou au-dessus).
  const legendH = corner === doc.legend ? legendRow(theme) * doc.series.filter((s) => s.legend).length + 1 + pad : 0;
  const x = corner.includes("east") ? box.x + box.w - w - pad : box.x + pad;
  const y = corner.includes("south") ? box.y + box.h - h - pad - legendH : box.y + pad + legendH;
  const out: Primitive[] = [{ kind: "rect", x, y, w, h, stroke: "trait fin", fill: "none", fillColor: "white" }];
  rows.forEach((r, k) => {
    const st = theme.graph.series[r.i % theme.graph.series.length]!;
    const cy = y + 0.5 + rowH * (k + 0.5);
    if (r.trait) out.push({ kind: "path", segs: [{ op: "M", p: [x + 1.5, cy] }, { op: "L", p: [x + 1.5 + sample, cy] }], stroke: "trait", fill: "none", color: st.svg, dash: st.dash === "dashed" ? "dotted" : true });
    out.push({ kind: "text", at: [x + 3 + sample, cy], text: r.text, anchor: "west", halo: false });
  });
  return out;
}

function legend(doc: GraphDoc, theme: Theme, box: GraphLayout["box"], entries: { s: Series; i: number }[]): Primitive[] {
  const size = theme.text.sizeMm;
  const rowH = legendRow(theme);
  const sample = 6;
  const textW = Math.max(...entries.map(({ s }) => measureLabel(s.name, size).w));
  const w = 1.5 + sample + 1.5 + textW + 1.5;
  const h = rowH * entries.length + 1;
  const pad = 1.5;
  const x = doc.legend.includes("east") ? box.x + box.w - w - pad : box.x + pad;
  const y = doc.legend.includes("south") ? box.y + box.h - h - pad : box.y + pad;
  const out: Primitive[] = [{ kind: "rect", x, y, w, h, stroke: "trait fin", fill: "none", fillColor: "white" }];
  entries.forEach(({ s, i }, k) => {
    const st = theme.graph.series[i % theme.graph.series.length]!;
    const cy = y + 0.5 + rowH * (k + 0.5);
    const a: Pt = [x + 1.5, cy];
    const b: Pt = [x + 1.5 + sample, cy];
    if (s.type === "bar") out.push({ kind: "rect", x: a[0] + 1.5, y: cy - 1.2, w: 3, h: 2.4, stroke: "trait fin", fill: "none", fillColor: st.barSvg });
    else {
      if (s.type !== "points") out.push({ kind: "path", segs: [{ op: "M", p: a }, { op: "L", p: b }], stroke: "trait", fill: "none", color: st.svg, dash: dashOf(st.dash) });
      if (s.type !== "line" && !(st.noMark && s.type === "linepoints")) out.push(...mark(st.mark, [(a[0] + b[0]) / 2, cy], theme.graph.markSize, st.svg, st.filled));
    }
    out.push({ kind: "text", at: [b[0] + 1.5, cy], text: s.name, anchor: "west", halo: false });
  });
  return out;
}
