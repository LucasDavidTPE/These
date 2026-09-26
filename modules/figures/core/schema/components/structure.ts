/** Composants de structure (SPEC §6) : sol hachuré, encastrement, appui simple. */
import { segmentAnchors, type ComponentDef } from "../component";
import { polyline, type Primitive, type StrokeRole } from "../geometry";
import { LENGTH_PARAM } from "./common";

/** Trait principal + petits traits obliques d'un côté (sol, encastrement). */
function hatchedLine(L: number, depth: number, spacing: number, side: number, main: StrokeRole): Primitive[] {
  const out: Primitive[] = [polyline([[0, 0], [L, 0]], main)];
  const count = Math.max(1, Math.floor(L / spacing));
  const step = L / count;
  for (let k = 0; k <= count; k++) {
    const x = k * step;
    // Traits inclinés à 45°, décalés pour rester dans la longueur.
    const x0 = Math.max(0, x - depth);
    const d = x - x0;
    if (d > 0.2) out.push(polyline([[x, 0], [x0, side * d]], "trait fin"));
  }
  return out;
}

const SIDE = {
  kind: "enum" as const,
  label: "Côté des hachures",
  default: "droite",
  options: [
    { value: "droite", label: "À droite du sens de tracé (dessous si tracé de gauche à droite)" },
    { value: "gauche", label: "À gauche du sens de tracé" },
  ],
};

export const ground: ComponentDef = {
  type: "ground",
  label: "Sol hachuré",
  category: "structure",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 40 },
    depth: { kind: "number", label: "Longueur des hachures", default: 2.5, min: 0.5, max: 20, unit: "mm" },
    spacing: { kind: "number", label: "Espacement", default: 2.5, min: 0.5, max: 20, unit: "mm" },
    side: SIDE,
  },
  geometry: (p, { length }) => hatchedLine(length, p.depth as number, p.spacing as number, p.side === "gauche" ? -1 : 1, "trait"),
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (_p, { length }) => `longueur ${Math.round(length * 100) / 100} mm`,
};

export const fixedSupport: ComponentDef = {
  type: "fixed_support",
  label: "Encastrement",
  category: "structure",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 20 },
    depth: { kind: "number", label: "Longueur des hachures", default: 2.5, min: 0.5, max: 20, unit: "mm" },
    spacing: { kind: "number", label: "Espacement", default: 1.8, min: 0.5, max: 20, unit: "mm" },
    side: SIDE,
  },
  geometry: (p, { length }) => hatchedLine(length, p.depth as number, p.spacing as number, p.side === "gauche" ? -1 : 1, "trait epais"),
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (_p, { length }) => `longueur ${Math.round(length * 100) / 100} mm`,
};

/** Appui simple : triangle dont la pointe est l'origine ; « glissant » ajoute des rouleaux. */
export const simpleSupport: ComponentDef = {
  type: "simple_support",
  label: "Appui simple",
  category: "structure",
  placement: "point",
  params: {
    size: { kind: "number", label: "Taille", default: 5, min: 1, max: 40, unit: "mm" },
    variant: {
      kind: "enum",
      label: "Type",
      default: "fixe",
      options: [
        { value: "fixe", label: "Articulation fixe" },
        { value: "glissant", label: "Appui glissant (rouleaux)" },
      ],
    },
  },
  geometry(p) {
    const s = p.size as number;
    const h = s * 0.87;
    const out: Primitive[] = [polyline([[0, 0], [-s / 2, h], [s / 2, h]], "trait", "blanc", true)];
    let yb = h;
    if (p.variant === "glissant") {
      const r = s * 0.12;
      for (const x of [-s / 3, 0, s / 3]) out.push({ kind: "circle", c: [x, h + r], r, stroke: "trait fin", fill: "blanc" });
      yb = h + 2 * r;
    }
    const base = hatchedLine(s * 1.4, s * 0.3, s * 0.2, 1, "trait");
    for (const prim of base) {
      if (prim.kind === "path") {
        out.push({ ...prim, segs: prim.segs.map((sg) => (sg.op === "Z" || sg.op === "C" ? sg : { ...sg, p: [sg.p[0] - s * 0.7, sg.p[1] + yb] })) });
      }
    }
    return out;
  },
  anchors: (p) => {
    const s = p.size as number;
    return { top: [0, 0], center: [0, s * 0.45], bottom: [0, s * 0.87] };
  },
  summary: (p) => `${p.variant === "glissant" ? "glissant" : "fixe"}, taille ${p.size} mm`,
};
