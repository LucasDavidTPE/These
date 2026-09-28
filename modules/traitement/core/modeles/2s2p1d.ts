/**
 * Modèle 2S2P1D — deux ressorts, deux éléments paraboliques, un amortisseur.
 *
 *   E*(ω) = E00 + (E0 − E00) / [ 1 + δ(iωτ)^−k + (iωτ)^−h + (iωβτ)^−1 ]
 *
 * Reproduit ligne à ligne les colonnes BO16:BV16 (module) et CB16:CI16 (coefficient de
 * Poisson) de la feuille « Calibration 2S2P1D ».
 *
 * OLARD F. & DI BENEDETTO H., « General "2S2P1D" model and relation between the linear
 * viscoelastic behaviours of bituminous binders and mixes », Road Materials and Pavement
 * Design, vol. 4, n° 2, p. 185-224, 2003.
 */
import type { Complexe, ModeleCale } from "./type";

const DEG = 180 / Math.PI;

export function noyau2s2p1d(f: number, { bas, haut, tau, k, h, delta, beta }: { bas: number; haut: number; tau: number; k: number; h: number; delta: number; beta: number }): Complexe {
  const d = haut - bas;
  const x = 2 * Math.PI * f * tau;
  const xk = x ** -k,
    xh = x ** -h;
  const c1 = d * (1 + delta * xk * Math.cos((k * Math.PI) / 2) + xh * Math.cos((h * Math.PI) / 2));
  const c2 = d * (delta * xk * Math.sin((k * Math.PI) / 2) + xh * Math.sin((h * Math.PI) / 2) + (Number.isFinite(beta) ? 1 / (x * beta) : 0));
  const den = (c1 / d) ** 2 + (c2 / d) ** 2;
  const re = bas + c1 / den;
  const im = c2 / den;
  return { re, im, norme: Math.hypot(re, im), phase: Math.atan(im / re) * DEG };
}

const m2s2p1d: ModeleCale = {
  id: "2s2p1d",
  nom: "2S2P1D",
  resume: "7 constantes pour le module, 3 de plus pour le coefficient de Poisson.",
  reference: "Olard & Di Benedetto, RMPD 2003",
  parametres: [
    { cle: "E00", label: "E00", unite: "MPa", min: 0, max: 5000, pas: 1, groupe: "module" },
    { cle: "E0", label: "E0", unite: "MPa", min: 1000, max: 60000, pas: 10, groupe: "module" },
    { cle: "k", label: "k", min: 0.05, max: 0.5, pas: 0.001, groupe: "module" },
    { cle: "h", label: "h", min: 0.2, max: 0.95, pas: 0.001, groupe: "module" },
    { cle: "delta", label: "δ", min: 0.5, max: 6, pas: 0.01, groupe: "module" },
    { cle: "tauE", label: "τE", unite: "s", min: -12, max: 4, pas: 0.01, log: true, groupe: "module" },
    { cle: "beta", label: "β", min: 1, max: 5000, pas: 1, groupe: "module" },
    { cle: "nu00", label: "ν00", min: 0, max: 0.6, pas: 0.001, groupe: "poisson" },
    { cle: "nu0", label: "ν0", min: 0.1, max: 0.6, pas: 0.001, groupe: "poisson" },
    { cle: "tauNu", label: "τν", unite: "s", min: -12, max: 4, pas: 0.01, log: true, groupe: "poisson" },
  ],
  defauts: { E00: 100, E0: 40000, k: 0.18, h: 0.6, delta: 2, tauE: 0.3, beta: 150, nu00: 0.18, nu0: 0.45, tauNu: 1 },
  bornes: { E00: [0, 1e5], E0: [1, 1e6], k: [1e-4, 0.999], h: [1e-4, 0.999], delta: [1e-3, 50], tauE: [1e-14, 1e6], beta: [1, 5000], nu00: [0, 0.6], nu0: [0, 0.6], tauNu: [1e-14, 1e6] },
  ajustables: ["E00", "E0", "k", "h", "delta", "tauE", "beta"],
  ajustablesPoisson: ["nu00", "nu0", "tauNu"],
  module: (f, p) => noyau2s2p1d(f, { bas: p.E00!, haut: p.E0!, tau: p.tauE!, k: p.k!, h: p.h!, delta: p.delta!, beta: p.beta! }),
  poisson: (f, p) => noyau2s2p1d(f, { bas: p.nu00!, haut: p.nu0!, tau: p.tauNu!, k: p.k!, h: p.h!, delta: p.delta!, beta: p.beta! }),
};

export default m2s2p1d;
