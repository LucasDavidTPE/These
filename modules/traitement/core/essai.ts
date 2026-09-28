/**
 * Un essai en cours de dépouillement et tout ce qu'on en fait : c'est la logique de la page
 * d'origine (statique/src/main.js), sans le DOM. Les fonctions modifient l'essai qu'on leur
 * passe, comme la page le faisait ; l'interface (ui/) se redessine ensuite.
 *
 * Les cycles écartés du calcul sont repérés par « T|f|cycle » : la clé survit à un nouveau
 * traitement, à un changement de mode et à la sauvegarde du projet.
 */
import { aTwlf, calageConjoint, calerModule, calerPoisson, calerWLF, ecarts, recalerIsothermes, type PointMesure, type Translations } from "./calage";
import { detecterCampagne } from "./campagne";
import type { Depouillement, Enregistrement } from "./depouillement";
import { construireDonnees, CORRESPONDANCE_PAR_DEFAUT, type Correspondance, type Donnees, type TableBrute } from "./donnees";
import { CONSTANTES_DEMO, pointsDemo, signalDemo, WLF_DEMO, type PointDemo } from "./demo";
import { entier, freq, nb } from "./format";
import type { Lu } from "./io/lecture";
import { CLES_TEMPS, modele, parametresInitiaux, type ChaineGKV, type Complexe, type Constantes, type ModeleCale } from "./modeles";
import { identifierGKV, moduleGKV } from "./modeles/gkv";
import { calerProny, grilleTau, type PointComplexe, type ReglagesProny, type SerieProny } from "./prony";
import { maximum, minimum, uniques } from "./nombres";
import { synthetiser, type Palier } from "./synthese";
import { traiterPalier, type LigneCycle } from "./traitement";

export const COULEURS_ESSAI = ["#0b5f5c", "#a4522a", "#3a5ba0", "#7a3f7e", "#5c7a2a", "#9a3b3b"];

export interface Meta {
  diametre: number;
  hauteur: number;
  hCalcul: number;
  cycleInitial: number;
  a1: number;
  b1: number;
  a2: number;
  b2: number;
}

export interface PalierTraite {
  T: number;
  f: number;
  de: number;
  a: number;
  lignes: LigneCycle[];
  donnees: Donnees;
  nLignes: number;
  libelle: string;
}

export type Mode = "excel" | "corrige";

export interface Essai {
  id: string;
  nom: string;
  table: TableBrute | null;
  entetes: string[];
  correspondance: Correspondance;
  uniteAxiale: string;
  meta: Meta;
  voiesAx: boolean[];
  voiesRad: boolean[];
  temperatures: number[];
  frequences: number[];
  /** [fréquence][température] */
  nbCycles: number[][];
  mode: Mode;
  paliers: PalierTraite[];
  synthese: Palier[];
  exclus: Set<string>;
  motifs: Record<string, string>;
  modeleId: string;
  p: Constantes;
  aT: Translations;
  Tref: number;
  C1: number;
  C2: number;
  couleur: string;
  visible: boolean;
  demo: boolean;
  pointsDemo?: PointDemo[];
  /** Chaîne Kelvin-Voigt identifiée (modèle GKV), recalculée quand les constantes changent. */
  chaine?: ChaineGKV | null;
  /** Fichier de mesure : référence de racine ou chemin absolu (pour rouvrir le dépouillement). */
  source?: string;
  /** Où le dépouillement s'enregistre dans l'espace, s'il s'y enregistre. */
  enregistrement?: Enregistrement;
  /** Série de Prony demandée (réglages) ; la série elle-même se recalcule (serieProny). */
  prony?: ReglagesProny;
}

let compteur = 0;

export function nouvelEssai(nom: string, rang = 0): Essai {
  const m = modele("2s2p1d");
  return {
    id: `e${Date.now().toString(36)}${(compteur++).toString(36)}`,
    nom,
    table: null,
    entetes: [],
    correspondance: { ...CORRESPONDANCE_PAR_DEFAUT },
    uniteAxiale: "mm/mm",
    meta: { diametre: 75, hauteur: 149, hCalcul: 1, cycleInitial: 1, a1: 0.001, b1: 0, a2: 0.001, b2: 0 },
    voiesAx: [true, true, true],
    voiesRad: [true, true, false, false],
    temperatures: [15],
    frequences: [0.003],
    nbCycles: [[3]],
    mode: "excel",
    paliers: [],
    synthese: [],
    exclus: new Set(),
    motifs: {},
    modeleId: "2s2p1d",
    p: parametresInitiaux(m),
    aT: {},
    Tref: 15,
    C1: 25,
    C2: 180,
    couleur: COULEURS_ESSAI[rang % COULEURS_ESSAI.length]!,
    visible: true,
    demo: false,
  };
}

