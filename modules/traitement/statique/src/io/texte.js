/**
 * Lecture des exports texte de la machine (.csv, .txt).
 *
 * C'est le chemin le plus rapide de loin : pas de zip, pas de XML, pas de
 * table de chaînes partagées. Sur une campagne complète il se compte en
 * secondes là où le .xlsx équivalent se compte en dizaines de secondes.
 */
import { TableBrute } from '../coeur/donnees.js';

const LIGNES_TEXTE = 24;

/** Devine le séparateur sur les premières lignes réellement remplies. */
function separateur(lignes) {
  const candidats = [';', '\t', ',', ' '];
  let meilleur = ';', score = -1;
  for (const c of candidats) {
    let total = 0, n = 0;
    for (let i = 0; i < Math.min(lignes.length, 40); i++) {
      if (!lignes[i].trim()) continue;
      // moyenne sur toutes les lignes : un séparateur absent des lignes de données
      // (les espaces d'un en-tête WaveMatrix) ne doit pas l'emporter
      total += lignes[i].split(c).length - 1; n++;
    }
    const moy = n ? total / n : 0;
    if (moy > score) { score = moy; meilleur = c; }
  }
  return meilleur;
}

/**
 * @param {string} texte
 * @param {(etape:string, part:number)=>void} progres
 */
export function lireTexte(texte, progres = () => {}) {
  progres('découpage', 0);
  const lignes = texte.split(/\r?\n/);
  while (lignes.length && !lignes[lignes.length - 1].trim()) lignes.pop();
  if (!lignes.length) throw new Error('Fichier vide.');

  const sep = separateur(lignes);
  const nc = lignes.reduce((m, l, i) => i < 200 ? Math.max(m, l.split(sep).length) : m, 0);
  const n = lignes.length;

  const colonnes = [];
  for (let c = 0; c < nc; c++) colonnes.push(new Float64Array(n).fill(NaN));
  const lignesTexte = [];

  for (let i = 0; i < n; i++) {
    const champs = lignes[i].split(sep);
    for (let c = 0; c < champs.length && c < nc; c++) {
      const brut = champs[c].trim().replace(/^"(.*)"$/, '$1');   // en-têtes WaveMatrix entre guillemets
      const s = brut.replace(/[\s  ]/g, '').replace(',', '.');
      const v = s === '' ? NaN : Number(s);
      colonnes[c][i] = Number.isNaN(v) ? NaN : v;
      if (i < LIGNES_TEXTE) (lignesTexte[i] ||= [])[c] = brut;
    }
    if ((i & 8191) === 0) progres('lecture', i / n);
  }

  progres('terminé', 1);
  const table = new TableBrute(colonnes, [], n);
  table.lignesTexte = lignesTexte;
  return table;
}
