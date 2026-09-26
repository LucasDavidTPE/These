import { boxAnchors, type ComponentDef } from "../component";
import type { Primitive } from "../geometry";
import { FILL_PARAM, fillOf } from "./common";

export interface RectangleParams {
  width: number;
  height: number;
  fill: string;
  label?: string;
  [k: string]: unknown;
}

/** Rectangle simple, avec remplissage et étiquette centrée facultatifs. */
export const rectangle: ComponentDef<RectangleParams> = {
  type: "rectangle",
  label: "Rectangle",
  category: "libre",
  placement: "point",
  params: {
    width: { kind: "number", label: "Largeur", default: 20, min: 0.1, max: 2000, unit: "mm" },
    height: { kind: "number", label: "Hauteur", default: 10, min: 0.1, max: 2000, unit: "mm" },
    fill: FILL_PARAM,
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
  },
  geometry(p) {
    const fill = fillOf(p.fill);
    const prims: Primitive[] = [{ kind: "rect", x: 0, y: 0, w: p.width, h: p.height, stroke: "trait", fill }];
    if (p.label) {
      prims.push({ kind: "text", at: [p.width / 2, p.height / 2], text: p.label, anchor: "center", halo: fill.startsWith("hachure") });
    }
    return prims;
  },
  anchors: (p) => boxAnchors(0, 0, p.width, p.height),
  summary: (p) => `${p.width} × ${p.height} mm${p.label ? `, « ${p.label} »` : ""}`,
};