/* ══════════════════════════════════════════════════════ chargement */

/** Un fichier lu devient un essai : voies, unité, cycle initial. */
export function essaiDepuisLecture(r: Lu, rang: number): Essai {
  const e = nouvelEssai(r.nom.replace(/\.[^.]+$/, ""), rang);
  e.table = r.table;
  e.entetes = r.entetes;
  e.correspondance = r.correspondance;
  e.uniteAxiale = r.uniteAxiale;
  const lions = ["lion1", "lion2", "lion3", "lion4"] as const;
  for (let q = 0; q < 4; q++) e.voiesRad[q] = e.correspondance[lions[q]!] >= 0;
  e.voiesAx = [e.correspondance.defA >= 0, e.correspondance.defB >= 0, e.correspondance.defC >= 0];
  const cCyc = e.table.colonne(e.correspondance.cycle);
  if (cCyc) {
    const m = minimum(cCyc);
    // Colonne vide ou illisible : minimum = Infinity, qui ferait boucler traiter().
    if (Number.isFinite(m)) e.meta.cycleInitial = m;
  }
  return e;
}

/** Retrouve la matrice T × f dans le fichier ; renvoie le message à afficher (null : rien trouvé). */
export function detecter(e: Essai): string | null {
  if (!e.table || e.table.n < 200) return null;
  let d = null;
  try {
    d = detecterCampagne(e.table, e.correspondance);
  } catch {
    d = null;
  }
  if (!d) return null;
  e.temperatures = d.temperatures;
  e.frequences = d.frequences;
  e.nbCycles = d.nbCycles;
  e.meta.cycleInitial = d.cycleInitial;
  e.Tref = d.temperatures.includes(15) ? 15 : d.temperatures[Math.floor(d.temperatures.length / 2)]!;
  const absents: string[] = [];
  d.nbCycles.forEach((ligne, j) =>
    ligne.forEach((v, i) => {
      if (!v) absents.push(`${freq(d.frequences[j]!)} Hz à ${d.temperatures[i]} °C`);
    }),
  );
  let total = 0;
  for (const l of d.nbCycles) for (const v of l) total += v;
  return (
    `${d.temperatures.length} paliers de température × ${d.frequences.length} fréquences, ${entier(total)} cycles à partir du cycle ${d.cycleInitial}. ` +
    `Fréquences déduites de la durée des cycles, températures de la sonde.` +
    (absents.length ? ` Absents du fichier : ${absents.join(", ")}.` : "")
  );
}

/* ══════════════════════════════════════════════════════ traitement */

function bornesCycles(table: TableBrute, colonne: number): Map<number, [number, number]> {
  const c = table.colonne(colonne)!;
  const index = new Map<number, [number, number]>();
  let prec: number | null = null,
    debut = 0;
  for (let i = 0; i < table.n; i++) {
    const v = c[i]!;
    if (v !== prec) {
      if (prec !== null) index.set(prec, [debut, i - 1]);
      prec = v;
      debut = i;
    }
  }
  if (prec !== null) index.set(prec, [debut, table.n - 1]);
  return index;
}

/**
 * Traite toute la campagne : un palier par couple (T, f) de la matrice, découpé dans le
 * fichier à partir du cycle initial. `pause` laisse respirer l'interface entre les paliers.
 */
