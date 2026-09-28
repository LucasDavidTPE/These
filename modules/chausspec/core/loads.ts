/**
 * Empreintes de chargement et leur transformée de Fourier 2D (loads.py).
 *
 * Axes : x = longitudinal (sens de roulement), y = transversal, z = profondeur (vers le bas).
 * Convention de Fourier :  f^(k1, k2) = int int f(x, y) exp(-i (k1 x + k2 y)) dx dy.
 *
 * Toutes les pressions sont en Pa, les longueurs en m, les forces en N. Une pression positive
 * est dirigée vers le bas (compression de la surface).
 *
 * Chaque empreinte fournit :
 *   ft(k1, k2)     : transformée analytique (ou exacte pour une carte en pixels), aux points
 *                    (k1[i], k2[i]) ;
 *   ftGrid(k1, k2) : la même sur la grille tensorielle k2 (lignes) × k1 (colonnes). Le Python
 *                    reconnaît cette grille à l'intérieur de ft ; ici c'est une méthode dédiée,
 *                    que les empreintes séparables et les cartes évaluent sans produit point
 *                    par point ;
 *   sample(x, y)   : valeur dans l'espace physique (tracés, contrôles) ;
 *   force()        : résultante = ft(0, 0).
 */
import { CArray, matmul, meshgrid, mul, phases } from "./carray";
import { j1x, sinc } from "./special";

// =========================================================================================
// Profils 1D (pour les empreintes séparables p(x, y) = A . fx(x) . fy(y))
// =========================================================================================
export abstract class Profile1D {
  abstract ft(k: Float64Array): CArray;
  abstract sample(s: number): number;

  integral(): number {
    return this.ft(Float64Array.of(0)).re[0]!;
  }
}

/** Créneau unitaire de demi-largeur a centré en 0. */
export class Box1D extends Profile1D {
  constructor(readonly a: number) {
    super();
  }
  ft(k: Float64Array): CArray {
    return CArray.real(k.map((v) => 2 * this.a * sinc((v * this.a) / Math.PI)));
  }
  sample(s: number): number {
    return Math.abs(s) < this.a ? 1 : 0;
  }
}

/** sqrt(max(0, 1 - (s/c)^2)) : profil longitudinal du TFE (demi-ellipse, b = 1). */
export class HalfEllipse1D extends Profile1D {
  constructor(readonly c: number) {
    super();
  }
  ft(k: Float64Array): CArray {
    return CArray.real(k.map((v) => Math.PI * this.c * j1x(v * this.c)));
  }
  sample(s: number): number {
    return Math.sqrt(Math.max(0, 1 - (s / this.c) ** 2));
  }
}

/**
 * Somme de gaussiennes symétriques : sum_i P_i [g(s - s_i) + g(s + s_i)],
 * g(u) = exp(-u^2 / (2 sig_i^2)).  C'est la fonction transversale T du TFE (Annexe III).
 * P_i sans dimension (niveaux relatifs) ou en Pa si l'amplitude globale vaut 1.
 */
export class GaussianPairs1D extends Profile1D {
  constructor(
    readonly P: readonly number[],
    readonly centers: readonly number[],
    readonly sig: readonly number[],
  ) {
    super();
  }
  ft(k: Float64Array): CArray {
    return CArray.real(
      k.map((kk) => {
        let g = 0;
        this.P.forEach((P, i) => {
          const s = this.sig[i]!;
          g += P * s * Math.sqrt(2 * Math.PI) * Math.exp(-0.5 * (kk * s) ** 2) * 2 * Math.cos(kk * this.centers[i]!);
        });
        return g;
      }),
    );
  }
  sample(u: number): number {
    let g = 0;
    this.P.forEach((P, i) => {
      const c = this.centers[i]!,
        s = this.sig[i]!;
      g += P * (Math.exp(-((u - c) ** 2) / (2 * s ** 2)) + Math.exp(-((u + c) ** 2) / (2 * s ** 2)));
    });
    return g;
  }
}

/** np.interp : interpolation linéaire, valeurs extrêmes hors plage. */
function interp(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[xs.length - 1]!) return ys[ys.length - 1]!;
  let i = 1;
  while (xs[i]! < x) i++;
  const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
}

