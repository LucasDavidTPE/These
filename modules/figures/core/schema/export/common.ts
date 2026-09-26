import { formatNumber } from "../../format/number";
import { COMPONENTS } from "../components";
import { layoutFigure, type Layout } from "../layout";
import type { Fill } from "../geometry";
import { validateFigure } from "../validate";
import type { FigureDoc, FigureError } from "../types";

/** Nombre formaté pour l'export : 2 décimales, déterministe. */
export const n = (v: number) => formatNumber(v, 2);

/** Erreur d'export : figure invalide ou ancres introuvables. */
export class FigureExportError extends Error {
  constructor(readonly errors: FigureError[]) {
    super(errors.map((e) => (e.path ? `${e.path} : ${e.message}` : e.message)).join("\n"));
  }
}

/** Valide et met en place la figure ; lève FigureExportError en cas de problème. */
export function prepare(raw: unknown): { doc: FigureDoc; layout: Layout } {
  const v = validateFigure(raw);
  if (!v.ok) throw new FigureExportError(v.errors);
  const layout = layoutFigure(v.doc, COMPONENTS);
  if (layout.errors.length > 0) throw new FigureExportError(layout.errors);
  return { doc: v.doc, layout };
}

/** Hachures utilisées, triées : définitions (SVG) stables. */
export function usedHatches(layout: Layout): string[] {
  const set = new Set<string>();
  for (const p of layout.placed) {
    for (const prim of p.primitives) {
      if ("fill" in prim && typeof prim.fill === "string" && prim.fill.startsWith("hachure ")) set.add(prim.fill.slice(8));
    }
  }
  return [...set].sort();
}

export function isHatch(f: Fill): boolean {
  return f.startsWith("hachure ");
}
