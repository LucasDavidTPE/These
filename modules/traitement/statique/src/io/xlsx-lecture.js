/**
 * Lecteur .xlsx écrit pour ce cas précis : de très longues feuilles de
 * mesures dont les nombres sont souvent stockés en texte partagé.
 *
 * Sur un export WaveMatrix de 252 048 lignes, le fichier contient
 * 206 Mo de feuille et 96 Mo de chaînes partagées. Une bibliothèque
 * généraliste doit en faire des millions de chaînes JavaScript, ce qui
 * coûte des dizaines de secondes et plus d'un gigaoctet.
 *
 * Ici :
 *   - les chaînes partagées sont converties en nombres au passage et rangées
 *     dans un Float64Array ; seules les premières sont gardées en texte, pour
 *     les en-têtes de colonnes ;
 *   - la feuille est analysée octet par octet, sans jamais être décodée en
 *     chaîne, et par morceaux au fil de la décompression ;
 *   - la taille exacte est lue dans <dimension>, donc les colonnes sont
 *     allouées une fois pour toutes.
 *
 * Résultat : mêmes valeurs, une fraction du temps et de la mémoire.
 */
import { lireRepertoire, octetsDe } from './zip.js';
import { TableBrute } from '../coeur/donnees.js';

const decodeur = new TextDecoder('utf-8');
const TEXTES_GARDES = 4096;     // chaînes conservées en clair, pour les en-têtes
const LIGNES_TEXTE = 24;        // lignes dont on garde aussi la version texte

/* --------------------------------------------------- lecture des nombres */

/** Lit un nombre entre buf[i] et buf[j-1]. Accepte la virgule décimale. */
function nombreOctets(buf, i, j) {
  let k = i, signe = 1;
  while (k < j && (buf[k] === 32 || buf[k] === 9)) k++;
  if (k < j && (buf[k] === 45 || buf[k] === 43)) { if (buf[k] === 45) signe = -1; k++; }
  let entier = 0, vu = false;
  while (k < j) {
    const c = buf[k];
    if (c >= 48 && c <= 57) { entier = entier * 10 + (c - 48); k++; vu = true; }
    else break;
  }
  let val = entier;
  if (k < j && (buf[k] === 46 || buf[k] === 44)) {          // '.' ou ','
    k++;
    let dec = 0, ech = 1;
    while (k < j) {
      const c = buf[k];
      if (c >= 48 && c <= 57) { dec = dec * 10 + (c - 48); ech *= 10; k++; vu = true; }
      else break;
    }
    val += dec / ech;
  }
  if (!vu) return NaN;
  if (k < j && (buf[k] === 101 || buf[k] === 69)) {          // 'e' ou 'E'
    k++;
    let se = 1;
    if (k < j && (buf[k] === 45 || buf[k] === 43)) { if (buf[k] === 45) se = -1; k++; }
    let ex = 0, vuE = false;
    while (k < j && buf[k] >= 48 && buf[k] <= 57) { ex = ex * 10 + (buf[k] - 48); k++; vuE = true; }
    if (vuE) val *= 10 ** (se * ex);
  }
  return signe * val;
}

/** Colonne "AB" → 27 (indice 0). */
function indiceColonne(buf, i, j) {
  let c = 0;
  for (let k = i; k < j; k++) {
    const b = buf[k];
    if (b >= 65 && b <= 90) c = c * 26 + (b - 64);
    else if (b >= 97 && b <= 122) c = c * 26 + (b - 96);
    else break;
  }
  return c - 1;
}

/** Concatène les morceaux successifs d'un flux décompressé, par blocs. */
async function* parBlocs(source, separateur, surProgres) {
  let reste = new Uint8Array(0);
  let lus = 0;
  for await (const morceau of source) {
    lus += morceau.length;
    let buf;
    if (reste.length) {
      buf = new Uint8Array(reste.length + morceau.length);
      buf.set(reste, 0); buf.set(morceau, reste.length);
    } else {
      buf = morceau;
    }
    // on ne traite que jusqu'à la dernière frontière complète
    const coupe = derniereOccurrence(buf, separateur);
    if (coupe < 0) { reste = buf; continue; }
    const fin = coupe + separateur.length;
    yield buf.subarray(0, fin);
    reste = buf.slice(fin);
    if (surProgres) surProgres(lus);
  }
  if (reste.length) yield reste;
}

