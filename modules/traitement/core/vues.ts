/**
 * Les graphiques de la page, décrits sans les dessiner (le traceur commun, @noyau/graphe, s'en
 * charge à l'écran comme à l'export). Même contenu que les tracés de la page d'origine.
 */
import { aTwlf } from "./calage";
import { VOIES, type CleVoie } from "./donnees";
import { evaluer, pointsCalage, temperaturesCalage, type Essai } from "./essai";
import { freq, nb } from "./format";
import { modele } from "./modeles";
import { maximum, minimum, uniques } from "./nombres";
import { couleurTemperature, type Point, type Serie, type SpecGraphe } from "@noyau/graphe";

export type Langue = "fr" | "en";

/** Titres d'axes et libellés, en français et en anglais (figures pour un article). */
export const TEXTES = {
  fr: { t: "t (s)", signal: "signal centré", mesure: "mesure", cycle: "cycle", ecart: "écart (%)", f: "f (Hz)", module: "|E*| (MPa)", phi: "φ (°)", E1: "E₁ (MPa)", E2: "E₂ (MPa)", faT: "f·a_T (Hz)", nu: "|ν*|", T: "T (°C)", aT: "a_T", modele: "modèle", mesureAT: "mesuré" },
  en: { t: "t (s)", signal: "centred signal", mesure: "measured", cycle: "cycle", ecart: "deviation (%)", f: "f (Hz)", module: "|E*| (MPa)", phi: "φ (°)", E1: "E₁ (MPa)", E2: "E₂ (MPa)", faT: "f·a_T (Hz)", nu: "|ν*|", T: "T (°C)", aT: "a_T", modele: "model", mesureAT: "measured" },
} as const;

/** Couleur du modèle (courbes continues) et des mesures brutes. */
export const ACCENT = "#0b5f5c";
export const ENCRE = "#8a8a84";

export interface Vue {
  spec: SpecGraphe;
  /** Texte du point survolé. */
  format(x: number, y: number, donnee?: unknown): string;
  legende?: [string, string][];
  /** Une ligne sous le titre (état du cycle affiché…). */
  sous?: string;
}

interface PointPalier {
  T: number;
  f: number;
}
const avecPalier = (p: unknown) => {
  const q = p as PointPalier | undefined;
  return q && Number.isFinite(q.T) ? `${q.T} °C · ${freq(q.f)} Hz — ` : "";
};

/* ─────────────────────────── étape 02 : cycles ─────────────────────────── */

export function vueSignal(e: Essai, iPalier: number, iCycle: number, voie: CleVoie, langue: Langue = "fr"): Vue | null {
  const x = TEXTES[langue];
  const p = e.paliers[iPalier];
  const l = p?.lignes[iCycle];
  if (!p || !l) return null;
  const aj = l._aj[voie];
  const mesure: Point[] = [],
    ajuste: Point[] = [];
  const w = 2 * Math.PI * p.f;
  const t0 = p.donnees.t[l._debut]!;
  for (let i = 0; i < l._n; i++) {
    const k = l._debut + i;
    if (k >= p.donnees.n) break;
    const t = p.donnees.t[k]!;
    mesure.push([t - t0, p.donnees.voies[voie][k]! - aj.moyenne]);
    ajuste.push([t - t0, aj.amplitude * Math.sin(w * t + (aj.phase / 180) * Math.PI)]);
  }
  return {
    spec: {
      series: [
        { points: mesure, mode: "points", couleur: ENCRE, taille: 1.7, libelle: x.mesure },
        { points: ajuste, mode: "ligne", couleur: ACCENT, epaisseur: 1.6, libelle: x.modele },
      ],
      xTitre: x.t,
      yTitre: x.signal,
      zeroY: true,
    },
    format: (x, y) => `t = ${nb(x, 1)} s · ${nb(y, 6)}`,
    sous: `cycle ${l.cycle} · ${l.nPoints} points · amplitude ${nb(aj.amplitude, 6)} · phase ${nb(aj.phase, 2)} ° · indice de qualité ${nb(aj.indice, 2)} %`,
  };
}

export const NOMS_VOIES: [CleVoie, string][] = VOIES.map((v) => [v.cle, v.nom]);