/**
 * Profil tabulé, interpolé linéairement entre points régulièrement espacés (nul hors plage).
 *
 * Transformée exacte de l'interpolant linéaire : d . sinc^2(k d / 2) . sum_n f_n exp(-i k s_n).
 * Les points non équidistants sont rééchantillonnés.
 */
export class Tabulated1D extends Profile1D {
  private readonly s_: number[];
  private readonly f_: number[];
  private readonly d: number;

  constructor(s0: readonly number[], f0: readonly number[]) {
    super();
    let s = [...s0];
    let f = [...f0];
    const ds = s.slice(1).map((v, i) => v - s[i]!);
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    if (Math.max(...ds) - Math.min(...ds) > 1e-9 * mean) {
      const n = s.length;
      const s2 = Array.from({ length: n }, (_, i) => s[0]! + ((s[n - 1]! - s[0]!) * i) / (n - 1));
      f = s2.map((v) => interp(v, s, f));
      s = s2;
    }
    // zéro aux extrémités pour que l'interpolant soit à support compact
    const d = s[1]! - s[0]!;
    if (f[0] !== 0 || f[f.length - 1] !== 0) {
      s = [s[0]! - d, ...s, s[s.length - 1]! + d];
      f = [0, ...f, 0];
    }
    this.s_ = s;
    this.f_ = f;
    this.d = d;
  }

  ft(k: Float64Array): CArray {
    const d = this.d;
    const out = CArray.zeros(k.length);
    k.forEach((kk, i) => {
      let re = 0,
        im = 0; // S = sum_n f_n exp(-i k s_n)
      this.s_.forEach((s, n) => {
        re += this.f_[n]! * Math.cos(kk * s);
        im -= this.f_[n]! * Math.sin(kk * s);
      });
      const m = d * sinc((kk * d) / (2 * Math.PI)) ** 2;
      out.re[i] = m * re;
      out.im[i] = m * im;
    });
    return out;
  }

  sample(u: number): number {
    const s = this.s_;
    return u < s[0]! || u > s[s.length - 1]! ? 0 : interp(u, s, this.f_);
  }
}

// =========================================================================================
// Empreintes 2D
// =========================================================================================
export abstract class Footprint {
  /** Transformée aux points (k1[i], k2[i]). */
  abstract ft(k1: Float64Array, k2: Float64Array): CArray;
  abstract sample(x: number, y: number): number;

  /** Transformée sur la grille k2 (lignes) × k1 (colonnes), rangée ligne par ligne. */
  ftGrid(k1: Float64Array, k2: Float64Array): CArray {
    return this.ft(...meshgrid(k1, k2));
  }

  force(): number {
    return this.ft(Float64Array.of(0), Float64Array.of(0)).re[0]!;
  }

  /** Renvoie l'empreinte multipliée pour que sa résultante vaille F (N). */
  scaledTo(F: number): Scaled {
    return new Scaled(this, F / this.force());
  }
}

export class Scaled extends Footprint {
  constructor(
    readonly base: Footprint,
    readonly factor: number,
  ) {
    super();
  }
  ft(k1: Float64Array, k2: Float64Array): CArray {
    return this.base.ft(k1, k2).mul(this.factor);
  }
  ftGrid(k1: Float64Array, k2: Float64Array): CArray {
    return this.base.ftGrid(k1, k2).mul(this.factor);
  }
  sample(x: number, y: number): number {
    return this.factor * this.base.sample(x, y);
  }
}

/** Pression uniforme p (Pa) sur un rectangle lx (selon x) par ly (selon y), centré en 0. */
export class UniformRect extends Footprint {
  constructor(
    readonly p: number,
    readonly lx: number,
    readonly ly: number,
  ) {
    super();
  }
  ft(k1: Float64Array, k2: Float64Array): CArray {
    return CArray.real(k1.map((a, i) => this.p * this.lx * sinc((a * this.lx) / (2 * Math.PI)) * this.ly * sinc((k2[i]! * this.ly) / (2 * Math.PI))));
  }
  sample(x: number, y: number): number {
    return Math.abs(x) < this.lx / 2 && Math.abs(y) < this.ly / 2 ? this.p : 0;
  }
}

