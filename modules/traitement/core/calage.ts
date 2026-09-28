/**
 * Translation des isothermes, loi WLF et calage des constantes (portage de calage.js).
 */
import { nelderMead, nelderMeadMulti } from "./optim";
import { maximum, minimum } from "./nombres";
import type { Constantes, Modele, ModeleCale } from "./modeles";

/** Point de mesure (synthèse d'un palier) utilisé pour le calage. */
export interface PointMesure {
  T: number;
  f: number;
  module: number;
  phi: number;
  nu?: number;
}

/** Facteur de translation par température. */
export type Translations = Record<number, number>;

/* ---------------------------------------------------------------- WLF */

/** Calibration 2S2P1D!AC78 : aT = 10^(−C1·(T−Tref)/(C2+T−Tref)) */
export function aTwlf(T: number, Tref: number, C1: number, C2: number): number {
  return 10 ** ((-C1 * (T - Tref)) / (C2 + T - Tref));
}

/** Objectif du solveur du classeur (AO79) : Σ |aTwlf − aT| / MOYENNE(aTwlf, aT) */
export function residuWLFexcel(temps: readonly number[], aTs: readonly number[], Tref: number, C1: number, C2: number): number {
  let s = 0;
  for (let i = 0; i < temps.length; i++) {
    const w = aTwlf(temps[i]!, Tref, C1, C2);
    s += Math.abs((w - aTs[i]!) / ((w + aTs[i]!) / 2));
  }
  return s;
}

/**
 * Le couple (C1, C2) est mal conditionné : quand les deux partent ensemble vers l'infini leur
 * rapport reste fini et le résidu ne bouge plus, si bien qu'un simplexe non borné dérive vers
 * des valeurs sans aucun sens physique. On borne donc les deux constantes, on travaille sur
 * log aT — qui est la grandeur réellement répartie — et on repart de six points différents.
 */
export function calerWLF(temperatures: readonly number[], aTs: readonly number[], Tref: number, depart?: readonly number[]): { C1: number; C2: number; residu: number } {
  const indices: number[] = [];
  for (let i = 0; i < temperatures.length; i++) {
    if (Number.isFinite(aTs[i]) && aTs[i]! > 0) indices.push(i);
  }
  const cout = (v: number[]) => {
    const C1 = Math.min(150, Math.max(0.5, v[0]!));
    const C2 = Math.min(1500, Math.max(5, v[1]!));
    let s = 0;
    for (const i of indices) {
      const T = temperatures[i]!;
      if (C2 + T - Tref <= 0) return 1e9; // pôle de la loi
      const w = aTwlf(T, Tref, C1, C2);
      if (!Number.isFinite(w) || w <= 0) return 1e9;
      const d = Math.log10(w) - Math.log10(aTs[i]!);
      s += d * d;
    }
    return s / Math.max(1, indices.length);
  };
  const r = nelderMeadMulti(
    cout,
    [depart || [25, 180], [10, 100], [20, 200], [35, 300], [45, 500], [15, 60]],
    { maxIter: 3000, tol: 1e-14 },
  );
  return { C1: Math.min(150, Math.max(0.5, r.x[0]!)), C2: Math.min(1500, Math.max(5, r.x[1]!)), residu: r.fx };
}

/* ------------------------------------------------- translation des isothermes */

interface Polynome {
  bas: number;
  haut: number;
  coefficients: number[];
  en(x: number): number;
}

