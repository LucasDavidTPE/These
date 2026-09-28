/**
 * Feuilles « Traitement » et « Info » du classeur Calcul.xlsx (portage de traitement.js).
 *
 * Le mode « Excel à l'identique » reproduit cinq particularités du classeur, relevées en
 * lisant ses formules. Elles sont documentées ici parce qu'elles changent les chiffres et
 * qu'aucune n'est signalée dans le fichier d'origine.
 *
 *  1. La régression porte sur DEUX cycles.
 *     Traitement!I2 = NB.SI(cycle) + NB.SI(cycle+1)
 *
 *  2. 410 points au maximum, en silence.
 *     La feuille n'est pré-remplie que des lignes 6 à 415 ; au-delà, SOMME(DECALER(…;I2;1))
 *     additionne des cellules vides. À 0,003 Hz, 447 points sont demandés et 410 seulement
 *     sont utilisés.
 *
 *  3. Le centrage porte sur I2−1 points, les sommes sur I2.
 *
 *  4. La voie Axial1 est décalée d'un point : Traitement!AG7:AG415 lit
 *     DECALER(données!$F$3 ; I−2) quand les neuf autres voies lisent I−3. Seule la première
 *     ligne est correcte. Amplitude, phase, indice et écart d'amplitude d'Axial1 en sont
 *     faussés — donc le diagnostic même qui sert à repérer un extensomètre défaillant.
 *
 *  5. Le diviseur de l'indice de qualité n'est PAS plafonné à 410, alors que la somme du
 *     numérateur l'est.
 *
 * Le mode « corrigé » lève les points 1 à 4. Le point 5 disparaît avec le 2. La sonde de
 * température 1 du classeur pointe sur #REF! ; ici la colonne déclarée dans la
 * correspondance des voies est lue normalement.
 */
import { ajusterSinus, AJUSTEMENT_VIDE, type Ajustement } from "./regression";
import { decouperCycles, VOIES, type CleVoie, type Donnees } from "./donnees";
import { recentrer180 } from "./nombres";

const DEG = 180 / Math.PI;

/** Traitement!6:415 — le nombre de lignes réellement pré-remplies. */
export const PLAFOND_EXCEL = 410;

export interface OptionsPalier {
  freq: number;
  /** mm */
  diametre: number;
  /** mm (h_calcul de l'extensomètre) */
  hCalcul?: number;
  temperature: number;
  exact?: boolean;
  plafond?: number;
}

/** Une ligne par cycle, calquée sur Info!D7:BL7. */
export interface LigneCycle {
  T: number;
  f: number;
  cycle: number;
  nPoints: number;
  nCycle: number;
  nDemande: number;
  tronque: boolean;
  sigma0: number;
  eoax: number;
  phi: number;
  eorad: number;
  nu: number;
  phiNu: number;
  module: number;
  E1: number;
  E2: number;
  [grandeur: string]: unknown;
  _aj: Record<CleVoie, Ajustement>;
  _debut: number;
  _n: number;
}

