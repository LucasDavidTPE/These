/**
 * Retrouve la matrice température × fréquence directement dans le fichier, sans rien
 * demander (portage de campagne.js).
 *
 * Le principe : chaque cycle a une durée ; les cycles consécutifs de même durée forment un
 * palier de fréquence ; une rupture de la sonde, ou un retour à une fréquence plus basse,
 * ouvre un palier thermique. Le compteur de cycles étant cumulatif sur toute la campagne, les
 * plages retrouvées coïncident avec le découpage Start_Cycle de la macro.
 *
 * Vérifié sur un export WaveMatrix de 252 048 lignes : retrouve 4, 6, 8, 12, 16, 30, 40 et 50
 * cycles et les dix paliers thermiques de la campagne, en une quinzaine de millisecondes.
 */
import type { Correspondance, TableBrute } from "./donnees";
import { moyenne } from "./nombres";

export const FREQUENCES_NORMALISEES = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30];

/** Recale sur une fréquence d'essai normalisée quand on en est à moins de 12 %. */
export function caler(f: number): number {
  if (!(f > 0)) return 0;
  let meilleure = FREQUENCES_NORMALISEES[0]!,
    ecart = Infinity;
  for (const s of FREQUENCES_NORMALISEES) {
    const d = Math.abs(Math.log10(s / f));
    if (d < ecart) {
      ecart = d;
      meilleure = s;
    }
  }
  if (ecart < 0.05) return meilleure;
  const m = 10 ** Math.floor(Math.log10(f));
  return (Math.round((f / m) * 100) / 100) * m;
}

export interface PalierDetecte {
  f: number;
  fBrute: number;
  nCycles: number;
  de: number;
  a: number;
  lignes: number;
  T: number;
}

export interface Campagne {
  temperatures: number[];
  frequences: number[];
  /** [fréquence][température] → nombre de cycles. */
  nbCycles: number[][];
  cycleInitial: number;
  paliers: PalierDetecte[];
  temperaturesMesurees: number[];
}

interface Cycle {
  c: number;
  i0: number;
  i1: number;
  n: number;
  duree: number;
}

export function detecterCampagne(table: TableBrute, map: Correspondance, opt: { minLignes?: number } = {}): Campagne | null {
  const minLignes = opt.minLignes ?? 60;
  const cCyc = table.colonne(map.cycle),
    cT = table.colonne(map.temps);
  const cPt = table.colonne(map.pt100);
  if (!cCyc || !cT) return null;
  const n = table.n;

  // 1. bornes de chaque cycle
  const cycles: Cycle[] = [];
  let cur: Cycle | null = null;
  for (let i = 0; i < n; i++) {
    const c = cCyc[i]!;
    if (!Number.isFinite(c)) continue;
    if (!cur || cur.c !== c) {
      cur = { c, i0: i, i1: i, n: 0, duree: 0 };
      cycles.push(cur);
    }
    cur.i1 = i;
    cur.n++;
  }
  if (cycles.length < 3) return null;
  for (let i = 0; i < cycles.length; i++) {
    const suiv = cycles[i + 1];
    cycles[i]!.duree = (suiv ? cT[suiv.i0]! : cT[cycles[i]!.i1]!) - cT[cycles[i]!.i0]!;
  }

  // 2. regroupement des cycles de même durée
  const suites: { duree: number; cycles: Cycle[]; lignes: number }[] = [];
  let suite: (typeof suites)[number] | null = null;
  for (let i = 0; i < cycles.length - 1; i++) {
    const d = cycles[i]!.duree;
    if (!(d > 0)) {
      suite = null;
      continue;
    }
    if (suite && Math.abs(Math.log(d / suite.duree)) < 0.18) {
      suite.cycles.push(cycles[i]!);
      suite.lignes += cycles[i]!.n;
      suite.duree = (suite.duree * (suite.cycles.length - 1) + d) / suite.cycles.length;
    } else {
      suite = { duree: d, cycles: [cycles[i]!], lignes: cycles[i]!.n };
      suites.push(suite);
    }
  }

  // 3. fréquence, température et plage de cycles de chaque palier
  const paliers: PalierDetecte[] = [];
  for (const s of suites) {
    if (s.lignes < minLignes || s.cycles.length < 2) continue;
    let somme = 0,
      k = 0;
    if (cPt) {
      for (const c of s.cycles) {
        for (let q = c.i0; q <= c.i1; q += 5) {
          const T = cPt[q]!;
          if (Number.isFinite(T)) {
            somme += T;
            k++;
          }
        }
      }
    }
    paliers.push({ f: caler(1 / s.duree), fBrute: 1 / s.duree, nCycles: s.cycles.length, de: s.cycles[0]!.c, a: s.cycles[s.cycles.length - 1]!.c, lignes: s.lignes, T: k ? somme / k : NaN });
  }
  if (!paliers.length) return null;

  // Le cycle de bascule est partagé entre deux paliers : on rétablit la partition contiguë de
  // la macro, où chaque palier va de son premier cycle au premier cycle du palier suivant (exclu).
  for (let i = 0; i < paliers.length; i++) {
    const suiv = paliers[i + 1];
    paliers[i]!.nCycles = suiv ? suiv.de - paliers[i]!.de : paliers[i]!.a - paliers[i]!.de + 1;
    paliers[i]!.a = paliers[i]!.de + paliers[i]!.nCycles - 1;
  }

  // 4. découpage en paliers thermiques
  const groupes: { T: number; items: PalierDetecte[]; derniere: number }[] = [];
  let g: (typeof groupes)[number] | null = null;
  for (const p of paliers) {
    if (!g || Math.abs(p.T - g.T) > 3 || p.f < g.derniere * 0.999) {
      g = { T: p.T, items: [], derniere: p.f };
      groupes.push(g);
    }
    g.items.push(p);
    g.derniere = p.f;
    g.T = moyenne(g.items.map((x) => x.T));
  }

  // Les paliers d'essai sont posés de 10 en 10 °C et la sonde traîne d'environ 1 °C sur la
  // consigne : on recale sur le multiple de 5 le plus proche quand il est à moins de 1,5 °C,
  // sans jamais masquer une valeur plus éloignée.
  const temperatures = groupes.map((x) => {
    const r5 = Math.round(x.T / 5) * 5;
    return Math.abs(x.T - r5) < 1.5 ? r5 : Math.round(x.T * 10) / 10;
  });

  const frequences: number[] = [];
  for (const p of paliers) if (!frequences.includes(p.f)) frequences.push(p.f);
  frequences.sort((a, b) => a - b);

  const nbCycles = frequences.map(() => temperatures.map(() => 0));
  groupes.forEach((grp, ti) => {
    for (const p of grp.items) {
      const fi = frequences.indexOf(p.f);
      if (fi >= 0) nbCycles[fi]![ti] = p.nCycles;
    }
  });

  return { temperatures, frequences, nbCycles, cycleInitial: paliers[0]!.de, paliers, temperaturesMesurees: groupes.map((x) => x.T) };
}