export async function traiter(e: Essai, progres: (part: number) => void = () => {}, pause: () => Promise<void> = () => Promise.resolve()): Promise<void> {
  if (!e.table) return;
  if (!Number.isFinite(e.meta.cycleInitial)) e.meta.cycleInitial = 1;
  const table = e.table;
  const index = bornesCycles(table, e.correspondance.cycle);
  const paliers: PalierTraite[] = [];
  let fin = e.meta.cycleInitial - 1;
  const total = e.temperatures.length * e.frequences.length;
  let fait = 0;

  for (let i = 0; i < e.temperatures.length; i++) {
    for (let j = 0; j < e.frequences.length; j++) {
      fait++;
      const nbc = e.nbCycles[j]?.[i] || 0;
      if (!nbc) continue;
      const debut = fin + 1;
      fin += nbc;
      let lo: number | null = null,
        hi: number | null = null;
      for (let c = debut; c <= fin; c++) {
        const b = index.get(c);
        if (b) {
          if (lo === null) lo = b[0];
          hi = b[1];
        }
      }
      if (lo === null || hi === null || hi - lo < 10) continue;
      const tranche = table.tranche(lo, hi);
      const donnees = construireDonnees(tranche, { correspondance: e.correspondance, uniteAxiale: e.uniteAxiale, etalonnage: e.meta, voiesAxiales: e.voiesAx, voiesRadiales: e.voiesRad });
      const T = e.temperatures[i]!,
        f = e.frequences[j]!;
      const lignes = traiterPalier(donnees, { freq: f, diametre: e.meta.diametre, hCalcul: e.meta.hCalcul, temperature: T, exact: e.mode === "excel" });
      paliers.push({ T, f, de: debut, a: fin, lignes, donnees, nLignes: hi - lo + 1, libelle: `${T} °C · ${freq(f)} Hz · cycles ${debut}–${fin}` });
      if ((fait & 7) === 0) {
        progres(fait / total);
        await pause();
      }
    }
  }
  e.paliers = paliers;
  recalculerSynthese(e);
  initialiserAT(e);
}

/* ─────────────────────── cycles écartés ─────────────────────── */

export const cleCycle = (l: Pick<LigneCycle, "T" | "f" | "cycle">) => `${l.T}|${l.f}|${l.cycle}`;
export const retenu = (e: Essai, l: LigneCycle) => !e.exclus.has(cleCycle(l));

/** La synthèse — et donc tout le calage — ne voit que les cycles retenus. */
export function recalculerSynthese(e: Essai): void {
  const toutes: LigneCycle[] = [];
  for (const p of e.paliers) for (const l of p.lignes) toutes.push(l);
  e.synthese = synthetiser(toutes, (l) => retenu(e, l));
}

export function basculerCycle(e: Essai, l: LigneCycle, motif?: string): void {
  const cle = cleCycle(l);
  if (e.exclus.has(cle)) {
    e.exclus.delete(cle);
    delete e.motifs[cle];
  } else {
    e.exclus.add(cle);
    e.motifs[cle] = motif || "écarté à la main";
  }
}

export function lignesEcartees(e: Essai): { palier: PalierTraite; ligne: LigneCycle; motif: string | undefined }[] {
  const out: { palier: PalierTraite; ligne: LigneCycle; motif: string | undefined }[] = [];
  for (const p of e.paliers) for (const l of p.lignes) if (!retenu(e, l)) out.push({ palier: p, ligne: l, motif: e.motifs[cleCycle(l)] });
  return out;
}

/** Après tout changement d'exclusion : synthèse et translations. */
export function appliquerExclusions(e: Essai): void {
  recalculerSynthese(e);
  initialiserAT(e);
}

export function toutRetablir(e: Essai): void {
  e.exclus.clear();
  e.motifs = {};
  appliquerExclusions(e);
}

/** Écarte les cycles dont l'indice de qualité ou l'écart d'un capteur dépasse les seuils ; renvoie leur nombre. */
export function proposerEcarts(e: Essai, seuilIq: number, seuilEcart: number): number {
  const voies = ["ecA1", "ecA2", "ecA3", "ecR1", "ecR2", "ecR3", "ecR4"];
  const actives = [...e.voiesAx.map((v, i) => (v ? voies[i]! : null)), ...e.voiesRad.map((v, i) => (v ? voies[3 + i]! : null))].filter((v): v is string => v !== null);
  let ajoutes = 0;
  for (const p of e.paliers) {
    for (const l of p.lignes) {
      if (!retenu(e, l)) continue;
      const motifs: string[] = [];
      const q = l.qMC as number;
      if (Number.isFinite(seuilIq) && q > seuilIq) motifs.push(`indice de qualité ${nb(q, 1)} %`);
      if (Number.isFinite(seuilEcart)) {
        for (const v of actives) {
          const x = l[v] as number;
          if (Math.abs(x) > seuilEcart) {
            motifs.push(`${v.slice(2)} à ${nb(x, 1)} %`);
            break;
          }
        }
      }
      if (motifs.length) {
        basculerCycle(e, l, motifs.join(", "));
        ajoutes++;
      }
    }
  }
  appliquerExclusions(e);
  return ajoutes;
}