function derniereOccurrence(buf, motif) {
  const m0 = motif[0], lm = motif.length;
  for (let i = buf.length - lm; i >= 0; i--) {
    if (buf[i] !== m0) continue;
    let ok = true;
    for (let k = 1; k < lm; k++) if (buf[i + k] !== motif[k]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

const octets = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
const FIN_SI = octets('</si>');
const FIN_ROW = octets('</row>');

/* ------------------------------------------------ chaînes partagées */

async function lireChainesPartagees(buffer, entree, surProgres) {
  if (!entree) return { valeurs: new Float64Array(0), textes: [] };
  let capacite = 1 << 16;
  let valeurs = new Float64Array(capacite);
  const textes = [];
  let n = 0;

  for await (const buf of parBlocs(octetsDe(buffer, entree), FIN_SI, surProgres)) {
    let i = 0;
    const len = buf.length;
    while (i < len) {
      // <si>
      if (buf[i] === 60 && buf[i + 1] === 115 && buf[i + 2] === 105 &&
          (buf[i + 3] === 62 || buf[i + 3] === 32 || buf[i + 3] === 47)) {
        // fin du <si>
        let fin = i;
        while (fin < len && !(buf[fin] === 60 && buf[fin + 1] === 47 && buf[fin + 2] === 115 &&
                              buf[fin + 3] === 105 && buf[fin + 4] === 62)) fin++;
        // morceaux <t ...> … </t>
        let debutTexte = -1, finTexte = -1, multiple = false;
        let k = i;
        while (k < fin) {
          if (buf[k] === 60 && buf[k + 1] === 116 && (buf[k + 2] === 62 || buf[k + 2] === 32)) {
            let d = k + 2;
            while (d < fin && buf[d] !== 62) d++;
            d++;
            let f = d;
            while (f < fin && !(buf[f] === 60 && buf[f + 1] === 47 && buf[f + 2] === 116)) f++;
            if (debutTexte < 0) { debutTexte = d; finTexte = f; }
            else { multiple = true; finTexte = f; }
            k = f + 3;
          } else k++;
        }
        if (n >= capacite) {
          capacite *= 2;
          const v2 = new Float64Array(capacite); v2.set(valeurs); valeurs = v2;
        }
        if (debutTexte < 0) {
          valeurs[n] = NaN;
          if (n < TEXTES_GARDES) textes[n] = '';
        } else {
          valeurs[n] = multiple ? NaN : nombreOctets(buf, debutTexte, finTexte);
          if (n < TEXTES_GARDES) textes[n] = decodeur.decode(buf.subarray(debutTexte, finTexte));
        }
        n++;
        i = fin + 5;
        continue;
      }
      i++;
    }
  }
  return { valeurs: valeurs.subarray(0, n), textes };
}

/* --------------------------------------------------------- la feuille */

function dimension(buf) {
  // <dimension ref="A1:V252049"/>
  for (let i = 0; i + 14 < buf.length; i++) {
    if (buf[i] === 60 && buf[i + 1] === 100 && buf[i + 2] === 105 && buf[i + 3] === 109 &&
        buf[i + 4] === 101 && buf[i + 5] === 110 && buf[i + 6] === 115) {
      let j = i;
      while (j < buf.length && buf[j] !== 62) j++;
      const txt = decodeur.decode(buf.subarray(i, j));
      const m = /ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(txt);
      if (m) {
        const col = s => [...s].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
        return { lignes: +m[4], colonnes: col(m[3]), premiere: +m[2], premiereCol: col(m[1]) };
      }
      return null;
    }
  }
  return null;
}

/**
 * @param {ArrayBuffer} buffer  le fichier .xlsx entier
 * @param {(etape:string, part:number)=>void} progres
 * @returns {Promise<TableBrute>}
 */
export async function lireXlsx(buffer, progres = () => {}) {
  const entrees = lireRepertoire(buffer);

  // feuille visée : la première du classeur, à défaut la plus grosse
  let nomFeuille = null;
  for (const [nom, e] of entrees) {
    if (!/^xl\/worksheets\/.*\.xml$/.test(nom)) continue;
    if (!nomFeuille || e.tailleBrute > entrees.get(nomFeuille).tailleBrute) nomFeuille = nom;
  }
  if (!nomFeuille) throw new Error('Aucune feuille de calcul dans ce fichier.');
  const feuille = entrees.get(nomFeuille);
  const partagees = entrees.get('xl/sharedStrings.xml');

  progres('chaînes partagées', 0);
  const total = (partagees ? partagees.tailleBrute : 0) + feuille.tailleBrute;
  let faits = 0;
  const { valeurs: valChaines, textes } = await lireChainesPartagees(
    buffer, partagees, lus => progres('chaînes partagées', (faits + lus) / total)
  );
  faits = partagees ? partagees.tailleBrute : 0;

  progres('feuille', faits / total);

  let colonnes = null, nLignes = 0, nColonnes = 0;
  let premierBloc = true;
  const lignesTexte = [];   // version texte des premières lignes, pour les en-têtes

  const agrandir = (jusqua) => {
    const taille = Math.max(jusqua + 1, colonnes[0] ? colonnes[0].length * 2 : 1024);
    for (let c = 0; c < colonnes.length; c++) {
      const n2 = new Float64Array(taille).fill(NaN);
      n2.set(colonnes[c]);
      colonnes[c] = n2;
    }
  };

  for await (const buf of parBlocs(octetsDe(buffer, feuille), FIN_ROW,
      lus => progres('feuille', (faits + lus) / total))) {
    const len = buf.length;
    if (premierBloc) {
      const d = dimension(buf);
      nLignes = d ? d.lignes : 0;
      nColonnes = d ? d.colonnes : 0;
      if (nLignes && nColonnes) {
        colonnes = [];
        for (let c = 0; c < nColonnes; c++) colonnes.push(new Float64Array(nLignes).fill(NaN));
      }
      premierBloc = false;
    }

    let i = 0;
    while (i < len) {
      if (buf[i] !== 60) { i++; continue; }                       // '<'
      // <c ...>
      if (buf[i + 1] === 99 && (buf[i + 2] === 32 || buf[i + 2] === 62 || buf[i + 2] === 47)) {
        let j = i + 2;
        let col = -1, ligne = -1, type = 0;                        // 0 nombre, 1 partagée, 2 texte
        while (j < len && buf[j] !== 62 && buf[j] !== 47) {
          if (buf[j] === 114 && buf[j + 1] === 61 && buf[j + 2] === 34) {        // r="
            const d = j + 3;
            let f = d; while (f < len && buf[f] !== 34) f++;
            col = indiceColonne(buf, d, f);
            let k = d; while (k < f && !(buf[k] >= 48 && buf[k] <= 57)) k++;
            ligne = nombreOctets(buf, k, f) - 1;
            j = f + 1; continue;
          }
          if (buf[j] === 116 && buf[j + 1] === 61 && buf[j + 2] === 34) {        // t="
            const d = j + 3;
            let f = d; while (f < len && buf[f] !== 34) f++;
            if (f - d === 1 && buf[d] === 115) type = 1;                          // s
            else if (buf[d] === 105 || buf[d] === 115) type = 2;                  // inlineStr / str
            j = f + 1; continue;
          }
          j++;
        }
        if (buf[j] === 47) { i = j + 1; continue; }                 // <c .../> cellule vide
        // valeur
        let k = j + 1, val = NaN, texte;
        const finCellule = () => buf[k] === 60 && buf[k + 1] === 47 && buf[k + 2] === 99;
        while (k < len && !finCellule()) {
          if (buf[k] === 60 && buf[k + 1] === 118 && buf[k + 2] === 62) {        // <v>
            const d = k + 3;
            let f = d; while (f < len && buf[f] !== 60) f++;
            const brut = nombreOctets(buf, d, f);
            if (type === 1) {
              val = valChaines[brut] ?? NaN;
              if (ligne < LIGNES_TEXTE) texte = textes[brut];
            } else {
              val = brut;
            }
            k = f; break;
          }
          if (type === 2 && buf[k] === 60 && buf[k + 1] === 116 &&
              (buf[k + 2] === 62 || buf[k + 2] === 32)) {                         // <t>
            let d = k + 2; while (d < len && buf[d] !== 62) d++; d++;
            let f = d; while (f < len && buf[f] !== 60) f++;
            val = nombreOctets(buf, d, f);
            if (ligne < LIGNES_TEXTE) texte = decodeur.decode(buf.subarray(d, f));
            k = f; break;
          }
          k++;
        }
        if (col >= 0 && ligne >= 0) {
          if (!colonnes) colonnes = [];
          while (colonnes.length <= col) {
            colonnes.push(new Float64Array(colonnes[0] ? colonnes[0].length : (nLignes || 1024)).fill(NaN));
          }
          if (ligne >= colonnes[col].length) agrandir(ligne);
          colonnes[col][ligne] = val;
          if (ligne < LIGNES_TEXTE && texte !== undefined) {
            (lignesTexte[ligne] ||= [])[col] = texte;
          }
          if (ligne + 1 > nLignes) nLignes = ligne + 1;
        }
        i = k;
        continue;
      }
      i++;
    }
  }

  if (!colonnes) throw new Error('Feuille vide.');
  if (colonnes[0].length > nLignes) {
    for (let c = 0; c < colonnes.length; c++) colonnes[c] = colonnes[c].subarray(0, nLignes);
  }

  progres('terminé', 1);
  const table = new TableBrute(colonnes, [], nLignes);
  table.lignesTexte = lignesTexte;   // les premières lignes en clair : en-têtes machine
  return table;
}
