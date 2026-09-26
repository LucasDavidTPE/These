import { segmentAnchors, type ComponentDef } from "../component";
import { polyline, type Primitive } from "../geometry";
import { LABEL_SIDE, LENGTH_PARAM } from "./common";

export interface DashpotParams {
  length: number;
  width: number;
  depth: number;
  label?: string;
  label_side: string;
  [k: string]: unknown;
}

/** Amortisseur (élément visqueux) : cylindre ouvert et piston. */
export const dashpot: ComponentDef<DashpotParams> = {
  type: "dashpot",
  label: "Amortisseur",
  category: "rheologie",
  placement: "segment",
  params: {
    length: LENGTH_PARAM,
    width: { kind: "number", label: "Largeur du cylindre", default: 5, min: 0.5, max: 50, unit: "mm" },
    depth: { kind: "number", label: "Profondeur du cylindre", default: 6, min: 0.5, max: 100, unit: "mm" },
    label: { kind: "string", label: "Étiquette", default: "", math: true, optional: true },
    label_side: LABEL_SIDE,
  },
  geometry(p, { length: L }) {
    const depth = Math.min(p.depth, L * 0.6);
    const a = (L - depth) / 2;
    const hw = p.width / 2;
    const xp = a + depth * 0.55;
    const prims: Primitive[] = [
      polyline([[0, 0], [a, 0]]),
      // Cylindre « [ » ouvert vers la fin du composant.
      polyline([[a + depth, -hw], [a, -hw], [a, hw], [a + depth, hw]]),
      // Piston : plaque et tige.
      polyline([[xp, -hw * 0.7], [xp, hw * 0.7]]),
      polyline([[xp, 0], [L, 0]]),
    ];
    if (p.label) {
      const s = p.label_side === "dessous" ? 1 : -1;
      prims.push({ kind: "text", at: [L / 2, s * (hw + 1)], text: p.label, anchor: "center", halo: false, away: [0, s] });
    }
    return prims;
  },
  anchors: (_p, { length }) => segmentAnchors(length),
  summary: (p, { length }) => `longueur ${Math.round(length * 100) / 100} mm${p.label ? `, ${p.label}` : ""}`,
};
