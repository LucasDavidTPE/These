/**
 * Exports « Données » de COMSOL (fichiers .txt / .csv : lignes d'en-tête `% Clé: valeur`, puis une ligne
 * `% X Y Z expr (unité) @ solution: paramètres…` et les valeurs). Un export est un profil (une coordonnée
 * varie : ligne verticale ou horizontale), une coupe (deux coordonnées : plan) ou un nuage. On en tire des
 * graphes propres : profils superposés (une série par fichier ou par expression), profil extrait d'une
 * coupe, ou carte en couleurs d'une coupe.
 * Exports de **tables** (évaluation en un point au cours du temps) : en-tête `% Temps (s)  colonne (unité)…`,
 * une ligne par instant ; ils se lisent comme une « série » (première colonne en abscisse).
 */
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

export interface ColonneComsol {
  /** Texte brut de l'expression (« 1e6*solid.eZZ »). */
  expression: string;
  /** Unité déclarée par COMSOL (« 1 » = sans dimension). */
  unite: string;
  /** Solution (« 303 ») et paramètres (« lc » → « 3 », « VE » → « 0 », « Temps » → « 10 s »). */
  solution: string;
  parametres: Record<string, string>;
  /** Libellé imposé (colonne calculée, opération entre fichiers) ; sinon déduit de l'expression. */
  libelle?: LibelleColonne;
}

export interface LibelleColonne {
  /** Grandeur pour les axes, notation pgfplots (« $\varepsilon_{zz}$ »). */
  grandeur: string;
  unite: string;
  /** Nom court pour les listes (« εzz »). */
  court: string;
}

export interface ExportComsol {
  /** Nom du fichier (sans dossier). */
  nom: string;
  meta: Record<string, string>;
  /** Noms des coordonnées (X, Y, Z). */
  coordonnees: string[];
  /** Unité de longueur des coordonnées (« m »). */
  uniteLongueur: string;
  colonnes: ColonneComsol[];
  /** Valeurs : une colonne par coordonnée puis par expression. */
  valeurs: Float64Array[];
  lignes: number;
  /**
   * Lecture imposée par l'utilisateur quand la détection se trompe : coordonnées à prendre comme variables,
   * dans l'ordre du tracé ([k] : profil selon k ; [kx, ky] : coupe, kx à l'horizontale).
   */
  forcer?: number[];
  /** « donnees » (coordonnées X, Y, Z) ou « table » (série : la première colonne, le temps, en abscisse). */
  nature?: "donnees" | "table";
  /** Unité de la première colonne d'une table (« s »). */
  uniteArgument?: string;
  /** Légende imposée (profil extrait, résultat d'une opération) ; sinon calculée. */
  legende?: string;
  /** Changements de repère appliqués aux coordonnées (k → nouvelle = facteur × (ancienne − origine)). */
  repere?: Record<number, { facteur: number; origine: number }>;
}

export const estComsol = (texte: string) =>
  /^\uFEFF?%\s*(Model|Modèle|Version|Dimension|Nodes|Table|Tableau)\s*:/m.test(texte.slice(0, 2000)) || /^\uFEFF?%\s*(Temps|Time|Fréquence|Frequency|freq|t)\s*\([^)]*\)/im.test(texte.slice(0, 2000));

/** Première colonne d'une table COMSOL (temps, fréquence, paramètre) : « Temps (s) ». */
const ARGUMENT_TABLE = /^(Temps|Time|Fréquence|Frequency|freq|t|[A-Za-zÀ-ÿ_][\wÀ-ÿ]*)\s*\(([^()]*)\)/i;

