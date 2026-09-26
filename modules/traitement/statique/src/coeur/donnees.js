/**
 * Feuille « données » du classeur Calcul.xlsx, en mémoire.
 *
 * Ce que faisait la macro VBA (Module3, Macro1) :
 *   - filtre du fichier brut sur la plage de CycleCount du palier
 *   - collage en A3:K de la feuille « données »
 *   - renumérotation des cycles      N = A − A(1re ligne) + 1   → colonne A
 *   - étalonnage des capteurs Lion   P = I·A1+B1 ; Q = J·A2+B2   → colonnes I, J
 *   - L = MOYENNE(F:H)  (Moy calcul, extensomètres axiaux)
 *   - M = MOYENNE(I:J)  (Moy radiales, capteurs sans contact)
 *
 * Les voies sont rangées en Float64Array, une par grandeur, et non en
 * tableau d'objets : sur 250 000 lignes cela divise la mémoire par cinq
 * environ et rend les boucles de régression nettement plus rapides.
 */
import { nombre, moyenne } from './nombres.js';

/** Position des voies dans l'export MTS/Instron d'origine. */
export const CORRESPONDANCE_PAR_DEFAUT = {
  cycle: 0, temps: 1, position: 2, charge: 3,
  defM: 4, defA: 5, defB: 6, defC: 7,
  lion1: 8, lion2: 9, lion3: -1, lion4: -1, pt100: 10
};

/** Facteur ramenant une voie axiale en déformation (mm/mm). */
export const UNITES_AXIALES = {
  'mm/mm': 1, '%': 0.01, 'µm/m': 1e-6, 'µdef': 1e-6, 'm/m': 1
};

/** Les dix voies traitées, dans l'ordre des colonnes de la feuille Traitement. */
export const VOIES = [
  { cle: 'F', nom: 'Force', unite: 'kN' },
  { cle: 'pos', nom: 'Déplacement du piston', unite: 'mm' },
  { cle: 'defM', nom: 'Moy pilotage', unite: 'déf' },
  { cle: 'dA', nom: 'Axial1', unite: 'déf' },
  { cle: 'dB', nom: 'Axial2', unite: 'déf' },
  { cle: 'dC', nom: 'Axial3', unite: 'déf' },
  { cle: 'l1', nom: 'Radial1', unite: 'mm' },
  { cle: 'l2', nom: 'Radial2', unite: 'mm' },
  { cle: 'l3', nom: 'Radial3', unite: 'mm' },
  { cle: 'l4', nom: 'Radial4', unite: 'mm' },
  { cle: 'mc', nom: 'Moy calcul', unite: 'déf' },
  { cle: 'mr', nom: 'Moy radiales', unite: 'mm' }
];

/**
 * Table brute en colonnes : ce que produisent les lecteurs de fichiers.
 * `colonnes` est un tableau de Float64Array de même longueur `n`.
 */
export class TableBrute {
  constructor(colonnes, entetes, n) {
    this.colonnes = colonnes;
    this.entetes = entetes || [];
    this.n = n;
  }
  /** Construit une table en colonnes à partir d'un tableau de lignes. */
  static depuisLignes(lignes, entetes) {
    const nc = lignes.reduce((m, l) => Math.max(m, l.length), 0);
    const n = lignes.length;
    const colonnes = [];
    for (let c = 0; c < nc; c++) colonnes.push(new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const l = lignes[i];
      for (let c = 0; c < nc; c++) colonnes[c][i] = nombre(l[c]);
    }
    return new TableBrute(colonnes, entetes, n);
  }
  colonne(i) {
    return i >= 0 && i < this.colonnes.length ? this.colonnes[i] : null;
  }
  /** Vue sur les lignes [debut, fin] incluses, sans recopier les données. */
  tranche(debut, fin) {
    const cols = this.colonnes.map(c => c.subarray(debut, fin + 1));
    return new TableBrute(cols, this.entetes, fin - debut + 1);
  }
}

/**
 * Applique correspondance, unités et étalonnages, et calcule les deux
 * moyennes de la feuille « données ».
 *
 * @param {TableBrute} table
 * @param {object} opt  correspondance, uniteAxiale, etalonnage, voiesAxiales,
 *                      voiesRadiales, tempsRegulier
 * @returns {{n:number, voies:Object<string,Float64Array>, t:Float64Array,
 *            cyc:Float64Array, T:Float64Array}}
 */
