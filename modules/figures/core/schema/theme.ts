/**
 * Thèmes : épaisseurs, couleurs, police, hachures, communs au SVG et au TikZ.
 * `tex/figurine.sty` est **généré** à partir du thème (voir export/sty.ts) et un test
 * vérifie que le fichier livré est à jour : les deux rendus ne peuvent pas diverger.
 */
import type { StrokeRole } from "./geometry";

export type Hatch =
  | { kind: "lines"; angle: number; spacing: number; width: number }
  | { kind: "cross"; angle: number; spacing: number; width: number }
  | { kind: "dots"; spacing: number; radius: number };

export interface Theme {
  name: string;
  /** Couleur de trait (CSS / xcolor, noms communs uniquement). */
  ink: string;
  strokes: Record<StrokeRole, { width: number; color: string }>;
  fills: { gris: string };
  hatchColor: { svg: string; tikz: string };
  hatches: Record<string, Hatch>;
  text: { sizeMm: number; tikzFont: string; svgFamily: string; sizes: Record<"petit" | "grand", { factor: number; tikzFont: string }> };
  /** Pointe de flèche (mm). */
  arrow: { length: number; width: number };
  /** Styles des séries de graphes (S9), dans l'ordre des séries. */
  graph: {
    series: {
      svg: string;
      tikz: string;
      dash: "dashed" | "dotted" | null;
      mark: GraphMark;
      barSvg: string;
      barTikz: string;
      /** Série sans marques, même en « points » impossible : réglage d'une série (graph/style.ts). */
      noMark?: boolean;
      /** Marques pleines. */
      filled?: boolean;
    }[];
    gridSvg: string;
    gridTikz: string;
    markSize: number;
  };
}

export type GraphMark = "o" | "square" | "triangle" | "x" | "diamond" | "+";

/** Thème par défaut : sobre, noir et gris, adapté à une thèse imprimée. */
export const THEME_THESE: Theme = {
  name: "these",
  ink: "black",
  strokes: {
    trait: { width: 0.3, color: "black" },
    "trait fin": { width: 0.18, color: "black" },
    "trait epais": { width: 0.5, color: "black" },
    interface: { width: 0.3, color: "black" },
  },
  fills: { gris: "#e6e6e6" },
  hatchColor: { svg: "#4d4d4d", tikz: "black!70" },
  hatches: {
    bitumineux: { kind: "lines", angle: 45, spacing: 1.2, width: 0.12 },
    "bitumineux-dense": { kind: "cross", angle: 45, spacing: 1.2, width: 0.12 },
    granulaire: { kind: "dots", spacing: 1.6, radius: 0.22 },
    beton: { kind: "dots", spacing: 1, radius: 0.15 },
    sol: { kind: "lines", angle: 135, spacing: 2.4, width: 0.12 },
  },
  arrow: { length: 1.6, width: 1.2 },
  graph: {
    series: [
      { svg: "black", tikz: "black", dash: null, mark: "o", barSvg: "#d9d9d9", barTikz: "black!15" },
      { svg: "black", tikz: "black", dash: "dashed", mark: "square", barSvg: "#8c8c8c", barTikz: "black!45" },
      { svg: "#666666", tikz: "black!60", dash: null, mark: "triangle", barSvg: "#404040", barTikz: "black!75" },
      { svg: "#666666", tikz: "black!60", dash: "dashed", mark: "x", barSvg: "#ffffff", barTikz: "white" },
      { svg: "black", tikz: "black", dash: "dotted", mark: "diamond", barSvg: "#b3b3b3", barTikz: "black!30" },
      { svg: "#999999", tikz: "black!40", dash: null, mark: "+", barSvg: "#666666", barTikz: "black!60" },
    ],
    gridSvg: "#d0d0d0",
    gridTikz: "black!20",
    markSize: 1.3,
  },
  text: {
    sizeMm: 2.82,
    tikzFont: "\\footnotesize",
    svgFamily: "'Latin Modern Roman', 'CMU Serif', 'Times New Roman', serif",
    sizes: { petit: { factor: 0.83, tikzFont: "\\scriptsize" }, grand: { factor: 1.13, tikzFont: "\\small" } },
  },
};

export const THEMES: Record<string, Theme> = { these: THEME_THESE };

export const HATCH_NAMES = Object.keys(THEME_THESE.hatches);