/** Lit un export COMSOL (séparateurs : espaces, tabulations, virgules ou points-virgules). */
export function lireComsol(texte: string, nom: string): ExportComsol {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/);
  const meta: Record<string, string> = {};
  const entetes: string[] = [];
  const donnees: string[] = [];
  for (const l of lignes) {
    if (l.startsWith("%")) {
      const m = /^%\s*([A-Za-zÀ-ÿ ]+?)\s*:\s*(.*)$/.exec(l);
      if (m && !/^%\s*[XYZxyz]\b/.test(l) && !donnees.length) meta[m[1]!.trim()] = m[2]!.trim();
      entetes.push(l.replace(/^%\s*/, ""));
    } else if (l.trim()) donnees.push(l.trim());
  }
  if (!donnees.length) throw new Error(`${nom} : aucune valeur (export COMSOL vide ?).`);
  // table : la dernière ligne d'en-tête ne commence pas par une coordonnée mais par « Temps (s) »…
  const derniere = entetes.at(-1) ?? "";
  if (!/^[XYZxyzRr]\b/.test(derniere) && ARGUMENT_TABLE.test(derniere)) return lireTable(meta, derniere, donnees, nom);
  const virgules = !/\s/.test(donnees[0]!.replace(/,\s+/g, ",")) && donnees[0]!.includes(",");
  const decouper = (l: string) => (virgules ? l.split(/\s*[,;]\s*/) : l.split(/[\s;]+/));
  const n = decouper(donnees[0]!).length;
  const dim = Number(meta.Dimension) || 0;
  // ligne des titres : la dernière ligne d'en-tête qui commence par une coordonnée
  const titres = [...entetes].reverse().find((h) => /^[XYZxyzRr]\b/.test(h)) ?? "";
  const nbCoord = dim > 0 && dim < n ? dim : Math.max(1, (/^((?:[XYZxyzr]\s+){1,3})/.exec(`${titres} `)?.[1] ?? "X ").trim().split(/\s+/).length);
  const coordonnees = titres ? titres.split(/\s+/).slice(0, nbCoord) : ["X", "Y", "Z"].slice(0, nbCoord);
  const reste = titres.split(/\s+/).slice(nbCoord).join(" ");
  const colonnes = lireTitres(virgules ? titres.split(/\s*,\s*/).slice(nbCoord).join(" ") : reste, n - nbCoord);

  const valeurs = Array.from({ length: n }, () => new Float64Array(donnees.length));
  donnees.forEach((l, i) => {
    const c = decouper(l);
    for (let j = 0; j < n; j++) {
      const v = c[j];
      valeurs[j]![i] = v === undefined || /^nan$/i.test(v) ? NaN : Number(v);
    }
  });
  return { nom, meta, coordonnees, uniteLongueur: meta["Length unit"] || meta["Unité de longueur"] || "m", colonnes, valeurs, lignes: donnees.length };
}

/**
 * Table COMSOL : titres séparés par des tabulations ou au moins deux espaces (« Temps (s)   Déformation,
 * composante zz (1), Point: (0.9, 6.5, -0.08) »), valeurs séparées par des blancs.
 */
function lireTable(meta: Record<string, string>, titres: string, donnees: string[], nom: string): ExportComsol {
  const decouper = (l: string) => l.split(/[\s;]+|,(?=\s*[-+\d.])/).filter(Boolean);
  const n = decouper(donnees[0]!).length;
  const morceaux = titres.split(/\t+|\s{2,}/).map((t) => t.trim()).filter(Boolean);
  const arg = ARGUMENT_TABLE.exec(morceaux[0] ?? "");
  const colonnes: ColonneComsol[] =
    morceaux.length === n
      ? morceaux.slice(1).map(lireTitreTable)
      : Array.from({ length: n - 1 }, (_, k) => ({ expression: `Colonne ${k + 1}`, unite: "", solution: "", parametres: {} }));
  const valeurs = Array.from({ length: n }, () => new Float64Array(donnees.length));
  donnees.forEach((l, i) => {
    const c = decouper(l);
    for (let j = 0; j < n; j++) valeurs[j]![i] = c[j] === undefined || /^nan$/i.test(c[j]!) ? NaN : Number(c[j]);
  });
  return {
    nom,
    meta,
    coordonnees: [arg?.[1] ?? "t"],
    uniteLongueur: meta["Length unit"] || "m",
    colonnes,
    valeurs,
    lignes: donnees.length,
    nature: "table",
    uniteArgument: arg?.[2]?.trim() ?? "",
  };
}

