/**
 * Lois de comportement linéaires (élastique, viscoélastiques) dans le domaine fréquentiel
 * (materials.py).
 *
 * Convention : une sollicitation harmonique s'écrit eps(t) = Re[eps0 * exp(i*omega*t)] et la
 * contrainte sigma(t) = Re[E*(omega) * eps0 * exp(i*omega*t)], avec Im(E*) >= 0 pour omega > 0.
 * Pour omega < 0 on utilise la symétrie hermitienne E*(-omega) = conj(E*(omega)), qui traduit le
 * fait que la réponse temporelle est réelle.
 *
 * Toutes les lois renvoient les modules en Pa. Les paramètres sont saisis en MPa (unités usuelles
 * des chaussées) sauf indication contraire.
 */
import { CArray, div, mul } from "./carray";

export const MPA = 1.0e6;

/** Évalue fun(|omega|) (définie pour omega >= 0) et applique E(-w) = conj(E(w)). */
function hermitian(fun: (w: Float64Array) => CArray, omega: Float64Array): CArray {
  const val = fun(omega.map(Math.abs));
  for (let i = 0; i < omega.length; i++) if (omega[i]! < 0) val.im[i] = -val.im[i]!;
  return val;
}

/** Classe de base. Sous-classes : Elastic, TwoS2P1D, GeneralizedKelvinVoigt, GeneralizedMaxwell. */
export abstract class Material {
  abstract readonly name: string;
  abstract readonly nu: number;

  // -- à surcharger ---------------------------------------------------------------
  abstract young(omega: Float64Array): CArray;

  poisson(omega: Float64Array): CArray {
    return CArray.full(omega.length, this.nu);
  }

  // -- dérivés ------------------------------------------------------------------------
  /** Renvoie (lambda*, mu*) en Pa, complexes, de même forme que omega. */
  lame(omega: Float64Array): [CArray, CArray] {
    const E = this.young(omega);
    const nu = this.poisson(omega);
    const mu = E.div(nu.add(1).mul(2)); // E / (2 (1 + nu))
    const lam = E.mul(nu).div(nu.add(1).mul(nu.mul(-2).add(1))); // E nu / ((1 + nu)(1 - 2 nu))
    return [lam, mu];
  }

  get isViscous(): boolean {
    return false;
  }
}

/** Élastique linéaire isotrope. E en MPa. */
export class Elastic extends Material {
  constructor(
    readonly E: number,
    readonly nu = 0.35,
    readonly name = "élastique",
  ) {
    super();
  }

  young(omega: Float64Array): CArray {
    return CArray.full(omega.length, this.E * MPA);
  }
}

export interface TwoS2P1DParams {
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
  name?: string;
}

/**
 * Modèle 2S2P1D (Olard & Di Benedetto, 2003).
 *
 * E*(w) = E00 + (E0 - E00) / (1 + delta (i w tau)^-k + (i w tau)^-h + (i w beta tau)^-1)
 *
 * E00 : module statique (w -> 0) [MPa]      E0 : module vitreux (w -> inf) [MPa]
 * k, h : exposants (0 < k < h < 1)          delta : constante
 * tau_ref : temps caractéristique à la température de référence T_ref [s]
 * beta : paramètre de l'amortisseur linéaire (Infinity = pas d'amortisseur)
 * Équivalence temps-température : WLF (C1, C2).
 * Coefficient de Poisson : constant (nu) ou 2S2P1D (nu00, nu0) si nu00 est renseigné :
 *     nu*(w) = nu00 + (nu0 - nu00) (E*(w) - E00) / (E0 - E00)
 */
export class TwoS2P1D extends Material {
  readonly E00: number;
  readonly E0: number;
  readonly k: number;
  readonly h: number;
  readonly delta: number;
  readonly tau_ref: number;
  readonly beta: number;
  readonly T_ref: number;
  readonly C1: number | null;
  readonly C2: number | null;
  readonly T: number | null;
  readonly nu: number;
  readonly nu00: number | null;
  readonly nu0: number | null;
  readonly name: string;

  constructor(p: TwoS2P1DParams) {
    super();
    this.E00 = p.E00;
    this.E0 = p.E0;
    this.k = p.k;
    this.h = p.h;
    this.delta = p.delta;
    this.tau_ref = p.tau_ref;
    this.beta = p.beta ?? Infinity;
    this.T_ref = p.T_ref ?? 15.0;
    this.C1 = p.C1 ?? null;
    this.C2 = p.C2 ?? null;
    this.T = p.T ?? null;
    this.nu = p.nu ?? 0.35;
    this.nu00 = p.nu00 ?? null;
    this.nu0 = p.nu0 ?? null;
    this.name = p.name ?? "2S2P1D";
  }