export function construireDonnees(table, opt = {}) {
  const map = opt.correspondance || CORRESPONDANCE_PAR_DEFAUT;
  const cal = opt.etalonnage || { a1: 0.001, b1: 0, a2: 0.001, b2: 0 };
  const selAx = opt.voiesAxiales || [true, true, true];
  const selRad = opt.voiesRadiales || [true, true, false, false];
  const ka = UNITES_AXIALES[opt.uniteAxiale] ?? 1;
  const n = table.n;

  const col = i => table.colonne(i);
  const cCyc = col(map.cycle), cT = col(map.temps);
  const vide = new Float64Array(0);
  const lire = (c, i) => (c ? c[i] : NaN);

  const cPos = col(map.position), cF = col(map.charge), cPt = col(map.pt100);
  const cM = col(map.defM), cA = col(map.defA), cB = col(map.defB), cC = col(map.defC);
  const cL = [col(map.lion1), col(map.lion2), col(map.lion3), col(map.lion4)];
  const aL = [cal.a1, cal.a2, cal.a3 ?? cal.a1, cal.a4 ?? cal.a2];
  const bL = [cal.b1, cal.b2, cal.b3 ?? 0, cal.b4 ?? 0];

  const voies = {};
  for (const v of VOIES) voies[v.cle] = new Float64Array(n);
  const t = new Float64Array(n), cyc = new Float64Array(n), T = new Float64Array(n);

  const c0 = cCyc && n ? cCyc[0] : 1;
  for (let i = 0; i < n; i++) {
    cyc[i] = (cCyc ? cCyc[i] : 1) - c0 + 1;
    t[i] = lire(cT, i);
    T[i] = lire(cPt, i);

    const dA = lire(cA, i) * ka, dB = lire(cB, i) * ka, dC = lire(cC, i) * ka;
    voies.F[i] = lire(cF, i);
    voies.pos[i] = lire(cPos, i);
    voies.defM[i] = lire(cM, i) * ka;
    voies.dA[i] = dA; voies.dB[i] = dB; voies.dC[i] = dC;

    let sa = 0, na = 0;
    if (selAx[0] && dA === dA) { sa += dA; na++; }
    if (selAx[1] && dB === dB) { sa += dB; na++; }
    if (selAx[2] && dC === dC) { sa += dC; na++; }
    voies.mc[i] = na ? sa / na : NaN;

    let sr = 0, nr = 0;
    for (let q = 0; q < 4; q++) {
      const v = lire(cL[q], i) * aL[q] + bL[q];
      voies['l' + (q + 1)][i] = v;
      if (selRad[q] && v === v) { sr += v; nr++; }
    }
    voies.mr[i] = nr ? sr / nr : NaN;
  }

  // Base de temps reconstruite à pas constant (ancienne macro ProjetInfo).
  if (opt.tempsRegulier && n > 1) {
    let tmax = -Infinity, tmin = Infinity;
    for (let i = 0; i < n; i++) { if (t[i] > tmax) tmax = t[i]; if (t[i] < tmin) tmin = t[i]; }
    let nmax = 0;
    for (let i = 0; i < n; i++) if (t[i] === tmax) nmax++;
    const dt = (tmax - tmin) / (n - 1 + (nmax > 1 ? nmax - 1 : 0));
    for (let i = 0; i < n; i++) t[i] = i * dt;
  }

  return { n, voies, t, cyc, T, vide };
}

/** Bornes de chaque cycle : équivalent de Traitement!A2:D. */
export function decouperCycles(cyc, n) {
  const segments = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    if (!cur || cur.cycle !== cyc[i]) {
      cur = { cycle: cyc[i], debut: i, nombre: 0 };
      segments.push(cur);
    }
    cur.nombre++;
  }
  return segments;
}

/** Devine l'unité des extensomètres sur l'ordre de grandeur du signal. */
export function devinerUniteAxiale(table, colonne) {
  const c = table.colonne(colonne);
  if (!c) return 'mm/mm';
  let mx = 0, vus = 0;
  for (let i = 0; i < table.n && vus < 4000; i += 7) {
    const v = Math.abs(c[i]);
    if (v === v && Number.isFinite(v)) { if (v > mx) mx = v; vus++; }
  }
  if (mx > 100) return 'µm/m';
  if (mx > 0.005) return '%';
  return 'mm/mm';
}

export { moyenne };
