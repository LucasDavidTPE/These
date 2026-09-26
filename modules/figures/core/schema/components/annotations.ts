/**
 * Annotations (SPEC §6) : repères 2D et 3D, cotes linéaire et angulaire (qui suivent leurs
 * ancres), flèche, accolade, texte (maths `$…$`), point de mesure.
 */
import { boxAnchors, segmentAnchors, type ComponentDef } from "../component";
import { polyline, type Primitive, type Seg, type TextSize } from "../geometry";
import type { ParamSpec } from "../params";
import type { Pt } from "../types";
import { LENGTH_PARAM } from "./common";

type P = Record<string, unknown>;
const num = (p: P, k: string) => p[k] as number;
const str = (p: P, k: string) => (p[k] as string | undefined) ?? "";
const r2 = (v: number) => Math.round(v * 100) / 100;

const DIRS: Record<string, Pt> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
const DIR_PARAM = (def: string): ParamSpec => ({
  kind: "enum",
  label: "Sens",
  default: def,
  options: [
    { value: "right", label: "Vers la droite" },
    { value: "left", label: "Vers la gauche" },
    { value: "up", label: "Vers le haut" },
    { value: "down", label: "Vers le bas" },
  ],
});

const TEXT_SIZE: ParamSpec = {
  kind: "enum",
  label: "Taille du texte",
  default: "normal",
  options: [
    { value: "petit", label: "Petit" },
    { value: "normal", label: "Normal" },
    { value: "grand", label: "Grand" },
  ],
};

function axis(origin: Pt, d: Pt, L: number, label: string): Primitive[] {
  const tip: Pt = [origin[0] + d[0] * L, origin[1] + d[1] * L];
  const out: Primitive[] = [{ kind: "arrow", from: origin, to: tip, stroke: "trait", head: "end" }];
  if (label) out.push({ kind: "text", at: [tip[0] + d[0], tip[1] + d[1]], text: label, anchor: "center", halo: false, away: d });
  return out;
}

// ---------------------------------------------------------------------------
// Repères
// ---------------------------------------------------------------------------

export const axes2d: ComponentDef = {
  type: "axes2d",
  label: "Repère 2D",
  category: "annotation",
  placement: "point",
  params: {
    length: { kind: "number", label: "Longueur des axes", default: 10, min: 1, max: 500, unit: "mm" },
    x: { kind: "group", label: "Premier axe", default: {}, fields: { dir: DIR_PARAM("right"), label: { kind: "string", label: "Étiquette", default: "$x$", math: true } } },
    z: { kind: "group", label: "Second axe", default: {}, fields: { dir: DIR_PARAM("down"), label: { kind: "string", label: "Étiquette", default: "$z$", math: true } } },
    origin_label: { kind: "string", label: "Étiquette de l'origine", default: "", math: true, optional: true },
  },
  geometry(p) {
    const L = num(p, "length");
    const x = p.x as P;
    const z = p.z as P;
    const dx = DIRS[str(x, "dir")]!;
    const dz = DIRS[str(z, "dir")]!;
    const out = [...axis([0, 0], dx, L, str(x, "label")), ...axis([0, 0], dz, L, str(z, "label"))];
    if (str(p, "origin_label")) {
      const away: Pt = [-(dx[0] + dz[0]), -(dx[1] + dz[1])];
      out.push({ kind: "text", at: [away[0], away[1]], text: str(p, "origin_label"), anchor: "center", halo: false, away });
    }
    return out;
  },
  anchors(p) {
    const L = num(p, "length");
    const dx = DIRS[str(p.x as P, "dir")]!;
    const dz = DIRS[str(p.z as P, "dir")]!;
    return { origin: [0, 0], "x.end": [dx[0] * L, dx[1] * L], "z.end": [dz[0] * L, dz[1] * L] };
  },
  summary: (p) => `axes ${str(p.x as P, "label") || "1"} (${str(p.x as P, "dir")}) et ${str(p.z as P, "label") || "2"} (${str(p.z as P, "dir")})`,
};

