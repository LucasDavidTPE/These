/**
 * Empreintes de chargement et leur transformée de Fourier 2D (portage de chausspec/loads.py).
 * Convention : f̂(k1, k2) = ∬ f(x, y) e^{−i(k1 x + k2 y)} dx dy. Pressions en Pa (positives
 * vers le bas), longueurs en m, forces en N. x longitudinal (roulement), y transversal.
 */
import { c, cmul, cscale, j1x, sinc, type C } from "./numerique";

/* ───────────────────────────── profils 1D ───────────────────────────── */

export interface Profil1D {
  ft(k: number): C;
  echantillon(s: number): number;
}

export const creneau = (a: number): Profil1D => ({
  ft: (k) => c(2 * a * sinc((k * a) / Math.PI)),
  echantillon: (s) => (Math.abs(s) < a ? 1 : 0),
});

/** √(1 − (s/c)²) : profil longitudinal du TFE. */
export const demiEllipse = (cc: number): Profil1D => ({
  ft: (k) => c(Math.PI * cc * j1x(k * cc)),
  echantillon: (s) => Math.sqrt(Math.max(0, 1 - (s / cc) ** 2)),
});

/** Σ Pᵢ [g(s − sᵢ) + g(s + sᵢ)], g gaussienne d'écart-type σᵢ (fonction transversale du TFE). */
export const pairesGaussiennes = (P: readonly number[], centres: readonly number[], sig: readonly number[]): Profil1D => ({
  ft: (k) => {
    let v = 0;
    for (let i = 0; i < P.length; i++) v += P[i]! * sig[i]! * Math.sqrt(2 * Math.PI) * Math.exp(-0.5 * (k * sig[i]!) ** 2) * 2 * Math.cos(k * centres[i]!);
    return c(v);
  },
  echantillon: (u) => {
    let v = 0;
    for (let i = 0; i < P.length; i++) v += P[i]! * (Math.exp(-((u - centres[i]!) ** 2) / (2 * sig[i]! ** 2)) + Math.exp(-((u + centres[i]!) ** 2) / (2 * sig[i]! ** 2)));
    return v;
  },
});

/** Profil tabulé, interpolé linéairement (nul hors plage), transformée exacte de l'interpolant. */
export function tabule(s0: readonly number[], f0: readonly number[]): Profil1D {
  let s = [...s0],
    f = [...f0];
  const d0 = s.slice(1).map((v, i) => v - s[i]!);
  const moy = d0.reduce((a, b) => a + b, 0) / d0.length;
  if (Math.max(...d0) - Math.min(...d0) > 1e-9 * moy) {
    const n = s.length,
      s2 = Array.from({ length: n }, (_, i) => s[0]! + ((s[n - 1]! - s[0]!) * i) / (n - 1));
    f = s2.map((v) => interp(v, s, f));
    s = s2;
  }
  const d = s[1]! - s[0]!;
  if (f[0] !== 0 || f[f.length - 1] !== 0) {
    s = [s[0]! - d, ...s, s[s.length - 1]! + d];
    f = [0, ...f, 0];
  }
  return {
    ft: (k) => {
      let re = 0,
        im = 0;
      for (let n = 0; n < s.length; n++) {
        re += f[n]! * Math.cos(k * s[n]!);
        im -= f[n]! * Math.sin(k * s[n]!);
      }
      const m = d * sinc((k * d) / (2 * Math.PI)) ** 2;
      return { re: m * re, im: m * im };
    },
    echantillon: (u) => (u < s[0]! || u > s[s.length - 1]! ? 0 : interp(u, s, f)),
  };
}

function interp(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[xs.length - 1]!) return ys[ys.length - 1]!;
  let i = 1;
  while (xs[i]! < x) i++;
  const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
}

/* ───────────────────────────── empreintes 2D ───────────────────────────── */

export interface Empreinte {
  ft(k1: number, k2: number): C;
  /**
   * Transformée sur une grille tensorielle (k1 le long des colonnes, k2 des lignes) :
   * tableau entrelacé (nk2 × nk1). Les empreintes séparables l'évaluent sans produit
   * point par point.
   */
  ftGrille?(k1: Float64Array, k2: Float64Array): Float64Array;
  echantillon(x: number, y: number): number;
}

export const force = (e: Empreinte): number => e.ft(0, 0).re;

