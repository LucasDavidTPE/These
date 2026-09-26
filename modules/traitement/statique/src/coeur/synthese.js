/**
 * Feuille « Calcul » de Synt_Temp.xlsx : moyenne, minimum, maximum et
 * écart-type de chaque grandeur sur les cycles d'un même palier (T, f).
 */
import { moyenne, ecartType, minimum, maximum } from './nombres.js';

export const GRANDEURS = [
  'sigma0', 'eoax', 'phi', 'eorad', 'nu', 'phiNu', 'module', 'E1', 'E2', 'sonde'
];

/**
 * @param {Array} lignes   résultats par cycle
 * @param {(ligne)=>boolean} [retenu]  cycles à prendre en compte ; les autres
 *        sont écartés du calcul mais restent dans la liste, avec le compte des
 *        cycles écartés reporté sur le palier.
 */
export function synthetiser(lignes, retenu) {
  const groupes = new Map();
  const ecartes = new Map();
  for (const r of lignes) {
    const cle = r.T + '|' + r.f;
    if (retenu && !retenu(r)) {
      ecartes.set(cle, (ecartes.get(cle) || 0) + 1);
      continue;
    }
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(r);
  }
  const sortie = [];
  for (const [cle, g] of groupes) {
    const o = {
      T: g[0].T, f: g[0].f, n: g.length, cycles: g.map(x => x.cycle),
      ecartes: ecartes.get(cle) || 0
    };
    for (const champ of GRANDEURS) {
      const v = g.map(x => x[champ]).filter(Number.isFinite);
      o[champ] = v.length ? moyenne(v) : NaN;
      o[champ + '_max'] = v.length ? maximum(v) : NaN;
      o[champ + '_min'] = v.length ? minimum(v) : NaN;
      o[champ + '_et'] = ecartType(v);
    }
    sortie.push(o);
  }
  return sortie;
}