/** « Déformation, composante zz (1), Point: (0.9, 6.5, -0.08) » ou « 1e6*solid.eZZ (1) @ 3: lc=1 ». */
export function lireTitreTable(t: string): ColonneComsol {
  // l'unité est la première parenthèse sans virgule (celle d'un point en a)
  const m = /^(.*?)\s*\(([^(),]*)\)\s*(.*)$/.exec(t);
  if (!m) return { expression: t, unite: "", solution: "", parametres: {} };
  const reste = m[3]!.replace(/^,\s*/, "");
  const parametres: Record<string, string> = {};
  const point = /Point\s*:\s*(\([^)]*\)|\S+)/i.exec(reste);
  if (point) parametres.Point = point[1]!;
  const at = /@\s*(?:([^:=,]*):\s*)?(.*)$/.exec(reste);
  for (const p of (at?.[2] ?? "").split(/,\s*/)) {
    const i = p.indexOf("=");
    if (i > 0) parametres[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return { expression: m[1]!.trim(), unite: m[2]!.trim(), solution: at?.[1]?.trim() ?? "", parametres };
}

/** « 1e6*solid.eXZ (1) @ 303: Temps=10 s, lc=3, VE=0 1e6*solid.eYZ (1) @ … » → colonnes. */
export function lireTitres(texte: string, n: number): ColonneComsol[] {
  const re = /(\S+) \(([^()]*)\)/g;
  const trouves: { debut: number; fin: number; expression: string; unite: string }[] = [];
  for (let m = re.exec(texte); m; m = re.exec(texte)) trouves.push({ debut: m.index, fin: m.index + m[0].length, expression: m[1]!, unite: m[2]! });
  if (trouves.length !== n) {
    const mots = texte.split(/\s+/).filter(Boolean);
    return Array.from({ length: n }, (_, k) => ({ expression: mots.length === n ? mots[k]! : `Colonne ${k + 1}`, unite: "", solution: "", parametres: {} }));
  }
  return trouves.map((t, k) => {
    const suite = texte.slice(t.fin, trouves[k + 1]?.debut ?? texte.length).trim();
    // « @ 303: Temps=10 s, lc=3 » (solution numérotée) ou « @ t=9 » (export à plusieurs instants)
    const m = /^@\s*(?:([^:=,]*):\s*)?(.*)$/.exec(suite);
    const parametres: Record<string, string> = {};
    for (const p of (m?.[2] ?? "").split(/,\s*/)) {
      const i = p.indexOf("=");
      if (i > 0) parametres[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    }
    return { expression: t.expression, unite: t.unite, solution: m?.[1]?.trim() ?? "", parametres };
  });
}

// ---- Libellés ----

const UNITES_FACTEUR: Record<string, Record<string, string>> = {
  "1": { "1e6": "µdef", "1e3": "‰", "100": "%", "1": "-" },
  Pa: { "1e-6": "MPa", "1e-3": "kPa", "1": "Pa" },
  m: { "1e6": "µm", "1e3": "mm", "100": "cm", "1": "m" },
};

/** Libellé d'une colonne : imposé, sinon déduit de son expression. */
export function libelleColonne(c: ColonneComsol): LibelleColonne {
  return c.libelle ?? libelleExpression(c);
}

/** Libellé lisible d'une expression, en notation pgfplots (« $\varepsilon_{zz}$ (µdef) »). */
export function libelleExpression(c: Pick<ColonneComsol, "expression" | "unite">): LibelleColonne {
  const m = /^\s*([0-9.eE+-]+)\s*\*\s*(.+)$/.exec(c.expression);
  const facteur = m ? String(Number(m[1])) : "1";
  const base = (m ? m[2]! : c.expression).trim();
  const nomVar = base.split(".").pop()!;
  let grandeur = base;
  let court = nomVar;
  // titres descriptifs des tables : « Déformation, composante zz », « Contrainte, composante xz »
  const decrit = /^(Déformation|Strain|Contrainte|Stress)[^,]*,\s*(?:composante|component)\s*([xyz])([xyz])$/i.exec(base);
  const brut = /^([es])([XYZxyz])([XYZxyz])$/.exec(nomVar);
  const tenseur: [string, string, string] | null = brut ? [brut[1]!, brut[2]!, brut[3]!] : decrit ? [/^(Déf|Str)/i.test(decrit[1]!) ? "e" : "s", decrit[2]!, decrit[3]!] : null;
  const princ = /^([es])p?([123])$/.exec(nomVar);
  const equiv = /^([es])eq$/i.exec(nomVar);
  if (tenseur) {
    const i = `${tenseur[1]}${tenseur[2]}`.toLowerCase();
    grandeur = `$${tenseur[0] === "e" ? "\\varepsilon" : "\\sigma"}_{${i}}$`;
    court = `${tenseur[0] === "e" ? "ε" : "σ"}${i}`;
  } else if (princ) {
    grandeur = `$${princ[1] === "e" ? "\\varepsilon" : "\\sigma"}_{${princ[2]}}$`;
    court = `${princ[1] === "e" ? "ε" : "σ"}${princ[2]}`;
  } else if (equiv) {
    grandeur = `$${equiv[1]!.toLowerCase() === "e" ? "\\varepsilon" : "\\sigma"}_{eq}$`;
    court = `${equiv[1]!.toLowerCase() === "e" ? "ε" : "σ"}eq`;
  } else if (/^(mises|vonmises)$/i.test(nomVar)) {
    grandeur = "$\\sigma_{VM}$";
    court = "σVM";
  } else if (/^[uvw]$/.test(nomVar)) {
    grandeur = `$u_{${{ u: "x", v: "y", w: "z" }[nomVar]}}$`;
    court = `u${{ u: "x", v: "y", w: "z" }[nomVar]}`;
  }
  const base1 = c.unite === "" ? "1" : c.unite;
  const connue = Object.entries(UNITES_FACTEUR[base1] ?? {}).find(([k]) => Number(k) === Number(facteur))?.[1];
  const unite = connue ?? (facteur === "1" ? (base1 === "1" ? "-" : base1) : `${m![1]} ${base1}`);
  return { grandeur, unite, court };
}

// ---- Géométrie ----

export interface Geometrie {
  /** Coordonnées qui varient (indices dans `coordonnees`). */
  varient: number[];
  /** « serie » : table COMSOL (une valeur par instant). */
  genre: "point" | "profil" | "coupe" | "volume" | "serie";
  /** Pour une coupe : valeurs distinctes de chaque coordonnée qui varie, et grille complète ou non. */
  grilles: number[][];
  reguliere: boolean;
}

/** Valeurs distinctes (à 10 chiffres près), triées : tri d'une copie typée, puis une passe. */
function distinctes(v: Float64Array): number[] {
  const out: number[] = [];
  let avant = NaN;
  for (const x of Float64Array.from(v).sort()) {
    if (!Number.isFinite(x)) continue;
    const r = Number(x.toPrecision(10));
    if (r !== avant) out.push((avant = r));
  }
  return out;
}

/**
 * Géométrie déjà calculée, par tableau de valeurs (les valeurs d'un export ne changent jamais une fois lues ; une
 * copie `{ ...e, legende }` les partage) puis par lecture imposée. Appelée à chaque rendu par les légendes, les
 * pistes, les tuiles : sans ce cache, elle recompte les coordonnées distinctes de chaque fichier à chaque fois.
 */
const geometries = new WeakMap<Float64Array[], Map<string, Geometrie>>();

export function geometrie(e: ExportComsol): Geometrie {
  if (e.nature === "table") return { varient: [0], genre: "serie", grilles: [], reguliere: false };
  const cle = `${e.lignes}|${(e.forcer ?? []).join(",")}`;
  let parLecture = geometries.get(e.valeurs);
  if (!parLecture) geometries.set(e.valeurs, (parLecture = new Map()));
  const deja = parLecture.get(cle);
  if (deja) return deja;
  const g = calculerGeometrie(e);
  parLecture.set(cle, g);
  return g;
}

function calculerGeometrie(e: ExportComsol): Geometrie {
  const forcees = (e.forcer ?? []).filter((k, i, t) => k >= 0 && k < e.coordonnees.length && t.indexOf(k) === i);
  const varient = forcees.length ? forcees : e.coordonnees.map((_, k) => k).filter((k) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of e.valeurs[k]!) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return mx - mn > 1e-9 * Math.max(1, Math.abs(mx));
  });
  const grilles = varient.map((k) => distinctes(e.valeurs[k]!));
  const genre = varient.length === 0 ? "point" : varient.length === 1 ? "profil" : varient.length === 2 ? "coupe" : "volume";
  const reguliere = genre === "coupe" && grilles[0]!.length * grilles[1]!.length === e.lignes;
  return { varient, genre, grilles, reguliere };
}

