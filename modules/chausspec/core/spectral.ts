/**
 * Régimes et assemblage des multiplicateurs spectraux (portage de regimes.py et
 * spectral.py) : pour un nombre d'onde (k1, k2) et le spectre du chargement, les transformées
 * des composantes demandées aux profondeurs demandées.
 */
import { lame } from "./materiaux";
import { Noyau, nouvellesAmplitudes, type Amplitudes } from "./noyau";
import type { Structure } from "./structure";

export const DEPLACEMENTS = ["ux", "uy", "uz"] as const;
export const DEFORMATIONS = ["exx", "eyy", "ezz", "exy", "exz", "eyz"] as const;
export const CONTRAINTES = ["sxx", "syy", "szz", "sxy", "sxz", "syz"] as const;
export const COMPOSANTES = [...DEPLACEMENTS, ...DEFORMATIONS, ...CONTRAINTES] as const;
export type Composante = (typeof COMPOSANTES)[number];

/**
 * Régime : pulsation vue par le matériau pour chaque nombre d'onde.
 * statique ω = 0 ; harmonique ω = 2πf (champs complexes) ; roulant ω = −k1·V (repère mobile,
 * charge avançant vers +x, inertie négligée).
 */
export type Regime = { type: "static" } | { type: "harmonic"; freq: number } | { type: "moving"; speed: number };

export const hermitien = (r: Regime) => r.type !== "harmonic";
export function omega(r: Regime, k1: number): number {
  return r.type === "static" ? 0 : r.type === "harmonic" ? 2 * Math.PI * r.freq : -k1 * r.speed;
}

export interface Cle {
  comp: Composante;
  z: number;
}

/**
 * Évalue le spectre des composantes demandées, un nombre d'onde à la fois. Les modules de
 * Lamé sont gardés tant que la pulsation ne change pas (une fois par colonne k1 en roulant,
 * une fois pour tout le calcul en statique).
 */
export class Evaluateur {
  readonly cles: Cle[];
  private readonly noyau: Noyau;
  private readonly amp: Amplitudes = nouvellesAmplitudes();
  private readonly lam: Float64Array;
  private readonly mu: Float64Array;
  private omegaCourant = NaN;
  private readonly profondeurs: number[];

  constructor(
    private readonly st: Structure,
    private readonly regime: Regime,
    comps: readonly Composante[],
    profondeurs: readonly number[],
    private readonly cote: "above" | "below" = "above",
    private readonly tangentiel = false,
    private readonly filtre = 0,
  ) {
    this.profondeurs = [...profondeurs];
    this.cles = comps.flatMap((comp) => this.profondeurs.map((z) => ({ comp, z })));
    this.noyau = new Noyau(st, tangentiel);
    this.lam = new Float64Array(2 * st.n);
    this.mu = new Float64Array(2 * st.n);
    this.comps = [...comps];
  }
  private readonly comps: Composante[];

  private modules(k1: number) {
    const w = omega(this.regime, k1);
    if (w === this.omegaCourant) return;
    this.omegaCourant = w;
    this.st.couches.forEach((L, j) => {
      const { lam, mu } = lame(L.materiau, w);
      this.lam[2 * j] = lam.re;
      this.lam[2 * j + 1] = lam.im;
      this.mu[2 * j] = mu.re;
      this.mu[2 * j + 1] = mu.im;
    });
  }