export function traiterPalier(d: Donnees, o: OptionsPalier): LigneCycle[] {
  const { freq, diametre } = o;
  const hCalcul = o.hCalcul ?? 1;
  const exact = o.exact !== false;
  const plafond = o.plafond ?? (exact ? PLAFOND_EXCEL : Infinity);
  const surface = (Math.PI * (diametre / 1000) ** 2) / 4; // m²
  const kAx = 1 / (hCalcul * 1e-6); // déf → µm/m
  const kRad = 1 / ((diametre / 2) * 1e-6); // mm  → µm/m

  const segments = decouperCycles(d.cyc, d.n);
  const V = d.voies;

  // valeurs initiales : Info!AS5:AW5 = données!F3..J3, 1re ligne du palier
  const init = { dA: V.dA[0]!, dB: V.dB[0]!, dC: V.dC[0]!, l1: V.l1[0]!, l2: V.l2[0]!, l3: V.l3[0]!, l4: V.l4[0]!, mc: 0, mr: 0 };
  init.mc = (init.dA + init.dB + init.dC) / 3; // Info!AR5
  init.mr = (init.l1 + init.l2) / 2; // Info!AX5

  const tampon = new Float64Array(Math.min(d.n, Number.isFinite(plafond) ? plafond : d.n));
  const lignes: LigneCycle[] = [];

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s]!;
    // Traitement!I2
    const nI2Brut = seg.nombre + (exact && segments[s + 1] ? segments[s + 1]!.nombre : 0);
    const nI2 = Math.min(nI2Brut, d.n - seg.debut);
    const nSomme = Math.min(nI2, plafond);
    const nCentre = Math.min(exact ? nI2 - 1 : nI2, plafond);
    if (nCentre < 2) continue;

    const temps = d.t.subarray(seg.debut, seg.debut + nSomme);
    const aj = {} as Record<CleVoie, Ajustement>;
    for (const v of VOIES) {
      const col = V[v.cle];
      if (!Number.isFinite(col[seg.debut])) {
        aj[v.cle] = AJUSTEMENT_VIDE;
        continue;
      }
      let buf: Float64Array;
      if (exact && v.cle === "dA") {
        // particularité 4 : tous les points sauf le premier sont lus une ligne plus bas
        for (let i = 0; i < nSomme; i++) {
          const k = seg.debut + i + (i > 0 ? 1 : 0);
          tampon[i] = k < d.n ? col[k]! : 0;
        }
        buf = tampon.subarray(0, nSomme);
      } else {
        buf = col.subarray(seg.debut, seg.debut + nSomme);
      }
      aj[v.cle] = ajusterSinus(buf, temps, freq, nSomme, nCentre, exact ? nI2 : nSomme);
    }

    // Info!AZ7 (sonde 1) pointe sur #REF! dans le classeur : on lit la sonde déclarée
    let tS = 0;
    for (let i = 0; i < nCentre; i++) tS += d.T[seg.debut + i]!;
    const tMoyenne = tS / nCentre;

    // Info!AR7:AX7 — moyenne du signal recentré sur sa valeur initiale
    const moyenneRecentree = (cle: CleVoie, ref: number) => {
      const col = V[cle];
      let s2 = 0;
      for (let i = 0; i < nSomme; i++) {
        const k = seg.debut + i + (exact && cle === "dA" && i > 0 ? 1 : 0);
        s2 += (k < d.n ? col[k]! : 0) - ref;
      }
      return s2 / nSomme;
    };

    const eoax = aj.mc.amplitude * kAx;
    const eorad = aj.mr.amplitude * kRad;
    const sigma0 = aj.F.amplitude / surface / 1e3;
    const phi = recentrer180(aj.F.phase - aj.mc.phase);
    const module = (sigma0 / eoax) * 1e6;

    lignes.push({
      T: o.temperature,
      f: freq,
      cycle: seg.cycle,
      nPoints: nSomme,
      nCycle: seg.nombre,
      nDemande: nI2,
      tronque: nI2 > plafond,

      sigma0,
      eoax,
      phi,
      eorad,
      nu: eorad / eoax,
      phiNu: recentrer180(aj.mr.phase - aj.mc.phase),
      module,
      E1: module * Math.cos(phi / DEG),
      E2: module * Math.sin(phi / DEG),

      ampF: aj.F.amplitude,
      ampPos: aj.pos.amplitude,
      ampPil: aj.defM.amplitude * kAx,
      ampA1: aj.dA.amplitude * kAx,
      ampA2: aj.dB.amplitude * kAx,
      ampA3: aj.dC.amplitude * kAx,
      ampR1: aj.l1.amplitude * kRad,
      ampR2: aj.l2.amplitude * kRad,
      ampR3: aj.l3.amplitude * kRad,
      ampR4: aj.l4.amplitude * kRad,
      ampMC: eoax,
      ampMR: eorad,

      ecA1: ((aj.dA.amplitude * kAx - eoax) / eoax) * 100,
      ecA2: ((aj.dB.amplitude * kAx - eoax) / eoax) * 100,
      ecA3: ((aj.dC.amplitude * kAx - eoax) / eoax) * 100,
      ecR1: ((aj.l1.amplitude * kRad - eorad) / eorad) * 100,
      ecR2: ((aj.l2.amplitude * kRad - eorad) / eorad) * 100,
      ecR3: ((aj.l3.amplitude * kRad - eorad) / eorad) * 100,
      ecR4: ((aj.l4.amplitude * kRad - eorad) / eorad) * 100,

      qF: aj.F.indice,
      qPos: aj.pos.indice,
      qPil: aj.defM.indice,
      qA1: aj.dA.indice,
      qA2: aj.dB.indice,
      qA3: aj.dC.indice,
      qR1: aj.l1.indice,
      qR2: aj.l2.indice,
      qR3: aj.l3.indice,
      qR4: aj.l4.indice,
      qMC: aj.mc.indice,
      qMR: aj.mr.indice,

      sigmaMoy: aj.F.moyenne / surface / 1e3,
      moyPil: moyenneRecentree("mc", init.mc) * kAx,
      moyA1: moyenneRecentree("dA", init.dA) * kAx,
      moyA2: moyenneRecentree("dB", init.dB) * kAx,
      moyA3: moyenneRecentree("dC", init.dC) * kAx,
      moyR1: moyenneRecentree("l1", init.l1) * kRad,
      moyR2: moyenneRecentree("l2", init.l2) * kRad,
      moyR3: moyenneRecentree("l3", init.l3) * kRad,
      moyR4: moyenneRecentree("l4", init.l4) * kRad,
      moyMR: moyenneRecentree("mr", init.mr) * kRad,

      phF: aj.F.phase,
      phPos: aj.pos.phase,
      phPil: aj.defM.phase,
      phA1: aj.dA.phase,
      phA2: aj.dB.phase,
      phA3: aj.dC.phase,
      phR1: aj.l1.phase,
      phR2: aj.l2.phase,
      phR3: aj.l3.phase,
      phR4: aj.l4.phase,
      phMC: aj.mc.phase,
      phMR: aj.mr.phase,
      sonde: tMoyenne,

      _aj: aj,
      _debut: seg.debut,
      _n: nSomme,
    });
  }
  return lignes;
}
