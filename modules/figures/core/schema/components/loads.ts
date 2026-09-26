/**
 * Composants de chargement (SPEC §6) : force ponctuelle, charge répartie, profil de
 * pression, empreinte en plan, roue en coupe, bogie vu en plan.
 */
import { boxAnchors, segmentAnchors, type ComponentDef } from "../component";
import { parseExpr } from "../expr";
import { polyline, type Primitive, type Seg } from "../geometry";
import type { Pt } from "../types";
import { FILL_PARAM, LENGTH_PARAM, fillOf } from "./common";

type P = Record<string, unknown>;
const num = (p: P, k: string) => p[k] as number;
const nums = (p: P, k: string) => p[k] as number[];
const str = (p: P, k: string) => (p[k] as string | undefined) ?? "";
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Force ponctuelle
// ---------------------------------------------------------------------------

function forceEnds(p: P): { tail: Pt; tip: Pt; d: Pt } {
  const a = (num(p, "angle") * Math.PI) / 180;
  const d: Pt = [Math.cos(a), -Math.sin(a)];
  const L = num(p, "length");
  return p.applied_at === "queue"
    ? { tail: [0, 0], tip: [d[0] * L, d[1] * L], d }
    : { tail: [-d[0] * L, -d[1] * L], tip: [0, 0], d };
}

/**
 * Force ponctuelle. L'origine est le point d'application : la pointe de la flèche
 * (compression, par défaut) ou sa queue (traction).
 */
export const force: ComponentDef = {
  type: "force",
  label: "Force ponctuelle",
  category: "chargement",
  placement: "point",
  params: {
    length: { kind: "number", label: "Longueur de la flèche", default: 12, min: 1, max: 500, unit: "mm" },
    angle: { kind: "number", label: "Direction de la force (°, 270 = vers le bas)", default: 270, min: -360, max: 360 },
    label: { kind: "string", label: "Étiquette", default: "$F$", math: true },
    applied_at: {
      kind: "enum",
      label: "Point d'application",
      default: "pointe",
      options: [
        { value: "pointe", label: "Pointe de la flèche (pousse)" },
        { value: "queue", label: "Queue de la flèche (tire)" },
      ],
    },
  },
  geometry(p) {
    const { tail, tip, d } = forceEnds(p);
    const out: Primitive[] = [{ kind: "arrow", from: tail, to: tip, stroke: "trait", head: "end" }];
    // Étiquette du côté libre de la flèche.
    const free = p.applied_at === "queue" ? tip : tail;
    const away: Pt = p.applied_at === "queue" ? d : [-d[0], -d[1]];
    if (str(p, "label")) out.push({ kind: "text", at: [free[0] + away[0], free[1] + away[1]], text: str(p, "label"), anchor: "center", halo: false, away });
    return out;
  },
  anchors(p) {
    const { tail, tip } = forceEnds(p);
    return { tip, tail };
  },
  summary: (p) => `${str(p, "label") || "force"}, direction ${num(p, "angle")}°`,
};

// ---------------------------------------------------------------------------
// Charge répartie uniforme
// ---------------------------------------------------------------------------

/** Charge répartie uniforme le long d'un segment (flèches du côté gauche du tracé). */
export const uniformLoad: ComponentDef = {
  type: "uniform_load",
  label: "Charge répartie uniforme",
  category: "chargement",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 30 },
    height: { kind: "number", label: "Hauteur des flèches", default: 8, min: 1, max: 200, unit: "mm" },
    arrows: { kind: "number", label: "Nombre de flèches", default: 7, min: 2, max: 100, integer: true },
    label: { kind: "string", label: "Étiquette", default: "$q$", math: true },
  },
  geometry(p, { length: L }) {
    const h = num(p, "height");
    const n = num(p, "arrows");
    const out: Primitive[] = [polyline([[0, -h], [L, -h]], "trait")];
    for (let k = 0; k < n; k++) {
      const x = (L * k) / (n - 1);
      out.push({ kind: "arrow", from: [x, -h], to: [x, 0], stroke: "trait fin", head: "end" });
    }
    if (str(p, "label")) out.push({ kind: "text", at: [L / 2, -h - 1], text: str(p, "label"), anchor: "south", halo: false, away: [0, -1] });
    return out;
  },
  anchors: (p, { length }) => ({ ...segmentAnchors(length), top: [length / 2, -num(p, "height")] }),
  summary: (p, { length }) => `${str(p, "label") || "q"} sur ${r2(length)} mm`,
};