/** Lectures possibles d'un export (pour corriger la détection) : profil selon chaque coordonnée, coupe pour chaque couple ordonné. */
export function lecturesPossibles(e: ExportComsol): { libelle: string; forcer: number[] }[] {
  if (e.nature === "table") return [];
  const c = e.coordonnees;
  const out = c.map((n, k) => ({ libelle: `Profil selon ${n}`, forcer: [k] }));
  for (let a = 0; a < c.length; a++) for (let b = 0; b < c.length; b++) if (a !== b) out.push({ libelle: `Coupe ${c[a]} (horizontal) × ${c[b]} (vertical)`, forcer: [a, b] });
  return out;
}

/** « profil vertical (Z), 161 points », « coupe YZ, 263 × 65 points ». */
export function descriptionGeometrie(e: ExportComsol): string {
  const g = geometrie(e);
  if (g.genre === "serie") return `série (${e.coordonnees[0]}${e.uniteArgument ? ` en ${e.uniteArgument}` : ""}), ${e.lignes} instants, ${e.colonnes.length} colonne(s)`;
  const noms = g.varient.map((k) => e.coordonnees[k]!).join("");
  if (g.genre === "profil") return `profil ${/^z$/i.test(noms) ? "vertical" : "horizontal"} (${noms}), ${e.lignes} points`;
  if (g.genre === "coupe") return `coupe ${noms}, ${g.reguliere ? `${g.grilles[0]!.length} × ${g.grilles[1]!.length}` : e.lignes} points`;
  if (g.genre === "volume") return `nuage 3D, ${e.lignes} points`;
  return `${e.lignes} point(s)`;
}

/** Paramètres de l'étude d'un export (ceux de sa première expression). */
export const parametresDe = (e: ExportComsol): Record<string, string> => e.colonnes[0]?.parametres ?? {};

/** Correspondance de légende : un mot du nom de fichier (« het ») ou un paramètre (« lc=1 ») → un texte. */
export interface Correspondance {
  de: string;
  vers: string;
}

/** D'où viennent les légendes automatiques. */
export type SourceLegende = "auto" | "nom" | "parametres" | "les-deux";

const cleCorrespondance = (t: string) => t.replace(/\s+/g, "").toLowerCase();

