/**
 * Rhéologie : éléments de base (ressort, amortisseur, élément parabolique, patin) et
 * réseaux série / parallèle pour les modèles composés (Maxwell, Kelvin-Voigt, Maxwell
 * généralisé, KVG, 2S2P1D). Tout est dessiné le long de l'axe x, de 0 à la longueur.
 */
import { polyline, transformPrimitive, type Primitive } from "../geometry";
import type { Pt } from "../types";

export type ElementKind = "spring" | "dashpot" | "parabolic" | "slider";

export type RheoNode =
  | { kind: ElementKind; label?: string; weight?: number }
  | { kind: "series"; items: RheoNode[]; weight?: number }
  | { kind: "parallel"; branches: RheoNode[]; weight?: number };

export interface RheoStyle {
  /** Demi-largeur des ressorts. */
  amplitude: number;
  /** Largeur des cylindres (amortisseur, parabolique) et hauteur du patin. */
  width: number;
  /** Nombre de spires des ressorts. */
  coils: number;
  /** Écart vertical supplémentaire entre branches parallèles. */
  gap: number;
  /** Fil entre l'extrémité et la barre d'un montage parallèle. */
  lead: number;
}

export const DEFAULT_RHEO_STYLE: RheoStyle = { amplitude: 2, width: 5, coils: 4, gap: 2, lead: 2 };

/** Longueur maximale d'un élément simple dans un réseau (mm). */
export const MAX_ELEMENT_LENGTH = 22;

/** Place à réserver au-dessus d'un élément pour son étiquette. */
const LABEL_ROOM = 4.5;

function floor2(v: number): number {
  return Math.floor(v * 100 + 1e-9) / 100;
}

function label(text: string | undefined, x: number, y: number): Primitive[] {
  return text ? [{ kind: "text", at: [x, y], text, anchor: "south", halo: false, away: [0, -1] }] : [];
}

/** Géométrie d'un élément de base de longueur `len`, centré sur y = 0. */
export function elementPrims(kind: ElementKind, len: number, st: RheoStyle, text?: string): Primitive[] {
  const hw = st.width / 2;
  switch (kind) {
    case "spring": {
      const lead = Math.min(3, len / 4);
      const segment = floor2((len - 2 * lead - 0.02) / st.coils);
      return [
        { kind: "zigzag", from: [0, 0], to: [len, 0], segment, amplitude: st.amplitude, pre: lead, post: lead, stroke: "trait" },
        ...label(text, len / 2, -st.amplitude - 1),
      ];
    }
    case "dashpot":
    case "parabolic": {
      const depth = Math.min(6, len * 0.5);
      const a = (len - depth) / 2;
      const xp = a + depth * 0.55;
      const prims: Primitive[] = [
        polyline([[0, 0], [a, 0]]),
        polyline([[a + depth, -hw], [a, -hw], [a, hw], [a + depth, hw]]),
        polyline([[xp, 0], [len, 0]]),
      ];
      if (kind === "dashpot") {
        prims.push(polyline([[xp, -hw * 0.7], [xp, hw * 0.7]]));
      } else {
        // Élément parabolique : piston en arc de parabole (convexe vers la tige).
        const b = hw * 0.7;
        const bulge = depth * 0.3;
        prims.push({
          kind: "path",
          segs: [
            { op: "M", p: [xp - bulge, -b] },
            { op: "C", c1: [xp + bulge / 3, -b / 3], c2: [xp + bulge / 3, b / 3], p: [xp - bulge, b] },
          ],
          stroke: "trait",
          fill: "none",
        });
      }
      return [...prims, ...label(text, len / 2, -hw - 1)];
    }
    case "slider": {
      // Patin (frottement) : bloc posé sur une surface hachurée.
      const w = Math.min(7, len * 0.5);
      const h = st.width * 0.7;
      const a = (len - w) / 2;
      const ys = h / 2;
      const prims: Primitive[] = [
        polyline([[0, 0], [a, 0]]),
        { kind: "rect", x: a, y: -h / 2, w, h, stroke: "trait", fill: "none" },
        polyline([[a + w, 0], [len, 0]]),
        polyline([[a - 1.5, ys], [a + w + 1.5, ys]]),
      ];
      for (let x = a - 1; x <= a + w + 1.5; x += 1.5) prims.push(polyline([[x, ys], [x - 1, ys + 1]], "trait fin"));
      return [...prims, ...label(text, len / 2, -h / 2 - 1)];
    }
  }
}