  /**
   * Transformées au point (k1, k2) : out[2·i], out[2·i+1] pour la clé i (ordre de `cles`).
   * p : spectre de pression ; qx, qy : spectres tangentiels (ou null).
   */
  evaluer(k1: number, k2: number, pr: number, pi: number, qx: [number, number] | null, qy: [number, number] | null, out: Float64Array): void {
    const xi = Math.hypot(k1, k2);
    if (xi === 0) throw new Error("ξ = 0 doit être traité à part.");
    const c1 = k1 / xi,
      c2 = k2 / xi;
    this.modules(k1);
    if (this.filtre > 0) {
      const f = Math.exp(-0.5 * (xi * this.filtre) ** 2);
      pr *= f;
      pi *= f;
    }
    // décomposition P-SV / SH des efforts tangentiels : T0 = i(c1 qx + c2 qy), R0 = i(−c2 qx + c1 qy)
    let T0r = 0,
      T0i = 0,
      R0r = 0,
      R0i = 0;
    const tang = this.tangentiel;
    if (tang) {
      const ax = qx ?? [0, 0],
        ay = qy ?? [0, 0];
      const sr = c1 * ax[0] + c2 * ay[0],
        si = c1 * ax[1] + c2 * ay[1];
      T0r = -si;
      T0i = sr;
      const rr = -c2 * ax[0] + c1 * ay[0],
        ri = -c2 * ax[1] + c1 * ay[1];
      R0r = -ri;
      R0i = rr;
    }
    this.noyau.resoudre(xi, this.lam, this.mu);
    const mr = this.noyau.mr;
    const nz = this.profondeurs.length;
    for (let iz = 0; iz < nz; iz++) {
      const a = this.noyau.amplitudes(this.profondeurs[iz]!, this.cote, this.amp);
      const n = a.n;
      // U, W, dU, dW = amplitudes × p (+ tangentiel × T0) ; V, dV = SH × R0
      const mulp = (k: number): [number, number] => {
        let re = n[2 * k]! * pr - n[2 * k + 1]! * pi,
          im = n[2 * k]! * pi + n[2 * k + 1]! * pr;
        if (tang) {
          re += a.t[2 * k]! * T0r - a.t[2 * k + 1]! * T0i;
          im += a.t[2 * k]! * T0i + a.t[2 * k + 1]! * T0r;
        }
        return [re, im];
      };
      const U = mulp(0),
        W = mulp(1),
        dU = mulp(2),
        dW = mulp(3);
      let V: [number, number] = [0, 0],
        dV: [number, number] = [0, 0];
      if (tang) {
        V = [a.sh[0]! * R0r - a.sh[1]! * R0i, a.sh[0]! * R0i + a.sh[1]! * R0r];
        dV = [a.sh[2]! * R0r - a.sh[3]! * R0i, a.sh[2]! * R0i + a.sh[3]! * R0r];
      }
      // déformations
      const exx: [number, number] = [(-c1 * (c1 * U[0] - c2 * V[0])) / mr, (-c1 * (c1 * U[1] - c2 * V[1])) / mr];
      const eyy: [number, number] = [(-c2 * (c2 * U[0] + c1 * V[0])) / mr, (-c2 * (c2 * U[1] + c1 * V[1])) / mr];
      const ezz: [number, number] = [dW[0] / mr, dW[1] / mr];
      const exy: [number, number] = [-(c1 * c2 * U[0] + 0.5 * (c1 * c1 - c2 * c2) * V[0]) / mr, -(c1 * c2 * U[1] + 0.5 * (c1 * c1 - c2 * c2) * V[1]) / mr];
      // 0.5 i (…) : (re, im) → (−0.5 im, 0.5 re)
      const sxzR = c1 * (dU[0] + W[0]) - c2 * dV[0],
        sxzI = c1 * (dU[1] + W[1]) - c2 * dV[1];
      const exz: [number, number] = [(-0.5 * sxzI) / mr, (0.5 * sxzR) / mr];
      const syzR = c2 * (dU[0] + W[0]) + c1 * dV[0],
        syzI = c2 * (dU[1] + W[1]) + c1 * dV[1];
      const eyz: [number, number] = [(-0.5 * syzI) / mr, (0.5 * syzR) / mr];
      const e: Record<string, [number, number]> = { exx, eyy, ezz, exy, exz, eyz };
      const [lr, li, mur, mui] = this.noyau.lameCouche(a.couche);
      const tr: [number, number] = [exx[0] + eyy[0] + ezz[0], exx[1] + eyy[1] + ezz[1]];
      this.comps.forEach((comp, ic) => {
        let v: [number, number];
        switch (comp) {
          case "ux": {
            const sr = c1 * U[0] - c2 * V[0],
              si = c1 * U[1] - c2 * V[1];
            v = [-si / (mr * xi), sr / (mr * xi)];
            break;
          }
          case "uy": {
            const sr = c2 * U[0] + c1 * V[0],
              si = c2 * U[1] + c1 * V[1];
            v = [-si / (mr * xi), sr / (mr * xi)];
            break;
          }
          case "uz":
            v = [W[0] / (mr * xi), W[1] / (mr * xi)];
            break;
          case "sxx":
          case "syy":
          case "szz": {
            const ee = e["e" + comp.slice(1)]!;
            // λ tr + 2 μ e
            v = [lr * tr[0] - li * tr[1] + 2 * (mur * ee[0] - mui * ee[1]), lr * tr[1] + li * tr[0] + 2 * (mur * ee[1] + mui * ee[0])];
            break;
          }
          case "sxy":
          case "sxz":
          case "syz": {
            const ee = e["e" + comp.slice(1)]!;
            v = [2 * (mur * ee[0] - mui * ee[1]), 2 * (mur * ee[1] + mui * ee[0])];
            break;
          }
          default:
            v = e[comp]!;
        }
        const o = 2 * (ic * nz + iz);
        out[o] = v[0];
        out[o + 1] = v[1];
      });
    }
  }
}
