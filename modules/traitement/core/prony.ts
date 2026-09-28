/**
 * Séries de Prony : Maxwell généralisé (relaxation) et Kelvin-Voigt généralisé (fluage),
 * calées directement sur les mesures translatées (courbe maîtresse) ou sur le modèle continu
 * calé. Les temps τᵢ sont fixés sur une grille logarithmique ; les modules (Maxwell) ou les
 * souplesses (Kelvin-Voigt) des branches entrent alors linéairement et se calent en une seule
 * résolution par moindres carrés positifs (nnls.ts), sans point de départ ni minimum local.
 *
 *   Maxwell généralisé      E*(ω) = E∞ + Σ Eᵢ·iωτᵢ / (1 + iωτᵢ)      E(t) = E∞ + Σ Eᵢ·e^(−t/τᵢ)
 *   Kelvin-Voigt généralisé J*(ω) = 1/E0 + Σ (1/Eᵢ) / (1 + iωτᵢ)      J(t) = 1/E0 + Σ (1/Eᵢ)(1 − e^(−t/τᵢ))
 *
 * L'erreur minimisée est l'écart relatif sur le module complexe (E* pour Maxwell, J* pour
 * Kelvin-Voigt), ce qui pèse la norme et l'angle de phase ensemble.
 *
 * PARK S. W. & SCHAPERY R. A., « Methods of interconversion between linear viscoelastic
 * material functions. Part I », International Journal of Solids and Structures, vol. 36,
 * p. 1653-1675, 1999.
 */
import { nnls } from "./nnls";
import type { Complexe } from "./modeles";

const DEG = 180 / Math.PI;

export type TypeProny = "maxwell" | "kelvin";
export type SourceProny = "mesures" | "modele";

/** Réglages enregistrés avec le dépouillement ; la série se recalcule à la demande. */
export interface ReglagesProny {
  type: TypeProny;
  source: SourceProny;
  /** Branches par décade de temps (1 ou 2 en général). */
  parDecade: number;
  /** Coefficient de Poisson supposé constant, pour les exports (G, K). */
  nu: number;
}

export const REGLAGES_PRONY: ReglagesProny = { type: "maxwell", source: "mesures", parDecade: 1, nu: 0.35 };

export interface SerieProny {
  type: TypeProny;
  /** Module instantané (t = 0, fréquence infinie), MPa. */
  E0: number;
  /** Module à long terme (t infini, fréquence nulle), MPa ; 0 pour un liquide. */
  Einf: number;
  /** Modules des branches, MPa (Maxwell : ressort de la branche ; Kelvin-Voigt : 1/souplesse). */
  E: number[];
  /** Temps de relaxation (Maxwell) ou de retard (Kelvin-Voigt), s. */
  tau: number[];
}

/** Un point à caler : fréquence (réduite) et module complexe. */
export interface PointComplexe {
  f: number;
  re: number;
  im: number;
}

/** Grille des τ couvrant les fréquences [fMin, fMax], une décade de marge de chaque côté. */
export function grilleTau(fMin: number, fMax: number, parDecade: number): number[] {
  const n = Math.max(1, Math.round(parDecade));
  const haut = Math.log10(1 / (2 * Math.PI * fMin)) + 1,
    bas = Math.log10(1 / (2 * Math.PI * fMax)) - 1;
  const k = Math.max(1, Math.ceil((haut - bas) * n));
  return Array.from({ length: k + 1 }, (_, i) => 10 ** (bas + ((haut - bas) * i) / k));
}

