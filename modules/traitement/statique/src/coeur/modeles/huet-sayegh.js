/**
 * Modèle de Huet-Sayegh — le 2S2P1D privé de son amortisseur.
 *
 *   E*(ω) = E00 + (E0 − E00) / [ 1 + δ(iωτ)^−k + (iωτ)^−h ]
 *
 * Autrement dit le 2S2P1D quand β tend vers l'infini : la branche
 * newtonienne disparaît et le modèle ne décrit plus l'écoulement aux très
 * basses fréquences. Six constantes au lieu de sept, ce qui en fait un point
 * de départ commode avant d'ouvrir β.
 *
 * HUET C., « Étude par une méthode d'impédance du comportement
 * viscoélastique des matériaux hydrocarbonés », thèse, Paris, 1963.
 * SAYEGH G., « Contribution à l'étude des propriétés viscoélastiques des
 * bitumes purs et des bétons bitumineux », thèse, Paris, 1965.
 */
import { noyau2s2p1d } from './2s2p1d.js';

export default {
  id: 'huet-sayegh',
  nom: 'Huet-Sayegh',
  resume: '6 constantes : le 2S2P1D sans la branche newtonienne (β infini).',
  reference: 'Huet 1963 · Sayegh 1965',
  parametres: [
    { cle: 'E00', label: 'E00', unite: 'MPa', min: 0, max: 5000, pas: 1, groupe: 'module' },
    { cle: 'E0', label: 'E0', unite: 'MPa', min: 1000, max: 60000, pas: 10, groupe: 'module' },
    { cle: 'k', label: 'k', min: 0.05, max: 0.5, pas: 0.001, groupe: 'module' },
    { cle: 'h', label: 'h', min: 0.2, max: 0.95, pas: 0.001, groupe: 'module' },
    { cle: 'delta', label: 'δ', min: 0.5, max: 6, pas: 0.01, groupe: 'module' },
    { cle: 'tauE', label: 'τE', unite: 's', min: -12, max: 4, pas: 0.01, log: true, groupe: 'module' },
    { cle: 'nu00', label: 'ν00', min: 0, max: 0.6, pas: 0.001, groupe: 'poisson' },
    { cle: 'nu0', label: 'ν0', min: 0.1, max: 0.6, pas: 0.001, groupe: 'poisson' },
    { cle: 'tauNu', label: 'τν', unite: 's', min: -12, max: 4, pas: 0.01, log: true, groupe: 'poisson' }
  ],
  defauts: {
    E00: 100, E0: 40000, k: 0.18, h: 0.6, delta: 2, tauE: 0.3,
    nu00: 0.18, nu0: 0.45, tauNu: 1
  },
  bornes: {
    E00: [0, 1e5], E0: [1, 1e6], k: [1e-4, 0.999], h: [1e-4, 0.999],
    delta: [1e-3, 50], tauE: [1e-14, 1e6],
    nu00: [0, 0.6], nu0: [0, 0.6], tauNu: [1e-14, 1e6]
  },
  ajustables: ['E00', 'E0', 'k', 'h', 'delta', 'tauE'],
  ajustablesPoisson: ['nu00', 'nu0', 'tauNu'],

  module: (f, p) => noyau2s2p1d(f, {
    bas: p.E00, haut: p.E0, tau: p.tauE, k: p.k, h: p.h, delta: p.delta, beta: Infinity
  }),
  poisson: (f, p) => noyau2s2p1d(f, {
    bas: p.nu00, haut: p.nu0, tau: p.tauNu, k: p.k, h: p.h, delta: p.delta, beta: Infinity
  })
};