// ---------------------------------------------------------------------------
// Profil de pression
// ---------------------------------------------------------------------------

/** Noms des modèles tels qu'écrits dans figure.json (SPEC §5). */
export const PROFILE_MODELS = ["uniform", "inverse_parabolic", "gaussians", "function"] as const;

/** Fonction p(y) du profil (y en m), selon le modèle choisi. */
export function profileFunction(p: P): (y: number) => number {
  const [a, b] = nums(p, "span") as [number, number];
  switch (p.model) {
    case "uniform":
      return () => num(p, "p");
    case "inverse_parabolic": {
      // Minimum au centre, maximum aux bords : p(y) = pc + (pb − pc) (2 (y − m) / (b − a))².
      const m = (a + b) / 2;
      const pc = num(p, "p_center");
      const pb = num(p, "p_edge");
      return (y) => pc + (pb - pc) * ((2 * (y - m)) / (b - a)) ** 2;
    }
    case "gaussians": {
      const c = nums(p, "centers");
      const A = nums(p, "amplitudes");
      const s2 = 2 * num(p, "sigma") ** 2;
      return (y) => c.reduce((sum, ci, i) => sum + A[i]! * Math.exp(-((y - ci) ** 2) / s2), 0);
    }
    default:
      return parseExpr(str(p, "expression"));
  }
}

const SAMPLES = 48;

