/**
 * Point d'entrée de la lecture de fichiers.
 *
 * Volontairement sans Worker : l'analyse est déjà asynchrone et découpée en
 * morceaux au rythme de la décompression, si bien que l'interface reste
 * réactive et que la progression s'affiche. Un Worker aurait obligé à
 * passer par un blob, que Chrome refuse quand la page est ouverte depuis un
 * fichier local — or c'est exactement le mode d'usage au laboratoire.
 */
import { lireXlsx } from './xlsx-lecture.js';
import { lireTexte } from './texte.js';
import { reperer, attribuerVoies } from './entetes.js';
import { devinerUniteAxiale } from '../coeur/donnees.js';

export async function lireFichier(fichier, progres = () => {}) {
  const ext = (fichier.name.split('.').pop() || '').toLowerCase();
  let table;

  if (ext === 'xlsx' || ext === 'xlsm') {
    progres('ouverture', 0);
    table = await lireXlsx(await fichier.arrayBuffer(), progres);
  } else if (ext === 'xls') {
    throw new Error(
      "Les classeurs .xls (ancien format binaire) ne sont pas lus ici. " +
      "Enregistre-le en .xlsx, ou mieux : exporte le .csv de la machine, bien plus rapide."
    );
  } else {
    progres('ouverture', 0);
    table = lireTexte(await fichier.text(), progres);
  }

  const { entetes, premiereLigne } = reperer(table);
  const correspondance = attribuerVoies(entetes);

  // on écarte les lignes d'en-tête : les colonnes deviennent des vues, sans recopie
  const utile = premiereLigne > 0 ? table.tranche(premiereLigne, table.n - 1) : table;
  utile.entetes = entetes;
  utile.lignesTexte = table.lignesTexte;

  // lignes sans numéro de cycle : équivalent du Clean_Data de la macro
  const cCyc = utile.colonne(correspondance.cycle);
  let dernier = utile.n;
  if (cCyc) {
    while (dernier > 0 && !Number.isFinite(cCyc[dernier - 1])) dernier--;
  }
  const table2 = dernier < utile.n ? utile.tranche(0, dernier - 1) : utile;
  table2.entetes = entetes;

  return {
    table: table2,
    entetes,
    correspondance,
    uniteAxiale: devinerUniteAxiale(table2, correspondance.defA),
    nom: fichier.name
  };
}