/** Les points qui servent au calage : la synthèse (ou la campagne fabriquée de la démonstration). */
export const pointsCalage = (e: Essai): (PointMesure & { E1?: number; E2?: number; nu?: number })[] => (e.demo ? (e.pointsDemo ?? []) : (e.synthese as unknown as PointMesure[]));

export function temperaturesCalage(e: Essai): number[] {
  return uniques(pointsCalage(e).map((p) => p.T));
}

export function initialiserAT(e: Essai): void {
  const ts = temperaturesCalage(e);
  if (!ts.length) return;
  if (!ts.includes(e.Tref)) e.Tref = ts[Math.floor(ts.length / 2)]!;
  for (const T of ts) if (!Number.isFinite(e.aT[T])) e.aT[T] = aTwlf(T, e.Tref, e.C1, e.C2);
}

export function grouperParT(e: Essai): Record<number, PointMesure[]> {
  const g: Record<number, PointMesure[]> = {};
  for (const p of pointsCalage(e)) (g[p.T] ||= []).push(p);
  return g;
}

/* ══════════════════════════════════════════════════════ calage */

export function chaineGKV(e: Essai): ChaineGKV | null {
  const m = modele(e.modeleId);
  if (m.id !== "gkv") return null;
  return identifierGKV(modele("2s2p1d"), e.p, { nElements: Math.round(e.p.nElements!), fMin: e.p.fMin, fMax: e.p.fMax });
}

/** Module complexe du modèle courant (la chaîne Kelvin-Voigt pour GKV). */
export function evaluer(e: Essai, f: number): Complexe {
  const m = modele(e.modeleId);
  if (m.id === "gkv") {
    e.chaine ||= chaineGKV(e);
    return moduleGKV(f, e.chaine!);
  }
  return m.module!(f, e.p);
}

/** À appeler après un changement de constantes (la chaîne GKV en dépend). */
export function constantesChangees(e: Essai): void {
  e.chaine = modele(e.modeleId).id === "gkv" ? chaineGKV(e) : null;
}

const modeleCale = (e: Essai) => modele(e.modeleId) as ModeleCale;

export function ecartsCalage(e: Essai): { module: number; phase: number; n: number } {
  return ecarts({ module: (f: number) => evaluer(e, f) }, pointsCalage(e), e.aT, e.p);
}

export function changerModele(e: Essai, id: string): void {
  const m = modele(id);
  e.modeleId = m.id;
  e.p = parametresInitiaux(m, e.p);
  e.chaine = null;
  constantesChangees(e);
}

/** Change de température de référence : les a_T et les τ sont ramenés sur la nouvelle référence. */
export function changerTref(e: Essai, T: number): void {
  e.Tref = T;
  const k = e.aT[e.Tref] || 1;
  for (const t of Object.keys(e.aT)) e.aT[Number(t)]! /= k;
  for (const cle of CLES_TEMPS) if (Number.isFinite(e.p[cle])) e.p[cle]! *= k;
  constantesChangees(e);
}

function calerLoiWLF(e: Essai): void {
  const ts = temperaturesCalage(e);
  const w = calerWLF(
    ts,
    ts.map((T) => e.aT[T]!),
    e.Tref,
    [e.C1, e.C2],
  );
  e.C1 = w.C1;
  e.C2 = w.C2;
}

/** « Caler tout » : constantes et a_T ensemble, puis la loi WLF (constantes seules pour un modèle élémentaire). */
export function calerTout(e: Essai): void {
  if (modele(e.modeleId).elementaire) return calerConstantes(e);
  const r = calageConjoint(modeleCale(e), grouperParT(e), e.Tref, e.p, e.aT);
  e.p = r.parametres;
  e.aT = r.aT;
  calerLoiWLF(e);
  constantesChangees(e);
}

export function calerConstantes(e: Essai): void {
  e.p = calerModule(modeleCale(e), pointsCalage(e), e.aT, e.p).parametres;
  constantesChangees(e);
}