export const pressureProfile: ComponentDef = {
  type: "pressure_profile",
  label: "Profil de pression",
  category: "chargement",
  placement: "point",
  params: {
    model: {
      kind: "enum",
      label: "Modèle",
      default: "gaussians",
      options: [
        { value: "uniform", label: "Uniforme" },
        { value: "inverse_parabolic", label: "Parabolique inverse" },
        { value: "gaussians", label: "Somme de gaussiennes" },
        { value: "function", label: "Fonction f(y) saisie" },
      ],
    },
    span: { kind: "numbers", label: "Étendue [y min, y max]", default: [-0.25, 0.25], minItems: 2, maxItems: 2, unit: "m" },
    width: { kind: "number", label: "Largeur dessinée de l'étendue", default: 60, min: 1, max: 2000, unit: "mm" },
    height: { kind: "number", label: "Hauteur dessinée du maximum", default: 12, min: 1, max: 500, unit: "mm" },
    arrows: { kind: "number", label: "Nombre de flèches", default: 15, min: 0, max: 200, integer: true },
    p: { kind: "number", label: "Pression (uniforme)", default: 1 },
    p_center: { kind: "number", label: "Pression au centre (parabolique)", default: 0.6 },
    p_edge: { kind: "number", label: "Pression au bord (parabolique)", default: 1 },
    centers: { kind: "numbers", label: "Centres des gaussiennes", default: [-0.16, 0, 0.16], minItems: 1, unit: "m" },
    amplitudes: { kind: "numbers", label: "Amplitudes des gaussiennes", default: [1.8, 1.67, 1.8], minItems: 1 },
    sigma: { kind: "number", label: "Écart-type σ", default: 0.0315, min: 1e-6, unit: "m" },
    expression: { kind: "string", label: "f(y), y en m", default: "1 - (y/0.25)^2" },
    label: { kind: "string", label: "Étiquette", default: "$p(y)$", math: true },
  },
  check(p) {
    const errs = [];
    const [a, b] = nums(p, "span") as [number, number];
    if (!(a < b)) errs.push({ path: "span", message: "y min doit être inférieur à y max." });
    if (p.model === "gaussians" && nums(p, "centers").length !== nums(p, "amplitudes").length) {
      errs.push({ path: "amplitudes", message: "autant d'amplitudes que de centres." });
    }
    if (p.model === "function") {
      try {
        const f = parseExpr(str(p, "expression"));
        if (!Number.isFinite(f((a + b) / 2))) errs.push({ path: "expression", message: "la fonction n'est pas définie au centre de l'étendue." });
      } catch (e) {
        errs.push({ path: "expression", message: (e as Error).message });
      }
    }
    return errs;
  },
  geometry(p) {
    const [a, b] = nums(p, "span") as [number, number];
    const f = profileFunction(p);
    const X = (y: number) => (y * num(p, "width")) / (b - a);
    const ys = Array.from({ length: SAMPLES + 1 }, (_, i) => a + ((b - a) * i) / SAMPLES);
    const values = ys.map((y) => Math.max(0, f(y)));
    const pmax = Math.max(...values) || 1;
    const H = (v: number) => (v / pmax) * num(p, "height");
    const env: Pt[] = [[X(a), 0], ...ys.map((y, i): Pt => [X(y), -H(values[i]!)]), [X(b), 0]];
    const out: Primitive[] = [polyline(env, "trait")];
    const n = num(p, "arrows");
    for (let k = 0; k < n; k++) {
      const y = n === 1 ? (a + b) / 2 : a + ((b - a) * k) / (n - 1);
      const h = H(Math.max(0, f(y)));
      if (h > 1) out.push({ kind: "arrow", from: [X(y), -h], to: [X(y), 0], stroke: "trait fin", head: "end" });
    }
    if (str(p, "label")) {
      // Sommet le plus proche du centre parmi les maxima (profils symétriques).
      const mid = (a + b) / 2;
      const peak = ys.filter((_, i) => values[i]! >= pmax * 0.999).sort((u, v) => Math.abs(u - mid) - Math.abs(v - mid))[0]!;
      out.push({ kind: "text", at: [X(peak), -num(p, "height") - 1], text: str(p, "label"), anchor: "south", halo: false, away: [0, -1] });
    }
    return out;
  },
  anchors(p) {
    const [a, b] = nums(p, "span") as [number, number];
    const X = (y: number) => (y * num(p, "width")) / (b - a);
    return { center: [0, 0], left: [X(a), 0], right: [X(b), 0], top: [0, -num(p, "height")] };
  },
  summary(p) {
    const [a, b] = nums(p, "span");
    const detail =
      p.model === "gaussians"
        ? `${nums(p, "centers").length} gaussiennes, σ = ${num(p, "sigma")} m`
        : p.model === "function"
          ? `f(y) = ${str(p, "expression")}`
          : String(p.model).replace("_", " ");
    return `${detail}, y de ${a} à ${b} m`;
  },
};

// ---------------------------------------------------------------------------
// Empreinte vue en plan
// ---------------------------------------------------------------------------

/** Ellipse en 4 Bézier cubiques (écart < 0,03 % du rayon). */
export function ellipseSegs(cx: number, cy: number, rx: number, ry: number): Seg[] {
  const k = 0.5522847498;
  return [
    { op: "M", p: [cx + rx, cy] },
    { op: "C", c1: [cx + rx, cy + k * ry], c2: [cx + k * rx, cy + ry], p: [cx, cy + ry] },
    { op: "C", c1: [cx - k * rx, cy + ry], c2: [cx - rx, cy + k * ry], p: [cx - rx, cy] },
    { op: "C", c1: [cx - rx, cy - k * ry], c2: [cx - k * rx, cy - ry], p: [cx, cy - ry] },
    { op: "C", c1: [cx + k * rx, cy - ry], c2: [cx + rx, cy - k * ry], p: [cx + rx, cy] },
    { op: "Z" },
  ];
}