  // -- temps-température ------------------------------------------------------------
  /** a_T(T) par WLF : log10 a_T = -C1 (T - Tref) / (C2 + T - Tref). */
  shiftFactor(T: number | null = this.T): number {
    if (T === null || T === this.T_ref) return 1.0;
    if (this.C1 === null || this.C2 === null) throw new Error("Température différente de T_ref mais C1/C2 (WLF) non renseignés.");
    const dT = T - this.T_ref;
    return 10.0 ** ((-this.C1 * dT) / (this.C2 + dT));
  }

  tau(T: number | null = this.T): number {
    return this.tau_ref * this.shiftFactor(T);
  }

  // -- modules --------------------------------------------------------------------------
  private Epos(w: Float64Array): CArray {
    const out = CArray.zeros(w.length);
    const iwt = new CArray(new Float64Array(w.length), w.map((v) => v * this.tau())); // i w tau
    let den = iwt.pow(-this.k).mul(this.delta).add(iwt.pow(-this.h)).add(1);
    if (Number.isFinite(this.beta)) den = den.add(div(1, iwt.mul(this.beta)));
    const E = div(this.E0 - this.E00, den).add(this.E00);
    for (let i = 0; i < w.length; i++) {
      // w = 0 : module statique
      out.re[i] = w[i] === 0 ? this.E00 : E.re[i]!;
      out.im[i] = w[i] === 0 ? 0 : E.im[i]!;
    }
    return out.mul(MPA);
  }

  young(omega: Float64Array): CArray {
    return hermitian((w) => this.Epos(w), omega);
  }

  poisson(omega: Float64Array): CArray {
    if (this.nu00 === null) return CArray.full(omega.length, this.nu);
    const E = this.young(omega).div(MPA);
    return mul(this.nu0! - this.nu00, E.sub(this.E00)).div(this.E0 - this.E00).add(this.nu00);
  }

  get isViscous(): boolean {
    return true;
  }
}

/**
 * Kelvin-Voigt généralisé (KVG) : ressort E0 en série avec n cellules (E_i, tau_i).
 *
 * J*(w) = 1/E0 + sum_i 1 / (E_i (1 + i w tau_i)) ;  E* = 1/J*.  Modules en MPa.
 * C'est la forme utilisée dans le TFE (Tableau 7) pour approcher le 2S2P1D dans COMSOL.
 */
export class GeneralizedKelvinVoigt extends Material {
  constructor(
    readonly E0: number,
    readonly Ei: readonly number[],
    readonly taui: readonly number[],
    readonly nu = 0.35,
    readonly name = "KVG",
  ) {
    super();
  }

  private Epos(w: Float64Array): CArray {
    let J = CArray.full(w.length, 1.0 / this.E0);
    this.Ei.forEach((Ei, i) => {
      const iwt = new CArray(new Float64Array(w.length), w.map((v) => v * this.taui[i]!));
      J = J.add(div(1, iwt.add(1).mul(Ei)));
    });
    return div(MPA, J);
  }

  young(omega: Float64Array): CArray {
    return hermitian((w) => this.Epos(w), omega);
  }

  get isViscous(): boolean {
    return true;
  }
}

/** Maxwell généralisé (série de Prony) : E*(w) = E_inf + sum_i E_i i w tau_i / (1 + i w tau_i). MPa. */
export class GeneralizedMaxwell extends Material {
  constructor(
    readonly E_inf: number,
    readonly Ei: readonly number[],
    readonly taui: readonly number[],
    readonly nu = 0.35,
    readonly name = "Maxwell généralisé",
  ) {
    super();
  }

  private Epos(w: Float64Array): CArray {
    let E = CArray.full(w.length, this.E_inf);
    this.Ei.forEach((Ei, i) => {
      const iwt = new CArray(new Float64Array(w.length), w.map((v) => v * this.taui[i]!));
      E = E.add(iwt.mul(Ei).div(iwt.add(1)));
    });
    return E.mul(MPA);
  }

  young(omega: Float64Array): CArray {
    return hermitian((w) => this.Epos(w), omega);
  }

  get isViscous(): boolean {
    return true;
  }
}

/**
 * Matériau élastique dont le module est |E*| (ou E*) d'une autre loi à une fréquence donnée.
 *
 * Sert à reproduire l'approche « module équivalent » (ex. |E*(1 Hz)| dans le TFE).
 */
export class FrozenModulus extends Material {
  private readonly E: [number, number];
  readonly nu: number;

  constructor(
    readonly source: Material,
    readonly freqHz: number,
    readonly useNorm = true,
    readonly name = "module figé",
  ) {
    super();
    const w = Float64Array.of(2 * Math.PI * freqHz);
    const E = source.young(w).at(0);
    this.E = useNorm ? [Math.hypot(...E), 0] : E;
    this.nu = source.poisson(w).re[0]!;
  }

  young(omega: Float64Array): CArray {
    return CArray.full(omega.length, ...this.E);
  }
}
