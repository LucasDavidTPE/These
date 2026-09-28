/**
 * Jeu de démonstration, entièrement calculé au chargement — aucune donnée n'est embarquée
 * (portage de demo.js). La page montre la chaîne avant qu'on ait déposé un fichier ; les
 * particularités du classeur sont visibles sur un signal dont on connaît la réponse exacte ;
 * et l'optimiseur peut être vérifié, puisqu'il doit retrouver les constantes qui ont servi
 * à fabriquer les points.
 */
import { aTwlf, type PointMesure } from "./calage";
import { TableBrute } from "./donnees";
import { modele, type ModeleCale } from "./modeles";

export const CONSTANTES_DEMO = { E00: 120, E0: 41000, k: 0.175, h: 0.6, delta: 2.05, tauE: 0.32, beta: 180, nu00: 0.18, nu0: 0.44, tauNu: 1.024 };
export const WLF_DEMO = { Tref: 15, C1: 25, C2: 180 };

/** Générateur pseudo-aléatoire déterministe : le jeu est le même à chaque ouverture. */
function alea(graine: number): () => number {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** Signal brut synthétique : quatre cycles à 0,003 Hz, 224 points par cycle, à 50 µm/m. */
export function signalDemo(): TableBrute {
  const f = 0.003,
    parCycle = 224,
    cycles = 4;
  const n = parCycle * cycles;
  const r = alea(20260908);
  const s2 = modele("2s2p1d") as ModeleCale;
  const m = s2.module(f * aTwlf(15, WLF_DEMO.Tref, WLF_DEMO.C1, WLF_DEMO.C2), CONSTANTES_DEMO);
  const nu = s2.poisson!(f * aTwlf(15, WLF_DEMO.Tref, WLF_DEMO.C1, WLF_DEMO.C2), CONSTANTES_DEMO);

  const eps = 50e-6; // 50 µm/m visés
  const diametre = 75,
    surface = (Math.PI * (diametre / 1000) ** 2) / 4;
  const sigma = m.norme * eps; // MPa
  const force = sigma * surface * 1e3; // kN
  const phi = (m.phase * Math.PI) / 180;
  const epsRad = eps * nu.norme;
  const phiNu = (nu.phase * Math.PI) / 180;

  const lignes: number[][] = [];
  const t0 = 27288.738,
    dt = 1 / (f * parCycle);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    const w = 2 * Math.PI * f * t;
    const bruit = () => gauss(r) * 0.004;
    const ax = eps * Math.sin(w);
    lignes.push([
      Math.floor(i / parCycle) + 1,
      t,
      2.18 + ax * 40 + bruit() * 1e-3, // position (mm)
      force * Math.sin(w + phi) * (1 + bruit()), // charge (kN)
      ax * (1 + bruit()), // DefM
      ax * (1.012 + bruit()), // DefA
      ax * (0.982 + bruit()), // DefB
      ax * (1.006 + bruit()), // DefC
      117 + epsRad * (diametre / 2) * 1e3 * Math.sin(w + phiNu) * (1.03 + bruit()), // Lion 1 (µm)
      113 + epsRad * (diametre / 2) * 1e3 * Math.sin(w + phiNu) * (0.97 + bruit()), // Lion 2 (µm)
      15 + gauss(r) * 0.03, // PT 100
    ]);
  }
  const table = TableBrute.depuisLignes(lignes);
  table.lignesTexte = [["CycleCount", "Temps d'exécution", "Axial Deplacement", "Axial Force", "DefM", "DefA", "DefB", "DefC", "Lion 1", "Lion 2", "PT 100 T1"]];
  return table;
}

export interface PointDemo extends PointMesure {
  n: number;
  nu: number;
  phiNu: number;
  sigma0: number;
  eoax: number;
  eorad: number;
  E1: number;
  E2: number;
  sonde: number;
}

/** Points (T, f) d'une campagne complète, fabriqués à partir des constantes plus environ 1 % de dispersion. */
export function pointsDemo(): PointDemo[] {
  const r = alea(4071);
  const s2 = modele("2s2p1d") as ModeleCale;
  const temperatures = [-25, -15, -5, 5, 15, 25, 35, 45];
  const frequences = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10];
  const points: PointDemo[] = [];
  for (const T of temperatures) {
    for (const f of frequences) {
      const fe = f * aTwlf(T, WLF_DEMO.Tref, WLF_DEMO.C1, WLF_DEMO.C2);
      const m = s2.module(fe, CONSTANTES_DEMO);
      const nu = s2.poisson!(fe, CONSTANTES_DEMO);
      const module = m.norme * (1 + gauss(r) * 0.012);
      const phi = m.phase + gauss(r) * 0.35;
      const rad = Math.PI / 180;
      points.push({
        T,
        f,
        n: 4,
        module,
        phi,
        nu: nu.norme * (1 + gauss(r) * 0.015),
        phiNu: nu.phase + gauss(r) * 0.25,
        sigma0: module * 50e-6,
        eoax: 50 * (1 + gauss(r) * 0.004),
        eorad: 50 * nu.norme,
        E1: module * Math.cos(phi * rad),
        E2: module * Math.sin(phi * rad),
        sonde: T + gauss(r) * 0.05,
      });
    }
  }
  return points;
}
