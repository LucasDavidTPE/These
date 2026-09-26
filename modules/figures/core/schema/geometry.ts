/**
 * Primitives géométriques produites par les composants, en mm, y vers le bas.
 * Les exporteurs SVG et TikZ ne connaissent que ces primitives.
 */
import type { Pt } from "./types";

/** Rôles de trait définis par le thème (et par figurine.sty côté TikZ). */
export type StrokeRole = "trait" | "trait fin" | "trait epais" | "interface";
/** Remplissage : aucun, blanc, gris clair, ou hachure nommée du thème. */
export type Fill = "none" | "blanc" | "gris" | `hachure ${string}`;
/** Ancres de texte, mêmes noms que TikZ. */
export type TextAnchor =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "north east"
  | "north west"
  | "south east"
  | "south west";

export type Seg = { op: "M"; p: Pt } | { op: "L"; p: Pt } | { op: "C"; c1: Pt; c2: Pt; p: Pt } | { op: "Z" };

export type Primitive =
  | { kind: "path"; segs: Seg[]; stroke: StrokeRole | null; fill: Fill; dash?: boolean | "dotted"; color?: string; fillColor?: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; stroke: StrokeRole | null; fill: Fill; color?: string; fillColor?: string }
  | { kind: "circle"; c: Pt; r: number; stroke: StrokeRole | null; fill: Fill; color?: string; fillColor?: string }
  /** Flèche droite ; pointe(s) « Stealth » dessinée(s) par le thème. */
  | { kind: "arrow"; from: Pt; to: Pt; stroke: StrokeRole; head: "end" | "start" | "both" }
  /** Zigzag de ressort, identique à la décoration TikZ `zigzag`. */
  | { kind: "zigzag"; from: Pt; to: Pt; segment: number; amplitude: number; pre: number; post: number; stroke: StrokeRole }
  /**
   * `halo` : fond blanc derrière le texte (lisible sur une hachure).
   * `away` : si présent, l'ancre est choisie pour que le texte s'écarte du point `at`
   * dans cette direction (locale), même après rotation du composant.
   */
  | { kind: "text"; at: Pt; text: string; anchor: TextAnchor; halo: boolean; away?: Pt; size?: TextSize; rotate?: number };

/** Taille relative d'un texte : petit (\scriptsize), normal (thème), grand (\small). */
export type TextSize = "petit" | "normal" | "grand";

export function polyline(points: Pt[], stroke: StrokeRole | null = "trait", fill: Fill = "none", closed = false): Primitive {
  const segs: Seg[] = points.map((p, i) => (i === 0 ? { op: "M", p } : { op: "L", p }));
  if (closed) segs.push({ op: "Z" });
  return { kind: "path", segs, stroke, fill };
}

export function add(a: Pt, b: Pt): Pt {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1]];
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Transformation d'un repère local (origine, rotation `deg` dans le sens trigonométrique
 * **visuel**) vers la planche. Avec y vers le bas, une rotation visuelle anti-horaire
 * de θ s'écrit x' = x cos θ + y sin θ, y' = −x sin θ + y cos θ.
 */
export interface Transform {
  origin: Pt;
  deg: number;
}