/** Encombrement vertical (au-dessus / au-dessous de l'axe) d'un nœud. */
export function extent(node: RheoNode, st: RheoStyle): { up: number; down: number } {
  switch (node.kind) {
    case "series": {
      const e = node.items.map((i) => extent(i, st));
      return { up: Math.max(0, ...e.map((x) => x.up)), down: Math.max(0, ...e.map((x) => x.down)) };
    }
    case "parallel": {
      const total = node.branches.reduce((s, b) => {
        const e = extent(b, st);
        return s + e.up + e.down;
      }, 0) + st.gap * (node.branches.length - 1);
      return { up: total / 2, down: total / 2 };
    }
    default: {
      const half = node.kind === "spring" ? st.amplitude : st.width / 2;
      return { up: half + (node.label ? LABEL_ROOM : 1), down: half + 1 };
    }
  }
}

function weightOf(node: RheoNode): number {
  if (node.weight !== undefined) return node.weight;
  if (node.kind === "series") return node.items.reduce((s, i) => s + weightOf(i), 0);
  if (node.kind === "parallel") return Math.max(...node.branches.map(weightOf)) + 0.3;
  return 1;
}

export interface RheoAnchors {
  [name: string]: Pt;
}

/**
 * Dessine `node` entre x0 et x1 sur l'axe y. Les nœuds reçoivent des ancres
 * `<prefix>start` / `<prefix>end` ; les montages parallèles numérotent leurs branches.
 */
export function layoutNode(node: RheoNode, x0: number, x1: number, y: number, st: RheoStyle, out: Primitive[], anchors: RheoAnchors, prefix = ""): void {
  anchors[`${prefix}start`] = [x0, y];
  anchors[`${prefix}end`] = [x1, y];
  switch (node.kind) {
    case "series": {
      const total = node.items.reduce((s, i) => s + weightOf(i), 0) || 1;
      let x = x0;
      node.items.forEach((item, i) => {
        const w = ((x1 - x0) * weightOf(item)) / total;
        layoutNode(item, x, x + w, y, st, out, anchors, `${prefix}item[${i}].`);
        x += w;
      });
      return;
    }
    case "parallel": {
      const xa = x0 + st.lead;
      const xb = x1 - st.lead;
      const ext = node.branches.map((b) => extent(b, st));
      const total = ext.reduce((s, e) => s + e.up + e.down, 0) + st.gap * (node.branches.length - 1);
      let top = y - total / 2;
      const ys = ext.map((e) => {
        const yc = top + e.up;
        top += e.up + e.down + st.gap;
        return yc;
      });
      out.push(polyline([[x0, y], [xa, y]]), polyline([[xb, y], [x1, y]]));
      out.push(polyline([[xa, ys[0]!], [xa, ys.at(-1)!]]), polyline([[xb, ys[0]!], [xb, ys.at(-1)!]]));
      node.branches.forEach((b, i) => layoutNode(b, xa, xb, ys[i]!, st, out, anchors, `${prefix}branch[${i}].`));
      return;
    }
    default: {
      // Un élément seul dans une longue branche garde une taille normale, centré, relié par
      // des fils (sinon un ressort s'étire sur toute la largeur).
      const len = Math.min(x1 - x0, MAX_ELEMENT_LENGTH);
      const xs = x0 + (x1 - x0 - len) / 2;
      if (xs > x0) out.push(polyline([[x0, y], [xs, y]]), polyline([[xs + len, y], [x1, y]]));
      for (const p of elementPrims(node.kind, len, st, node.label)) {
        out.push(transformPrimitive({ origin: [xs, y], deg: 0 }, p));
      }
    }
  }
}

/** Remplace `{i}` par le numéro (à partir de 1) dans un modèle d'étiquette : « $E_{i}$ » → « $E_{3}$ ». */
export function numbered(template: string, i: number): string {
  return template.replace(/\{i\}/g, `{${i}}`);
}