/** Pression uniforme p (Pa) sur un disque de rayon R. */
export class UniformCircle extends Footprint {
  constructor(
    readonly p: number,
    readonly R: number,
  ) {
    super();
  }
  ft(k1: Float64Array, k2: Float64Array): CArray {
    return CArray.real(k1.map((a, i) => this.p * 2 * Math.PI * this.R ** 2 * j1x(Math.hypot(a, k2[i]!) * this.R)));
  }
  sample(x: number, y: number): number {
    return Math.hypot(x, y) <= this.R ? this.p : 0;
  }
}

/** p(x, y) = amplitude . fx(x) . fy(y)  (hypothèse de séparabilité de l'Annexe III du TFE). */
export class Separable extends Footprint {
  constructor(
    readonly fx: Profile1D,
    readonly fy: Profile1D,
    readonly amplitude = 1.0,
  ) {
    super();
  }
  ft(k1: Float64Array, k2: Float64Array): CArray {
    return this.fx.ft(k1).mul(this.fy.ft(k2)).mul(this.amplitude);
  }
  /** Grille tensorielle : on n'évalue chaque profil qu'une fois. */
  ftGrid(k1: Float64Array, k2: Float64Array): CArray {
    const a = this.fx.ft(k1);
    const b = this.fy.ft(k2);
    const out = CArray.zeros(k1.length * k2.length);
    for (let r = 0; r < k2.length; r++)
      for (let c = 0; c < k1.length; c++) {
        const o = r * k1.length + c;
        out.re[o] = this.amplitude * (a.re[c]! * b.re[r]! - a.im[c]! * b.im[r]!);
        out.im[o] = this.amplitude * (a.re[c]! * b.im[r]! + a.im[c]! * b.re[r]!);
      }
    return out;
  }
  sample(x: number, y: number): number {
    return this.amplitude * this.fx.sample(x) * this.fy.sample(y);
  }
}

/**
 * Carte de pression mesurée : valeurs P[j][i] (Pa) constantes par pixel.
 *
 * x (nx), y (ny) : centres des pixels, pas réguliers. P de forme (ny, nx).
 * Transformée exacte de la fonction constante par morceaux :
 *     p^ = dx sinc(k1 dx/2) dy sinc(k2 dy/2) sum_ij P_ji exp(-i (k1 x_i + k2 y_j)).
 * C'est le point d'entrée prévu pour les cartes du prototype STAC (Tekscan, etc.).
 */
export class PressureMap extends Footprint {
  readonly dx: number;
  readonly dy: number;

  constructor(
    readonly x: readonly number[],
    readonly y: readonly number[],
    readonly P: readonly (readonly number[])[],
  ) {
    super();
    if (P.length !== y.length || P.some((row) => row.length !== x.length)) throw new Error("P doit être de forme (ny, nx)");
    this.dx = x.length > 1 ? x[1]! - x[0]! : 1.0;
    this.dy = y.length > 1 ? y[1]! - y[0]! : 1.0;
  }

  private pix(k1: number, k2: number): number {
    return this.dx * sinc((k1 * this.dx) / (2 * Math.PI)) * this.dy * sinc((k2 * this.dy) / (2 * Math.PI));
  }

  ft(k1: Float64Array, k2: Float64Array): CArray {
    const out = CArray.zeros(k1.length);
    k1.forEach((a, m) => {
      let re = 0,
        im = 0;
      this.P.forEach((row, j) =>
        row.forEach((Pji, i) => {
          if (Pji === 0) return;
          const t = -(a * this.x[i]! + k2[m]! * this.y[j]!);
          re += Pji * Math.cos(t);
          im += Pji * Math.sin(t);
        }),
      );
      const w = this.pix(a, k2[m]!);
      out.re[m] = re * w;
      out.im[m] = im * w;
    });
    return out;
  }