export function vueEcartsCapteurs(e: Essai, iPalier: number, langue: Langue = "fr"): Vue | null {
  const x = TEXTES[langue];
  const p = e.paliers[iPalier];
  if (!p) return null;
  const cles = (
    [
      ["ecA1", "Axial 1", e.voiesAx[0]],
      ["ecA2", "Axial 2", e.voiesAx[1]],
      ["ecA3", "Axial 3", e.voiesAx[2]],
      ["ecR1", "Radial 1", e.voiesRad[0]],
      ["ecR2", "Radial 2", e.voiesRad[1]],
      ["ecR3", "Radial 3", e.voiesRad[2]],
      ["ecR4", "Radial 4", e.voiesRad[3]],
    ] as [string, string, boolean | undefined][]
  ).filter((k) => k[2]);
  const couleur = (i: number) => couleurTemperature(i, cles.length);
  const series: Serie[] = [
    ...cles.map(([cle, nom], i) => ({ points: p.lignes.map((l) => [l.cycle, l[cle] as number] as Point), mode: "ligne" as const, couleur: couleur(i), epaisseur: 1.5, libelle: nom })),
    ...cles.map(([cle, nom], i) => ({ points: p.lignes.map((l) => [l.cycle, l[cle] as number] as Point), mode: "points" as const, couleur: couleur(i), taille: 2, libelle: nom })),
  ];
  return {
    spec: { series, xTitre: x.cycle, yTitre: x.ecart, zeroY: true },
    format: (x, y) => `cycle ${Math.round(x)} · ${nb(y, 2)} %`,
    legende: cles.map(([, nom], i) => [nom, couleur(i)]),
  };
}

/* ─────────────────────────── étape 03 : synthèse ─────────────────────────── */

export function vuesSynthese(e: Essai, langue: Langue = "fr"): { module: Vue; phase: Vue } {
  const x = TEXTES[langue];
  const parT: Record<number, typeof e.synthese> = {};
  for (const a of e.synthese) (parT[a.T] ||= []).push(a);
  const ts = uniques(Object.keys(parT).map(Number));
  const sE: Serie[] = [],
    sP: Serie[] = [];
  const legende: [string, string][] = [];
  ts.forEach((T, i) => {
    const c = couleurTemperature(i, ts.length);
    const pts = parT[T]!.slice().sort((x, y) => x.f - y.f);
    sE.push({ points: pts.map((a) => [a.f, a.module]), mode: "ligne", couleur: c, epaisseur: 1.4 });
    sE.push({ points: pts.map((a) => [a.f, a.module]), mode: "points", couleur: c, libelle: `${T} °C` });
    sP.push({ points: pts.map((a) => [a.f, a.phi]), mode: "ligne", couleur: c, epaisseur: 1.4 });
    sP.push({ points: pts.map((a) => [a.f, a.phi]), mode: "points", couleur: c, libelle: `${T} °C` });
    legende.push([`${T} °C`, c]);
  });
  return {
    module: { spec: { series: sE, xLog: true, yLog: true, xTitre: x.f, yTitre: x.module }, format: (a, b) => `${freq(a)} Hz · ${nb(b, 0)} MPa`, legende },
    phase: { spec: { series: sP, xLog: true, xTitre: x.f, yTitre: x.phi }, format: (a, b) => `${freq(a)} Hz · ${nb(b, 2)} °`, legende },
  };
}

/* ─────────────────────────── étape 04 : calage ─────────────────────────── */

export interface VuesCalage {
  cole: Vue;
  black: Vue;
  maitreE: Vue;
  maitreP: Vue;
  nu: Vue;
  aT: Vue;
}

