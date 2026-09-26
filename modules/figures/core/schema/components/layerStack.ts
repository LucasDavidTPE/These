import { boxAnchors, type ComponentDef } from "../component";
import { wavySegs, type Primitive, type Seg } from "../geometry";
import type { Pt } from "../types";
import { HATCH_PARAM, fillOf } from "./common";

export interface Layer {
  name: string;
  h: number;
  hatch: string;
  semi_infinite: boolean;
  label?: string;
}

export interface LayerStackParams {
  width: number;
  layers: Layer[];
  labels: string;
  [k: string]: unknown;
}

/** Longueur d'onde visée du bord ondulé d'un demi-espace indéfini (mm). */
const WAVE_LENGTH = 12;
const WAVE_AMPLITUDE = 0.8;

/**
 * Empilement de couches de chaussée : une couche par rectangle hachuré ; la dernière peut
 * être un demi-espace indéfini (bord inférieur ondulé). Origine = coin haut gauche.
 */
export const layerStack: ComponentDef<LayerStackParams> = {
  type: "layer_stack",
  label: "Empilement de couches",
  category: "structure",
  placement: "point",
  params: {
    width: { kind: "number", label: "Largeur", default: 100, min: 1, max: 2000, unit: "mm" },
    layers: {
      kind: "list",
      label: "Couches (de haut en bas)",
      minItems: 1,
      default: [
        { name: "BB", h: 8, hatch: "bitumineux" },
        { name: "GB", h: 12, hatch: "bitumineux-dense" },
        { name: "PF", h: 15, hatch: "sol", semi_infinite: true },
      ],
      item: {
        name: { kind: "string", label: "Nom", default: "" },
        h: { kind: "number", label: "Épaisseur dessinée", default: 10, min: 0.5, max: 1000, unit: "mm" },
        hatch: HATCH_PARAM,
        semi_infinite: { kind: "boolean", label: "Demi-espace indéfini", default: false },
        label: { kind: "string", label: "Étiquette (sinon le nom)", default: "", math: true, optional: true },
      },
    },
    labels: {
      kind: "enum",
      label: "Étiquettes",
      default: "dedans",
      options: [
        { value: "dedans", label: "Dans les couches" },
        { value: "droite", label: "À droite" },
        { value: "aucune", label: "Aucune" },
      ],
    },
  },
  check(p) {
    return p.layers.flatMap((l, i) =>
      l.semi_infinite && i !== p.layers.length - 1
        ? [{ path: `layers[${i}].semi_infinite`, message: "seule la dernière couche peut être un demi-espace indéfini." }]
        : [],
    );
  },
  geometry(p) {
    const W = p.width;
    const prims: Primitive[] = [];
    let y = 0;
    for (const layer of p.layers) {
      const y1 = y + layer.h;
      const fill = fillOf(layer.hatch);
      if (layer.semi_infinite) {
        const waves = Math.max(1, Math.round(W / WAVE_LENGTH));
        const wave = wavySegs(W, 0, y1, WAVE_AMPLITUDE, waves);
        const region: Seg[] = [{ op: "M", p: [0, y] }, { op: "L", p: [W, y] }, { op: "L", p: [W, y1] }, ...wave, { op: "Z" }];
        prims.push({ kind: "path", segs: region, stroke: null, fill });
        const sides: Pt[] = [[0, y1], [0, y], [W, y], [W, y1]];
        prims.push({ kind: "path", segs: sides.map((pt, k) => (k === 0 ? { op: "M", p: pt } : { op: "L", p: pt })), stroke: "interface", fill: "none" });
        prims.push({ kind: "path", segs: [{ op: "M", p: [W, y1] }, ...wave], stroke: "trait fin", fill: "none" });
      } else {
        prims.push({ kind: "rect", x: 0, y, w: W, h: layer.h, stroke: "interface", fill });
      }
      const text = layer.label || layer.name;
      if (text && p.labels !== "aucune") {
        const mid = y + layer.h / 2;
        prims.push(
          p.labels === "droite"
            ? { kind: "text", at: [W + 2, mid], text, anchor: "west", halo: false }
            : { kind: "text", at: [2, mid], text, anchor: "west", halo: fill !== "none" },
        );
      }
      y = y1;
    }
    return prims;
  },
  anchors(p) {
    const total = p.layers.reduce((s, l) => s + l.h, 0);
    const out = boxAnchors(0, 0, p.width, total);
    let y = 0;
    p.layers.forEach((l, i) => {
      Object.assign(out, boxAnchors(0, y, p.width, l.h, `layer[${i}].`));
      y += l.h;
    });
    return out;
  },
  summary: (p) =>
    `${p.layers.length} couche${p.layers.length > 1 ? "s" : ""} (${p.layers.map((l) => l.name || "?").join(", ")}), largeur ${p.width} mm`,
};