/**
 * Légende de chaque export : les mots qui diffèrent d'un nom de fichier à l'autre (« el lc3 het » /
 * « ve lc1 rect ») et/ou les paramètres de l'étude qui diffèrent (« lc=3, VE=0 »), traduits par la table de
 * correspondances (« lc=1 » → « Rectangulaire », « het » → « Hétérogène »). « auto » : les mots, sinon les
 * paramètres, sinon le nom. Une légende imposée (`legende` de l'export) l'emporte toujours.
 */
export function legendes(exports: readonly ExportComsol[], o: { correspondances?: readonly Correspondance[]; source?: SourceLegende } = {}): string[] {
  const table = new Map((o.correspondances ?? []).filter((c) => c.de.trim()).map((c) => [cleCorrespondance(c.de), c.vers]));
  const traduire = (t: string) => table.get(cleCorrespondance(t)) ?? t;
  const nomCourt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
  const imposer = (l: string[]) => l.map((x, i) => exports[i]!.legende ?? x);
  const source = o.source ?? "auto";
  if (exports.length <= 1) {
    // un seul fichier : son nom, avec ses mots traduits s'il y a lieu
    const seul = (e: ExportComsol) => {
      if (source === "parametres") return Object.entries(parametresDe(e)).map(([k, v]) => traduire(`${k}=${v}`)).join(", ");
      const mots = nomCourt(e.nom).split(/[_\-\s]+/).filter(Boolean);
      return mots.some((m) => table.has(cleCorrespondance(m))) ? mots.map(traduire).join(" ") : nomCourt(e.nom);
    };
    return imposer(exports.map((e) => seul(e) || nomCourt(e.nom)));
  }
  // mots qui diffèrent d'un nom à l'autre ; si couper aux tirets ne les distingue pas (« EL » / « EL-fin »),
  // couper seulement aux « _ » et aux blancs
  const differentsMots = (sep: RegExp) => {
    const morceaux = exports.map((e) => nomCourt(e.nom).split(sep).filter(Boolean));
    const communs = new Set(morceaux[0]!.filter((m) => morceaux.every((x) => x.includes(m))));
    return morceaux.map((m) => m.filter((x) => !communs.has(x)).map(traduire).join(" "));
  };
  const avecTirets = differentsMots(/[_\-\s]+/);
  const sansTirets = differentsMots(/[_\s]+/);
  const parNom = avecTirets.every(Boolean) && new Set(avecTirets).size === avecTirets.length ? avecTirets : sansTirets.every(Boolean) && new Set(sansTirets).size === sansTirets.length ? sansTirets : avecTirets;
  const cles = [...new Set(exports.flatMap((e) => Object.keys(parametresDe(e))))];
  const differents = cles.filter((k) => new Set(exports.map((e) => parametresDe(e)[k] ?? "")).size > 1);
  const parParam = exports.map((e) => differents.map((k) => traduire(`${k}=${parametresDe(e)[k] ?? "?"}`)).join(", "));
  const distinctes = (l: string[]) => l.every(Boolean) && new Set(l).size === l.length;
  const noms = exports.map((e) => nomCourt(e.nom));
  if (source === "nom") return imposer(parNom.map((x, i) => x || noms[i]!));
  if (source === "parametres") return imposer(parParam.map((x, i) => x || noms[i]!));
  if (source === "les-deux") return imposer(parNom.map((x, i) => [x, parParam[i]].filter(Boolean).join(" — ") || noms[i]!));
  if (distinctes(parNom)) return imposer(parNom);
  if (differents.length && distinctes(parParam)) return imposer(parParam);
  return imposer(noms);
}