export function calerNu(e: Essai): void {
  e.p = calerPoisson(modele(e.modeleId), pointsCalage(e), e.aT, e.p).parametres;
  constantesChangees(e);
}

export function reinitialiser(e: Essai): void {
  const m = modele(e.modeleId);
  // les constantes des autres modèles restent (le GKV se construit sur celles du 2S2P1D)
  const autres = Object.fromEntries(Object.entries(e.p).filter(([cle]) => !(cle in m.defauts)));
  e.p = parametresInitiaux(m, autres);
  e.chaine = null;
  constantesChangees(e);
}

/* ══════════════════════════════════════════════════════ séries de Prony */

/** Plage des fréquences réduites mesurées (f·a_T). */
export function plageReduite(e: Essai): [number, number] | null {
  const fr = pointsCalage(e)
    .map((p) => p.f * (e.aT[p.T] || NaN))
    .filter((f) => f > 0 && Number.isFinite(f));
  return fr.length ? [Math.min(...fr), Math.max(...fr)] : null;
}

/** La série de Prony demandée, calée sur les mesures translatées ou sur le modèle continu. */
export function serieProny(e: Essai, r: ReglagesProny | undefined = e.prony): SerieProny | null {
  const plage = plageReduite(e);
  if (!r || !plage) return null;
  let points: PointComplexe[];
  let [fMin, fMax] = plage;
  if (r.source === "mesures") {
    points = pointsCalage(e).flatMap((p) => {
      const a = e.aT[p.T],
        f = p.f * (a ?? NaN);
      if (!(f > 0) || !Number.isFinite(p.module) || !Number.isFinite(p.phi)) return [];
      const phi = (p.phi / 180) * Math.PI;
      return [{ f, re: p.module * Math.cos(phi), im: p.module * Math.sin(phi) }];
    });
  } else {
    // le modèle calé, prolongé de deux décades de part et d'autre des mesures
    fMin /= 100;
    fMax *= 100;
    const decades = Math.log10(fMax / fMin),
      n = Math.max(40, Math.round(decades * 12));
    points = Array.from({ length: n }, (_, i) => {
      const f = fMin * 10 ** ((decades * i) / (n - 1));
      const m = evaluer(e, f);
      return { f, re: m.re, im: m.im };
    });
  }
  return calerProny(points, r.type, grilleTau(fMin, fMax, r.parDecade));
}

export function recaler(e: Essai): void {
  e.aT = recalerIsothermes(grouperParT(e), e.Tref);
}

export function ajusterWLF(e: Essai): void {
  calerLoiWLF(e);
}

/* ══════════════════════════════════════════════════════ démonstration */

/** L'essai de démonstration, entièrement calculé et calé (l'optimiseur doit retrouver ses constantes). */
export async function essaiDemo(): Promise<Essai> {
  const e = nouvelEssai("démonstration");
  e.demo = true;
  e.table = signalDemo();
  e.entetes = (e.table.lignesTexte?.[0] ?? []).map((v) => v ?? "");
  e.pointsDemo = pointsDemo();
  e.p = { ...CONSTANTES_DEMO, E0: 34000, k: 0.21, h: 0.65, delta: 2.6, tauE: 0.8, beta: 300 };
  e.Tref = WLF_DEMO.Tref;
  e.C1 = WLF_DEMO.C1;
  e.C2 = WLF_DEMO.C2;
  await traiter(e);
  // premier calage, pour ouvrir sur une courbe qui tient
  calerTout(e);
  calerNu(e);
  return e;
}

/* ══════════════════════════════════════════════════════ tableaux et exports */

export const COLONNES_CYCLES: [string, string, number][] = [
  ["cycle", "Cycle", 0],
  ["sigma0", "σ₀ (MPa)", 4],
  ["eoax", "ε₀ ax (µm/m)", 2],
  ["phi", "φ (°)", 2],
  ["eorad", "ε₀ rad (µm/m)", 2],
  ["nu", "ν", 4],
  ["phiNu", "φ(ax−rad) (°)", 2],
  ["module", "|E*| (MPa)", 1],
  ["E1", "E₁ (MPa)", 1],
  ["E2", "E₂ (MPa)", 1],
  ["qMC", "Iq (%)", 2],
  ["ecA1", "Δ A1 (%)", 2],
  ["ecA2", "Δ A2 (%)", 2],
  ["ecA3", "Δ A3 (%)", 2],
  ["ecR1", "Δ R1 (%)", 2],
  ["ecR2", "Δ R2 (%)", 2],
  ["ecR3", "Δ R3 (%)", 2],
  ["ecR4", "Δ R4 (%)", 2],
  ["sonde", "T sonde (°C)", 2],
  ["nPoints", "pts", 0],
];