export const axes3d: ComponentDef = {
  type: "axes3d",
  label: "Repère 3D",
  category: "annotation",
  placement: "point",
  params: {
    length: { kind: "number", label: "Longueur des axes", default: 10, min: 1, max: 500, unit: "mm" },
    oblique_angle: { kind: "number", label: "Angle de l'axe fuyant (°)", default: 35, min: -180, max: 180 },
    oblique_ratio: { kind: "number", label: "Réduction de l'axe fuyant", default: 0.6, min: 0.1, max: 1 },
    x_label: { kind: "string", label: "Axe x (droite)", default: "$x$", math: true },
    y_label: { kind: "string", label: "Axe y (fuyant)", default: "$y$", math: true },
    z_label: { kind: "string", label: "Axe z", default: "$z$", math: true },
    z_dir: DIR_PARAM("down"),
  },
  geometry(p) {
    const L = num(p, "length");
    const a = (num(p, "oblique_angle") * Math.PI) / 180;
    const dy: Pt = [Math.cos(a), -Math.sin(a)];
    return [
      ...axis([0, 0], [1, 0], L, str(p, "x_label")),
      ...axis([0, 0], dy, L * num(p, "oblique_ratio"), str(p, "y_label")),
      ...axis([0, 0], DIRS[str(p, "z_dir")]!, L, str(p, "z_label")),
    ];
  },
  anchors: () => ({ origin: [0, 0] }),
  summary: (p) => `x, y fuyant à ${num(p, "oblique_angle")}° (× ${num(p, "oblique_ratio")}), z ${str(p, "z_dir")}`,
};

// ---------------------------------------------------------------------------
// Cotes
// ---------------------------------------------------------------------------

/**
 * Cote linéaire entre deux ancres (ou points) : lignes d'attache, ligne de cote à double
 * flèche décalée de `offset` à gauche du sens de tracé (négatif : à droite), texte au milieu.
 */
export const dimension: ComponentDef = {
  type: "dimension",
  label: "Cote linéaire",
  category: "annotation",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 20 },
    offset: { kind: "number", label: "Décalage de la ligne de cote", default: 6, min: -500, max: 500, unit: "mm" },
    label: { kind: "string", label: "Texte", default: "", math: true },
    extension: { kind: "boolean", label: "Lignes d'attache", default: true },
  },
  geometry(p, { length: L }) {
    const off = num(p, "offset");
    const s = off >= 0 ? -1 : 1; // côté visuel (y local négatif = gauche)
    const y = s * Math.abs(off);
    const out: Primitive[] = [];
    if (p.extension && Math.abs(off) > 0.5) {
      const gap = 0.8 * s;
      const over = 1.2 * s;
      out.push(polyline([[0, gap], [0, y + over]], "trait fin"), polyline([[L, gap], [L, y + over]], "trait fin"));
    }
    out.push({ kind: "arrow", from: [0, y], to: [L, y], stroke: "trait fin", head: "both" });
    const label = str(p, "label") || `${r2(L).toString().replace(".", ",")}`;
    out.push({ kind: "text", at: [L / 2, y + s * 0.8], text: label, anchor: "center", halo: true, away: [0, s] });
    return out;
  },
  anchors: (p, { length }) => ({ ...segmentAnchors(length), "line.center": [length / 2, -num(p, "offset")] }),
  summary: (p, { length }) => `${str(p, "label") || `${r2(length)} mm`}, décalage ${num(p, "offset")} mm`,
};

/** Arc de cercle en Bézier cubiques (moins de 90° par morceau), angles en degrés, sens trigonométrique visuel. */
export function arcSegs(c: Pt, r: number, a0: number, a1: number): Seg[] {
  const pt = (deg: number): Pt => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] - r * Math.sin((deg * Math.PI) / 180)];
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
  const step = (a1 - a0) / n;
  const k = (4 / 3) * Math.tan((step * Math.PI) / 180 / 4);
  const segs: Seg[] = [{ op: "M", p: pt(a0) }];
  for (let i = 0; i < n; i++) {
    const t0 = ((a0 + i * step) * Math.PI) / 180;
    const t1 = ((a0 + (i + 1) * step) * Math.PI) / 180;
    const p0 = pt(a0 + i * step);
    const p1 = pt(a0 + (i + 1) * step);
    segs.push({
      op: "C",
      c1: [p0[0] - k * r * Math.sin(t0), p0[1] - k * r * Math.cos(t0)],
      c2: [p1[0] + k * r * Math.sin(t1), p1[1] + k * r * Math.cos(t1)],
      p: p1,
    });
  }
  return segs;
}