export function echelle(base: Empreinte, facteur: number): Empreinte {
  return {
    ft: (a, b) => cscale(base.ft(a, b), facteur),
    ftGrille: base.ftGrille ? (k1, k2) => base.ftGrille!(k1, k2).map((v) => v * facteur) : undefined,
    echantillon: (x, y) => facteur * base.echantillon(x, y),
  };
}

/** Empreinte multipliée pour que sa résultante vaille F (N). */
export const ramenerA = (e: Empreinte, F: number): Empreinte => echelle(e, F / force(e));

function separableGrille(fx: (k: number) => C, fy: (k: number) => C, amp: number) {
  return (k1: Float64Array, k2: Float64Array) => {
    const a = Array.from(k1, fx),
      b = Array.from(k2, fy);
    const out = new Float64Array(2 * k1.length * k2.length);
    let o = 0;
    for (const y of b)
      for (const x of a) {
        out[o++] = amp * (x.re * y.re - x.im * y.im);
        out[o++] = amp * (x.re * y.im + x.im * y.re);
      }
    return out;
  };
}

export function rectangle(p: number, lx: number, ly: number): Empreinte {
  const fx = (k: number) => c(lx * sinc((k * lx) / (2 * Math.PI))),
    fy = (k: number) => c(ly * sinc((k * ly) / (2 * Math.PI)));
  return {
    ft: (a, b) => c(p * fx(a).re * fy(b).re),
    ftGrille: separableGrille(fx, fy, p),
    echantillon: (x, y) => (Math.abs(x) < lx / 2 && Math.abs(y) < ly / 2 ? p : 0),
  };
}

export function disque(p: number, R: number): Empreinte {
  return {
    ft: (a, b) => c(p * 2 * Math.PI * R * R * j1x(Math.hypot(a, b) * R)),
    echantillon: (x, y) => (Math.hypot(x, y) <= R ? p : 0),
  };
}

/** p(x, y) = A·fx(x)·fy(y). */
export function separable(fx: Profil1D, fy: Profil1D, amplitude = 1): Empreinte {
  return {
    ft: (a, b) => cscale(cmul(fx.ft(a), fy.ft(b)), amplitude),
    ftGrille: separableGrille(fx.ft, fy.ft, amplitude),
    echantillon: (x, y) => amplitude * fx.echantillon(x) * fy.echantillon(y),
  };
}

/**
 * Carte de pression mesurée, constante par pixel : x (nx), y (ny) centres des pixels (pas
 * réguliers), P[j][i] en Pa. Transformée exacte :
 * p̂ = dx sinc(k1 dx/2) dy sinc(k2 dy/2) Σ P_ji e^{−i(k1 xᵢ + k2 yⱼ)}.
 */
export function carte(x: readonly number[], y: readonly number[], P: readonly (readonly number[])[]): Empreinte {
  if (P.length !== y.length || P.some((l) => l.length !== x.length)) throw new Error("Carte de pression : P doit compter une ligne par y et une colonne par x.");
  const dx = x.length > 1 ? x[1]! - x[0]! : 1,
    dy = y.length > 1 ? y[1]! - y[0]! : 1;
  const pix = (a: number, b: number) => dx * sinc((a * dx) / (2 * Math.PI)) * dy * sinc((b * dy) / (2 * Math.PI));
  const ft = (a: number, b: number): C => {
    let re = 0,
      im = 0;
    for (let j = 0; j < y.length; j++) {
      for (let i = 0; i < x.length; i++) {
        const v = P[j]![i]!;
        if (v === 0) continue;
        const t = -(a * x[i]! + b * y[j]!);
        re += v * Math.cos(t);
        im += v * Math.sin(t);
      }
    }
    const m = pix(a, b);
    return { re: re * m, im: im * m };
  };
  return {
    ft,
    ftGrille: (k1, k2) => {
      // S = Ey · P · Ex, avec Ex (nx × nk1), Ey (nk2 × ny)
      const nx = x.length,
        ny = y.length,
        n1 = k1.length,
        n2 = k2.length;
      const PEx = new Float64Array(2 * ny * n1); // (ny × nk1)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const v = P[j]![i]!;
          if (v === 0) continue;
          for (let q = 0; q < n1; q++) {
            const t = -k1[q]! * x[i]!;
            PEx[2 * (j * n1 + q)] = PEx[2 * (j * n1 + q)]! + v * Math.cos(t);
            PEx[2 * (j * n1 + q) + 1] = PEx[2 * (j * n1 + q) + 1]! + v * Math.sin(t);
          }
        }
      const out = new Float64Array(2 * n2 * n1);
      for (let r = 0; r < n2; r++)
        for (let j = 0; j < ny; j++) {
          const t = -k2[r]! * y[j]!,
            er = Math.cos(t),
            ei = Math.sin(t);
          for (let q = 0; q < n1; q++) {
            const pr = PEx[2 * (j * n1 + q)]!,
              pi = PEx[2 * (j * n1 + q) + 1]!;
            out[2 * (r * n1 + q)] = out[2 * (r * n1 + q)]! + er * pr - ei * pi;
            out[2 * (r * n1 + q) + 1] = out[2 * (r * n1 + q) + 1]! + er * pi + ei * pr;
          }
        }
      for (let r = 0; r < n2; r++)
        for (let q = 0; q < n1; q++) {
          const m = pix(k1[q]!, k2[r]!);
          out[2 * (r * n1 + q)] = out[2 * (r * n1 + q)]! * m;
          out[2 * (r * n1 + q) + 1] = out[2 * (r * n1 + q) + 1]! * m;
        }
      return out;
    },
    echantillon: (xx, yy) => {
      const i = Math.round((xx - x[0]!) / dx),
        j = Math.round((yy - y[0]!) / dy);
      return i >= 0 && i < x.length && j >= 0 && j < y.length ? P[j]![i]! : 0;
    },
  };
}