/** Moindres carrés polynomiaux, résolus par pivot de Gauss sur les équations normales. */
function polyfit(xs: number[], ys: number[], degre: number): Polynome | null {
  const m = degre + 1;
  if (xs.length < m) return null;
  const A: number[][] = [],
    b: number[] = [];
  for (let r = 0; r < m; r++) {
    A.push(new Array<number>(m).fill(0));
    b.push(0);
    for (let k = 0; k < xs.length; k++) {
      for (let c = 0; c < m; c++) A[r]![c]! += xs[k]! ** (r + c);
      b[r]! += xs[k]! ** r * ys[k]!;
    }
  }
  for (let r = 0; r < m; r++) {
    // pivot de Gauss
    let p = r;
    for (let k = r + 1; k < m; k++) if (Math.abs(A[k]![r]!) > Math.abs(A[p]![r]!)) p = k;
    [A[r], A[p]] = [A[p]!, A[r]!];
    [b[r], b[p]] = [b[p]!, b[r]!];
    if (Math.abs(A[r]![r]!) < 1e-14) return null;
    for (let k = r + 1; k < m; k++) {
      const f = A[k]![r]! / A[r]![r]!;
      for (let c = r; c < m; c++) A[k]![c]! -= f * A[r]![c]!;
      b[k]! -= f * b[r]!;
    }
  }
  const co: number[] = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < m; c++) s -= A[r]![c]! * co[c]!;
    co[r] = s / A[r]![r]!;
  }
  return { bas: minimum(xs), haut: maximum(xs), coefficients: co, en: (x) => co.reduce((v, c, j) => v + c * x ** j, 0) };
}

/** Ajustement de log f en fonction de log|E*| sur une isotherme. Droite à moins de cinq points, parabole au-delà. */
function logfSelonLogE(points: readonly PointMesure[]): Polynome | null {
  const xs: number[] = [],
    ys: number[] = [];
  for (const p of points) {
    if (p.module > 0 && p.f > 0) {
      xs.push(Math.log10(p.module));
      ys.push(Math.log10(p.f));
    }
  }
  if (xs.length < 2) return null;
  return polyfit(xs, ys, xs.length >= 5 ? 2 : 1);
}

const temperaturesDe = (parTemperature: Record<number, readonly PointMesure[]>) =>
  Object.keys(parTemperature)
    .map(Number)
    .sort((a, b) => a - b);

/**
 * Recalage automatique des isothermes.
 *
 * Le recouvrement de deux isothermes voisines est presque nul sur l'axe des fréquences —
 * 0,003 à 10 Hz d'un côté, la même plage décalée de plusieurs décades de l'autre — et
 * chercher la translation par la fréquence ne converge pas. On raisonne donc sur l'axe des
 * modules, où le recouvrement existe toujours : chaque isotherme donne log f en fonction de
 * log|E*|, et la translation est l'écart moyen entre les deux courbes sur la plage de module
 * commune. Sans plage commune, les deux ajustements sont prolongés jusqu'au module qui les
 * sépare.
 */
export function recalerIsothermes(parTemperature: Record<number, readonly PointMesure[]>, Tref: number): Translations {
  const temps = temperaturesDe(parTemperature);
  const aT: Translations = { [Tref]: 1 };
  const iref = temps.indexOf(Tref);
  if (iref < 0) {
    for (const t of temps) aT[t] = 1;
    return aT;
  }

  const ajustements: Record<number, Polynome | null> = {};
  for (const T of temps) ajustements[T] = logfSelonLogE(parTemperature[T]!);

  const translation = (courante: number, reference: number) => {
    const a = ajustements[reference],
      b = ajustements[courante];
    if (!a || !b) return aT[reference]!;
    const bas = Math.max(a.bas, b.bas),
      haut = Math.min(a.haut, b.haut);
    let s = 0,
      n = 0;
    if (haut - bas < 0.03) {
      // pas de recouvrement
      const x = (Math.min(a.haut, b.haut) + Math.max(a.bas, b.bas)) / 2;
      s = a.en(x) - b.en(x);
      n = 1;
    } else {
      for (let i = 0; i <= 20; i++) {
        const x = bas + ((haut - bas) * i) / 20;
        s += a.en(x) - b.en(x);
        n++;
      }
    }
    return 10 ** (s / n) * aT[reference]!;
  };

  for (let i = iref + 1; i < temps.length; i++) aT[temps[i]!] = translation(temps[i]!, temps[i - 1]!);
  for (let j = iref - 1; j >= 0; j--) aT[temps[j]!] = translation(temps[j]!, temps[j + 1]!);

  return affinerTranslations(parTemperature, Tref, aT);
}

