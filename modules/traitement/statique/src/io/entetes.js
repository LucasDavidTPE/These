/**
 * Reconnaissance des en-têtes et attribution des voies.
 *
 * Deux formats coexistent dans le laboratoire :
 *   - l'export MTS/Instron pour lequel la macro a été écrite : « CycleCount,
 *     Temps d'exécution, Axial Deplacement, Axial Force, DefM/A/B/C,
 *     Lion …, PT 100 », six lignes d'en-tête, déformations en mm/mm,
 *     capteurs sans contact en volts ;
 *   - l'export WaveMatrix « steps tracking » : en-têtes français, une seule
 *     ligne, déformations en %, jusqu'à quatre capteurs sans contact en µm,
 *     et des nombres écrits en texte avec virgule décimale.
 */
import { CORRESPONDANCE_PAR_DEFAUT } from '../coeur/donnees.js';

/** Trouve la ligne d'en-tête et la première ligne de mesures. */
export function reperer(table) {
  const texte = table.lignesTexte || [];
  const cCyc = table.colonne(0);
  for (let i = 0; i < Math.min(texte.length, 20); i++) {
    const l = texte[i] || [];
    const mots = l.filter(v => v && !/^[-+]?[\d\s,.eE]+$/.test(v)).length;
    if (mots < 4) continue;
    // la ligne suivante doit être numérique
    for (let j = i + 1; j <= i + 2; j++) {
      let nums = 0;
      for (let c = 0; c < table.colonnes.length; c++) {
        if (Number.isFinite(table.colonnes[c][j])) nums++;
      }
      if (nums >= 4) return { entetes: l.map(v => v ?? ''), premiereLigne: j };
    }
  }
  // pas d'en-tête reconnaissable : on cherche la première ligne numérique
  for (let j = 0; j < Math.min(table.n, 50); j++) {
    let nums = 0;
    for (let c = 0; c < table.colonnes.length; c++) {
      if (Number.isFinite(table.colonnes[c][j])) nums++;
    }
    if (nums >= 4) return { entetes: [], premiereLigne: j };
  }
  return { entetes: [], premiereLigne: 0 };
}

export function attribuerVoies(entetes) {
  const m = { ...CORRESPONDANCE_PAR_DEFAUT };
  if (!entetes.length) return m;
  const trouver = re => entetes.findIndex(h => re.test(h || ''));
  const tous = re => entetes.map((h, i) => re.test(h || '') ? i : -1).filter(i => i >= 0);
  const poser = (cle, v) => { if (v >= 0) m[cle] = v; };

  const waveMatrix = /nombre total de cycles/i.test(entetes.join('|'));

  if (waveMatrix) {
    const exact = entetes.findIndex(h => /^\s*nombre total de cycles\s*$/i.test(h || ''));
    poser('cycle', exact >= 0 ? exact : trouver(/nombre total de cycles/i));
    poser('temps', trouver(/temps total/i));
    poser('position', trouver(/^position/i));
    poser('charge', trouver(/^force/i));
    poser('pt100', trouver(/\(°C\)/i));
    m.defM = -1;                                  // pas de voie de pilotage moyenne
    const defs = tous(/^d[ée]formation/i);
    m.defA = defs[0] ?? -1; m.defB = defs[1] ?? -1; m.defC = defs[2] ?? -1;
    const lions = tous(/lion/i);
    for (let q = 0; q < 4; q++) m['lion' + (q + 1)] = lions[q] ?? -1;
    return m;
  }

  for (const [cle, re] of [
    ['cycle', /cycle/i], ['temps', /temps|time/i], ['position', /d[ée]pl|position/i],
    ['charge', /force|charge|load/i], ['defM', /^\s*defm/i], ['defA', /^\s*defa/i],
    ['defB', /^\s*defb/i], ['defC', /^\s*defc/i], ['pt100', /pt\s*100|temp[ée]rature|\(°C\)/i]
  ]) poser(cle, trouver(re));

  const lions = tous(/lion|sc_/i);
  for (let q = 0; q < 4; q++) m['lion' + (q + 1)] = lions[q] ?? -1;
  return m;
}