export const footprint: ComponentDef = {
  type: "footprint",
  label: "Empreinte (vue en plan)",
  category: "chargement",
  placement: "point",
  params: {
    shape: {
      kind: "enum",
      label: "Forme",
      default: "rectangle",
      options: [
        { value: "rectangle", label: "Rectangle" },
        { value: "cercle", label: "Cercle" },
        { value: "ellipse", label: "Ellipse" },
      ],
    },
    width: { kind: "number", label: "Largeur", default: 12, min: 0.5, max: 1000, unit: "mm" },
    length: { kind: "number", label: "Longueur (sens de roulement)", default: 18, min: 0.5, max: 1000, unit: "mm" },
    fill: { ...FILL_PARAM, default: "gris" },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const w = num(p, "width");
    const l = p.shape === "cercle" ? w : num(p, "length");
    const fill = fillOf(p.fill as string);
    const out: Primitive[] =
      p.shape === "rectangle"
        ? [{ kind: "rect", x: -w / 2, y: -l / 2, w, h: l, stroke: "trait", fill }]
        : p.shape === "cercle"
          ? [{ kind: "circle", c: [0, 0], r: w / 2, stroke: "trait", fill }]
          : [{ kind: "path", segs: ellipseSegs(0, 0, w / 2, l / 2), stroke: "trait", fill }];
    if (str(p, "label")) out.push({ kind: "text", at: [0, 0], text: str(p, "label"), anchor: "center", halo: fill !== "none" });
    return out;
  },
  anchors(p) {
    const w = num(p, "width");
    const l = p.shape === "cercle" ? w : num(p, "length");
    return boxAnchors(-w / 2, -l / 2, w, l);
  },
  summary: (p) => `${p.shape}, ${num(p, "width")} × ${p.shape === "cercle" ? num(p, "width") : num(p, "length")} mm`,
};

// ---------------------------------------------------------------------------
// Roue / pneu en coupe
// ---------------------------------------------------------------------------

/** Rectangle aux coins arrondis (quarts de cercle en Bézier). */
export function roundedRectSegs(x: number, y: number, w: number, h: number, r: number): Seg[] {
  const k = 0.5522847498 * r;
  return [
    { op: "M", p: [x + r, y] },
    { op: "L", p: [x + w - r, y] },
    { op: "C", c1: [x + w - r + k, y], c2: [x + w, y + r - k], p: [x + w, y + r] },
    { op: "L", p: [x + w, y + h - r] },
    { op: "C", c1: [x + w, y + h - r + k], c2: [x + w - r + k, y + h], p: [x + w - r, y + h] },
    { op: "L", p: [x + r, y + h] },
    { op: "C", c1: [x + r - k, y + h], c2: [x, y + h - r + k], p: [x, y + h - r] },
    { op: "L", p: [x, y + r] },
    { op: "C", c1: [x, y + r - k], c2: [x + r - k, y], p: [x + r, y] },
    { op: "Z" },
  ];
}

/** Pneu en coupe transversale, posé sur la chaussée : l'origine est le point de contact. */
export const wheelSection: ComponentDef = {
  type: "wheel_section",
  label: "Roue / pneu en coupe",
  category: "chargement",
  placement: "point",
  params: {
    width: { kind: "number", label: "Largeur du pneu", default: 22, min: 1, max: 500, unit: "mm" },
    height: { kind: "number", label: "Hauteur du flanc", default: 14, min: 1, max: 500, unit: "mm" },
    rim: { kind: "number", label: "Largeur de la jante", default: 14, min: 0, max: 500, unit: "mm" },
    fill: { ...FILL_PARAM, default: "blanc" },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const w = num(p, "width");
    const h = num(p, "height");
    const r = Math.min(w, h) * 0.3;
    const rim = Math.min(num(p, "rim"), w * 0.9);
    const out: Primitive[] = [
      { kind: "path", segs: roundedRectSegs(-w / 2, -h, w, h, r), stroke: "trait", fill: fillOf(p.fill as string) },
      polyline([[-w / 2 + r, 0], [w / 2 - r, 0]], "trait epais"),
    ];
    if (rim > 0) out.push({ kind: "rect", x: -rim / 2, y: -h - 1.5, w: rim, h: h * 0.4 + 1.5, stroke: "trait", fill: "gris" });
    if (str(p, "label")) out.push({ kind: "text", at: [w / 2 + 1.5, -h / 2], text: str(p, "label"), anchor: "west", halo: false });
    return out;
  },
  anchors(p) {
    const w = num(p, "width");
    const h = num(p, "height");
    const r = Math.min(w, h) * 0.3;
    const rimTop = num(p, "rim") > 0 ? -h - 1.5 : -h;
    return {
      ...boxAnchors(-w / 2, -h, w, h),
      top: [0, rimTop],
      contact: [0, 0],
      "contact.left": [-w / 2 + r, 0],
      "contact.right": [w / 2 - r, 0],
    };
  },
  summary: (p) => `pneu ${num(p, "width")} × ${num(p, "height")} mm${str(p, "label") ? `, ${str(p, "label")}` : ""}`,
};