/**
 * Affinage global des translations.
 *
 * La passe précédente enchaîne les isothermes deux à deux depuis la température de
 * référence : l'erreur de chaque comparaison se reporte sur toutes les suivantes, et la plus
 * éloignée de Tref est la plus fausse.
 *
 * On reprend donc TOUTES les paires d'isothermes, pas seulement les voisines, et pas
 * seulement en chaîne. Pour une paire qui se recouvre en module, l'écart de translation est
 * directement mesurable ; cela donne une équation log a_i − log a_j = d_ij, pondérée par la
 * largeur du recouvrement. Le système est linéaire en log a_T : une seule résolution aux
 * moindres carrés, sans itération ni minimum local. Les températures sans aucun recouvrement
 * gardent la valeur de la passe en chaîne, ancrée faiblement.
 *
 * Seules les paires qui se recouvrent réellement entrent dans le système : sans cette
 * contrainte le problème est dégénéré, puisqu'on peut toujours éloigner deux isothermes
 * disjointes sans rien dégrader.
 */
export function affinerTranslations(parTemperature: Record<number, readonly PointMesure[]>, Tref: number, depart: Translations): Translations {
  const temps = temperaturesDe(parTemperature);
  const n = temps.length;
  if (n < 2) return { ...depart };
  const iref = temps.indexOf(Tref);
  if (iref < 0) return { ...depart };

  const ajust = temps.map((T) => logfSelonLogE(parTemperature[T]!));

  // équations : lg_i − lg_j = d_ij, poids = largeur du recouvrement
  const lignes: { i: number; j: number; d: number; poids: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ajust[i],
        b = ajust[j];
      if (!a || !b) continue;
      const bas = Math.max(a.bas, b.bas),
        haut = Math.min(a.haut, b.haut);
      const largeur = haut - bas;
      if (largeur < 0.05) continue; // recouvrement insuffisant
      let s = 0;
      const echantillons = 11;
      for (let q = 0; q < echantillons; q++) {
        const x = bas + (largeur * q) / (echantillons - 1);
        s += b.en(x) - a.en(x);
      }
      lignes.push({ i, j, d: s / echantillons, poids: Math.sqrt(largeur) });
    }
  }
  // ancrage faible sur la passe en chaîne, pour les isothermes isolées
  for (let i = 0; i < n; i++) {
    const v = depart[temps[i]!]!;
    if (v > 0) lignes.push({ i, j: iref, d: Math.log10(v), poids: 0.02 });
  }
  if (!lignes.length) return { ...depart };

  // équations normales, avec lg[iref] éliminé (fixé à 0)
  const idx = temps.map((_, i) => (i < iref ? i : i - 1));
  const m = n - 1;
  const G = Array.from({ length: m }, () => new Float64Array(m));
  const c = new Float64Array(m);
  for (const L of lignes) {
    const w2 = L.poids * L.poids;
    const a: [number, number][] = [];
    if (L.i !== iref) a.push([idx[L.i]!, 1]);
    if (L.j !== iref) a.push([idx[L.j]!, -1]);
    for (const [p, sp] of a) {
      c[p]! += w2 * sp * L.d;
      for (const [q, sq] of a) G[p]![q]! += w2 * sp * sq;
    }
  }
  for (let i = 0; i < m; i++) G[i]![i]! += 1e-9;

  // pivot de Gauss
  const M = G.map((g, i) => Float64Array.from([...g, c[i]!]));
  for (let r = 0; r < m; r++) {
    let p = r;
    for (let k = r + 1; k < m; k++) if (Math.abs(M[k]![r]!) > Math.abs(M[p]![r]!)) p = k;
    [M[r], M[p]] = [M[p]!, M[r]!];
    if (Math.abs(M[r]![r]!) < 1e-14) return { ...depart };
    for (let k = r + 1; k < m; k++) {
      const f = M[k]![r]! / M[r]![r]!;
      for (let cc = r; cc <= m; cc++) M[k]![cc]! -= f * M[r]![cc]!;
    }
  }
  const lg = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = M[r]![m]!;
    for (let cc = r + 1; cc < m; cc++) s -= M[r]![cc]! * lg[cc]!;
    lg[r] = s / M[r]![r]!;
  }

  const aT: Translations = { [Tref]: 1 };
  for (let i = 0; i < n; i++) if (i !== iref) aT[temps[i]!] = 10 ** lg[idx[i]!]!;
  return aT;
}