/** Coin du graphe le moins chargé en points (pour y mettre la légende). */
export function coinLibre(series: readonly { x: number[]; y: number[] }[]): "north east" | "north west" | "south east" | "south west" {
  const xs = series.flatMap((s) => s.x);
  const ys = series.flatMap((s) => s.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const compte = { "north east": 0, "north west": 0, "south east": 0, "south west": 0 };
  for (const s of series)
    s.x.forEach((x, i) => {
      const u = (x - x0) / (x1 - x0 || 1);
      const v = (s.y[i]! - y0) / (y1 - y0 || 1);
      // un coin = le tiers extérieur dans chaque direction
      if (u > 0.55 && v > 0.55) compte["north east"]++;
      if (u < 0.45 && v > 0.55) compte["north west"]++;
      if (u > 0.55 && v < 0.45) compte["south east"]++;
      if (u < 0.45 && v < 0.45) compte["south west"]++;
    });
  return (Object.entries(compte) as [keyof typeof compte, number][]).sort((a, b) => a[1] - b[1])[0]![0];
}

// ---- Profils → graphe ----

export type UniteLongueur = "m" | "cm" | "mm";
export const FACTEUR_LONGUEUR: Record<string, number> = { m: 1, cm: 100, mm: 1000, km: 1e-3 };

export interface OptionsProfils {
  /** Expressions à tracer (texte brut). */
  expressions: string[];
  /** Légende de chaque export (même ordre) ; sinon calculée. */
  noms?: string[];
  longueur: UniteLongueur;
  /** Profil vertical tracé en profondeur positive (vers le bas) plutôt qu'en z négatif. */
  profondeur?: boolean;
  /**
   * « verticale » : valeur en abscisse, coordonnée en ordonnée (profil en profondeur) ; « horizontale » :
   * l'inverse ; « auto » (défaut) : verticale si la coordonnée est Z.
   */
  orientation?: "auto" | "verticale" | "horizontale";
  /** Interfaces de couches (cote z dans les coordonnées du fichier, en m) : lignes de repère. */
  interfaces?: readonly Interface[];
}

/** Interface entre couches de la chaussée : cote z (unité de longueur des fichiers COMSOL) et nom. */
export interface Interface {
  z: number;
  texte: string;
}

/** Coordonnée k d'un export après ses changements de repère (valeur du fichier → valeur affichée, même unité). */
export function versRepere(e: ExportComsol, k: number, v: number): number {
  const r = e.repere?.[k];
  return r ? r.facteur * (v - r.origine) : v;
}

/** Titre d'axe d'une coordonnée, repère compris : « $z$ », « Profondeur », « $y - y_0$ ». */
export function titreCoordonnee(e: ExportComsol, k: number): string {
  const n = e.coordonnees[k]!.toLowerCase();
  const r = e.repere?.[k];
  if (r && r.facteur < 0 && n === "z" && r.origine === 0) return "Profondeur";
  const base = r && r.origine !== 0 ? `${n} - ${n}_0` : n;
  return `$${r && r.facteur < 0 ? `-(${base})` : base}$`;
}

/** Lignes de repère des interfaces sur l'axe qui porte z (null : z n'est sur aucun des deux axes). */
function reperesInterfaces(e: ExportComsol, interfaces: readonly Interface[] | undefined, kz: number | undefined, axe: "x" | "y", facteur: number) {
  if (!interfaces?.length || kz === undefined) return undefined;
  return interfaces.map((i) => ({ axe, valeur: Number((versRepere(e, kz, i.z) * facteur).toPrecision(10)), texte: i.texte, trait: "dashed" as const }));
}

/**
 * Profils superposés : un graphe avec une série par (export, expression). Profil vertical : valeur en
 * abscisse, cote (ou profondeur) en ordonnée ; profil horizontal : position en abscisse, valeur en ordonnée.
 */
export function grapheProfils(exports: readonly ExportComsol[], o: OptionsProfils): GraphDoc {
  const profils = exports.filter((e) => geometrie(e).genre === "profil");
  if (!profils.length) throw new Error("Aucun profil (ligne) parmi ces exports : pour une coupe, extraire d'abord un profil.");
  const noms = o.noms ?? legendes(exports);
  const estZ = profils.every((e) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));
  const vertical = o.orientation === "verticale" || (o.orientation !== "horizontale" && estZ);
  // z déjà passé en profondeur positive par un changement de repère : ne pas le retourner une seconde fois
  const retourne = estZ && profils.every((e) => (e.repere?.[geometrie(e).varient[0]!]?.facteur ?? 1) < 0);
  const prof = !!o.profondeur || retourne;
  const signe = vertical && o.profondeur && !retourne ? -1 : 1;
  const series: Series[] = [];
  const unites = new Set<string>();
  const grandeurs = new Set<string>();
  for (const e of profils) {
    const k = geometrie(e).varient[0]!;
    const f = FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
    const coord = [...e.valeurs[k]!].map((v) => v * f * signe);
    for (const expr of o.expressions) {
      const j = e.colonnes.findIndex((c) => c.expression === expr);
      if (j < 0) continue;
      const lib = libelleColonne(e.colonnes[j]!);
      unites.add(lib.unite);
      grandeurs.add(lib.grandeur);
      const vals = [...e.valeurs[e.coordonnees.length + j]!];
      const pts = coord.map((c, i) => [c, vals[i]!] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      pts.sort((a, b) => a[0] - b[0]);
      const nom = o.expressions.length > 1 && profils.length > 1 ? `${lib.grandeur} — ${noms[exports.indexOf(e)]}` : o.expressions.length > 1 ? lib.grandeur : noms[exports.indexOf(e)]!;
      series.push({ name: nom, type: "line", x: vertical ? pts.map((p) => p[1]) : pts.map((p) => p[0]), y: vertical ? pts.map((p) => p[0]) : pts.map((p) => p[1]), legend: true });
    }
  }
  if (!series.length) throw new Error("Aucune des expressions choisies dans ces exports.");
  const g = [...grandeurs];
  const valeur = `${g.length === 1 ? g[0] : g.length <= 3 ? g.join(", ") : "Valeur"} (${[...unites].join(", ")})`;
  const nomCoord = titreCoordonnee(profils[0]!, geometrie(profils[0]!).varient[0]!);
  const coordNom = vertical && estZ ? (o.profondeur ? "Profondeur" : retourne ? nomCoord : "$z$") : nomCoord;
  const coord = `${coordNom} (${o.longueur})`;
  // cote : de la surface (0) au point le plus bas, arrondi
  const toutes = series.flatMap((s) => (vertical ? s.y : s.x));
  const extreme = vertical && prof ? Math.max(...toutes) : Math.min(...toutes);
  const pas = 10 ** Math.floor(Math.log10(Math.abs(extreme) || 1) - 1);
  const borne = vertical && prof ? Math.ceil(extreme / pas - 1e-9) * pas : Math.floor(extreme / pas + 1e-9) * pas;
  const p0 = profils[0]!;
  const k0 = geometrie(p0).varient[0]!;
  const lignes = estZ ? reperesInterfaces(p0, o.interfaces, k0, vertical ? "y" : "x", (FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[p0.uniteLongueur] ?? 1)) * signe) : undefined;
  // profondeur positive : vers le bas (axe inversé), de la surface (0) au point le plus bas
  const profond = vertical && estZ && prof;
  return {
    format: GRAPH_FORMAT,
    width: vertical ? 90 : 130,
    height: vertical ? 110 : 80,
    theme: "these",
    x: { label: vertical ? valeur : coord, log: false },
    y: { label: vertical ? coord : valeur, log: false, ...(vertical && estZ && !prof && extreme < 0 ? { min: borne, max: 0 } : profond && extreme > 0 ? { min: 0, max: borne } : {}), ...(profond ? { inverse: true } : {}) },
    legend: coinLibre(series),
    grid: true,
    bar_width: 3,
    ...(lignes ? { reperes: lignes } : {}),
    series,
  };
}

