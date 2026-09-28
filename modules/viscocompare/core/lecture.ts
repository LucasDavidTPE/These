/**
 * Lecture des résultats à comparer, portage fidèle de `ViscoCompare/main.py`
 * (LucasDavidTPE/ViscoCompare) :
 * - COMSOL : un export `.csv` par vitesse (« … V=0.1 … .csv »), profil le long d'une ligne
 *   (`arc_length`), déplacements en m convertis en µm ;
 * - Viscoroute : un dossier par vitesse (« Vitesse_0.1 »), un fichier `.json` par grandeur
 *   (UX, UZ, EPS_XX…), une grille (x, y) dont on garde le profil en x = 0.
 * Pur : les fichiers sont lus par l'interface.
 */

/** Grandeurs comparées, dans l'ordre d'affichage (QUANTITES du script). */
export const GRANDEURS = ["UX", "UZ", "EPS_XX", "EPS_YY", "EPS_ZZ"] as const;
export type Grandeur = (typeof GRANDEURS)[number];

/** Réglages du script, modifiables dans l'interface. */
export interface Conventions {
  /** Décalage ajouté à `arc_length` de COMSOL (OFFSET_ARCLENGTH). */
  decalageArc: number;
  /** Facteur appliqué aux résultats Viscoroute (CONV_FACTOR). */
  facteurViscoroute: number;
  /** Grandeurs Viscoroute dont le signe est inversé (INVERT_SIGN_FOR). */
  signeInverse: Grandeur[];
  /** Facteur appliqué aux déplacements COMSOL (m → µm). */
  facteurDeplacementComsol: number;
}

export const CONVENTIONS_SCRIPT: Conventions = { decalageArc: -5, facteurViscoroute: 1e6, signeInverse: ["UX", "UZ"], facteurDeplacementComsol: 1e6 };

/** PATTERN_COMSOL : « V=0.1 », « v = 2 ». */
export function vitesseComsol(nomFichier: string): number | null {
  const m = /V\s*=\s*([-+]?\d+\.?\d*)/i.exec(nomFichier);
  return m ? Number(m[1]) : null;
}

/** PATTERN_VISCOROUTE_FOLDER : « Vitesse_0.1 ». */
export function vitesseViscoroute(nomDossier: string): number | null {
  const m = /Vitesse_([-+]?\d+\.?\d*)/i.exec(nomDossier);
  return m ? Number(m[1]) : null;
}

/** detect_quantity : la première grandeur dont le motif apparaît dans le nom. */
export function grandeurDuFichier(nom: string): Grandeur | null {
  const u = nom.toUpperCase();
  const motifs: [Grandeur, RegExp][] = [
    ["UX", /UX/],
    ["UZ", /UZ/],
    ["EPS_XX", /EPS[_\s]*XX/],
    ["EPS_YY", /EPS[_\s]*YY/],
    ["EPS_ZZ", /EPS[_\s]*ZZ/],
  ];
  return motifs.find(([, m]) => m.test(u))?.[0] ?? null;
}

/** Un tableau de colonnes nommées (colonne → valeurs), `arc_length` en premier. */
export interface Tableau {
  colonnes: string[];
  valeurs: Record<string, number[]>;
}

/** Noms de colonnes de COMSOL (français) → noms courts du script. */
const RENOMMAGE: Record<string, string> = {
  "Champ_de_déplacement,_composante_X": "UX",
  "Champ_de_déplacement,_composante_Y": "UY",
  "Champ_de_déplacement,_composante_Z": "UZ",
  "Tenseur_des_contraintes,_composante_xx": "Sxx",
  "Tenseur_des_contraintes,_composante_yy": "Syy",
  "Tenseur_des_contraintes,_composante_zz": "Szz",
  Tenseur_def_xx: "EPS_XX",
  Tenseur_def_yy: "EPS_YY",
  Tenseur_def_zz: "EPS_ZZ",
};

/** Découpe une ligne CSV (séparateur « , », guillemets doubles). */
function champsCsv(ligne: string): string[] {
  const out: string[] = [];
  let courant = "";
  let guillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]!;
    if (guillemets) {
      if (c === '"' && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else courant += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") {
      out.push(courant);
      courant = "";
    } else courant += c;
  }
  out.push(courant);
  return out.map((s) => s.trim());
}

const nombre = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? NaN : Number(t);
};