export function calerProny(points: readonly PointComplexe[], type: TypeProny, tau: readonly number[]): SerieProny | null {
  const pts = points.filter((p) => p.f > 0 && Number.isFinite(p.re) && Number.isFinite(p.im) && Math.hypot(p.re, p.im) > 0);
  if (pts.length < 2 || !tau.length) return null;
  const A: number[][] = [],
    b: number[] = [];
  for (const p of pts) {
    const w = 2 * Math.PI * p.f,
      n2 = p.re * p.re + p.im * p.im;
    const lr = [1],
      li = [0];
    for (const t of tau) {
      const x = w * t,
        d = 1 + x * x;
      lr.push(type === "maxwell" ? (x * x) / d : 1 / d);
      li.push(x / d);
    }
    if (type === "maxwell") {
      const s = 1 / Math.sqrt(n2); // écart relatif sur E*
      A.push(lr.map((v) => v * s), li.map((v) => v * s));
      b.push(p.re * s, p.im * s);
    } else {
      const s = Math.sqrt(n2); // écart relatif sur J* = 1/E*
      A.push(lr.map((v) => v * s), li.map((v) => v * s));
      b.push((p.re / n2) * s, (p.im / n2) * s);
    }
  }
  const { x } = nnls(A, b);
  const E: number[] = [],
    T: number[] = [];
  if (type === "maxwell") {
    x.slice(1).forEach((v, i) => v > 0 && (E.push(v), T.push(tau[i]!)));
    const Einf = x[0]!;
    return { type, Einf, E0: Einf + E.reduce((a, v) => a + v, 0), E, tau: T };
  }
  x.slice(1).forEach((v, i) => v > 0 && (E.push(1 / v), T.push(tau[i]!)));
  const J0 = x[0]!;
  if (!(J0 > 0)) return null; // pas d'élasticité instantanée : la chaîne n'a pas de sens
  return { type, E0: 1 / J0, Einf: 1 / (J0 + x.slice(1).reduce((a, v) => a + v, 0)), E, tau: T };
}

export function moduleProny(f: number, s: SerieProny): Complexe {
  const w = 2 * Math.PI * f;
  let re: number, im: number;
  if (s.type === "maxwell") {
    re = s.Einf;
    im = 0;
    s.E.forEach((E, i) => {
      const x = w * s.tau[i]!,
        d = 1 + x * x;
      re += (E * x * x) / d;
      im += (E * x) / d;
    });
  } else {
    let jr = 1 / s.E0,
      ji = 0;
    s.E.forEach((E, i) => {
      const x = w * s.tau[i]!,
        d = E * (1 + x * x);
      jr += 1 / d;
      ji += x / d;
    });
    const d = jr * jr + ji * ji;
    re = jr / d;
    im = ji / d;
  }
  return { re, im, norme: Math.hypot(re, im), phase: Math.atan2(im, re) * DEG };
}

/** Maxwell : module de relaxation E(t) (MPa). Kelvin-Voigt : fonction de fluage J(t) (1/MPa). */
export function fonctionTemps(s: SerieProny, t: number): number {
  if (s.type === "maxwell") return s.E.reduce((a, E, i) => a + E * Math.exp(-t / s.tau[i]!), s.Einf);
  return s.E.reduce((a, E, i) => a + (1 - Math.exp(-t / s.tau[i]!)) / E, 1 / s.E0);
}

/** Écarts moyens à des mesures (|E*| en %, φ en °). */
export function ecartsProny(s: SerieProny, points: readonly { f: number; module: number; phi: number }[]): { module: number; phase: number; n: number } {
  let eE = 0,
    eP = 0,
    n = 0;
  for (const p of points) {
    if (!(p.f > 0) || !Number.isFinite(p.module)) continue;
    const m = moduleProny(p.f, s);
    eE += Math.abs(m.norme - p.module) / p.module;
    eP += Math.abs(m.phase - p.phi);
    n++;
  }
  return n ? { module: (eE / n) * 100, phase: eP / n, n } : { module: NaN, phase: NaN, n: 0 };
}

/* ─────────────────────────────── exports ─────────────────────────────── */

export interface ContexteExport {
  nom: string;
  nu: number;
  Tref: number;
  C1: number;
  C2: number;
}

const e = (v: number) => v.toExponential(8);

