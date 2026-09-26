/**
 * Géométrie de l'éditeur : boîtes englobantes, test de clic, aimantation (grille, ancres).
 */
import { measureLabel } from "../math/tex";
import { zigzagPoints, type Primitive } from "../schema/geometry";
import type { Layout, PlacedItem } from "../schema/layout";
import type { Pt } from "../schema/types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largeur approximative d'un texte (sans métrique de police) : 0,55 × taille par caractère. */
export function approxTextWidth(text: string, size: number): number {
  const visible = text.replace(/\$|\\[a-zA-Z]+|[{}_^]/g, (m) => (m.startsWith("\\") ? "x" : ""));
  return Math.max(1, visible.length) * size * 0.55;
}

function points(p: Primitive, textSize: number): Pt[] {
  switch (p.kind) {
    case "path":
      return p.segs.flatMap((s) => (s.op === "Z" ? [] : s.op === "C" ? [s.c1, s.c2, s.p] : [s.p]));
    case "rect":
      return [[p.x, p.y], [p.x + p.w, p.y + p.h]];
    case "circle":
      return [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]];
    case "zigzag":
      return zigzagPoints(p);
    case "arrow":
      return [p.from, p.to];
    case "text": {
      const { w, h } = measureLabel(p.text, textSize);
      const hx = p.anchor.includes("west") ? 0 : p.anchor.includes("east") ? -w : -w / 2;
      const vy = p.anchor.includes("north") ? 0 : p.anchor.includes("south") ? -h : -h / 2;
      return [[p.at[0] + hx, p.at[1] + vy], [p.at[0] + hx + w, p.at[1] + vy + h]];
    }
  }
}

export function boxOf(prims: Primitive[], textSize = 2.82): Box | null {
  const pts = prims.flatMap((p) => points(p, textSize));
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function itemBox(p: PlacedItem): Box {
  return boxOf(p.primitives) ?? { x: p.transform.origin[0], y: p.transform.origin[1], w: 0, h: 0 };
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

function inBox(b: Box, p: Pt, tol: number): boolean {
  return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
}

/**
 * Élément sous le point (le plus au-dessus, c'est-à-dire le dernier dessiné). Parmi les
 * boîtes qui contiennent le point, on préfère la plus petite (un ressort posé sur une
 * chaussée doit rester cliquable).
 */
export function hitTest(layout: Layout, p: Pt, tol = 1): string | null {
  let best: { id: string; area: number; order: number } | null = null;
  layout.placed.forEach((item, order) => {
    const b = itemBox(item);
    if (!inBox(b, p, tol)) return;
    const area = (b.w + 2 * tol) * (b.h + 2 * tol);
    if (!best || area < best.area - 1e-9 || (Math.abs(area - best.area) <= 1e-9 && order > best.order)) {
      best = { id: item.item.id, area, order };
    }
  });
  return (best as { id: string } | null)?.id ?? null;
}

/** Éléments entièrement contenus dans le rectangle de sélection. */
export function itemsInRect(layout: Layout, r: Box): string[] {
  const x0 = Math.min(r.x, r.x + r.w);
  const y0 = Math.min(r.y, r.y + r.h);
  const x1 = Math.max(r.x, r.x + r.w);
  const y1 = Math.max(r.y, r.y + r.h);
  return layout.placed
    .filter((p) => {
      const b = itemBox(p);
      return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
    })
    .map((p) => p.item.id);
}

export function snapValue(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

export function snapPoint(p: Pt, grid: number): Pt {
  return [snapValue(p[0], grid), snapValue(p[1], grid)];
}

/** Ancre la plus proche de `p` à moins de `tol` mm, hors des éléments exclus. */
export function nearestAnchor(layout: Layout, p: Pt, tol: number, exclude: ReadonlySet<string> = new Set()): { ref: string; point: Pt } | null {
  let best: { ref: string; point: Pt; d: number } | null = null;
  for (const item of layout.placed) {
    if (exclude.has(item.item.id)) continue;
    for (const [name, pt] of Object.entries(item.anchors)) {
      const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]);
      if (d <= tol && (!best || d < best.d - 1e-9)) best = { ref: `${item.item.id}.${name}`, point: pt, d };
    }
  }
  return best ? { ref: best.ref, point: best.point } : null;
}
