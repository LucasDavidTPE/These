/**
 * Exports « Données » de COMSOL (fichiers .txt / .csv : lignes d'en-tête `% Clé: valeur`, puis une ligne
 * `% X Y Z expr (unité) @ solution: paramètres…` et les valeurs). Un export est un profil (une coordonnée
 * varie : ligne verticale ou horizontale), une coupe (deux coordonnées : plan) ou un nuage. On en tire des
 * graphes propres : profils superposés (une série par fichier ou par expression), profil extrait d'une
 * coupe, ou carte en couleurs d'une coupe.
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
}

export const estComsol = (texte: string) => /^\uFEFF?%\s*(Model|Modèle|Version|Dimension|Nodes)\s*:/m.test(texte.slice(0, 2000));

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
    const m = /^@\s*([^:]*):\s*(.*)$/.exec(suite);
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

/** Libellé lisible d'une expression, en notation pgfplots (« $\varepsilon_{zz}$ (µdef) »). */
export function libelleExpression(c: Pick<ColonneComsol, "expression" | "unite">): { grandeur: string; unite: string; court: string } {
  const m = /^\s*([0-9.eE+-]+)\s*\*\s*(.+)$/.exec(c.expression);
  const facteur = m ? String(Number(m[1])) : "1";
  const base = (m ? m[2]! : c.expression).trim();
  const nomVar = base.split(".").pop()!;
  let grandeur = base;
  let court = nomVar;
  const tenseur = /^([es])([XYZxyz])([XYZxyz])$/.exec(nomVar);
  const princ = /^([es])p([123])$/.exec(nomVar);
  if (tenseur) {
    const i = `${tenseur[2]}${tenseur[3]}`.toLowerCase();
    grandeur = `$${tenseur[1] === "e" ? "\\varepsilon" : "\\sigma"}_{${i}}$`;
    court = `${tenseur[1] === "e" ? "ε" : "σ"}${i}`;
  } else if (princ) {
    grandeur = `$${princ[1] === "e" ? "\\varepsilon" : "\\sigma"}_{${princ[2]}}$`;
    court = `${princ[1] === "e" ? "ε" : "σ"}${princ[2]}`;
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
  genre: "point" | "profil" | "coupe" | "volume";
  /** Pour une coupe : valeurs distinctes de chaque coordonnée qui varie, et grille complète ou non. */
  grilles: number[][];
  reguliere: boolean;
}

const distinctes = (v: Float64Array) => [...new Set([...v].filter(Number.isFinite).map((x) => Number(x.toPrecision(10))))].sort((a, b) => a - b);

export function geometrie(e: ExportComsol): Geometrie {
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
  const c = e.coordonnees;
  const out = c.map((n, k) => ({ libelle: `Profil selon ${n}`, forcer: [k] }));
  for (let a = 0; a < c.length; a++) for (let b = 0; b < c.length; b++) if (a !== b) out.push({ libelle: `Coupe ${c[a]} (horizontal) × ${c[b]} (vertical)`, forcer: [a, b] });
  return out;
}

/** « profil vertical (Z), 161 points », « coupe YZ, 263 × 65 points ». */
export function descriptionGeometrie(e: ExportComsol): string {
  const g = geometrie(e);
  const noms = g.varient.map((k) => e.coordonnees[k]!).join("");
  if (g.genre === "profil") return `profil ${/^z$/i.test(noms) ? "vertical" : "horizontal"} (${noms}), ${e.lignes} points`;
  if (g.genre === "coupe") return `coupe ${noms}, ${g.reguliere ? `${g.grilles[0]!.length} × ${g.grilles[1]!.length}` : e.lignes} points`;
  if (g.genre === "volume") return `nuage 3D, ${e.lignes} points`;
  return `${e.lignes} point(s)`;
}

/** Paramètres de l'étude d'un export (ceux de sa première expression). */
export const parametresDe = (e: ExportComsol): Record<string, string> => e.colonnes[0]?.parametres ?? {};

/**
 * Légende de chaque export : les mots qui diffèrent d'un nom de fichier à l'autre (« el lc3 het » /
 * « ve lc1 rect ») ; à défaut, les paramètres de l'étude qui diffèrent (« lc=3, VE=0 ») ; à défaut, le nom.
 */
export function legendes(exports: readonly ExportComsol[]): string[] {
  const nomCourt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
  if (exports.length <= 1) return exports.map((e) => nomCourt(e.nom));
  const morceaux = exports.map((e) => nomCourt(e.nom).split(/[_\-\s]+/).filter(Boolean));
  const communs = new Set(morceaux[0]!.filter((m) => morceaux.every((x) => x.includes(m))));
  const parNom = morceaux.map((m) => m.filter((x) => !communs.has(x)).join(" "));
  if (parNom.every(Boolean) && new Set(parNom).size === parNom.length) return parNom;
  const cles = [...new Set(exports.flatMap((e) => Object.keys(parametresDe(e))))];
  const differents = cles.filter((k) => new Set(exports.map((e) => parametresDe(e)[k] ?? "")).size > 1);
  const parParam = exports.map((e) => differents.map((k) => `${k}=${parametresDe(e)[k] ?? "?"}`).join(", "));
  if (differents.length && new Set(parParam).size === parParam.length) return parParam;
  return exports.map((e) => nomCourt(e.nom));
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
const FACTEUR_LONGUEUR: Record<string, number> = { m: 1, cm: 100, mm: 1000, km: 1e-3 };

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
  const series: Series[] = [];
  const unites = new Set<string>();
  const grandeurs = new Set<string>();
  for (const e of profils) {
    const k = geometrie(e).varient[0]!;
    const f = FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
    const coord = [...e.valeurs[k]!].map((v) => v * f * (vertical && o.profondeur ? -1 : 1));
    for (const expr of o.expressions) {
      const j = e.colonnes.findIndex((c) => c.expression === expr);
      if (j < 0) continue;
      const lib = libelleExpression(e.colonnes[j]!);
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
  const nomCoord = `$${profils[0]!.coordonnees[geometrie(profils[0]!).varient[0]!]!.toLowerCase()}$`;
  const coordNom = vertical && estZ ? (o.profondeur ? "Profondeur" : "$z$") : nomCoord;
  const coord = `${coordNom} (${o.longueur})`;
  // cote : de la surface (0) au point le plus bas, arrondi
  const toutes = series.flatMap((s) => (vertical ? s.y : s.x));
  const extreme = vertical && o.profondeur ? Math.max(...toutes) : Math.min(...toutes);
  const pas = 10 ** Math.floor(Math.log10(Math.abs(extreme) || 1) - 1);
  const borne = vertical && o.profondeur ? Math.ceil(extreme / pas - 1e-9) * pas : Math.floor(extreme / pas + 1e-9) * pas;
  return {
    format: GRAPH_FORMAT,
    width: vertical ? 90 : 130,
    height: vertical ? 110 : 80,
    theme: "these",
    x: { label: vertical ? valeur : coord, log: false },
    y: { label: vertical ? coord : valeur, log: false, ...(vertical && estZ && !o.profondeur && extreme < 0 ? { min: borne, max: 0 } : vertical && estZ && o.profondeur && extreme > 0 ? { min: 0, max: borne } : {}) },
    legend: coinLibre(series),
    grid: true,
    bar_width: 3,
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
export function grilleCoupe(e: ExportComsol, expression: string, longueur: UniteLongueur): { x: number[]; y: number[]; v: (number | null)[][]; nomX: string; nomY: string } {
  const g = geometrie(e);
  if (g.genre !== "coupe" || !g.reguliere) throw new Error("Carte possible seulement pour une coupe sur grille régulière (sinon, choisir une autre lecture du fichier).");
  const j = e.colonnes.findIndex((c) => c.expression === expression);
  if (j < 0) throw new Error(`Expression absente : ${expression}.`);
  const [kx, ky] = g.varient as [number, number];
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
export function grapheCarte(e: ExportComsol, expression: string, longueur: UniteLongueur): GraphDoc {
  const g = grilleCoupe(e, expression, longueur);
  const lib = libelleExpression(e.colonnes.find((c) => c.expression === expression)!);
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
    x: { label: `$${g.nomX}$ (${longueur})`, log: false, min: g.x[0]!, max: g.x.at(-1)! },
    y: { label: `$${g.nomY}$ (${longueur})`, log: false, min: g.y[0]!, max: g.y.at(-1)! },
    legend: "none",
    grid: false,
    bar_width: 3,
    carte: { x: g.x, y: g.y, v: g.v, palette: div ? "divergente" : "viridis", niveaux: 24, legende: `${lib.grandeur} (${lib.unite})`, inverser: false },
    series: [],
  };
}

/** Libellé de légende de la carte : « εzz (µdef) ». */
export function legendeCarte(e: ExportComsol, expression: string): string {
  const c = e.colonnes.find((x) => x.expression === expression);
  if (!c) return expression;
  const l = libelleExpression(c);
  return `${l.court} (${l.unite})`;
}
