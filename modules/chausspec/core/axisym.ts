/**
 * Solveur axisymétrique (portage de chausspec/axisym.py) : pression uniforme p sur un disque de
 * rayon a, inversion de Hankel. Même noyau que la grille ; régimes statique et harmonique.
 *   f(r) = 1/(2π) ∫ F(ξ) J0(ξr) ξ dξ,   u_r(r) = −1/(2π) ∫ U(ξ) J1(ξr) ξ dξ
 */
import { lame } from "./materiaux";
import { Noyau, nouvellesAmplitudes } from "./noyau";
import { besselJ0, besselJ1, j1x, leggauss } from "./numerique";
import { omega, type Regime } from "./spectral";
import type { Structure } from "./structure";

export const SORTIES_AXI = ["uz", "ur", "szz", "srr", "stt", "srz", "ezz", "err", "ett", "erz"] as const;
export type SortieAxi = (typeof SORTIES_AXI)[number];

function noeudsXi(a: number, rmax: number, zmin: number, ximax: number | undefined, parPanneau: number): [number[], number[]] {
  let xm = ximax;
  if (xm === undefined) {
    xm = zmin > 0 ? 60 / zmin : 2000 / a;
    xm = Math.min(xm, 4000 / a);
  }
  const largeur = Math.PI / (2 * Math.max(rmax + a, a));
  const bords = [0];
  let e = Math.min(largeur, 1e-3 / a);
  while (e < largeur) {
    bords.push(e);
    e *= 3;
  }
  let x = largeur;
  while (x < xm) {
    bords.push(x);
    x += largeur;
  }
  bords.push(xm);
  const [g, w] = leggauss(parPanneau);
  const n: number[] = [],
    p: number[] = [];
  for (let i = 0; i + 1 < bords.length; i++) {
    const lo = bords[i]!,
      hi = bords[i + 1]!;
    for (let k = 0; k < parPanneau; k++) {
      n.push(0.5 * (hi - lo) * g[k]! + 0.5 * (hi + lo));
      p.push(0.5 * (hi - lo) * w[k]!);
    }
  }
  return [n, p];
}

/** Réponse (tableaux nz × nr, re et im) à une pression p (Pa) sur un disque de rayon a (m). */
export function resoudreAxisym(
  st: Structure,
  p: number,
  a: number,
  r: number[],
  z: number[],
  regime: Regime = { type: "static" },
  o: { cote?: "above" | "below"; ximax?: number; parPanneau?: number } = {},
): Record<SortieAxi, { re: number[][]; im: number[][] }> {
  if (regime.type === "moving") throw new Error("Le solveur axisymétrique n'admet pas de charge roulante (utiliser la grille).");
  const [xi, wq] = noeudsXi(a, Math.max(...r), Math.min(...z), o.ximax, o.parPanneau ?? 16);
  const w = omega(regime, 0);
  const lam = new Float64Array(2 * st.n),
    mu = new Float64Array(2 * st.n);
  st.couches.forEach((L, j) => {
    const m = lame(L.materiau, w);
    lam[2 * j] = m.lam.re;
    lam[2 * j + 1] = m.lam.im;
    mu[2 * j] = m.mu.re;
    mu[2 * j + 1] = m.mu.im;
  });
  const K = new Noyau(st, false);
  const amp = nouvellesAmplitudes();
  const out = Object.fromEntries(SORTIES_AXI.map((k) => [k, { re: z.map(() => r.map(() => 0)), im: z.map(() => r.map(() => 0)) }])) as Record<SortieAxi, { re: number[][]; im: number[][] }>;
  const cm = (ar: number, ai: number, br: number, bi: number): [number, number] => [ar * br - ai * bi, ar * bi + ai * br];
  xi.forEach((x, m) => {
    K.resoudre(x, lam, mu);
    const mr = K.mr;
    const base = (wq[m]! * x * p * 2 * Math.PI * a * a * j1x(x * a)) / (2 * Math.PI);
    z.forEach((zz, iz) => {
      K.amplitudes(zz, o.cote ?? "above", amp);
      const [lr, li, mur, mui] = K.lameCouche(amp.couche);
      const U: [number, number] = [amp.n[0]!, amp.n[1]!],
        W: [number, number] = [amp.n[2]!, amp.n[3]!],
        dU: [number, number] = [amp.n[4]!, amp.n[5]!],
        dW: [number, number] = [amp.n[6]!, amp.n[7]!];
      r.forEach((rr, ir) => {
        const XR = x * rr;
        const J0 = besselJ0(XR),
          J1 = besselJ1(XR),
          J1x = XR > 1e-12 ? J1 / XR : 0.5;
        const Uc: [number, number] = [U[0] / mr, U[1] / mr];
        const v: Record<string, [number, number]> = {
          uz: [(W[0] / (mr * x)) * J0, (W[1] / (mr * x)) * J0],
          ur: [(-U[0] / (mr * x)) * J1, (-U[1] / (mr * x)) * J1],
          ezz: [(dW[0] / mr) * J0, (dW[1] / mr) * J0],
          err: [-Uc[0] * (J0 - J1x), -Uc[1] * (J0 - J1x)],
          ett: [-Uc[0] * J1x, -Uc[1] * J1x],
          erz: [(-0.5 * (dU[0] + W[0]) * J1) / mr, (-0.5 * (dU[1] + W[1]) * J1) / mr],
        };
        const tr: [number, number] = [v.err![0] + v.ett![0] + v.ezz![0], v.err![1] + v.ett![1] + v.ezz![1]];
        const lt = cm(lr, li, ...tr);
        const s = (e: [number, number]): [number, number] => {
          const me = cm(mur, mui, ...e);
          return [lt[0] + 2 * me[0], lt[1] + 2 * me[1]];
        };
        v.szz = s(v.ezz!);
        v.srr = s(v.err!);
        v.stt = s(v.ett!);
        const mrz = cm(mur, mui, ...v.erz!);
        v.srz = [2 * mrz[0], 2 * mrz[1]];
        for (const k of SORTIES_AXI) {
          out[k].re[iz]![ir] = out[k].re[iz]![ir]! + base * v[k]![0];
          out[k].im[iz]![ir] = out[k].im[iz]![ir]! + base * v[k]![1];
        }
      });
    });
  });
  return out;
}