export function applyTransform(t: Transform, p: Pt): Pt {
  const a = (t.deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [t.origin[0] + p[0] * c + p[1] * s, t.origin[1] - p[0] * s + p[1] * c];
}

function isAxisAligned(deg: number): boolean {
  return ((deg % 360) + 360) % 360 === 0;
}

export function transformPrimitive(t: Transform, prim: Primitive): Primitive {
  const f = (p: Pt) => applyTransform(t, p);
  switch (prim.kind) {
    case "path":
      return {
        ...prim,
        segs: prim.segs.map((s) =>
          s.op === "Z" ? s : s.op === "C" ? { op: "C", c1: f(s.c1), c2: f(s.c2), p: f(s.p) } : { op: s.op, p: f(s.p) },
        ),
      };
    case "rect":
      if (isAxisAligned(t.deg)) return { ...prim, x: prim.x + t.origin[0], y: prim.y + t.origin[1] };
      return transformPrimitive(t, {
        kind: "path",
        segs: [
          { op: "M", p: [prim.x, prim.y] },
          { op: "L", p: [prim.x + prim.w, prim.y] },
          { op: "L", p: [prim.x + prim.w, prim.y + prim.h] },
          { op: "L", p: [prim.x, prim.y + prim.h] },
          { op: "Z" },
        ],
        stroke: prim.stroke,
        fill: prim.fill,
      });
    case "circle":
      return { ...prim, c: f(prim.c) };
    case "zigzag":
    case "arrow":
      return { ...prim, from: f(prim.from), to: f(prim.to) };
    case "text": {
      if (!prim.away) return { ...prim, at: f(prim.at) };
      const o = applyTransform({ origin: [0, 0], deg: t.deg }, prim.away);
      return { ...prim, at: f(prim.at), anchor: anchorAway(o), away: o };
    }
  }
}

/** Ancre TikZ pour un texte qui s'écarte de son point dans la direction `d` (y vers le bas). */
export function anchorAway(d: Pt): TextAnchor {
  const [dx, dy] = d;
  const len = Math.hypot(dx, dy) || 1;
  const h = dx / len > 0.38 ? "west" : dx / len < -0.38 ? "east" : "";
  const v = dy / len < -0.38 ? "south" : dy / len > 0.38 ? "north" : "";
  if (h && v) return `${v} ${h}` as TextAnchor;
  return (v || h || "center") as TextAnchor;
}

/**
 * Points du zigzag, tels que TikZ les trace (`decoration={zigzag}`) : segment droit
 * `pre`, puis des dents de longueur `segment` (sommet à +amplitude au quart, à −amplitude
 * aux trois quarts, amplitude positive à gauche du sens de parcours), puis droit jusqu'au bout.
 */
export function zigzagPoints(z: { from: Pt; to: Pt; segment: number; amplitude: number; pre: number; post: number }): Pt[] {
  const L = dist(z.from, z.to);
  if (L === 0) return [z.from, z.to];
  const d: Pt = [(z.to[0] - z.from[0]) / L, (z.to[1] - z.from[1]) / L];
  // « Gauche » visuelle avec y vers le bas.
  const n: Pt = [d[1], -d[0]];
  const at = (u: number, v: number): Pt => [z.from[0] + d[0] * u + n[0] * v, z.from[1] + d[1] * u + n[1] * v];
  const pts: Pt[] = [z.from, at(z.pre, 0)];
  const available = L - z.pre - z.post;
  // Tolérance : les longueurs sont arrondies au centième à l'export.
  const count = z.segment > 0 ? Math.floor(available / z.segment + 1e-6) : 0;
  for (let k = 0; k < count; k++) {
    const base = z.pre + k * z.segment;
    pts.push(at(base + 0.25 * z.segment, z.amplitude), at(base + 0.75 * z.segment, -z.amplitude), at(base + z.segment, 0));
  }
  pts.push(z.to);
  return pts;
}

/**
 * Bord ondulé horizontal de `x0` à `x1` à la hauteur `y` (demi-espace indéfini) :
 * suite de demi-ondes en Bézier cubiques, `waves` ondes complètes.
 */
export function wavySegs(x0: number, x1: number, y: number, amplitude: number, waves: number): Seg[] {
  const halves = Math.max(1, Math.round(waves)) * 2;
  const step = (x1 - x0) / halves;
  const k = (4 / 3) * amplitude;
  const segs: Seg[] = [];
  for (let i = 0; i < halves; i++) {
    const xa = x0 + i * step;
    const sgn = i % 2 === 0 ? -1 : 1;
    segs.push({ op: "C", c1: [xa + step / 3, y + sgn * k], c2: [xa + (2 * step) / 3, y + sgn * k], p: [xa + step, y] });
  }
  return segs;
}

/**
 * Pointe de flèche « Stealth » (comme TikZ `arrows.meta`) : triangle à base échancrée,
 * pointe en `tip`, dirigée selon `from → tip`. `length` et `width` en mm.
 */
export function stealthHead(from: Pt, tip: Pt, length: number, width: number): Pt[] {
  const L = dist(from, tip) || 1;
  const d: Pt = [(tip[0] - from[0]) / L, (tip[1] - from[1]) / L];
  const nrm: Pt = [-d[1], d[0]];
  const back: Pt = [tip[0] - d[0] * length, tip[1] - d[1] * length];
  const inset: Pt = [tip[0] - d[0] * length * 0.75, tip[1] - d[1] * length * 0.75];
  return [
    tip,
    [back[0] + (nrm[0] * width) / 2, back[1] + (nrm[1] * width) / 2],
    inset,
    [back[0] - (nrm[0] * width) / 2, back[1] - (nrm[1] * width) / 2],
  ];
}

/** Point à la distance `t` de `a` vers `b`. */
export function along(a: Pt, b: Pt, t: number): Pt {
  const L = dist(a, b) || 1;
  return [a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L];
}