/** Tableau des branches (CSV, feuille de calcul). */
export function tableauProny(s: SerieProny): (string | number)[][] {
  if (s.type === "maxwell") {
    const lignes: (string | number)[][] = [["Maxwell généralisé", "E0 (MPa)", s.E0, "E∞ (MPa)", s.Einf], [], ["i", "τi (s)", "Ei (MPa)", "gi = Ei/E0"]];
    s.E.forEach((E, i) => lignes.push([i + 1, s.tau[i]!, E, E / s.E0]));
    return lignes;
  }
  const lignes: (string | number)[][] = [["Kelvin-Voigt généralisé", "E0 (MPa)", s.E0, "E∞ (MPa)", s.Einf], [], ["i", "τi (s)", "Ei (MPa)", "Ji = 1/Ei (1/MPa)", "ηi = Ei·τi (MPa·s)"]];
  s.E.forEach((E, i) => lignes.push([i + 1, s.tau[i]!, E, 1 / E, E * s.tau[i]!]));
  return lignes;
}

/**
 * Cartes Abaqus : élasticité instantanée, série de Prony normalisée (gᵢ = kᵢ, coefficient de
 * Poisson supposé constant) et loi WLF. Unités MPa et s (système mm, N, s).
 */
export function exportAbaqus(s: SerieProny, c: ContexteExport): string {
  if (s.type !== "maxwell") throw new Error("Abaqus attend une série de relaxation (Maxwell généralisé).");
  const g = s.E.map((E) => E / s.E0);
  return [
    `** ${c.nom} : série de Prony (Maxwell généralisé, ${s.E.length} branches), application Thèse`,
    `** Unités : MPa, s. Coefficient de Poisson supposé constant : g_i = k_i.`,
    `** E0 = ${e(s.E0)} MPa (instantané), E_inf = ${e(s.Einf)} MPa (long terme), somme g_i = ${(1 - s.Einf / s.E0).toFixed(6)}`,
    "*ELASTIC, MODULI=INSTANTANEOUS",
    `${e(s.E0)}, ${c.nu}`,
    "*VISCOELASTIC, TIME=PRONY",
    ...g.map((gi, i) => `${e(gi)}, ${e(gi)}, ${e(s.tau[i]!)}`),
    `** Translation temps-température (log10 a_T = -C1 (T - Tref) / (C2 + T - Tref))`,
    "*TRS, DEFINITION=WLF",
    `${c.Tref}, ${c.C1}, ${c.C2}`,
    "",
  ].join("\n");
}

/**
 * Pour COMSOL (Matériau viscoélastique linéaire, Maxwell généralisé) : tableau des branches
 * « module de cisaillement Gᵢ (Pa) ↹ temps de relaxation τᵢ (s) », à charger dans le tableau
 * des branches, et en commentaire les grandeurs à saisir à côté (G∞, K, WLF).
 */
export function exportComsol(s: SerieProny, c: ContexteExport): string {
  if (s.type !== "maxwell") throw new Error("COMSOL attend une série de relaxation (Maxwell généralisé).");
  const G = (E: number) => (E * 1e6) / (2 * (1 + c.nu));
  const K = (s.E0 * 1e6) / (3 * (1 - 2 * c.nu));
  return [
    `% ${c.nom} : Maxwell généralisé, ${s.E.length} branches (application Thèse)`,
    `% Colonnes : module de cisaillement G_i (Pa), temps de relaxation tau_i (s). nu = ${c.nu} supposé constant.`,
    `% Module de cisaillement à long terme G_inf = ${e(G(s.Einf))} Pa ; instantané G0 = ${e(G(s.E0))} Pa`,
    `% Module de compressibilité K = ${e(K)} Pa (partie volumique élastique)`,
    `% Translation WLF : T_ref = ${c.Tref} degC, C1 = ${c.C1}, C2 = ${c.C2} K (log10)`,
    ...s.E.map((E, i) => `${e(G(E))}\t${e(s.tau[i]!)}`),
    "",
  ].join("\n");
}