/**
 * Profil extrait d'une coupe régulière : la ligne de la grille la plus proche de `valeur` le long de la
 * coordonnée `fixe` (par exemple Y = 5,2 m dans une coupe YZ → profil vertical en Z). Renvoie un export
 * « profil » qu'on trace comme les autres.
 */
export function extraireProfil(e: ExportComsol, fixe: number, valeur: number): ExportComsol {
  const g = geometrie(e);
  if (g.genre !== "coupe" || !g.varient.includes(fixe)) throw new Error("Extraction possible seulement dans une coupe, le long d'une de ses deux coordonnées.");
  const grille = g.grilles[g.varient.indexOf(fixe)]!;
  const proche = grille.reduce((a, b) => (Math.abs(b - valeur) < Math.abs(a - valeur) ? b : a), grille[0]!);
  const tol = 1e-9 * Math.max(1, Math.abs(proche));
  const idx: number[] = [];
  e.valeurs[fixe]!.forEach((v, i) => Math.abs(v - proche) <= tol && idx.push(i));
  const nomCoord = e.coordonnees[fixe]!;
  return {
    ...e,
    nom: `${e.nom.replace(/\.(txt|csv|dat)$/i, "")} (${nomCoord} = ${Number(proche.toPrecision(6))} ${e.uniteLongueur})`,
    valeurs: e.valeurs.map((c) => Float64Array.from(idx.map((i) => c[i]!))),
    lignes: idx.length,
  };
}

// ---- Carte d'une coupe ----

/** Grille d'une coupe régulière : nœuds (unité de longueur choisie) et valeurs [ligne y][colonne x] (null : absente). */
type Grille = { x: number[]; y: number[]; v: (number | null)[][]; nomX: string; nomY: string };

/**
 * Grilles déjà construites, par colonne de valeurs puis par colonnes de coordonnées (partagées par les vues d'un
 * export à un instant, `vueEtape`) : la sonde, le curseur des instants et l'aperçu redemandent les mêmes à chaque
 * rendu. À lire seulement.
 */
const grillesConstruites = new WeakMap<Float64Array, WeakMap<Float64Array, WeakMap<Float64Array, Map<string, Grille>>>>();

