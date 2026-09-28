/**
 * Retouches des données d'un graphe (page Graphes) : chaque fonction rend une nouvelle
 * série, sans modifier celle reçue (l'historique Annuler / Rétablir en dépend).
 */
import type { Series } from "./model";

export interface Affine {
  /** v' = v × scale + offset */
  scale: number;
  offset: number;
}

/** Changement d'unité, de signe ou d'origine sur x et/ou y (12 chiffres gardés : pas de bruit binaire). */
export function transform(s: Series, x: Affine | null, y: Affine | null): Series {
  const f = (a: Affine | null) => (v: number) => (a ? Number((v * a.scale + a.offset).toPrecision(12)) : v);
  return { ...s, x: s.x.map(f(x)), y: s.y.map(f(y)) };
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const inside = (b: Box, x: number, y: number) => x >= Math.min(b.x0, b.x1) && x <= Math.max(b.x0, b.x1) && y >= Math.min(b.y0, b.y1) && y <= Math.max(b.y0, b.y1);

/** Points dans le rectangle (gomme) : retirés. Renvoie aussi leur nombre. */
export function eraseBox(s: Series, b: Box): { series: Series; removed: number } {
  const keep = s.x.map((x, i) => !inside(b, x, s.y[i]!));
  const removed = keep.filter((k) => !k).length;
  return { series: removed ? { ...s, x: s.x.filter((_, i) => keep[i]), y: s.y.filter((_, i) => keep[i]) } : s, removed };
}

/** Garde (ou retire, `keep` faux) les points dont x est dans [lo, hi]. */
export function xRange(s: Series, lo: number, hi: number, keep = true): Series {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  const ok = s.x.map((x) => (x >= a && x <= b) === keep);
  return { ...s, x: s.x.filter((_, i) => ok[i]), y: s.y.filter((_, i) => ok[i]) };
}

/** Moyenne glissante centrée sur y (fenêtre impaire, bords : fenêtre tronquée). */
export function smooth(s: Series, window: number): Series {
  const h = Math.max(0, Math.floor(Math.max(1, Math.round(window)) / 2));
  if (h === 0) return s;
  const y = s.y.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(s.y.length - 1, i + h); j++) {
      sum += s.y[j]!;
      n++;
    }
    return sum / n;
  });
  return { ...s, y };
}

/** Un point sur n (le premier et le dernier sont gardés). */
export function decimate(s: Series, n: number): Series {
  const k = Math.max(1, Math.round(n));
  if (k === 1 || s.x.length < 3) return s;
  const idx = s.x.map((_, i) => i).filter((i) => i % k === 0 || i === s.x.length - 1);
  return { ...s, x: idx.map((i) => s.x[i]!), y: idx.map((i) => s.y[i]!) };
}

export function sortByX(s: Series): Series {
  const idx = s.x.map((_, i) => i).sort((a, b) => s.x[a]! - s.x[b]! || a - b);
  return { ...s, x: idx.map((i) => s.x[i]!), y: idx.map((i) => s.y[i]!) };
}

/** Échange x et y (tracer ε en fonction de σ au lieu de σ en fonction de ε). */
export function swapXY(s: Series): Series {
  return { ...s, x: [...s.y], y: [...s.x] };
}

/** Tableau x ↹ y (copier vers Excel). */
export function toTsv(s: Series): string {
  return ["x\ty", ...s.x.map((x, i) => `${String(x).replace(".", ",")}\t${String(s.y[i]).replace(".", ",")}`)].join("\n");
}

/**
 * Lit un tableau collé ou retapé (deux colonnes, tabulation, point-virgule ou espaces,
 * virgule décimale acceptée) ; les lignes non numériques (en-tête) sont ignorées.
 */
export function parseXY(text: string): { x: number[]; y: number[]; skipped: number } {
  const x: number[] = [],
    y: number[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.includes("\t") || line.includes(";") ? line.split(/[\t;]/) : line.split(/\s+/);
    const nums = parts.map((p) => Number(p.trim().replace(/\s/g, "").replace(",", ".")));
    if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
      x.push(nums[0]!);
      y.push(nums[1]!);
    } else skipped++;
  }
  return { x, y, skipped };
}
