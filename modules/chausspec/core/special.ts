/**
 * Fonctions spéciales du solveur, sans dépendance : ce que le Python prend dans numpy et
 * scipy.special (sinc, j0, j1, _j1x de loads.py, np.polynomial.legendre.leggauss).
 */

/** sin(πx)/(πx), comme numpy.sinc. */
export function sinc(x: number): number {
  if (x === 0) return 1;
  const y = Math.PI * x;
  return Math.sin(y) / y;
}

/* ───────────────────────────── Bessel J0, J1 ───────────────────────────── */
// Approximations rationnelles de Hart / Numerical Recipes (§6.5), erreur relative ~1e-8,
// raffinées par la récurrence asymptotique de Hankel à 6 termes au-delà de x = 8.

export function j0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const a2 = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a1 / a2;
  }
  return hankel(ax, 0);
}

export function j1(x: number): number {
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
  return Math.abs(x) > 1e-8 ? j1(x) / x : 0.5;
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