export function grilleCoupe(e: ExportComsol, expression: string, longueur: UniteLongueur): Grille {
  const g = geometrie(e);
  if (g.genre !== "coupe" || !g.reguliere) throw new Error("Carte possible seulement pour une coupe sur grille régulière (sinon, choisir une autre lecture du fichier).");
  const j = e.colonnes.findIndex((c) => c.expression === expression);
  if (j < 0) throw new Error(`Expression absente : ${expression}.`);
  const [kx, ky] = g.varient as [number, number];
  const niveau = <K extends object, V>(m: WeakMap<K, V>, k: K, nouveau: () => V): V => {
    if (!m.has(k)) m.set(k, nouveau());
    return m.get(k)!;
  };
  const parCle = niveau(
    niveau(niveau(grillesConstruites, e.valeurs[e.coordonnees.length + j]!, () => new WeakMap()), e.valeurs[kx]!, () => new WeakMap()),
    e.valeurs[ky]!,
    () => new Map<string, Grille>(),
  );
  const cle = `${kx},${ky}|${longueur}|${e.uniteLongueur}|${e.lignes}|${e.coordonnees[kx]}|${e.coordonnees[ky]}`;
  const deja = parCle.get(cle);
  if (deja) return deja;
  const grille = construireGrille(e, g, j, kx, ky, longueur);
  parCle.set(cle, grille);
  return grille;
}

function construireGrille(e: ExportComsol, g: Geometrie, j: number, kx: number, ky: number, longueur: UniteLongueur): Grille {
  const f = FACTEUR_LONGUEUR[longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  const gx = g.grilles[0]!;
  const gy = g.grilles[1]!;
  const ix = new Map(gx.map((v, i) => [v, i]));
  const iy = new Map(gy.map((v, i) => [v, i]));
  const v: (number | null)[][] = gy.map(() => gx.map(() => null));
  const col = e.valeurs[e.coordonnees.length + j]!;
  for (let i = 0; i < e.lignes; i++) {
    const a = ix.get(Number(e.valeurs[kx]![i]!.toPrecision(10)));
    const b = iy.get(Number(e.valeurs[ky]![i]!.toPrecision(10)));
    if (a === undefined || b === undefined || !Number.isFinite(col[i]!)) continue;
    v[b]![a] = Number(col[i]!.toPrecision(8));
  }
  const r = (x: number) => Number((x * f).toPrecision(10));
  return { x: gx.map(r), y: gy.map(r), v, nomX: e.coordonnees[kx]!.toLowerCase(), nomY: e.coordonnees[ky]!.toLowerCase() };
}

/**
 * Carte d'une coupe en graphe modifiable (champ `carte` de `graph.json`) : palette divergente si les valeurs
 * changent de signe, viridis sinon ; hauteur choisie pour une exagération verticale raisonnable.
 */
export function grapheCarte(e: ExportComsol, expression: string, longueur: UniteLongueur, o: { interfaces?: readonly Interface[] } = {}): GraphDoc {
  const g = grilleCoupe(e, expression, longueur);
  const lib = libelleColonne(e.colonnes.find((c) => c.expression === expression)!);
  const [kx, ky] = geometrie(e).varient as [number, number];
  const f = FACTEUR_LONGUEUR[longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  const kz = e.coordonnees.findIndex((c) => /^z$/i.test(c));
  const lignes = kz === ky ? reperesInterfaces(e, o.interfaces, kz, "y", f) : kz === kx ? reperesInterfaces(e, o.interfaces, kz, "x", f) : undefined;
  // un axe retourné par changement de repère (profondeur positive) se lit vers le bas / la gauche
  const inv = (k: number) => ((e.repere?.[k]?.facteur ?? 1) < 0 ? { inverse: true } : {});
  const vals = g.v.flat().filter((x): x is number => x !== null);
  const div = vals.some((x) => x < 0) && vals.some((x) => x > 0);
  const lx = g.x.at(-1)! - g.x[0]!;
  const ly = g.y.at(-1)! - g.y[0]!;
  const largeur = 160;
  const boite = largeur - 16 - 3 - 3 - 3.5 - 11 - 5;
  const hauteur = Math.round(Math.max(45, Math.min(140, (boite * ly) / (lx || 1) + 15)));
  return {
    format: GRAPH_FORMAT,
    width: largeur,
    height: hauteur,
    theme: "these",
    x: { label: `${titreCoordonnee(e, kx)} (${longueur})`, log: false, min: g.x[0]!, max: g.x.at(-1)!, ...inv(kx) },
    y: { label: `${titreCoordonnee(e, ky)} (${longueur})`, log: false, min: g.y[0]!, max: g.y.at(-1)!, ...inv(ky) },
    legend: "none",
    grid: false,
    bar_width: 3,
    ...(lignes ? { reperes: lignes } : {}),
    carte: { x: g.x, y: g.y, v: g.v, palette: div ? "divergente" : "viridis", niveaux: 24, legende: `${lib.grandeur} (${lib.unite})`, inverser: false },
    series: [],
  };
}

/** Libellé de légende de la carte : « εzz (µdef) ». */
export function legendeCarte(e: ExportComsol, expression: string): string {
  const c = e.colonnes.find((x) => x.expression === expression);
  if (!c) return expression;
  const l = libelleColonne(c);
  return `${l.court} (${l.unite})`;
}
