/**
 * Interface d'un composant de schéma (documentée dans docs/COMPOSANTS.md).
 *
 * Un composant décrit, à partir de ses paramètres validés :
 * - sa géométrie (primitives en coordonnées locales, mm, y vers le bas) ;
 * - ses ancres nommées (points locaux) ;
 * - un résumé d'une ligne pour le commentaire TikZ.
 * Le placement (translation, rotation, extrémités) et les rendus SVG / TikZ sont communs.
 */
import type { Primitive } from "./geometry";
import type { ParamSchema } from "./params";
import type { FigureError, Pt } from "./types";

export type Category = "rheologie" | "structure" | "chargement" | "annotation" | "libre";

/**
 * - `point` : placé par `at` (ou `on`, une ancre), avec rotation facultative ;
 * - `segment` : placé par `from` / `to` (ancres ou points) et orienté le long de ce
 *   segment ; ou par `at` + le paramètre `length` + `rotate`. Sa géométrie locale va de
 *   (0, 0) à (longueur, 0).
 */
export type Placement = "point" | "segment";

export interface GeometryContext {
  /** Longueur effective d'un composant `segment`. */
  length: number;
}

export interface ComponentDef<P = Record<string, unknown>> {
  type: string;
  /** Nom affiché (français). */
  label: string;
  category: Category;
  placement: Placement;
  params: ParamSchema;
  /** Contrôles croisés entre paramètres (au-delà du schéma). */
  check?(p: P): FigureError[];
  geometry(p: P, ctx: GeometryContext): Primitive[];
  anchors(p: P, ctx: GeometryContext): Record<string, Pt>;
  /** Résumé pour le commentaire de l'export TikZ, par ex. « 4 couches, largeur 110 mm ». */
  summary(p: P, ctx: GeometryContext): string;
}

/** Ancres standard d'une boîte (x, y, w, h) : center, top, bottom, left, right, coins. */
export function boxAnchors(x: number, y: number, w: number, h: number, prefix = ""): Record<string, Pt> {
  const a: Record<string, Pt> = {
    center: [x + w / 2, y + h / 2],
    top: [x + w / 2, y],
    bottom: [x + w / 2, y + h],
    left: [x, y + h / 2],
    right: [x + w, y + h / 2],
    "top.left": [x, y],
    "top.right": [x + w, y],
    "bottom.left": [x, y + h],
    "bottom.right": [x + w, y + h],
  };
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [prefix + k, v]));
}

/** Ancres d'un composant linéaire de longueur L : start, end, center. */
export function segmentAnchors(L: number): Record<string, Pt> {
  return { start: [0, 0], end: [L, 0], center: [L / 2, 0] };
}