/** parse_csv_comsol, puis le décalage d'`arc_length` appliqué par main(). */
export function lireCsvComsol(texte: string, c: Conventions = CONVENTIONS_SCRIPT): Tableau {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lignes.length) throw new Error("fichier vide");
  const entetes = champsCsv(lignes[0]!).map((e) => {
    const n = e.normalize("NFC");
    return RENOMMAGE[n] ?? n;
  });
  const ia = entetes.indexOf("arc_length");
  if (ia < 0) throw new Error("arc_length manquante");
  const valeurs: Record<string, number[]> = Object.fromEntries(entetes.map((e) => [e, []]));
  for (const l of lignes.slice(1)) {
    const champs = champsCsv(l);
    entetes.forEach((e, j) => valeurs[e]!.push(nombre(champs[j])));
  }
  for (const g of ["UX", "UZ"]) if (valeurs[g]) valeurs[g] = valeurs[g].map((v) => v * c.facteurDeplacementComsol);
  valeurs.arc_length = valeurs.arc_length!.map((v) => v + c.decalageArc);
  return { colonnes: ["arc_length", ...entetes.filter((e) => e !== "arc_length")], valeurs };
}

export interface Grille {
  x: number[];
  y: number[];
  /** Une ligne par y, une colonne par x (NaN si la ligne est courte). */
  matrice: number[][];
}

const flottants = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const v = Number(t);
      if (Number.isNaN(v) && t.toLowerCase() !== "nan") throw new Error(`valeur illisible : « ${t} »`);
      return v;
    });

/**
 * parse_json_viscoroute : le fichier est lu par motifs, comme dans le script (il n'est pas
 * forcément du JSON valide). Clé "4" : les abscisses x ; clés ≥ 5 : « y v1 v2 … ».
 */
export function lireJsonViscoroute(texte: string): Grille {
  const mx = /"4"\s*:\s*"([\s\S]+?)"/.exec(texte);
  if (!mx) throw new Error("clé 4 non trouvée");
  const x = flottants(mx[1]!);
  const lignes = new Map<number, number[]>();
  for (const m of texte.matchAll(/"(\d+)"\s*:\s*"([\s\S]+?)"/g)) {
    const k = Number(m[1]);
    if (k >= 5) lignes.set(k, flottants(m[2]!));
  }
  if (!lignes.size) throw new Error("aucune clé ≥ 5 trouvée");
  let y: number[] = [];
  let matrice: number[][] = [];
  for (const k of [...lignes.keys()].sort((a, b) => a - b)) {
    const parts = lignes.get(k)!;
    if (!parts.length) continue;
    y.push(parts[0]!);
    const v = parts.slice(1, 1 + x.length);
    while (v.length < x.length) v.push(NaN);
    matrice.push(v);
  }
  if (y.length && y[0]! > y[y.length - 1]!) {
    y = y.reverse();
    matrice = matrice.reverse();
  }
  return { x, y, matrice };
}

/** get_profile_at_x0 : la colonne dont x est le plus proche de 0 (la première en cas d'égalité). */
export function profilEnX0(g: Grille): { y: number[]; v: number[] } {
  let i = 0;
  for (let j = 1; j < g.x.length; j++) if (Math.abs(g.x[j]!) < Math.abs(g.x[i]!)) i = j;
  return { y: [...g.y], v: g.matrice.map((l) => l[i] ?? NaN) };
}

/** Conversion Viscoroute du script : signe inversé pour UX et UZ, ×1e6 pour tout (µm, µdef). */
export function convertirViscoroute(g: Grandeur, v: number[], c: Conventions = CONVENTIONS_SCRIPT): number[] {
  if (c.signeInverse.includes(g)) return v.map((x) => -x * c.facteurViscoroute);
  if (g.startsWith("EPS_")) return v.map((x) => x * c.facteurViscoroute);
  return v;
}

/**
 * np.interp(xRef, xSource[masque], vSource[masque]) : interpolation linéaire, valeurs
 * extrêmes au-delà des bornes ; NaN partout s'il reste moins de deux points valides.
 */
export function interpoler(xRef: readonly number[], xSource: readonly number[], vSource: readonly number[]): number[] {
  const xs: number[] = [];
  const vs: number[] = [];
  vSource.forEach((v, i) => {
    if (!Number.isNaN(v)) {
      xs.push(xSource[i]!);
      vs.push(v);
    }
  });
  if (xs.length < 2) return xRef.map(() => NaN);
  return xRef.map((x) => {
    if (Number.isNaN(x)) return NaN;
    if (x <= xs[0]!) return vs[0]!;
    if (x >= xs[xs.length - 1]!) return vs[vs.length - 1]!;
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m]! <= x) lo = m;
      else hi = m;
    }
    const [x0, x1, v0, v1] = [xs[lo]!, xs[hi]!, vs[lo]!, vs[hi]!];
    return x1 === x0 ? v1 : v0 + ((x - x0) * (v1 - v0)) / (x1 - x0);
  });
}