export const angleDimension: ComponentDef = {
  type: "angle_dimension",
  label: "Cote angulaire",
  category: "annotation",
  placement: "point",
  params: {
    radius: { kind: "number", label: "Rayon", default: 10, min: 1, max: 500, unit: "mm" },
    from_angle: { kind: "number", label: "Angle de départ (°)", default: 0, min: -360, max: 360 },
    to_angle: { kind: "number", label: "Angle d'arrivée (°)", default: 45, min: -360, max: 360 },
    label: { kind: "string", label: "Texte", default: "$\\alpha$", math: true },
    arrows: { kind: "boolean", label: "Flèches", default: true },
  },
  geometry(p) {
    const r = num(p, "radius");
    const a0 = num(p, "from_angle");
    const a1 = num(p, "to_angle");
    const out: Primitive[] = [{ kind: "path", segs: arcSegs([0, 0], r, a0, a1), stroke: "trait fin", fill: "none" }];
    const pt = (deg: number, rr = r): Pt => [rr * Math.cos((deg * Math.PI) / 180), -rr * Math.sin((deg * Math.PI) / 180)];
    if (p.arrows) {
      // Pointe tangente à l'arc à chaque extrémité (segment très court sous la pointe).
      const eps = Math.sign(a1 - a0) * Math.min(4, Math.abs(a1 - a0) / 4);
      out.push({ kind: "arrow", from: pt(a1 - eps), to: pt(a1), stroke: "trait fin", head: "end" });
      out.push({ kind: "arrow", from: pt(a0 + eps), to: pt(a0), stroke: "trait fin", head: "end" });
    }
    const mid = (a0 + a1) / 2;
    if (str(p, "label")) {
      const d = pt(mid, 1);
      out.push({ kind: "text", at: pt(mid, r + 1.2), text: str(p, "label"), anchor: "center", halo: false, away: d });
    }
    return out;
  },
  anchors: (p) => {
    const r = num(p, "radius");
    const pt = (deg: number): Pt => [r * Math.cos((deg * Math.PI) / 180), -r * Math.sin((deg * Math.PI) / 180)];
    return { center: [0, 0], start: pt(num(p, "from_angle")), end: pt(num(p, "to_angle")) };
  },
  summary: (p) => `de ${num(p, "from_angle")}° à ${num(p, "to_angle")}°${str(p, "label") ? `, ${str(p, "label")}` : ""}`,
};

// ---------------------------------------------------------------------------
// Flèche, accolade
// ---------------------------------------------------------------------------

export const arrow: ComponentDef = {
  type: "arrow",
  label: "Flèche",
  category: "annotation",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 15 },
    head: {
      kind: "enum",
      label: "Pointes",
      default: "end",
      options: [
        { value: "end", label: "À la fin" },
        { value: "start", label: "Au début" },
        { value: "both", label: "Aux deux bouts" },
      ],
    },
    weight: {
      kind: "enum",
      label: "Trait",
      default: "trait",
      options: [
        { value: "trait fin", label: "Fin" },
        { value: "trait", label: "Normal" },
        { value: "trait epais", label: "Épais" },
      ],
    },
    label: { kind: "string", label: "Texte", default: "", math: true, optional: true },
  },
  geometry(p, { length: L }) {
    const out: Primitive[] = [{ kind: "arrow", from: [0, 0], to: [L, 0], stroke: p.weight as "trait", head: p.head as "end" }];
    if (str(p, "label")) out.push({ kind: "text", at: [L / 2, -1], text: str(p, "label"), anchor: "south", halo: false, away: [0, -1] });
    return out;
  },
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (p, { length }) => `${r2(length)} mm${str(p, "label") ? `, ${str(p, "label")}` : ""}`,
};