/* -------------------------------------------------- calage des constantes */

function borner(m: Modele, p: Constantes): Constantes {
  const q = { ...p };
  for (const [cle, [lo, hi]] of Object.entries(m.bornes || {})) {
    if (Number.isFinite(q[cle])) q[cle] = Math.min(hi, Math.max(lo, q[cle]!));
  }
  if (Number.isFinite(q.E0) && Number.isFinite(q.E00)) q.E0 = Math.max(q.E00! + 1e-6, q.E0!);
  if (Number.isFinite(q.h) && Number.isFinite(q.k)) q.h = Math.max(q.k! + 1e-4, q.h!);
  return q;
}

export interface Poids {
  module: number;
  phase: number;
}

/** Cale les constantes du module sur |E*| (écart relatif) et φ (écart absolu), comme la feuille « Difference 2S2P1D vs. exp ». */
export function calerModule(m: ModeleCale, points: readonly PointMesure[], aT: Translations, p0: Constantes, poids: Poids = { module: 1, phase: 0.02 }): { parametres: Constantes; cout: number } {
  const libres = m.ajustables;
  if (!libres.length) return { parametres: p0, cout: NaN };
  const echelle = libres.map((c) => Math.abs(p0[c]!) || 1);
  const ouvrir = (v: number[]) => borner(m, { ...p0, ...Object.fromEntries(libres.map((c, i) => [c, v[i]! * echelle[i]!])) });
  const cout = (v: number[]) => {
    const p = ouvrir(v);
    let s = 0,
      n = 0;
    for (const q of points) {
      const a = aT[q.T];
      if (!Number.isFinite(a) || !Number.isFinite(q.module)) continue;
      const mod = m.module(q.f * a!, p);
      const dm = (mod.norme - q.module) / q.module;
      const dp = mod.phase - q.phi;
      s += poids.module * dm * dm + (poids.phase * dp * dp) / 100;
      n++;
    }
    return n ? s / n : 1e9;
  };
  const v0 = libres.map((c, i) => p0[c]! / echelle[i]!);
  let r = nelderMead(cout, v0, { maxIter: 8000, tol: 1e-14 });
  r = nelderMead(cout, r.x, { maxIter: 8000, tol: 1e-16 });
  return { parametres: ouvrir(r.x), cout: r.fx };
}

export function calerPoisson(m: Modele, points: readonly PointMesure[], aT: Translations, p0: Constantes): { parametres: Constantes; cout: number } {
  const libres = m.ajustablesPoisson;
  const poisson = m.poisson;
  if (!libres.length || !poisson) return { parametres: p0, cout: NaN };
  const echelle = libres.map((c) => Math.abs(p0[c]!) || 1);
  const ouvrir = (v: number[]) => borner(m, { ...p0, ...Object.fromEntries(libres.map((c, i) => [c, v[i]! * echelle[i]!])) });
  const cout = (v: number[]) => {
    const p = ouvrir(v);
    let s = 0,
      n = 0;
    for (const q of points) {
      const a = aT[q.T];
      if (!Number.isFinite(a) || !Number.isFinite(q.nu)) continue;
      const d = (poisson(q.f * a!, p).norme - q.nu!) / Math.max(1e-6, Math.abs(q.nu!));
      s += d * d;
      n++;
    }
    return n ? s / n : 1e9;
  };
  const v0 = libres.map((c, i) => p0[c]! / echelle[i]!);
  const r = nelderMead(cout, v0, { maxIter: 6000, tol: 1e-14 });
  return { parametres: ouvrir(r.x), cout: r.fx };
}