/* ───────────────────────────── roues et chargement ───────────────────────────── */

export interface Roue {
  empreinte: Empreinte;
  x0: number;
  y0: number;
  /** Efforts tangentiels : coefficient (q = coef·p) ou empreinte de cisaillement. */
  qx?: number | Empreinte | null;
  qy?: number | Empreinte | null;
}

export class Chargement {
  constructor(readonly roues: Roue[]) {}

  get tangentiel(): boolean {
    return this.roues.some((r) => (r.qx ?? null) !== null || (r.qy ?? null) !== null);
  }

  force(): number {
    return this.roues.reduce((s, r) => s + force(r.empreinte), 0);
  }

  echantillon(x: number, y: number): number {
    return this.roues.reduce((s, r) => s + r.empreinte.echantillon(x - r.x0, y - r.y0), 0);
  }

  /**
   * (p̂, q̂x, q̂y) sur la grille tensorielle (k2 en lignes, k1 en colonnes), entrelacés ;
   * q̂x, q̂y nuls si aucun effort tangentiel.
   */
  ftGrille(k1: Float64Array, k2: Float64Array): { p: Float64Array; qx: Float64Array | null; qy: Float64Array | null } {
    const n1 = k1.length,
      n2 = k2.length;
    const p = new Float64Array(2 * n1 * n2);
    const tang = this.tangentiel;
    const qx = tang ? new Float64Array(2 * n1 * n2) : null,
      qy = tang ? new Float64Array(2 * n1 * n2) : null;
    for (const r of this.roues) {
      const g = grille(r.empreinte, k1, k2);
      const ajouter = (dest: Float64Array, src: Float64Array, coef: number) => {
        for (let j = 0; j < n2; j++)
          for (let i = 0; i < n1; i++) {
            const o = 2 * (j * n1 + i);
            const t = -(k1[i]! * r.x0 + k2[j]! * r.y0);
            const cr = Math.cos(t),
              ci = Math.sin(t);
            dest[o] = dest[o]! + coef * (src[o]! * cr - src[o + 1]! * ci);
            dest[o + 1] = dest[o + 1]! + coef * (src[o]! * ci + src[o + 1]! * cr);
          }
      };
      ajouter(p, g, 1);
      for (const [q, dest] of [
        [r.qx, qx],
        [r.qy, qy],
      ] as const) {
        if (q === null || q === undefined || !dest) continue;
        if (typeof q === "number") ajouter(dest, g, q);
        else ajouter(dest, grille(q, k1, k2), 1);
      }
    }
    return { p, qx, qy };
  }
}

function grille(e: Empreinte, k1: Float64Array, k2: Float64Array): Float64Array {
  if (e.ftGrille) return e.ftGrille(k1, k2);
  const out = new Float64Array(2 * k1.length * k2.length);
  let o = 0;
  for (let j = 0; j < k2.length; j++)
    for (let i = 0; i < k1.length; i++) {
      const v = e.ft(k1[i]!, k2[j]!);
      out[o++] = v.re;
      out[o++] = v.im;
    }
  return out;
}