/** Accolade du côté gauche du sens de tracé (dessus si tracée de gauche à droite). */
export const brace: ComponentDef = {
  type: "brace",
  label: "Accolade",
  category: "annotation",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 20 },
    depth: { kind: "number", label: "Profondeur", default: 2.5, min: 0.5, max: 50, unit: "mm" },
    label: { kind: "string", label: "Texte", default: "", math: true },
  },
  geometry(p, { length: L }) {
    const d = num(p, "depth");
    const h = d / 2;
    const m = L / 2;
    // Deux demi-accolades en Bézier : bord → épaule → pointe centrale.
    const segs: Seg[] = [
      { op: "M", p: [0, 0] },
      { op: "C", c1: [0, -h * 0.9], c2: [Math.min(h, m / 2) * 0.3, -h], p: [Math.min(h, m / 2), -h] },
      { op: "L", p: [m - Math.min(h, m / 2), -h] },
      { op: "C", c1: [m - Math.min(h, m / 2) * 0.3, -h], c2: [m, -h * 1.1], p: [m, -d] },
      { op: "C", c1: [m, -h * 1.1], c2: [m + Math.min(h, m / 2) * 0.3, -h], p: [m + Math.min(h, m / 2), -h] },
      { op: "L", p: [L - Math.min(h, m / 2), -h] },
      { op: "C", c1: [L - Math.min(h, m / 2) * 0.3, -h], c2: [L, -h * 0.9], p: [L, 0] },
    ];
    const out: Primitive[] = [{ kind: "path", segs, stroke: "trait fin", fill: "none" }];
    if (str(p, "label")) out.push({ kind: "text", at: [m, -d - 1], text: str(p, "label"), anchor: "south", halo: false, away: [0, -1] });
    return out;
  },
  anchors: (p, { length }) => ({ ...segmentAnchors(length), tip: [length / 2, -num(p, "depth")] }),
  summary: (p, { length }) => `${r2(length)} mm${str(p, "label") ? `, ${str(p, "label")}` : ""}`,
};

// ---------------------------------------------------------------------------
// Texte, point de mesure
// ---------------------------------------------------------------------------

export const text: ComponentDef = {
  type: "text",
  label: "Texte",
  category: "annotation",
  placement: "point",
  params: {
    text: { kind: "string", label: "Texte ($…$ pour les maths)", default: "Texte" , math: true },
    anchor: {
      kind: "enum",
      label: "Point d'accroche",
      default: "center",
      options: [
        { value: "center", label: "Centre" },
        { value: "west", label: "Gauche" },
        { value: "east", label: "Droite" },
        { value: "north", label: "Haut" },
        { value: "south", label: "Bas" },
        { value: "north west", label: "Haut gauche" },
        { value: "north east", label: "Haut droite" },
        { value: "south west", label: "Bas gauche" },
        { value: "south east", label: "Bas droite" },
      ],
    },
    size: TEXT_SIZE,
    background: { kind: "boolean", label: "Fond blanc", default: false },
  },
  geometry: (p) => [{ kind: "text", at: [0, 0], text: str(p, "text"), anchor: p.anchor as "center", halo: !!p.background, size: p.size as TextSize }],
  anchors: () => ({ center: [0, 0] }),
  summary: (p) => `« ${str(p, "text")} »`,
};

export const measurePoint: ComponentDef = {
  type: "measure_point",
  label: "Point de mesure",
  category: "annotation",
  placement: "point",
  params: {
    marker: {
      kind: "enum",
      label: "Symbole",
      default: "croix",
      options: [
        { value: "croix", label: "Croix" },
        { value: "capteur", label: "Capteur (cercle barré)" },
        { value: "point", label: "Point plein" },
      ],
    },
    size: { kind: "number", label: "Taille", default: 2, min: 0.5, max: 20, unit: "mm" },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const s = num(p, "size") / 2;
    const out: Primitive[] =
      p.marker === "point"
        ? [{ kind: "circle", c: [0, 0], r: s * 0.6, stroke: null, fill: "gris" }, { kind: "circle", c: [0, 0], r: s * 0.6, stroke: "trait", fill: "none" }]
        : p.marker === "capteur"
          ? [{ kind: "circle", c: [0, 0], r: s, stroke: "trait", fill: "blanc" }, polyline([[-s * 0.7, s * 0.7], [s * 0.7, -s * 0.7]]), polyline([[-s * 0.7, -s * 0.7], [s * 0.7, s * 0.7]])]
          : [polyline([[-s, -s], [s, s]]), polyline([[-s, s], [s, -s]])];
    if (str(p, "label")) out.push({ kind: "text", at: [s + 0.8, -s - 0.3], text: str(p, "label"), anchor: "south west", halo: false });
    return out;
  },
  anchors: (p) => boxAnchors(-num(p, "size") / 2, -num(p, "size") / 2, num(p, "size"), num(p, "size")),
  summary: (p) => `${p.marker}${str(p, "label") ? `, ${str(p, "label")}` : ""}`,
};