/**
 * Calage conjoint des constantes et des facteurs de translation.
 *
 * Le recalage géométrique ne peut pas placer correctement une isotherme dépourvue
 * d'information : à très basse température le matériau est sur son asymptote vitreuse, |E*|
 * n'y varie presque plus et la translation devient indéterminée. La feuille du classeur
 * contourne le problème en laissant l'utilisateur régler un τ par température en même temps
 * que les constantes ; c'est ce que fait ici l'optimiseur, en une seule passe.
 *
 * Les inconnues sont les constantes ajustables du modèle et les log a_T de toutes les
 * températures sauf celle de référence. Le point de départ est le recalage géométrique, qui
 * place déjà correctement les isothermes riches en information.
 */
export function calageConjoint(
  m: ModeleCale,
  parTemperature: Record<number, readonly PointMesure[]>,
  Tref: number,
  p0: Constantes,
  aT0: Translations,
  poids: Poids = { module: 1, phase: 0.02 },
): { parametres: Constantes; aT: Translations; cout: number } {
  const temps = temperaturesDe(parTemperature);
  const libres = temps.filter((T) => T !== Tref);
  const cles = m.ajustables;
  if (!cles.length) return { parametres: p0, aT: { ...aT0 }, cout: NaN };

  const echelle = cles.map((c) => Math.abs(p0[c]!) || 1);
  const points: PointMesure[] = [];
  for (const T of temps) for (const p of parTemperature[T]!) points.push(p);

  const ouvrir = (v: number[]) => {
    const p = borner(m, { ...p0, ...Object.fromEntries(cles.map((c, i) => [c, v[i]! * echelle[i]!])) });
    const aT: Translations = { [Tref]: 1 };
    libres.forEach((T, i) => {
      aT[T] = 10 ** v[cles.length + i]!;
    });
    return { p, aT };
  };

  const cout = (v: number[]) => {
    const { p, aT } = ouvrir(v);
    let s = 0,
      n = 0;
    for (const q of points) {
      const a = aT[q.T];
      if (!Number.isFinite(a) || !Number.isFinite(q.module)) continue;
      const mod = m.module(q.f * a!, p);
      const dm = (mod.norme - q.module) / q.module;
      const dp = mod.phase - q.phi;
      s += poids.module * dm * dm + (Number.isFinite(dp) ? (poids.phase * dp * dp) / 100 : 0);
      n++;
    }
    return n ? s / n : 1e9;
  };

  const v0 = [...cles.map((c, i) => p0[c]! / echelle[i]!), ...libres.map((T) => Math.log10(aT0[T]! > 0 ? aT0[T]! : 1))];
  let r = nelderMead(cout, v0, { maxIter: 20000, tol: 1e-15 });
  r = nelderMead(cout, r.x, { maxIter: 20000, tol: 1e-17 });
  const { p, aT } = ouvrir(r.x);
  return { parametres: p, aT, cout: r.fx };
}

/** Écarts moyens entre modèle et mesure, pour l'affichage. */
export function ecarts(m: Pick<ModeleCale, "module">, points: readonly PointMesure[], aT: Translations, p: Constantes): { module: number; phase: number; n: number } {
  let eE = 0,
    eP = 0,
    n = 0;
  for (const q of points) {
    const a = aT[q.T];
    if (!Number.isFinite(a) || !Number.isFinite(q.module)) continue;
    const mod = m.module(q.f * a!, p);
    eE += Math.abs((mod.norme - q.module) / q.module);
    eP += Math.abs(mod.phase - q.phi);
    n++;
  }
  return n ? { module: (eE / n) * 100, phase: eP / n, n } : { module: NaN, phase: NaN, n: 0 };
}
