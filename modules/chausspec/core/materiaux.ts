/**
 * Lois de comportement linéaires dans le domaine fréquentiel (portage de chausspec/materials.py).
 *
 * Convention : ε(t) = Re[ε₀ e^{iωt}], σ = E*(ω) ε, Im(E*) ≥ 0 pour ω > 0 ; pour ω < 0,
 * E*(−ω) = conj(E*(ω)) (réponse temporelle réelle). Modules renvoyés en Pa, saisis en MPa.
 */
import { c, cadd, cconj, cdiv, cmul, cscale, csub, ipow, type C } from "./numerique";

export const MPA = 1e6;

export interface Materiau {
  nom: string;
  young(omega: number): C;
  poisson(omega: number): C;
  visqueux: boolean;
}

/** λ*, μ* (Pa) à la pulsation ω. */
export function lame(m: Materiau, omega: number): { lam: C; mu: C } {
  const E = m.young(omega),
    nu = m.poisson(omega);
  const unPlusNu = cadd(c(1), nu);
  const mu = cdiv(E, cscale(unPlusNu, 2));
  const lam = cdiv(cmul(E, nu), cmul(unPlusNu, csub(c(1), cscale(nu, 2))));
  return { lam, mu };
}

const hermitien = (f: (w: number) => C) => (omega: number) => (omega < 0 ? cconj(f(-omega)) : f(omega));

export function elastique(E: number, nu = 0.35, nom = "élastique"): Materiau {
  return { nom, young: () => c(E * MPA), poisson: () => c(nu), visqueux: false };
}

export interface Params2S2P1D {
  E00: number;
  E0: number;
  k: number;
  h: number;
  delta: number;
  tau_ref: number;
  beta?: number;
  T_ref?: number;
  C1?: number | null;
  C2?: number | null;
  T?: number | null;
  nu?: number;
  nu00?: number | null;
  nu0?: number | null;
}

/** a_T(T) par WLF : log10 a_T = −C1 (T − Tref) / (C2 + T − Tref). */
export function decalage(p: Params2S2P1D, T = p.T): number {
  const Tref = p.T_ref ?? 15;
  if (T === null || T === undefined || T === Tref) return 1;
  if (p.C1 === null || p.C1 === undefined || p.C2 === null || p.C2 === undefined) throw new Error("Température différente de T_ref mais C1/C2 (WLF) non renseignés.");
  const dT = T - Tref;
  return 10 ** ((-p.C1 * dT) / (p.C2 + dT));
}

export function deuxS2P1D(p: Params2S2P1D, nom = "2S2P1D"): Materiau {
  const beta = p.beta ?? Infinity;
  const tau = p.tau_ref * decalage(p);
  const Epos = (w: number): C => {
    if (w === 0) return c(p.E00 * MPA);
    const y = w * tau; // iωτ = i·y
    // (iy)^-k = y^-k e^{-ikπ/2}
    let den = cadd(c(1), cadd(cscale(ipow(y, -p.k), p.delta), ipow(y, -p.h)));
    if (Number.isFinite(beta)) den = cadd(den, cdiv(c(1), { re: 0, im: y * beta }));
    return cscale(cadd(c(p.E00), cdiv(c(p.E0 - p.E00), den)), MPA);
  };
  const young = hermitien(Epos);
  return {
    nom,
    young,
    poisson: (omega) => {
      if (p.nu00 === null || p.nu00 === undefined) return c(p.nu ?? 0.35);
      const E = cscale(young(omega), 1 / MPA);
      return cadd(c(p.nu00), cscale(csub(E, c(p.E00)), ((p.nu0 ?? p.nu00) - p.nu00) / (p.E0 - p.E00)));
    },
    visqueux: true,
  };
}

/** Kelvin-Voigt généralisé : J* = 1/E0 + Σ 1/(Eᵢ(1 + iωτᵢ)), E* = 1/J*. MPa. */
export function kvg(E0: number, Ei: readonly number[], taui: readonly number[], nu = 0.35, nom = "KVG"): Materiau {
  const Epos = (w: number): C => {
    let J = c(1 / E0);
    for (let i = 0; i < Ei.length; i++) J = cadd(J, cdiv(c(1), cscale({ re: 1, im: w * taui[i]! }, Ei[i]!)));
    return cdiv(c(MPA), J);
  };
  return { nom, young: hermitien(Epos), poisson: () => c(nu), visqueux: true };
}

/** Maxwell généralisé (Prony) : E* = E∞ + Σ Eᵢ iωτᵢ/(1 + iωτᵢ). MPa. */
export function maxwellGeneralise(Einf: number, Ei: readonly number[], taui: readonly number[], nu = 0.35, nom = "Maxwell généralisé"): Materiau {
  const Epos = (w: number): C => {
    let E = c(Einf);
    for (let i = 0; i < Ei.length; i++) {
      const iwt = { re: 0, im: w * taui[i]! };
      E = cadd(E, cscale(cdiv(iwt, cadd(c(1), iwt)), Ei[i]!));
    }
    return cscale(E, MPA);
  };
  return { nom, young: hermitien(Epos), poisson: () => c(nu), visqueux: true };
}

/** Module figé : |E*| (ou E*) d'une autre loi à une fréquence donnée (approche « module équivalent »). */
export function moduleFige(source: Materiau, freqHz: number, norme = true, nom = "module figé"): Materiau {
  const w = 2 * Math.PI * freqHz;
  const E0 = source.young(w);
  const E = norme ? c(Math.hypot(E0.re, E0.im)) : E0;
  const nu = c(source.poisson(w).re);
  return { nom, young: () => E, poisson: () => nu, visqueux: false };
}
