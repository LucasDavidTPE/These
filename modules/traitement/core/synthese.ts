/**
 * Feuille « Calcul » de Synt_Temp.xlsx : moyenne, minimum, maximum et écart-type de chaque
 * grandeur sur les cycles d'un même palier (T, f). Portage de synthese.js.
 */
import { ecartType, maximum, minimum, moyenne } from "./nombres";
import type { LigneCycle } from "./traitement";

export const GRANDEURS = ["sigma0", "eoax", "phi", "eorad", "nu", "phiNu", "module", "E1", "E2", "sonde"] as const;

export interface Palier {
  T: number;
  f: number;
  n: number;
  cycles: number[];
  ecartes: number;
  sigma0: number;
  eoax: number;
  phi: number;
  eorad: number;
  nu: number;
  phiNu: number;
  module: number;
  E1: number;
  E2: number;
  sonde: number;
  /** « module_et », « phi_max »… */
  [statistique: string]: number | number[];
}

/**
 * @param retenu  cycles à prendre en compte ; les autres sont écartés du calcul mais restent
 *        dans la liste, avec le compte des cycles écartés reporté sur le palier.
 */
export function synthetiser(lignes: readonly LigneCycle[], retenu?: (l: LigneCycle) => boolean): Palier[] {
  const groupes = new Map<string, LigneCycle[]>();
  const ecartes = new Map<string, number>();
  for (const r of lignes) {
    const cle = r.T + "|" + r.f;
    if (retenu && !retenu(r)) {
      ecartes.set(cle, (ecartes.get(cle) || 0) + 1);
      continue;
    }
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(r);
  }
  const sortie: Palier[] = [];
  for (const [cle, g] of groupes) {
    const o: Record<string, number | number[]> = { T: g[0]!.T, f: g[0]!.f, n: g.length, cycles: g.map((x) => x.cycle), ecartes: ecartes.get(cle) || 0 };
    for (const champ of GRANDEURS) {
      const v = g.map((x) => x[champ] as number).filter(Number.isFinite);
      o[champ] = v.length ? moyenne(v) : NaN;
      o[champ + "_max"] = v.length ? maximum(v) : NaN;
      o[champ + "_min"] = v.length ? minimum(v) : NaN;
      o[champ + "_et"] = ecartType(v);
    }
    sortie.push(o as Palier);
  }
  return sortie;
}
