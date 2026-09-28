/**
 * Solveur axisymétrique (transformée de Hankel) pour une charge circulaire uniforme (axisym.py).
 *
 * Même noyau que le solveur 2D ; seule l'inversion change :
 *   f(r)   = 1/(2 pi) int_0^inf F(xi) J0(xi r) xi dxi          (grandeurs scalaires)
 *   u_r(r) = -1/(2 pi) int_0^inf U(xi) J1(xi r) xi dxi
 * Utile pour : la validation croisée du solveur 2D, les calculs type Burmister, et le HWD en
 * fréquentiel (plaque circulaire, régime Harmonic). Régimes admis : Static et Harmonic
 * (le noyau ne dépend alors que de xi).
 */
import { CArray } from "./carray";
import { StiffnessKernel } from "./kernel";
import { Moving, Static, type Regime } from "./regimes";
import { j0, j1, j1x, leggauss } from "./special";
import { layerModuli } from "./spectral";
import type { Structure } from "./structure";

export const AXISYM_OUTPUTS = ["uz", "ur", "szz", "srr", "stt", "srz", "ezz", "err", "ett", "erz"] as const;
export type AxisymOutput = (typeof AXISYM_OUTPUTS)[number];

/** Nœuds/poids de Gauss sur [0, xi_max] avec des panneaux adaptés aux oscillations. */
function xiNodes(a: number, rmax: number, zmin: number, xiMax?: number, perPanel = 16): [Float64Array, Float64Array] {
  if (xiMax === undefined) {
    xiMax = zmin > 0 ? 60.0 / zmin : 2000.0 / a;
    xiMax = Math.min(xiMax, 4000.0 / a);
  }
  const width = Math.PI / (2 * Math.max(rmax + a, a));
  // panneaux géométriques près de 0, puis réguliers
  const edges = [0.0];
  let e = Math.min(width, 1e-3 / a);
  while (e < width) {
    edges.push(e);
    e *= 3;
  }
  let x = width;
  while (x < xiMax) {
    edges.push(x);
    x += width;
  }
  edges.push(xiMax);
  const [g, w] = leggauss(perPanel);
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const lo = edges[i]!,
      hi = edges[i + 1]!;
    g.forEach((gk, k) => {
      nodes.push(0.5 * (hi - lo) * gk + 0.5 * (hi + lo));
      weights.push(0.5 * (hi - lo) * w[k]!);
    });
  }
  return [Float64Array.from(nodes), Float64Array.from(weights)];
}

export interface AxisymOptions {
  regime?: Regime;
  side?: "above" | "below";
  xiMax?: number;
  perPanel?: number;
}

/**
 * Réponse d'un multicouche à une pression uniforme p (Pa) sur un disque de rayon a (m).
 *
 * Renvoie, pour chaque sortie (uz, ur, szz, srr, stt, srz, ezz, err, ett, erz), un tableau
 * (nz × nr) rangé ligne par ligne (déformations tensorielles ; contraintes en Pa,
 * compression négative).
 */
export function solveAxisym(structure: Structure, p: number, a: number, r: readonly number[], z: readonly number[], options: AxisymOptions = {}): Record<AxisymOutput, CArray> {
  const regime = options.regime ?? new Static();
  if (regime instanceof Moving) throw new Error("Le solveur axisymétrique n'admet pas de charge roulante (utiliser solveGrid).");
  const [xi, wq] = xiNodes(a, Math.max(...r), Math.min(...z), options.xiMax, options.perPanel ?? 16);
  const M = xi.length;
  const omega = regime.omega(xi, new Float64Array(M));
  const [lam, mu] = layerModuli(structure, omega);
  const K = new StiffnessKernel(structure, xi, lam, mu);
  const ph = xi.map((x) => p * 2 * Math.PI * a ** 2 * j1x(x * a)); // transformée de la charge
  const base = xi.map((x, m) => (wq[m]! * x * ph[m]!) / (2 * Math.PI));
  // J0(xi r), J1(xi r), J1(xi r)/(xi r) : une colonne par rayon
  const bessel = r.map((rr) => {
    const XR = xi.map((x) => x * rr);
    return { J0: XR.map(j0), J1: XR.map(j1), J1x: XR.map((v) => (v > 1e-12 ? j1(v) / v : 0.5)) };
  });
  const out = Object.fromEntries(AXISYM_OUTPUTS.map((k) => [k, CArray.zeros(z.length * r.length)])) as Record<AxisymOutput, CArray>;
  z.forEach((zz, iz) => {
    const amp = K.atDepth(zz, options.side ?? "above");
    const [U, W, dU, dW] = amp.n;
    const mr = amp.muRef;
    const Uc = U.div(mr); //                    = xi * U_phys
    const mrXi = mr.map((m, i) => m * xi[i]!);
    const L_ = amp.lam;
    const M_ = amp.mu;
    r.forEach((_, ir) => {
      const { J0, J1, J1x } = bessel[ir]!;
      // grandeurs spectrales
      const uz = W.div(mrXi).mul(J0);
      const ur = U.div(mrXi).mul(J1).neg();
      const ezz = dW.div(mr).mul(J0);
      const err = Uc.mul(J0.map((v, i) => v - J1x[i]!)).neg();
      const ett = Uc.mul(J1x).neg();
      const erz = dU.add(W).div(mr).mul(J1).mul(-0.5);
      const tr = err.add(ett).add(ezz);
      const vals: Record<AxisymOutput, CArray> = {
        uz,
        ur,
        ezz,
        err,
        ett,
        erz,
        szz: L_.mul(tr).add(M_.mul(2).mul(ezz)),
        srr: L_.mul(tr).add(M_.mul(2).mul(err)),
        stt: L_.mul(tr).add(M_.mul(2).mul(ett)),
        srz: M_.mul(2).mul(erz),
      };
      for (const k of AXISYM_OUTPUTS) {
        const [re, im] = vals[k].mul(base).sum(); // np.sum(base * v, axis=0)
        out[k].re[iz * r.length + ir] = re;
        out[k].im[iz * r.length + ir] = im;
      }
    });
  });
  return out;
}
