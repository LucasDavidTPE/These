/** Formes libres (SPEC §6) : ligne, polyligne, cercle, courbe de Bézier (+ rectangle, S4). */
import { boxAnchors, segmentAnchors, type ComponentDef } from "../component";
import type { Primitive, Seg, StrokeRole } from "../geometry";
import type { ParamSpec } from "../params";
import type { Pt } from "../types";
import { FILL_PARAM, LENGTH_PARAM, fillOf } from "./common";


const STROKE: ParamSpec = {
  kind: "enum",
  label: "Trait",
  default: "trait",
  options: [
    { value: "trait fin", label: "Fin" },
    { value: "trait", label: "Normal" },
    { value: "trait epais", label: "Épais" },
  ],
};
const DASH: ParamSpec = { kind: "boolean", label: "Pointillés", default: false };
const HEAD: ParamSpec = {
  kind: "enum",
  label: "Flèche",
  default: "aucune",
  options: [
    { value: "aucune", label: "Aucune" },
    { value: "end", label: "À la fin" },
    { value: "both", label: "Aux deux bouts" },
  ],
};

/** Pointe(s) de flèche au bout d'un tracé, tangentes à la dernière direction. */
function heads(head: unknown, a: Pt, b: Pt, first: Pt, second: Pt): Primitive[] {
  const out: Primitive[] = [];
  const tiny = (from: Pt, to: Pt): Primitive => {
    const L = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const t = Math.min(1, 0.5 / L);
    return { kind: "arrow", from: [to[0] - (to[0] - from[0]) * t, to[1] - (to[1] - from[1]) * t], to, stroke: "trait", head: "end" };
  };
  if (head === "end" || head === "both") out.push(tiny(a, b));
  if (head === "both") out.push(tiny(second, first));
  return out;
}

export const line: ComponentDef = {
  type: "line",
  label: "Ligne",
  category: "libre",
  placement: "segment",
  params: { length: { ...LENGTH_PARAM, default: 20 }, stroke: STROKE, dashed: DASH },
  geometry: (p, { length }) => [
    { kind: "path", segs: [{ op: "M", p: [0, 0] }, { op: "L", p: [length, 0] }], stroke: p.stroke as StrokeRole, fill: "none", dash: !!p.dashed },
  ],
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (p, { length }) => `${Math.round(length * 100) / 100} mm${p.dashed ? ", pointillés" : ""}`,
};

export const polylineShape: ComponentDef = {
  type: "polyline",
  label: "Polyligne",
  category: "libre",
  placement: "point",
  params: {
    points: { kind: "points", label: "Points (relatifs à la position)", default: [[0, 0], [10, -5], [20, 0]], minItems: 2, unit: "mm" },
    closed: { kind: "boolean", label: "Fermée", default: false },
    fill: FILL_PARAM,
    stroke: STROKE,
    dashed: DASH,
    head: HEAD,
  },
  geometry(p) {
    const pts = p.points as Pt[];
    const segs: Seg[] = pts.map((pt, i) => (i === 0 ? { op: "M", p: pt } : { op: "L", p: pt }));
    if (p.closed) segs.push({ op: "Z" });
    const out: Primitive[] = [{ kind: "path", segs, stroke: p.stroke as StrokeRole, fill: p.closed ? fillOf(p.fill as string) : "none", dash: !!p.dashed }];
    if (!p.closed) out.push(...heads(p.head, pts.at(-2)!, pts.at(-1)!, pts[0]!, pts[1]!));
    return out;
  },
  anchors(p) {
    const pts = p.points as Pt[];
    const out: Record<string, Pt> = { start: pts[0]!, end: pts.at(-1)! };
    pts.forEach((pt, i) => (out[`point[${i}]`] = pt));
    return out;
  },
  summary: (p) => `${(p.points as Pt[]).length} points${p.closed ? ", fermée" : ""}`,
};

export const circleShape: ComponentDef = {
  type: "circle",
  label: "Cercle",
  category: "libre",
  placement: "point",
  params: {
    radius: { kind: "number", label: "Rayon", default: 5, min: 0.1, max: 1000, unit: "mm" },
    fill: FILL_PARAM,
    stroke: STROKE,
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const r = p.radius as number;
    const fill = fillOf(p.fill as string);
    const out: Primitive[] = [{ kind: "circle", c: [0, 0], r, stroke: p.stroke as StrokeRole, fill }];
    if (p.label) out.push({ kind: "text", at: [0, 0], text: p.label as string, anchor: "center", halo: fill.startsWith("hachure") });
    return out;
  },
  anchors: (p) => boxAnchors(-(p.radius as number), -(p.radius as number), 2 * (p.radius as number), 2 * (p.radius as number)),
  summary: (p) => `rayon ${p.radius} mm`,
};

/** Courbe de Bézier entre deux points : `bend` décale les points de contrôle à gauche du tracé. */
export const bezier: ComponentDef = {
  type: "bezier",
  label: "Courbe de Bézier",
  category: "libre",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 30 },
    bend: { kind: "number", label: "Courbure (décalage des points de contrôle)", default: 8, min: -500, max: 500, unit: "mm" },
    asymmetry: { kind: "number", label: "Dissymétrie (−1 à 1)", default: 0, min: -1, max: 1 },
    stroke: STROKE,
    dashed: DASH,
    head: HEAD,
  },
  geometry(p, { length: L }) {
    const b = p.bend as number;
    const a = p.asymmetry as number;
    const c1: Pt = [L / 3, -b * (1 + a)];
    const c2: Pt = [(2 * L) / 3, -b * (1 - a)];
    const out: Primitive[] = [{ kind: "path", segs: [{ op: "M", p: [0, 0] }, { op: "C", c1, c2, p: [L, 0] }], stroke: p.stroke as StrokeRole, fill: "none", dash: !!p.dashed }];
    out.push(...heads(p.head, c2, [L, 0], [0, 0], c1));
    return out;
  },
  anchors: (p, { length }) => ({ ...segmentAnchors(length), top: [length / 2, -(p.bend as number) * 0.75] }),
  summary: (p, { length }) => `${Math.round(length * 100) / 100} mm, courbure ${p.bend} mm`,
};
