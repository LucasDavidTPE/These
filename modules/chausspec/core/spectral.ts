/** Assemblage des multiplicateurs spectraux : noyau x chargement -> composantes transformées (spectral.py). */
import { CArray, meshgrid, mul } from "./carray";
import { StiffnessKernel, type Amplitudes } from "./kernel";
import type { Loading } from "./loads";
import type { Regime } from "./regimes";
import type { Structure } from "./structure";

export const DISP = ["ux", "uy", "uz"] as const;
export const STRAIN = ["exx", "eyy", "ezz", "exy", "exz", "eyz"] as const;
export const STRESS = ["sxx", "syy", "szz", "sxy", "sxz", "syz"] as const;
export const ALL = [...DISP, ...STRAIN, ...STRESS] as const;
export type Component = (typeof ALL)[number];

/** Clé d'un champ : le couple (comp, z) du Python, écrit « comp@z ». */
export const fieldKey = (comp: string, z: number) => `${comp}@${z}`;

export function layerModuli(structure: Structure, omega: Float64Array): [CArray[], CArray[]] {
  const lam: CArray[] = [];
  const mu: CArray[] = [];
  for (const L of structure.layers) {
    const [l, m] = L.material.lame(omega);
    lam.push(l);
    mu.push(m);
  }
  return [lam, mu];
}

/**
 * Transformées de Fourier des composantes demandées à une profondeur.
 *
 * amp : amplitudes renvoyées par StiffnessKernel.atDepth ; p = p^ ; T0, R0 : décomposition
 * P-SV / SH des efforts tangentiels de surface (ou null).
 */
export function componentsFromAmplitudes(amp: Amplitudes, xi: Float64Array, c1: Float64Array, c2: Float64Array, p: CArray, T0: CArray | null, R0: CArray | null, comps: readonly Component[]): Map<Component, CArray> {
  const mr = amp.muRef;
  const [Un, Wn, dUn, dWn] = amp.n;
  let U = Un.mul(p);
  let W = Wn.mul(p);
  let dU = dUn.mul(p);
  let dW = dWn.mul(p);
  let V = CArray.zeros(xi.length);
  let dV = CArray.zeros(xi.length);
  if (T0 !== null && R0 !== null) {
    const [Ut, Wt, dUt, dWt] = amp.t!;
    U = U.add(Ut.mul(T0));
    W = W.add(Wt.mul(T0));
    dU = dU.add(dUt.mul(T0));
    dW = dW.add(dWt.mul(T0));
    const [Vs, dVs] = amp.sh!;
    V = Vs.mul(R0);
    dV = dVs.mul(R0);
  }
  const out = new Map<Component, CArray>();
  const need = new Set(comps);
  const e: Partial<Record<(typeof STRAIN)[number], CArray>> = {};
  if ([...STRAIN, ...STRESS].some((c) => need.has(c))) {
    e.exx = mul(c1, mul(c1, U).sub(mul(c2, V))).neg().div(mr); //  -c1 (c1 U - c2 V) / mr
    e.eyy = mul(c2, mul(c2, U).add(mul(c1, V))).neg().div(mr); //  -c2 (c2 U + c1 V) / mr
    e.ezz = dW.div(mr); //                                          dW / mr
    const c1c2 = c1.map((a, i) => a * c2[i]!);
    const halfDiff = c1.map((a, i) => 0.5 * (a ** 2 - c2[i]! ** 2));
    e.exy = mul(c1c2, U).add(mul(halfDiff, V)).neg().div(mr); //   -(c1 c2 U + 0.5 (c1^2 - c2^2) V) / mr
    const dUW = dU.add(W);
    e.exz = mul(c1, dUW).sub(mul(c2, dV)).mulI().mul(0.5).div(mr); // 0.5j (c1 (dU + W) - c2 dV) / mr
    e.eyz = mul(c2, dUW).add(mul(c1, dV)).mulI().mul(0.5).div(mr); // 0.5j (c2 (dU + W) + c1 dV) / mr
  }
  const mrXi = mr.map((m, i) => m * xi[i]!);
  for (const c of comps) {
    if (c === "ux") out.set(c, mul(c1, U).sub(mul(c2, V)).mulI().div(mrXi)); //  1j (c1 U - c2 V) / (mr xi)
    else if (c === "uy") out.set(c, mul(c2, U).add(mul(c1, V)).mulI().div(mrXi)); // 1j (c2 U + c1 V) / (mr xi)
    else if (c === "uz") out.set(c, W.div(mrXi)); //                                  W / (mr xi)
    else if ((STRAIN as readonly string[]).includes(c)) out.set(c, e[c as keyof typeof e]!);
  }
  if (STRESS.some((c) => need.has(c))) {
    const lam = amp.lam;
    const mu = amp.mu;
    const tr = e.exx!.add(e.eyy!).add(e.ezz!);
    for (const c of comps) {
      const eps = e[`e${c.slice(1)}` as keyof typeof e];
      if (c === "sxx" || c === "syy" || c === "szz") out.set(c, lam.mul(tr).add(mu.mul(2).mul(eps!))); // lam tr + 2 mu e
      else if (c === "sxy" || c === "sxz" || c === "syz") out.set(c, mu.mul(2).mul(eps!)); //             2 mu e
    }
  }
  return out;
}

