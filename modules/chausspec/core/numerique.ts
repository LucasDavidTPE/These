/**
 * Outils numériques du solveur (sans dépendance) : complexes, FFT radix 2, fonctions de Bessel
 * J0 et J1, quadrature de Gauss-Legendre, sinc. Les tableaux complexes sont stockés à plat
 * (re, im entrelacés) dans des Float64Array : pas d'objet par nombre dans les boucles chaudes.
 */

export interface C {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): C => ({ re, im });
export const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cscale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });
export function cdiv(a: C, b: C): C {
  // division de Smith (évite les dépassements)
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re,
      d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im,
    d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
}
export const cconj = (a: C): C => ({ re: a.re, im: -a.im });
export const cabs = (a: C): number => Math.hypot(a.re, a.im);
/** (i·y)^p pour y > 0 réel : y^p · e^{i p π/2} (branche principale, comme numpy). */
export function ipow(y: number, p: number): C {
  const m = y ** p,
    a = (p * Math.PI) / 2;
  return { re: m * Math.cos(a), im: m * Math.sin(a) };
}
export const cexpi = (t: number): C => ({ re: Math.cos(t), im: Math.sin(t) });

/** sin(πx)/(πx), comme numpy.sinc. */
export function sinc(x: number): number {
  if (x === 0) return 1;
  const y = Math.PI * x;
  return Math.sin(y) / y;
}

/* ───────────────────────────── Bessel J0, J1 ───────────────────────────── */
// Approximations rationnelles de Hart / Numerical Recipes (§6.5), erreur relative ~1e-8,
// raffinées par la récurrence asymptotique de Hankel à 6 termes au-delà de x = 8.

export function besselJ0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const a2 = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a1 / a2;
  }
  return hankel(ax, 0);
}

export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a1 / a2;
  }
  const v = hankel(ax, 1);
  return x < 0 ? -v : v;
}

/** Développement asymptotique de Hankel (x ≥ 8), ordre ν = 0 ou 1, erreur < 1e-12. */
function hankel(x: number, nu: 0 | 1): number {
  const mu = 4 * nu * nu;
  let P = 1,
    Q = 0,
    terme = 1;
  const z8 = 8 * x;
  for (let k = 1; k <= 14; k++) {
    terme *= (mu - (2 * k - 1) ** 2) / (k * z8);
    if (k % 2 === 1) Q += (k % 4 === 1 ? 1 : -1) * terme;
    else P += (k % 4 === 2 ? -1 : 1) * terme;
    if (Math.abs(terme) < 1e-17) break;
  }
  const chi = x - (nu / 2 + 0.25) * Math.PI;
  return Math.sqrt(2 / (Math.PI * x)) * (P * Math.cos(chi) - Q * Math.sin(chi));
}

/** J1(x)/x, prolongée par 1/2 en 0. */
export function j1x(x: number): number {
  return Math.abs(x) > 1e-8 ? besselJ1(x) / x : 0.5;
}

/* ───────────────────────────── Gauss-Legendre ───────────────────────────── */

const cacheGL = new Map<number, [Float64Array, Float64Array]>();

/** Nœuds et poids de Gauss-Legendre sur [-1, 1] (Newton sur P_n), comme numpy leggauss. */
export function leggauss(n: number): [Float64Array, Float64Array] {
  const deja = cacheGL.get(n);
  if (deja) return deja;
  const x = new Float64Array(n),
    w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1,
        p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      if (n === 1) {
        p1 = z;
        p0 = 1;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    // ordre croissant, comme numpy
    x[n - 1 - i] = z;
    w[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
  }
  cacheGL.set(n, [x, w]);
  return [x, w];
}

/* ───────────────────────────── FFT ───────────────────────────── */

export const puissanceDeDeux = (n: number) => n >= 1 && (n & (n - 1)) === 0;

/**
 * FFT complexe en place (radix 2, Cooley-Tukey), sur `n` valeurs espacées de `pas`
 * complexes à partir de `debut` dans le tableau entrelacé `a`. `inverse` : signe + et
 * division par n (convention numpy.fft.ifft).
 */
export function fft(a: Float64Array, n: number, inverse = false, debut = 0, pas = 1): void {
  if (!puissanceDeDeux(n)) throw new Error(`FFT : ${n} points, une puissance de 2 est attendue.`);
  const idx = (k: number) => 2 * (debut + k * pas);
  // permutation par inversion des bits
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const p = idx(i),
        q = idx(j);
      let t = a[p]!;
      a[p] = a[q]!;
      a[q] = t;
      t = a[p + 1]!;
      a[p + 1] = a[q + 1]!;
      a[q + 1] = t;
    }
  }
  const signe = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (signe * 2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = idx(i + k),
          q = idx(i + k + len / 2);
        const xr = a[q]! * cr - a[q + 1]! * ci,
          xi = a[q]! * ci + a[q + 1]! * cr;
        a[q] = a[p]! - xr;
        a[q + 1] = a[p + 1]! - xi;
        a[p] = a[p]! + xr;
        a[p + 1] = a[p + 1]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) {
    for (let k = 0; k < n; k++) {
      a[idx(k)] = a[idx(k)]! / n;
      a[idx(k) + 1] = a[idx(k) + 1]! / n;
    }
  }
}

/** Fréquences de numpy.fft.fftfreq(n, d). */
export function fftfreq(n: number, d: number): Float64Array {
  const f = new Float64Array(n);
  const moitie = Math.floor((n - 1) / 2) + 1;
  for (let i = 0; i < moitie; i++) f[i] = i / (n * d);
  for (let i = moitie; i < n; i++) f[i] = (i - n) / (n * d);
  return f;
}

/** Fréquences de numpy.fft.rfftfreq(n, d). */
export function rfftfreq(n: number, d: number): Float64Array {
  const m = Math.floor(n / 2) + 1;
  const f = new Float64Array(m);
  for (let i = 0; i < m; i++) f[i] = i / (n * d);
  return f;
}