  /** Grille tensorielle : S = Ey @ P @ Ex, Ex = exp(-i x k1) (nx, Nk1), Ey = exp(-i k2 y) (Nk2, ny). */
  ftGrid(k1: Float64Array, k2: Float64Array): CArray {
    const nx = this.x.length,
      ny = this.y.length;
    const Ex = phases(Float64Array.from(this.x, (v) => -v), k1);
    const Ey = phases(k2.map((v) => -v), Float64Array.from(this.y));
    const P = CArray.real(this.P.flat());
    const S = matmul(matmul(Ey, k2.length, ny, P, nx), k2.length, nx, Ex, k1.length);
    const [K1, K2] = meshgrid(k1, k2);
    return mul(S, K1.map((a, i) => this.pix(a, K2[i]!)));
  }

  sample(x: number, y: number): number {
    const i = Math.round((x - this.x[0]!) / this.dx);
    const j = Math.round((y - this.y[0]!) / this.dy);
    return i >= 0 && i < this.x.length && j >= 0 && j < this.y.length ? this.P[j]![i]! : 0;
  }
}

// =========================================================================================
// Roues et chargement complet
// =========================================================================================

/** Transformées (p^, qx^, qy^) ; qx^, qy^ valent null si aucun effort tangentiel. */
export interface LoadSpectrum {
  p: CArray;
  qx: CArray | null;
  qy: CArray | null;
}

/**
 * Une empreinte positionnée en (x0, y0).
 *
 * Efforts tangentiels (optionnels) : qx, qy = coefficient (q = coef . p, ex. freinage)
 * ou Footprint distincte (carte de cisaillement mesurée). Convention : q est la force
 * surfacique exercée PAR le pneu SUR la chaussée (qx > 0 vers +x).
 */
export class Wheel {
  constructor(
    readonly footprint: Footprint,
    readonly x0 = 0.0,
    readonly y0 = 0.0,
    readonly qx: number | Footprint | null = null,
    readonly qy: number | Footprint | null = null,
  ) {}

  /** exp(-i (k1 x0 + k2 y0)) : translation de l'empreinte. */
  private shift(k1: Float64Array, k2: Float64Array): CArray {
    const t = k1.map((a, i) => -(a * this.x0 + k2[i]! * this.y0));
    return new CArray(t.map(Math.cos), t.map(Math.sin));
  }

  /** Transformées sur la grille k2 × k1 (voir Footprint.ftGrid). */
  ftGrid(k1: Float64Array, k2: Float64Array): LoadSpectrum {
    const sh = this.shift(...meshgrid(k1, k2));
    const p = this.footprint.ftGrid(k1, k2);
    const tangential = (q: number | Footprint | null) => (q === null ? null : q instanceof Footprint ? q.ftGrid(k1, k2).mul(sh) : p.mul(q).mul(sh));
    return { p: p.mul(sh), qx: tangential(this.qx), qy: tangential(this.qy) };
  }

  sample(x: number, y: number): number {
    return this.footprint.sample(x - this.x0, y - this.y0);
  }

  get hasTangential(): boolean {
    return this.qx !== null || this.qy !== null;
  }
}

/** Ensemble de roues (atterrisseur, essieu, plaque HWD...). */
export class Loading {
  constructor(readonly wheels: Wheel[]) {}

  /** Renvoie (p^, qx^, qy^) sur la grille k2 × k1 ; qx^, qy^ valent null si aucun effort tangentiel. */
  ftGrid(k1: Float64Array, k2: Float64Array): LoadSpectrum {
    let p = CArray.zeros(k1.length * k2.length);
    let qx: CArray | null = null;
    let qy: CArray | null = null;
    for (const w of this.wheels) {
      const s = w.ftGrid(k1, k2);
      p = p.add(s.p);
      if (s.qx) qx = qx ? qx.add(s.qx) : s.qx;
      if (s.qy) qy = qy ? qy.add(s.qy) : s.qy;
    }
    return { p, qx, qy };
  }

  sample(x: number, y: number): number {
    return this.wheels.reduce((sum, w) => sum + w.sample(x, y), 0);
  }

  force(): number {
    return this.wheels.reduce((sum, w) => sum + w.footprint.force(), 0);
  }

  get hasTangential(): boolean {
    return this.wheels.some((w) => w.hasTangential);
  }

  extent(pad = 0.5): [number, number, number, number] {
    const xs = this.wheels.map((w) => w.x0);
    const ys = this.wheels.map((w) => w.y0);
    return [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  }
}