/** Colonnes du tableau des cycles, sans les capteurs non retenus. */
export function colonnesCycles(e: Essai): [string, string, number][] {
  const ax: Record<string, number> = { ecA1: 0, ecA2: 1, ecA3: 2 },
    rad: Record<string, number> = { ecR1: 0, ecR2: 1, ecR3: 2, ecR4: 3 };
  return COLONNES_CYCLES.filter((c) => (ax[c[0]] !== undefined ? e.voiesAx[ax[c[0]]!] : rad[c[0]] !== undefined ? e.voiesRad[rad[c[0]]!] : true));
}

export const COLONNES_SYNTHESE: [string, string, number][] = [
  ["T", "T (°C)", 1],
  ["f", "f (Hz)", 3],
  ["n", "retenus", 0],
  ["ecartes", "écartés", 0],
  ["sigma0", "σ₀ (MPa)", 4],
  ["eoax", "ε₀ ax (µm/m)", 2],
  ["phi", "φ (°)", 2],
  ["eorad", "ε₀ rad (µm/m)", 2],
  ["nu", "ν", 4],
  ["phiNu", "φν (°)", 2],
  ["module", "|E*| (MPa)", 1],
  ["E1", "E₁ (MPa)", 1],
  ["E2", "E₂ (MPa)", 1],
  ["sonde", "T mesurée (°C)", 2],
];

const COLONNES_DATA: [string, string][] = [
  ["T", "T (°C)"],
  ["f", "f (Hz)"],
  ["cycle", "Cycle"],
  ["sigma0", "so (MPa)"],
  ["eoax", "eoax (µm/m)"],
  ["phi", "j0ax (°)"],
  ["eorad", "eorad (µm/m)"],
  ["nu", "n"],
  ["phiNu", "j(ax-rad) (°)"],
  ["module", "E (MPa)"],
  ["E1", "E1 (MPa)"],
  ["E2", "E2 (MPa)"],
  ["ampF", "Force (kN)"],
  ["ampPos", "Déplacement piston (mm)"],
  ["ampPil", "Moy pilotage (µm/m)"],
  ["ampA1", "Axial1 (µm/m)"],
  ["ampA2", "Axial2 (µm/m)"],
  ["ampA3", "Axial3 (µm/m)"],
  ["ampR1", "Radial1 (µm/m)"],
  ["ampR2", "Radial2 (µm/m)"],
  ["ampR3", "Radial3 (µm/m)"],
  ["ampR4", "Radial4 (µm/m)"],
  ["ampMC", "Moy calcul (µm/m)"],
  ["ampMR", "Moy radiales (µm/m)"],
  ["ecA1", "Écart Axial1"],
  ["ecA2", "Écart Axial2"],
  ["ecA3", "Écart Axial3"],
  ["ecR1", "Écart Radial1"],
  ["ecR2", "Écart Radial2"],
  ["ecR3", "Écart Radial3"],
  ["ecR4", "Écart Radial4"],
  ["qF", "Iq Force"],
  ["qPos", "Iq Déplacement"],
  ["qPil", "Iq Moy pilotage"],
  ["qA1", "Iq Axial1"],
  ["qA2", "Iq Axial2"],
  ["qA3", "Iq Axial3"],
  ["qR1", "Iq Radial1"],
  ["qR2", "Iq Radial2"],
  ["qR3", "Iq Radial3"],
  ["qR4", "Iq Radial4"],
  ["qMC", "Iq Moy calcul"],
  ["qMR", "Iq Moy radiales"],
  ["sigmaMoy", "Contrainte moyenne (MPa)"],
  ["moyPil", "Moy pilotage calcul"],
  ["moyA1", "Moy Axial1"],
  ["moyA2", "Moy Axial2"],
  ["moyA3", "Moy Axial3"],
  ["moyR1", "Moy Radial1"],
  ["moyR2", "Moy Radial2"],
  ["moyMR", "Moy radiales"],
  ["sonde", "Sonde (°C)"],
  ["phF", "Phase Force"],
  ["phPos", "Phase Déplacement"],
  ["phPil", "Phase Moy pilotage"],
  ["phA1", "Phase Axial1"],
  ["phA2", "Phase Axial2"],
  ["phA3", "Phase Axial3"],
  ["phR1", "Phase Radial1"],
  ["phR2", "Phase Radial2"],
  ["phMC", "Phase Moy calcul"],
  ["phMR", "Phase Moy radiales"],
  ["nPoints", "Points"],
];

