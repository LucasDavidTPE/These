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
  const varient = e.coordonnees.map((_, k) => k).filter((k) => {
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
}

/**
 * Profils superposés : un graphe avec une série par (export, expression). Profil vertical : valeur en
 * abscisse, cote (ou profondeur) en ordonnée ; profil horizontal : position en abscisse, valeur en ordonnée.
 */
export function grapheProfils(exports: readonly ExportComsol[], o: OptionsProfils): GraphDoc {
  const profils = exports.filter((e) => geometrie(e).genre === "profil");
  if (!profils.length) throw new Error("Aucun profil (ligne) parmi ces exports : pour une coupe, extraire d'abord un profil.");
  const noms = o.noms ?? legendes(exports);
  const vertical = profils.every((e) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));
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
  const coordNom = vertical ? (o.profondeur ? "Profondeur" : "$z$") : `$${profils[0]!.coordonnees[geometrie(profils[0]!).varient[0]!]!.toLowerCase()}$`;
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
    y: { label: vertical ? coord : valeur, log: false, ...(vertical && !o.profondeur ? { min: borne, max: 0 } : vertical ? { min: 0, max: borne } : {}) },
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

export interface Carte {
  /** Abscisses et ordonnées de la grille (unités de longueur choisies), valeurs [ligne y][colonne x]. */
  x: number[];
  y: number[];
  v: number[][];
  min: number;
  max: number;
  nomX: string;
  nomY: string;
}

export function carte(e: ExportComsol, expression: string, longueur: UniteLongueur): Carte {
  const g = geometrie(e);
  if (g.genre !== "coupe" || !g.reguliere) throw new Error("Carte possible seulement pour une coupe sur grille régulière.");
  const j = e.colonnes.findIndex((c) => c.expression === expression);
  if (j < 0) throw new Error(`Expression absente : ${expression}.`);
  const [kx, ky] = g.varient as [number, number];
  const f = FACTEUR_LONGUEUR[longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  const gx = g.grilles[0]!;
  const gy = g.grilles[1]!;
  const ix = new Map(gx.map((v, i) => [v, i]));
  const iy = new Map(gy.map((v, i) => [v, i]));
  const v = gy.map(() => gx.map(() => NaN));
  const col = e.valeurs[e.coordonnees.length + j]!;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < e.lignes; i++) {
    const a = ix.get(Number(e.valeurs[kx]![i]!.toPrecision(10)));
    const b = iy.get(Number(e.valeurs[ky]![i]!.toPrecision(10)));
    if (a === undefined || b === undefined) continue;
    const x = col[i]!;
    v[b]![a] = x;
    if (Number.isFinite(x)) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return { x: gx.map((x) => x * f), y: gy.map((y) => y * f), v, min, max, nomX: e.coordonnees[kx]!.toLowerCase(), nomY: e.coordonnees[ky]!.toLowerCase() };
}

/** Viridis (séquentielle) et rouge-bleu (divergente), 9 repères chacune. */
const VIRIDIS = ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"];
const ROUGE_BLEU = ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"];

function interpCouleur(echelle: string[], t: number): string {
  const u = Math.max(0, Math.min(1, t)) * (echelle.length - 1);
  const i = Math.min(echelle.length - 2, Math.floor(u));
  const f = u - i;
  const a = echelle[i]!;
  const b = echelle[i + 1]!;
  const c = (s: string, k: number) => parseInt(s.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `#${[0, 1, 2].map((k) => Math.round(c(a, k) + f * (c(b, k) - c(a, k))).toString(16).padStart(2, "0")).join("")}`;
}

const nb = (x: number) => String(Number(x.toPrecision(4))).replace(/^-/, "−").replace(".", ",");

/**
 * Carte en couleurs d'une coupe, en SVG autonome : cellules de la grille (regroupées par plages de même
 * couleur), axes gradués, barre de couleurs. Échelle divergente centrée sur 0 si les valeurs changent de
 * signe, sinon viridis. `exageration` : facteur d'échelle verticale (coupes de chaussée très allongées).
 */
export function carteSvg(c: Carte, o: { titre?: string; legende: string; uniteLongueur: string; exageration?: number; niveaux?: number; largeur?: number }): string {
  const niveaux = o.niveaux ?? 24;
  const div = c.min < 0 && c.max > 0;
  const borne = Math.max(Math.abs(c.min), Math.abs(c.max));
  const [lo, hi] = div ? [-borne, borne] : [c.min, c.max];
  const echelle = div ? ROUGE_BLEU : VIRIDIS;
  const niveau = (v: number) => Math.min(niveaux - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo || 1)) * niveaux)));
  const couleurNiveau = (k: number) => interpCouleur(echelle, (k + 0.5) / niveaux);

  const W = o.largeur ?? 640;
  const M = { g: 64, d: 90, h: o.titre ? 34 : 14, b: 44 };
  const lx = c.x.at(-1)! - c.x[0]!;
  const ly = c.y.at(-1)! - c.y[0]!;
  const pw = W - M.g - M.d;
  const ph = Math.max(60, Math.min(600, (pw * ly * (o.exageration ?? 1)) / (lx || 1)));
  const H = M.h + ph + M.b;
  const px = (x: number) => M.g + ((x - c.x[0]!) / (lx || 1)) * pw;
  const py = (y: number) => M.h + (1 - (y - c.y[0]!) / (ly || 1)) * ph;
  // bornes des cellules : milieux entre nœuds
  const bord = (g: number[], i: number, cote: -1 | 1) => (cote < 0 ? (i === 0 ? g[0]! : (g[i - 1]! + g[i]!) / 2) : i === g.length - 1 ? g[i]! : (g[i]! + g[i + 1]!) / 2);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H)}" viewBox="0 0 ${W} ${Math.round(H)}" font-family="Segoe UI, Arial, sans-serif">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ];
  if (o.titre) out.push(`<text x="${M.g}" y="20" font-size="14" font-weight="600" fill="#1d1d1b">${echapper(o.titre)}</text>`);
  out.push(`<g shape-rendering="crispEdges">`);
  c.y.forEach((_, j) => {
    const y0 = py(bord(c.y, j, 1));
    const y1 = py(bord(c.y, j, -1));
    let i = 0;
    while (i < c.x.length) {
      const v = c.v[j]![i]!;
      if (!Number.isFinite(v)) {
        i++;
        continue;
      }
      const k = niveau(v);
      let fin = i;
      while (fin + 1 < c.x.length && Number.isFinite(c.v[j]![fin + 1]!) && niveau(c.v[j]![fin + 1]!) === k) fin++;
      const x0 = px(bord(c.x, i, -1));
      const x1 = px(bord(c.x, fin, 1));
      out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0 + 0.3)}" height="${r2(y1 - y0 + 0.3)}" fill="${couleurNiveau(k)}"/>`);
      i = fin + 1;
    }
  });
  out.push(`</g>`, `<rect x="${M.g}" y="${M.h}" width="${r2(pw)}" height="${r2(ph)}" fill="none" stroke="#333" stroke-width="0.8"/>`);
  // graduations
  for (const t of graduer(c.x[0]!, c.x.at(-1)!, 7)) out.push(`<line x1="${r2(px(t))}" y1="${r2(M.h + ph)}" x2="${r2(px(t))}" y2="${r2(M.h + ph + 4)}" stroke="#333"/><text x="${r2(px(t))}" y="${r2(M.h + ph + 16)}" font-size="11" text-anchor="middle" fill="#333">${nb(t)}</text>`);
  for (const t of graduer(c.y[0]!, c.y.at(-1)!, 5)) out.push(`<line x1="${M.g - 4}" y1="${r2(py(t))}" x2="${M.g}" y2="${r2(py(t))}" stroke="#333"/><text x="${M.g - 7}" y="${r2(py(t) + 4)}" font-size="11" text-anchor="end" fill="#333">${nb(t)}</text>`);
  out.push(`<text x="${r2(M.g + pw / 2)}" y="${r2(H - 8)}" font-size="12" text-anchor="middle" fill="#1d1d1b">${c.nomX} (${o.uniteLongueur})</text>`);
  out.push(`<text transform="translate(16 ${r2(M.h + ph / 2)}) rotate(-90)" font-size="12" text-anchor="middle" fill="#1d1d1b">${c.nomY} (${o.uniteLongueur})</text>`);
  // barre de couleurs
  const bx = W - M.d + 18;
  const bh = Math.max(60, ph);
  for (let k = 0; k < niveaux; k++) out.push(`<rect x="${bx}" y="${r2(M.h + bh - ((k + 1) * bh) / niveaux)}" width="14" height="${r2(bh / niveaux + 0.3)}" fill="${couleurNiveau(k)}"/>`);
  out.push(`<rect x="${bx}" y="${M.h}" width="14" height="${r2(bh)}" fill="none" stroke="#333" stroke-width="0.6"/>`);
  for (const t of graduer(lo, hi, 5)) {
    const y = M.h + bh - ((t - lo) / (hi - lo || 1)) * bh;
    out.push(`<line x1="${bx + 14}" y1="${r2(y)}" x2="${bx + 18}" y2="${r2(y)}" stroke="#333"/><text x="${bx + 21}" y="${r2(y + 4)}" font-size="10.5" fill="#333">${nb(t)}</text>`);
  }
  out.push(`<text x="${bx}" y="${M.h - 4}" font-size="11" fill="#1d1d1b">${echapper(o.legende)}</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function graduer(a: number, b: number, n: number): number[] {
  const etendue = b - a;
  if (!(etendue > 0)) return [a];
  const brut = etendue / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => etendue / s <= n) ?? 10 * p;
  const out: number[] = [];
  for (let t = Math.ceil(a / pas - 1e-9) * pas; t <= b + 1e-9 * etendue; t += pas) out.push(Math.abs(t) < pas * 1e-9 ? 0 : Number(t.toPrecision(10)));
  return out;
}

/** Libellé de légende de la carte : « εzz (µdef) ». */
export function legendeCarte(e: ExportComsol, expression: string): string {
  const c = e.colonnes.find((x) => x.expression === expression);
  if (!c) return expression;
  const l = libelleExpression(c);
  return `${l.court} (${l.unite})`;
}