// ---------------------------------------------------------------------------
// Bogie vu en plan
// ---------------------------------------------------------------------------

/** Bogie vu en plan : `axles` essieux de `wheels` roues ; l'origine est le centre. */
export const bogie: ComponentDef = {
  type: "bogie",
  label: "Bogie (vue en plan)",
  category: "chargement",
  placement: "point",
  params: {
    axles: { kind: "number", label: "Nombre d'essieux", default: 2, min: 1, max: 8, integer: true },
    wheels: { kind: "number", label: "Roues par essieu", default: 2, min: 1, max: 8, integer: true },
    axle_spacing: { kind: "number", label: "Entraxe des essieux", default: 30, min: 0, max: 1000, unit: "mm" },
    wheel_spacing: { kind: "number", label: "Entraxe des roues sur un essieu", default: 18, min: 0, max: 1000, unit: "mm" },
    tyre_width: { kind: "number", label: "Largeur des pneus", default: 7, min: 0.5, max: 200, unit: "mm" },
    tyre_length: { kind: "number", label: "Longueur des empreintes", default: 12, min: 0.5, max: 200, unit: "mm" },
    fill: { ...FILL_PARAM, default: "gris" },
    show_frame: { kind: "boolean", label: "Dessiner essieux et poutre", default: true },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const na = num(p, "axles");
    const nw = num(p, "wheels");
    const tw = num(p, "tyre_width");
    const tl = num(p, "tyre_length");
    const xs = Array.from({ length: nw }, (_, j) => (j - (nw - 1) / 2) * num(p, "wheel_spacing"));
    const ys = Array.from({ length: na }, (_, i) => (i - (na - 1) / 2) * num(p, "axle_spacing"));
    const out: Primitive[] = [];
    if (p.show_frame) {
      if (na > 1) out.push(polyline([[0, ys[0]!], [0, ys.at(-1)!]], "trait epais"));
      // Essieux entre les pneus seulement (un remplissage hachuré laisserait voir le trait).
      for (const y of ys) {
        for (let j = 0; j + 1 < nw; j++) {
          const a = xs[j]! + tw / 2;
          const b = xs[j + 1]! - tw / 2;
          if (b > a) out.push(polyline([[a, y], [b, y]], "trait"));
        }
      }
    }
    const fill = fillOf(p.fill as string);
    for (const y of ys) for (const x of xs) out.push({ kind: "rect", x: x - tw / 2, y: y - tl / 2, w: tw, h: tl, stroke: "trait", fill });
    if (str(p, "label")) {
      const right = (xs.at(-1) ?? 0) + tw / 2 + 2;
      out.push({ kind: "text", at: [right, 0], text: str(p, "label"), anchor: "west", halo: false });
    }
    return out;
  },
  anchors(p) {
    const na = num(p, "axles");
    const nw = num(p, "wheels");
    const tw = num(p, "tyre_width");
    const tl = num(p, "tyre_length");
    const xs = Array.from({ length: nw }, (_, j) => (j - (nw - 1) / 2) * num(p, "wheel_spacing"));
    const ys = Array.from({ length: na }, (_, i) => (i - (na - 1) / 2) * num(p, "axle_spacing"));
    const W = (xs.at(-1)! - xs[0]!) + tw;
    const H = (ys.at(-1)! - ys[0]!) + tl;
    const out: Record<string, Pt> = boxAnchors(-W / 2, -H / 2, W, H);
    ys.forEach((y, i) => {
      out[`axle[${i}]`] = [0, y];
      xs.forEach((x, j) => (out[`wheel[${i * nw + j}]`] = [x, y]));
    });
    return out;
  },
  summary: (p) =>
    `${num(p, "axles")} essieu(x) × ${num(p, "wheels")} roue(s), entraxes ${num(p, "axle_spacing")} et ${num(p, "wheel_spacing")} mm`,
};