export type Cellule = string | number | null | undefined;

/** Feuille « Data » : un cycle par ligne ; la colonne « Retenu » garde la trace du tri, avec le motif. */
export function tableauData(e: Essai): Cellule[][] {
  const out: Cellule[][] = [["Retenu", "Motif de mise à l'écart", ...COLONNES_DATA.map((c) => c[1])]];
  for (const p of e.paliers) {
    for (const l of p.lignes) {
      const dedans = retenu(e, l);
      out.push([dedans ? "oui" : "non", dedans ? "" : e.motifs[cleCycle(l)] || "écarté à la main", ...COLONNES_DATA.map((c) => l[c[0]] as Cellule)]);
    }
  }
  return out;
}

/** Feuille « Calcul » : moyenne, maximum, minimum et écart-type par palier. */
export function tableauCalcul(e: Essai): Cellule[][] {
  const out: Cellule[][] = [["T (°C)", "f (Hz)", "cycles retenus", "cycles écartés", "|E*| (MPa)", "φ (°)", "|ν|", "φν (°)", "σ (MPa)", "ε1 (µm/m)", "ε2 (µm/m)"]];
  for (const [nom, suffixe] of [
    ["moyenne", ""],
    ["maximum", "_max"],
    ["minimum", "_min"],
    ["écart-type", "_et"],
  ] as const) {
    out.push([], [nom]);
    for (const a of e.synthese) {
      const v = (k: string) => a[k + suffixe] as number;
      out.push([a.T, a.f, a.n, a.ecartes || 0, v("module"), v("phi"), v("nu"), v("phiNu"), v("sigma0"), v("eoax"), v("eorad")]);
    }
  }
  return out;
}

/** Feuille « Modele » : constantes, WLF et a_T. */
export function tableauModele(e: Essai): Cellule[][] {
  const m = modele(e.modeleId);
  const out: Cellule[][] = [["Modèle", m.nom], ["Référence", m.reference], []];
  for (const p of m.parametres) out.push([p.label + (p.unite ? ` (${p.unite})` : ""), e.p[p.cle]]);
  out.push([], ["WLF"], ["Tref (°C)", e.Tref], ["C1", e.C1], ["C2", e.C2], [], ["T (°C)", "a_T"]);
  for (const T of temperaturesCalage(e)) out.push([T, e.aT[T]]);
  return out;
}

/** Points mesurés et modèle aux mêmes fréquences réduites (export CSV « modèle »). */
export function tableauModeleExp(e: Essai): Cellule[][] {
  const lignes: Cellule[][] = [["T (°C)", "f (Hz)", "aT", "f.aT", "|E*| exp", "|E*| modèle", "φ exp", "φ modèle", "|ν| exp"]];
  for (const p of pointsCalage(e)) {
    const a = e.aT[p.T] || 1,
      v = evaluer(e, p.f * a);
    lignes.push([p.T, p.f, a, p.f * a, p.module, v.norme, p.phi, v.phase, p.nu]);
  }
  return lignes;
}