export function vuesCalage(e: Essai, langue: Langue = "fr"): VuesCalage {
  const X = TEXTES[langue];
  const m = modele(e.modeleId);
  const points = pointsCalage(e);
  const ts = temperaturesCalage(e);
  const parT: Record<number, typeof points> = {};
  for (const p of points) (parT[p.T] ||= []).push(p);

  const courbeE: Point[] = [],
    courbeP: Point[] = [],
    courbeCole: Point[] = [],
    courbeBlack: Point[] = [],
    courbeNu: Point[] = [];
  for (let lf = -8; lf <= 10; lf += 0.05) {
    const f = 10 ** lf;
    const v = evaluer(e, f);
    courbeE.push([f, v.norme]);
    courbeP.push([f, v.phase]);
    courbeCole.push([v.re, v.im]);
    courbeBlack.push([v.phase, v.norme]);
    if (m.poisson) courbeNu.push([f, m.poisson(f, e.p).norme]);
  }

  const expE: Serie[] = [],
    expP: Serie[] = [],
    expCole: Serie[] = [],
    expBlack: Serie[] = [],
    expNu: Serie[] = [];
  const legende: [string, string][] = [];
  ts.forEach((T, i) => {
    const c = couleurTemperature(i, ts.length),
      a = e.aT[T] || 1;
    const g = parT[T]!.slice().sort((x, y) => x.f - y.f);
    const s = (pts: Point[]): Serie => ({ points: pts, mode: "points", couleur: c, libelle: `${T} °C` });
    expE.push(s(g.map((p) => [p.f * a, p.module, p])));
    expP.push(s(g.map((p) => [p.f * a, p.phi, p])));
    expCole.push(s(g.map((p) => [p.E1 ?? NaN, p.E2 ?? NaN, p])));
    expBlack.push(s(g.map((p) => [p.phi, p.module, p])));
    expNu.push(s(g.map((p) => [p.f * a, p.nu ?? NaN, p])));
    legende.push([`${T} °C`, c]);
  });
  const ligne = (pts: Point[]): Serie => ({ points: pts, mode: "ligne", couleur: ACCENT, epaisseur: 1.8, libelle: `${X.modele} ${m.nom}` });
  const fmtMaitre = (x: number, y: number, p?: unknown) => `${avecPalier(p)}f·a_T = ${nb(x)} Hz · ${nb(y)}`;

  const wlf: Point[] = [];
  if (ts.length) {
    const t1 = minimum(ts) - 5,
      t2 = maximum(ts) + 5;
    for (let T = t1; T <= t2; T += 0.5) wlf.push([T, aTwlf(T, e.Tref, e.C1, e.C2)]);
  }
  return {
    cole: {
      spec: { series: [...expCole, ligne(courbeCole)], xTitre: X.E1, yTitre: X.E2, zeroY: true },
      format: (x, y, p) => `${avecPalier(p)}E₁ ${nb(x, 0)} · E₂ ${nb(y, 0)} MPa`,
      legende,
    },
    black: { spec: { series: [...expBlack, ligne(courbeBlack)], yLog: true, xTitre: X.phi, yTitre: X.module }, format: (x, y, p) => `${avecPalier(p)}φ ${nb(x, 2)} ° · ${nb(y, 0)} MPa`, legende },
    maitreE: { spec: { series: [...expE, ligne(courbeE)], xLog: true, yLog: true, xTitre: X.faT, yTitre: X.module }, format: fmtMaitre, legende },
    maitreP: { spec: { series: [...expP, ligne(courbeP)], xLog: true, xTitre: X.faT, yTitre: X.phi }, format: fmtMaitre, legende },
    nu: { spec: { series: courbeNu.length ? [...expNu, ligne(courbeNu)] : expNu, xLog: true, xTitre: X.faT, yTitre: X.nu }, format: fmtMaitre, legende },
    aT: {
      spec: {
        series: [
          { points: ts.map((T) => [T, e.aT[T]!] as Point), mode: "points", couleur: ENCRE, taille: 3.4, libelle: X.mesureAT },
          { points: wlf, mode: "ligne", couleur: ACCENT, epaisseur: 1.8, libelle: "WLF" },
        ],
        yLog: true,
        xTitre: X.T,
        yTitre: X.aT,
      },
      format: (x, y) => `${nb(x, 1)} °C · a_T = ${nb(y)}`,
    },
  };
}

/* ─────────────────────────── étape 05 : comparaison ─────────────────────────── */

export function vuesComparaison(essais: readonly Essai[], langue: Langue = "fr"): { module: Vue; cole: Vue; black: Vue; aT: Vue } {
  const X = TEXTES[langue];
  const visibles = essais.filter((e) => e.visible && pointsCalage(e).length);
  const sE: Serie[] = [],
    sCole: Serie[] = [],
    sBlack: Serie[] = [],
    sAT: Serie[] = [];
  const legende: [string, string][] = [];
  for (const e of visibles) {
    const pts = pointsCalage(e);
    const courbe: Point[] = [];
    for (let lf = -8; lf <= 10; lf += 0.08) {
      const f = 10 ** lf;
      courbe.push([f, evaluer(e, f).norme]);
    }
    sE.push({ points: courbe, mode: "ligne", couleur: e.couleur, epaisseur: 1.6 });
    sE.push({ points: pts.map((p) => [p.f * (e.aT[p.T] || 1), p.module, p]), mode: "points", couleur: e.couleur, libelle: e.nom });
    sCole.push({ points: pts.map((p) => [p.E1 ?? NaN, p.E2 ?? NaN, p]), mode: "points", couleur: e.couleur, libelle: e.nom });
    sBlack.push({ points: pts.map((p) => [p.phi, p.module, p]), mode: "points", couleur: e.couleur, libelle: e.nom });
    const ts = uniques(pts.map((p) => p.T));
    sAT.push({ points: ts.map((T) => [T, e.aT[T]!]), mode: "points", couleur: e.couleur, taille: 3.2, libelle: e.nom });
    sAT.push({ points: ts.map((T) => [T, e.aT[T]!] as Point).sort((a, b) => a[0] - b[0]), mode: "ligne", couleur: e.couleur, epaisseur: 1.2 });
    legende.push([e.nom, e.couleur]);
  }
  const fmt = (x: number, y: number, p?: unknown) => `${avecPalier(p)}${nb(x)} · ${nb(y)}`;
  return {
    module: { spec: { series: sE, xLog: true, yLog: true, xTitre: X.faT, yTitre: X.module }, format: fmt, legende },
    cole: { spec: { series: sCole, xTitre: X.E1, yTitre: X.E2, zeroY: true }, format: fmt, legende },
    black: { spec: { series: sBlack, yLog: true, xTitre: X.phi, yTitre: X.module }, format: fmt, legende },
    aT: { spec: { series: sAT, yLog: true, xTitre: X.T, yTitre: X.aT }, format: (x, y) => `${nb(x, 1)} °C · ${nb(y)}`, legende },
  };
}
