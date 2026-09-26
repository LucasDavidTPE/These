import { segmentAnchors, type ComponentDef } from "../component";
import type { Primitive } from "../geometry";
import { LABEL_SIDE, LENGTH_PARAM } from "./common";

export interface SpringParams {
  length: number;
  coils: number;
  amplitude: number;
  lead: number;
  label?: string;
  label_side: string;
  [k: string]: unknown;
}

/** Arrondi par défaut au centième : TikZ doit loger exactement `coils` dents. */
function floor2(v: number): number {
  return Math.floor(v * 100 + 1e-9) / 100;
}

/** Ressort (élément élastique) : zigzag entre deux fils de liaison. */
export const spring: ComponentDef<SpringParams> = {
  type: "spring",
  label: "Ressort",
  category: "rheologie",
  placement: "segment",
  params: {
    length: LENGTH_PARAM,
    coils: { kind: "number", label: "Nombre de spires", default: 4, min: 1, max: 40, integer: true },
    amplitude: { kind: "number", label: "Demi-largeur", default: 2, min: 0.2, max: 50, unit: "mm" },
    lead: { kind: "number", label: "Fils de liaison", default: 3, min: 0, max: 500, unit: "mm" },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
    label_side: LABEL_SIDE,
  },
  geometry(p, { length: L }) {
    // Fils de liaison raccourcis si le ressort est trop court.
    const lead = Math.min(p.lead, L / 4);
    // Marge de 0,02 mm : sans elle, les arrondis internes de TeX peuvent faire sauter la
    // dernière dent quand la longueur tombe juste.
    const segment = floor2((L - 2 * lead - 0.02) / p.coils);
    const prims: Primitive[] = [
      { kind: "zigzag", from: [0, 0], to: [L, 0], segment, amplitude: p.amplitude, pre: lead, post: lead, stroke: "trait" },
    ];
    if (p.label) {
      const s = p.label_side === "dessous" ? 1 : -1;
      prims.push({ kind: "text", at: [L / 2, s * (p.amplitude + 1)], text: p.label, anchor: "center", halo: false, away: [0, s] });
    }
    return prims;
  },
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (p, { length }) => `${p.coils} spires, longueur ${Math.round(length * 100) / 100} mm${p.label ? `, ${p.label}` : ""}`,
};