/** (T0, R0) tels que sigma_xz(0) = -qx et sigma_yz(0) = -qy (voir notice §3.4). */
export function tangentialDecomposition(c1: Float64Array, c2: Float64Array, qx: CArray | null, qy: CArray | null): [CArray | null, CArray | null] {
  if (qx === null && qy === null) return [null, null];
  const zero = CArray.zeros(c1.length);
  const Qx = qx ?? zero;
  const Qy = qy ?? zero;
  const T0 = mul(c1, Qx).add(mul(c2, Qy)).mulI(); //        1j (c1 qx + c2 qy)
  const R0 = mul(c2, Qx).neg().add(mul(c1, Qy)).mulI(); //  1j (-c2 qx + c1 qy)
  return [T0, R0];
}

export interface SpectralOptions {
  side?: "above" | "below";
  /** Largeur (m) d'un filtre gaussien appliqué au chargement (0 = aucun). */
  filterWidth?: number;
}

/**
 * Calcule, pour un paquet de nombres d'onde, les transformées des composantes demandées à
 * chaque profondeur. Renvoie une Map fieldKey(comp, z) -> tableau.
 *
 * Différence d'écriture avec le Python : le paquet est la grille tensorielle k2 (lignes) × k1
 * (colonnes), donnée par ses deux axes (le Python reçoit np.meshgrid(k1, k2)) ; les tableaux
 * renvoyés sont rangés ligne par ligne (k2.length × k1.length).
 * k1_shift (texture sous enveloppe roulante) n'est pas porté.
 */
export function spectralFields(structure: Structure, regime: Regime, loading: Loading, k1: Float64Array, k2: Float64Array, depths: readonly number[], comps: readonly Component[], options: SpectralOptions = {}): Map<string, CArray> {
  const [a, b] = meshgrid(k1, k2);
  const xi = a.map((v, i) => Math.hypot(v, b[i]!));
  if (xi.some((v) => v === 0)) throw new Error("xi = 0 doit être traité par moyenne de cellule.");
  const c1 = a.map((v, i) => v / xi[i]!);
  const c2 = b.map((v, i) => v / xi[i]!);
  const omega = regime.omega(a, b);
  const [lam, mu] = layerModuli(structure, omega);
  const load = loading.ftGrid(k1, k2);
  let p = load.p;
  const fw = options.filterWidth ?? 0;
  if (fw > 0) p = mul(p, xi.map((x) => Math.exp(-0.5 * (x * fw) ** 2)));
  const [T0, R0] = tangentialDecomposition(c1, c2, load.qx, load.qy);
  const K = new StiffnessKernel(structure, xi, lam, mu, T0 !== null);
  const out = new Map<string, CArray>();
  for (const z of depths) {
    const amp = K.atDepth(z, options.side ?? "above");
    const comp = componentsFromAmplitudes(amp, xi, c1, c2, p, T0, R0, comps);
    for (const [c, v] of comp) out.set(fieldKey(c, z), v);
  }
  return out;
}