/** CSV pour Excel français : « ; », virgule décimale, BOM. */
export function csv(lignes: readonly (readonly Cellule[])[]): string {
  return (
    "﻿" +
    lignes
      .map((l) =>
        l
          .map((v) => {
            if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
            return '"' + String(v ?? "").replace(/"/g, '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

/** Les deux modes de calcul côte à côte, sur le premier palier (étape « Fidélité Excel »). */
export function comparerModes(e: Essai): { exact: LigneCycle[]; corrige: LigneCycle[] } | null {
  const p = e.paliers[0];
  if (!p) return null;
  const commun = { freq: p.f, diametre: e.meta.diametre, hCalcul: e.meta.hCalcul, temperature: p.T };
  return { exact: traiterPalier(p.donnees, { ...commun, exact: true }), corrige: traiterPalier(p.donnees, { ...commun, exact: false }) };
}

/* ══════════════════════════════════════════════════════ projet */

interface EssaiSauve {
  nom?: string;
  meta?: Meta;
  correspondance?: Correspondance;
  uniteAxiale?: string;
  temperatures?: number[];
  frequences?: number[];
  nbCycles?: number[][];
  voiesAx?: boolean[];
  voiesRad?: boolean[];
  mode?: Mode;
  modeleId?: string;
  p?: Constantes;
  aT?: Translations;
  Tref?: number;
  C1?: number;
  C2?: number;
  couleur?: string;
  exclus?: string[];
  motifs?: Record<string, string>;
  prony?: ReglagesProny;
}

/** Le fichier projet (même format, version 2, que la page d'origine et le site en ligne). */
export function projetJSON(essais: readonly Essai[]): string {
  return JSON.stringify(
    {
      version: 2,
      essais: essais.map((e) => ({
        nom: e.nom,
        meta: e.meta,
        correspondance: e.correspondance,
        uniteAxiale: e.uniteAxiale,
        temperatures: e.temperatures,
        frequences: e.frequences,
        nbCycles: e.nbCycles,
        voiesAx: e.voiesAx,
        voiesRad: e.voiesRad,
        mode: e.mode,
        modeleId: e.modeleId,
        p: e.p,
        aT: e.aT,
        Tref: e.Tref,
        C1: e.C1,
        C2: e.C2,
        couleur: e.couleur,
        exclus: [...e.exclus],
        motifs: e.motifs,
        // absent tant qu'aucune série n'est demandée : le fichier reste celui de la page d'origine
        prony: e.prony,
      })),
    },
    null,
    2,
  );
}

/** Réapplique un projet enregistré (tri des cycles, calages) aux essais chargés, dans l'ordre, puis les retraite. */
export async function appliquerProjet(essais: Essai[], j: { essais?: EssaiSauve[] }): Promise<void> {
  for (const [i, sauve] of (j.essais || []).entries()) {
    const e = essais[i];
    if (!e) continue;
    const { exclus, motifs, ...reste } = sauve;
    Object.assign(e, reste);
    e.exclus = new Set(exclus || []);
    e.motifs = motifs || {};
    e.chaine = null;
  }
  for (const e of essais) if (e.table && !e.demo) await traiter(e);
  for (const e of essais) constantesChangees(e);
}

/** Ce qui s'écrit dans l'espace pour cet essai (null s'il ne s'y enregistre pas). */
export function contenuEnregistre(e: Essai, poste: string, maintenant: string): string | null {
  if (!e.enregistrement || e.demo) return null;
  const projet = projetJSON([e]);
  if (e.enregistrement.format === "projet") return projet;
  const d: Depouillement = { version: 1, nom: e.nom, source: e.source ?? "", fichier: (e.source ?? "").split(/[\\/:]/).pop() ?? "", modifie: maintenant, poste, projet: JSON.parse(projet) };
  return JSON.stringify(d, null, 2) + "\n";
}

/* ══════════════════════════════════════════════════════ ligne d'état */

export function resumeEssai(e: Essai, nbEssais: number): string[] {
  const cycles = e.paliers.reduce((a, p) => a + p.lignes.length, 0);
  const tronques = e.paliers.reduce((a, p) => a + p.lignes.filter((l) => l.tronque).length, 0);
  const ecartes = e.exclus.size;
  return [
    e.nom,
    `Ø ${nb(e.meta.diametre, 2)} mm`,
    `${e.table ? entier(e.table.n) : 0} lignes brutes`,
    `${e.paliers.length} paliers · ${cycles} cycles`,
    `mode ${e.mode === "excel" ? "Excel à l'identique" : "corrigé"}`,
    ...(ecartes ? [`${ecartes} cycle${ecartes > 1 ? "s" : ""} écarté${ecartes > 1 ? "s" : ""}`] : []),
    ...(tronques ? [`${tronques} cycles tronqués à 410 points`] : []),
    ...(nbEssais > 1 ? [`${nbEssais} essais chargés`] : []),
  ];
}

export { maximum, minimum, uniques };
