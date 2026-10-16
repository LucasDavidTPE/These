/**
 * Calculs sur les exports COMSOL avant le tracé : colonnes calculées, changement de repère, opérations entre deux
 * fichiers de même grille, profils interpolés dans une coupe, séries temporelles (pic, décalage), tableau de
 * synthèse (extrema et positions, LaTeX booktabs, barres groupées), contour d'empreinte, réglages partagés.
 * Chaque résultat est un export (il rejoint la liste et se trace comme les autres) ou un graphe modifiable.
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  libelleColonne,
  legendes,
  parametresDe,
  type ColonneComsol,
  type Correspondance,
  type ExportComsol,
  type Interface,
  type LibelleColonne,
  type UniteLongueur,
} from "./comsol";
import { evaluerFormule } from "./formule";
import { GRAPH_FORMAT, type Annotation, type GraphDoc, type Repere, type Series } from "./model";

const nomCourt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");

/** Nombre en français, sans bruit (« 0,848 »). */
export const fr = (v: number, chiffres = 4) => String(Number(v.toPrecision(chiffres))).replace(".", ",").replace("-", "−");

// ---- Noms des colonnes dans les formules ----

/**
 * Noms utilisables dans une formule pour un export : `c1`, `c2`… (n° de colonne), le nom de variable COMSOL
 * (« solid.eZZ » → « ezz », « ep1 » → aussi « e1 »), et les coordonnées (« x », « y », « z », « t »). Un nom
 * porté par deux colonnes est ambigu : on l'écarte (reste `cN`).
 */
export function nomsColonnes(e: ExportComsol): Map<string, number> {
  const noms = new Map<string, number>();
  const ambigus = new Set<string>();
  const nc = e.coordonnees.length;
  const poser = (n: string, j: number) => {
    const k = n.toLowerCase();
    if (!/^[a-z_]\w*$/.test(k)) return;
    if (noms.has(k) && noms.get(k) !== j) ambigus.add(k);
    else noms.set(k, j);
  };
  e.coordonnees.forEach((c, k) => poser(c, k));
  if (e.nature === "table") poser("t", 0);
  e.colonnes.forEach((c, j) => {
    const base = c.expression.replace(/^\s*[0-9.eE+-]+\s*\*\s*/, "").trim();
    const v = base.split(".").pop()!;
    poser(v, nc + j);
    const p = /^([es])p([123])$/i.exec(v);
    if (p) poser(`${p[1]}${p[2]}`, nc + j);
    if (/^[A-Za-z_]\w*$/.test(c.expression)) poser(c.expression, nc + j);
  });
  for (const a of ambigus) noms.delete(a);
  e.colonnes.forEach((_, j) => noms.set(`c${j + 1}`, nc + j));
  return noms;
}

/** Ajoute une colonne calculée par une formule (« abs(ezz) », « max(e1, 0) », « exx + eyy »…). */
export function ajouterColonne(e: ExportComsol, o: { formule: string; nom: string; unite: string }): ExportComsol {
  const noms = nomsColonnes(e);
  const v = evaluerFormule(o.formule, e.lignes, (n) => {
    const j = noms.get(n.toLowerCase());
    return j === undefined ? null : e.valeurs[j]!;
  });
  const nom = o.nom.trim() || o.formule.trim();
  const libelle: LibelleColonne = { grandeur: nom, unite: o.unite.trim() || "-", court: nom };
  return { ...e, colonnes: [...e.colonnes, { expression: nom, unite: o.unite, solution: "", parametres: parametresDe(e), libelle }], valeurs: [...e.valeurs, v] };
}

/** Change le repère d'une coordonnée : nouvelle = facteur × (ancienne − origine) (z ↦ −z, y ↦ y − y0). */
export function changerRepere(e: ExportComsol, k: number, o: { facteur: number; origine: number }): ExportComsol {
  if (!(k >= 0 && k < e.coordonnees.length)) throw new Error("Coordonnée inconnue.");
  const ancien = e.repere?.[k] ?? { facteur: 1, origine: 0 };
  // composition : f2 (f1 (v − o1) − o2) = f1 f2 (v − (o1 + o2 / f1))
  const compose = { facteur: ancien.facteur * o.facteur, origine: ancien.origine + o.origine / ancien.facteur };
  const valeurs = e.valeurs.map((c, j) => (j === k ? Float64Array.from(c, (v) => o.facteur * (v - o.origine)) : c));
  const repere = { ...(e.repere ?? {}), [k]: compose };
  if (compose.facteur === 1 && Math.abs(compose.origine) < 1e-12) delete repere[k];
  return { ...e, valeurs, repere };
}

// ---- Opérations entre deux fichiers ----

export type Operation = "difference" | "rapport" | "ecart";
export const OPERATIONS: Record<Operation, string> = { difference: "A − B", rapport: "A / B", ecart: "Écart relatif (A − B) / |B| (%)" };

const cle = (e: ExportComsol, i: number) => e.valeurs.slice(0, e.coordonnees.length).map((c) => Number(c[i]!.toPrecision(9))).join(";");

/**
 * Opération point à point entre deux exports de même grille (mêmes coordonnées, dans n'importe quel ordre), sur
 * les expressions communes (ou celles demandées). Refus explicite si les grilles diffèrent.
 */
export function combiner(a: ExportComsol, b: ExportComsol, op: Operation, o: { expressions?: string[]; nomA?: string; nomB?: string } = {}): ExportComsol {
  if ((a.nature ?? "donnees") !== (b.nature ?? "donnees") || a.coordonnees.join() !== b.coordonnees.join())
    throw new Error(`Grilles différentes : ${a.nom} (${a.coordonnees.join(", ")}) et ${b.nom} (${b.coordonnees.join(", ")}) n'ont pas les mêmes coordonnées.`);
  const index = new Map<string, number>();
  for (let i = 0; i < b.lignes; i++) index.set(cle(b, i), i);
  const lignesB: number[] = [];
  const absents: number[] = [];
  for (let i = 0; i < a.lignes; i++) {
    const j = index.get(cle(a, i));
    if (j === undefined) absents.push(i);
    else lignesB.push(j);
  }
  if (absents.length || a.lignes !== b.lignes) {
    const ex = absents[0] !== undefined ? ` (par exemple ${a.coordonnees.map((c, k) => `${c} = ${fr(a.valeurs[k]![absents[0]!]!)}`).join(", ")})` : "";
    throw new Error(`Grilles différentes : ${a.lignes} points dans ${a.nom}, ${b.lignes} dans ${b.nom}${absents.length ? `, dont ${absents.length} de A absents de B${ex}` : ""}. Réexporter les deux cas sur la même grille.`);
  }
  const communes = a.colonnes.map((c) => c.expression).filter((x) => b.colonnes.some((c) => c.expression === x));
  const exprs = (o.expressions ?? communes).filter((x) => communes.includes(x));
  if (!exprs.length) throw new Error("Aucune expression commune aux deux fichiers.");
  const nA = o.nomA ?? nomCourt(a.nom);
  const nB = o.nomB ?? nomCourt(b.nom);
  const nc = a.coordonnees.length;
  const colonnes: ColonneComsol[] = [];
  const valeurs: Float64Array[] = a.valeurs.slice(0, nc).map((c) => Float64Array.from(c));
  for (const x of exprs) {
    const ja = a.colonnes.findIndex((c) => c.expression === x);
    const jb = b.colonnes.findIndex((c) => c.expression === x);
    const va = a.valeurs[nc + ja]!;
    const vb = b.valeurs[nc + jb]!;
    const l = libelleColonne(a.colonnes[ja]!);
    const res = new Float64Array(a.lignes);
    for (let i = 0; i < a.lignes; i++) {
      const p = va[i]!;
      const q = vb[lignesB[i]!]!;
      const r = op === "difference" ? p - q : op === "rapport" ? (q === 0 ? NaN : p / q) : q === 0 ? NaN : (100 * (p - q)) / Math.abs(q);
      res[i] = Number.isFinite(r) ? r : NaN;
    }
    const libelle: LibelleColonne =
      op === "difference"
        ? { grandeur: `$\\Delta$${l.grandeur}`, unite: l.unite, court: `Δ${l.court}` }
        : op === "rapport"
          ? { grandeur: `${l.grandeur} (rapport)`, unite: "-", court: `${l.court} A/B` }
          : { grandeur: `Écart relatif ${l.grandeur}`, unite: "%", court: `${l.court} écart` };
    colonnes.push({ ...a.colonnes[ja]!, libelle });
    valeurs.push(res);
  }
  const symbole = op === "difference" ? "−" : op === "rapport" ? "/" : "écart";
  return {
    ...a,
    nom: `${nA} ${symbole} ${nB}`,
    legende: op === "ecart" ? `(${nA} − ${nB}) / ${nB}` : `${nA} ${symbole} ${nB}`,
    colonnes,
    valeurs,
    forcer: a.forcer,
  };
}

// ---- Profils interpolés dans une coupe ----

/**
 * Profils le long d'une coupe régulière, à des valeurs choisies de la coordonnée `fixe` (unité du fichier),
 * interpolés linéairement entre les deux lignes de grille voisines (exact sur une ligne de la grille). Un profil
 * hors de la coupe est refusé.
 */
export function profilsInterpoles(e: ExportComsol, fixe: number, valeurs: readonly number[]): ExportComsol[] {
  const g = geometrie(e);
  if (g.genre !== "coupe" || !g.reguliere || !g.varient.includes(fixe)) throw new Error("Profils possibles seulement dans une coupe sur grille régulière, le long d'une de ses deux coordonnées.");
  const pos = g.varient.indexOf(fixe);
  const autre = g.varient[1 - pos]!;
  const gf = g.grilles[pos]!;
  const ga = g.grilles[1 - pos]!;
  const nc = e.coordonnees.length;
  const r10 = (v: number) => Number(v.toPrecision(10));
  // ligne de chaque nœud (valeur fixe, valeur de l'autre coordonnée)
  const idx = new Map<string, number>();
  for (let i = 0; i < e.lignes; i++) idx.set(`${r10(e.valeurs[fixe]![i]!)};${r10(e.valeurs[autre]![i]!)}`, i);
  return valeurs.map((v) => {
    if (!(v >= gf[0]! - 1e-12 && v <= gf.at(-1)! + 1e-12)) throw new Error(`${e.coordonnees[fixe]} = ${fr(v)} ${e.uniteLongueur} est hors de la coupe (${fr(gf[0]!)} à ${fr(gf.at(-1)!)}).`);
    let k = gf.findIndex((x, i) => i + 1 < gf.length && v >= x && v <= gf[i + 1]!);
    if (k < 0) k = gf.length - 2;
    const x0 = gf[k]!;
    const x1 = gf[k + 1] ?? x0;
    const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
    const cols = e.valeurs.map(() => new Float64Array(ga.length));
    ga.forEach((a, n) => {
      const i0 = idx.get(`${x0};${a}`);
      const i1 = idx.get(`${x1};${a}`);
      for (let j = 0; j < e.valeurs.length; j++) {
        if (j === fixe) cols[j]![n] = v;
        else if (j === autre) cols[j]![n] = a;
        else if (j < nc) cols[j]![n] = i0 === undefined ? NaN : e.valeurs[j]![i0]!;
        else {
          const p = i0 === undefined ? NaN : e.valeurs[j]![i0]!;
          const q = i1 === undefined ? NaN : e.valeurs[j]![i1]!;
          cols[j]![n] = t === 0 ? p : (1 - t) * p + t * q;
        }
      }
    });
    const nomC = e.coordonnees[fixe]!.toLowerCase();
    return {
      ...e,
      nom: `${nomCourt(e.nom)} (${e.coordonnees[fixe]} = ${fr(v, 6)} ${e.uniteLongueur})`,
      legende: `$${nomC}$ = ${fr(v, 6)} ${e.uniteLongueur}`,
      valeurs: cols,
      lignes: ga.length,
      forcer: [autre],
    };
  });
}

/** « 0,70 ; 0,848 ; 0.9 » → [0.7, 0.848, 0.9] (séparateurs : ; espaces, virgule décimale acceptée). */
export function lireValeurs(texte: string): number[] {
  return texte
    .split(/[;\s]+/)
    .map((t) => t.trim().replace(",", "."))
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

// ---- Séries temporelles ----

export type ModePic = "max" | "min" | "abs";

/** Pic d'un signal : plus grande valeur, plus petite, ou plus grande en valeur absolue (avec son signe). */
export function pic(x: ArrayLike<number>, y: ArrayLike<number>, mode: ModePic = "abs"): { i: number; x: number; y: number } | null {
  let best = -1;
  for (let i = 0; i < y.length; i++) {
    const v = y[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(x[i]!)) continue;
    if (best < 0) best = i;
    else if (mode === "max" ? v > y[best]! : mode === "min" ? v < y[best]! : Math.abs(v) > Math.abs(y[best]!)) best = i;
  }
  return best < 0 ? null : { i: best, x: x[best]!, y: y[best]! };
}

export interface OptionsTemporel {
  /** Expressions (colonnes) à tracer. */
  expressions: string[];
  /** Légende de chaque export (même ordre) ; sinon calculée. */
  noms?: string[];
  /** Valeur constante de référence (cas élastique), en trait horizontal. */
  reference?: { valeur: number; texte: string } | null;
  /** Instant de référence (10 s) : trait vertical, et décalage du pic par rapport à lui. */
  instant?: number | null;
  /** Pic à repérer et annoter (null : aucun). */
  pic?: ModePic | null;
}

/** Séries temporelles (exports de tables) superposées, avec référence, instant repère et pics annotés. */
export function grapheTemporel(exports: readonly ExportComsol[], o: OptionsTemporel): GraphDoc {
  const tables = exports.filter((e) => e.nature === "table");
  if (!tables.length) throw new Error("Aucun export de table (série temporelle) parmi ces fichiers.");
  const noms = o.noms ?? legendes(tables);
  const series: Series[] = [];
  const annotations: Annotation[] = [];
  const unites = new Set<string>();
  const grandeurs = new Set<string>();
  tables.forEach((e, k) => {
    for (const expr of o.expressions) {
      const j = e.colonnes.findIndex((c) => c.expression === expr);
      if (j < 0) continue;
      const lib = libelleColonne(e.colonnes[j]!);
      unites.add(lib.unite);
      grandeurs.add(lib.grandeur);
      const t = e.valeurs[0]!;
      const v = e.valeurs[1 + j]!;
      const pts = [...t].map((x, i) => [x, v[i]!] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      const nom = o.expressions.length > 1 && tables.length > 1 ? `${lib.grandeur} — ${noms[k]}` : o.expressions.length > 1 ? lib.grandeur : noms[k]!;
      series.push({ name: nom, type: "line", x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), legend: true });
      if (o.pic) {
        const p = pic(t, v, o.pic);
        if (p) {
          const dt = o.instant !== null && o.instant !== undefined ? ` ; Δt = ${p.x - o.instant >= 0 ? "+" : ""}${fr(p.x - o.instant, 3)} s` : "";
          // texte vers l'intérieur du graphe : sous un maximum, au-dessus d'un minimum, côté le plus libre en temps
          const finies = pts.map((q) => q[1]);
          const enHaut = p.y >= (Math.min(...finies) + Math.max(...finies)) / 2;
          const aDroite = p.x <= (pts[0]![0] + pts.at(-1)![0]) / 2;
          const position = `${enHaut ? "south" : "north"} ${aDroite ? "east" : "west"}` as Annotation["position"];
          annotations.push({ x: p.x, y: p.y, texte: `${fr(p.y)} ${lib.unite === "-" ? "" : lib.unite} à ${fr(p.x)} ${e.uniteArgument || "s"}${dt}`.replace("  ", " "), position });
        }
      }
    }
  });
  if (!series.length) throw new Error("Aucune des colonnes choisies dans ces tables.");
  const reperes: Repere[] = [];
  if (o.reference && Number.isFinite(o.reference.valeur)) reperes.push({ axe: "y", valeur: o.reference.valeur, texte: o.reference.texte, trait: "dashed" });
  if (o.instant !== null && o.instant !== undefined && Number.isFinite(o.instant)) reperes.push({ axe: "x", valeur: o.instant, texte: `$t$ = ${fr(o.instant)} s`, trait: "dotted" });
  const g = [...grandeurs];
  const arg = tables[0]!.coordonnees[0]!;
  const nomArg = /^(temps|time|t)$/i.test(arg) ? "$t$" : arg;
  return {
    format: GRAPH_FORMAT,
    width: 130,
    height: 80,
    theme: "these",
    x: { label: `${nomArg} (${tables[0]!.uniteArgument || "s"})`, log: false },
    y: { label: `${g.length === 1 ? g[0] : g.length <= 3 ? g.join(", ") : "Valeur"} (${[...unites].join(", ")})`, log: false },
    legend: "north west",
    grid: true,
    bar_width: 3,
    ...(reperes.length ? { reperes } : {}),
    ...(annotations.length ? { annotations } : {}),
    series,
  };
}

// ---- Tableau de synthèse ----

export interface LigneSynthese {
  fichier: string;
  /** Légende (mots qui diffèrent, correspondances). */
  legende: string;
  expression: string;
  libelle: LibelleColonne;
  max: number;
  posMax: Record<string, number>;
  min: number;
  posMin: Record<string, number>;
}

/** Max, min et leur position (coordonnées dans l'unité choisie) pour chaque fichier × expression. */
export function synthese(exports: readonly ExportComsol[], expressions: readonly string[], o: { longueur?: UniteLongueur; correspondances?: readonly Correspondance[] } = {}): LigneSynthese[] {
  const noms = legendes(exports, { correspondances: o.correspondances });
  const out: LigneSynthese[] = [];
  exports.forEach((e, k) => {
    const nc = e.coordonnees.length;
    const f = e.nature === "table" ? 1 : FACTEUR_LONGUEUR[o.longueur ?? e.uniteLongueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
    for (const x of expressions) {
      const j = e.colonnes.findIndex((c) => c.expression === x);
      if (j < 0) continue;
      const v = e.valeurs[nc + j]!;
      let iMax = -1;
      let iMin = -1;
      for (let i = 0; i < e.lignes; i++) {
        if (!Number.isFinite(v[i]!)) continue;
        if (iMax < 0 || v[i]! > v[iMax]!) iMax = i;
        if (iMin < 0 || v[i]! < v[iMin]!) iMin = i;
      }
      if (iMax < 0) continue;
      const pos = (i: number) => Object.fromEntries(e.coordonnees.map((c, kc) => [c, Number((e.valeurs[kc]![i]! * f).toPrecision(10))]));
      out.push({ fichier: e.nom, legende: noms[k]!, expression: x, libelle: libelleColonne(e.colonnes[j]!), max: v[iMax]!, posMax: pos(iMax), min: v[iMin]!, posMin: pos(iMin) });
    }
  });
  return out;
}

/** Tableau LaTeX booktabs (paquet booktabs) : une ligne par fichier × grandeur, max et min avec leur position. */
export function syntheseLatex(lignes: readonly LigneSynthese[], o: { longueur?: string; virgule?: boolean; chiffres?: number; legende?: string } = {}): string {
  if (!lignes.length) return "";
  const coords = Object.keys(lignes[0]!.posMax);
  const num = (v: number, ch = o.chiffres ?? 4) => {
    const t = String(Number(v.toPrecision(ch)));
    return `$${(o.virgule ? t.replace(".", "{,}") : t).replace("e", "\\mathrm{e}")}$`;
  };
  const esc = (t: string) => (t.includes("$") ? t : t.replace(/([&%#_{}])/g, "\\$1"));
  const u = o.longueur ? ` (${o.longueur})` : "";
  const out = [
    "% Tableau généré par Thèse (synthèse d'exports COMSOL). Nécessite \\usepackage{booktabs}.",
    "\\begin{table}[htbp]",
    "\\centering",
    ...(o.legende ? [`\\caption{${esc(o.legende)}}`] : []),
    `\\begin{tabular}{ll${"r".repeat(2 * (coords.length + 1))}}`,
    "\\toprule",
    ` & & \\multicolumn{${coords.length + 1}}{c}{Maximum} & \\multicolumn{${coords.length + 1}}{c}{Minimum} \\\\`,
    `\\cmidrule(lr){3-${3 + coords.length}} \\cmidrule(lr){${4 + coords.length}-${4 + 2 * coords.length}}`,
    `Cas & Grandeur & Valeur & ${coords.map((c) => `$${c.toLowerCase()}$${u}`).join(" & ")} & Valeur & ${coords.map((c) => `$${c.toLowerCase()}$${u}`).join(" & ")} \\\\`,
    "\\midrule",
  ];
  let precedent = "";
  for (const l of lignes) {
    const cas = l.legende === precedent ? "" : esc(l.legende);
    precedent = l.legende;
    out.push(
      `${cas} & ${esc(l.libelle.grandeur)} (${esc(l.libelle.unite)}) & ${num(l.max)} & ${coords.map((c) => num(l.posMax[c]!, 5)).join(" & ")} & ${num(l.min)} & ${coords.map((c) => num(l.posMin[c]!, 5)).join(" & ")} \\\\`,
    );
  }
  out.push("\\bottomrule", "\\end{tabular}", "\\end{table}", "");
  return out.join("\n");
}

/** Mots d'un nom de fichier, séparés par « _ » (« coupeXZ_R1_EL-fin_het.txt » → coupeXZ, R1, EL-fin, het). */
export const motsDuNom = (nom: string) => nomCourt(nom).split(/[_\s]+/).filter(Boolean);

export type Statistique = "max" | "min" | "abs";

/**
 * Barres groupées d'une synthèse : une catégorie par valeur du mot n° `categorie` des noms de fichiers (empreinte),
 * une série par valeur du mot n° `groupe` (matériau) ; valeur = max, min ou plus grande valeur absolue.
 */
export function grapheBarres(lignes: readonly LigneSynthese[], o: { expression: string; categorie: number; groupe: number; statistique: Statistique; correspondances?: readonly Correspondance[] }): GraphDoc {
  const choisies = lignes.filter((l) => l.expression === o.expression);
  if (!choisies.length) throw new Error("Aucune ligne de synthèse pour cette grandeur.");
  const table = new Map((o.correspondances ?? []).map((c) => [c.de.replace(/\s+/g, "").toLowerCase(), c.vers]));
  const traduire = (t: string) => table.get(t.toLowerCase()) ?? t;
  const mot = (l: LigneSynthese, n: number) => motsDuNom(l.fichier)[n] ?? "?";
  const categories = [...new Set(choisies.map((l) => mot(l, o.categorie)))];
  const groupes = [...new Set(choisies.map((l) => mot(l, o.groupe)))];
  const valeur = (l: LigneSynthese) => (o.statistique === "max" ? l.max : o.statistique === "min" ? l.min : Math.abs(l.max) >= Math.abs(l.min) ? l.max : l.min);
  const series: Series[] = groupes.map((g) => {
    const pts = categories
      .map((c, k) => {
        const l = choisies.find((x) => mot(x, o.categorie) === c && mot(x, o.groupe) === g);
        return l ? ([k + 1, valeur(l)] as const) : null;
      })
      .filter((p): p is readonly [number, number] => p !== null);
    return { name: traduire(g), type: "bar", x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), legend: true };
  });
  const lib = choisies[0]!.libelle;
  const stat = o.statistique === "max" ? "max" : o.statistique === "min" ? "min" : "extremum";
  return {
    format: GRAPH_FORMAT,
    width: 120,
    height: 75,
    theme: "these",
    x: { label: "", log: false, categories: categories.map(traduire) },
    y: { label: `${lib.grandeur} ${stat} (${lib.unite})`, log: false },
    legend: "north west",
    grid: false,
    bar_width: Math.max(2, Math.min(6, 60 / Math.max(1, categories.length * groupes.length))),
    series,
  };
}

// ---- Contour d'empreinte ----

export type Forme = { forme: "cercle"; cx: number; cy: number; r: number } | { forme: "rectangle"; cx: number; cy: number; lx: number; ly: number } | { forme: "courbe"; x: number[]; y: number[] };

/** Contour d'empreinte à superposer à une carte (coordonnées du graphe) : une série en trait noir, hors légende. */
export function contourEmpreinte(f: Forme, nom = "Empreinte"): Series {
  let x: number[];
  let y: number[];
  if (f.forme === "cercle") {
    if (!(f.r > 0)) throw new Error("Rayon du cercle : un nombre positif.");
    const n = 96;
    x = Array.from({ length: n + 1 }, (_, k) => f.cx + f.r * Math.cos((2 * Math.PI * k) / n));
    y = Array.from({ length: n + 1 }, (_, k) => f.cy + f.r * Math.sin((2 * Math.PI * k) / n));
  } else if (f.forme === "rectangle") {
    if (!(f.lx > 0 && f.ly > 0)) throw new Error("Côtés du rectangle : des nombres positifs.");
    const [a, b, c, d] = [f.cx - f.lx / 2, f.cx + f.lx / 2, f.cy - f.ly / 2, f.cy + f.ly / 2];
    x = [a, b, b, a, a];
    y = [c, c, d, d, c];
  } else {
    if (f.x.length < 2 || f.x.length !== f.y.length) throw new Error("Courbe : au moins deux points x y.");
    x = [...f.x];
    y = [...f.y];
  }
  return { name: nom, type: "line", x: x.map((v) => Number(v.toPrecision(10))), y: y.map((v) => Number(v.toPrecision(10))), legend: false, color: "#000000", mark: "none", dash: "solid" };
}

// ---- Réglages partagés (bibliothèque) ----

/** Dossier et fichier des réglages COMSOL, à la racine de la bibliothèque (partagés entre les deux PC). */
export const FICHIER_REGLAGES_COMSOL = "_comsol/reglages.json";
export const REGLAGES_COMSOL_FORMAT = "these-comsol/1";

export interface ReglagesComsol {
  format: typeof REGLAGES_COMSOL_FORMAT;
  correspondances: Correspondance[];
  /** Interfaces de couches (cote z en unité des fichiers, m). */
  interfaces: Interface[];
}

export function reglagesComsolDefaut(): ReglagesComsol {
  return {
    format: REGLAGES_COMSOL_FORMAT,
    correspondances: [
      { de: "lc=1", vers: "Rectangulaire" },
      { de: "lc=2", vers: "Circulaire" },
      { de: "lc=3", vers: "Hétérogène" },
      { de: "VE=0", vers: "Élastique" },
      { de: "VE=1", vers: "Viscoélastique" },
    ],
    interfaces: [
      { z: -0.08, texte: "BB/GB" },
      { z: -0.32, texte: "GB/GRH" },
    ],
  };
}

/** Lecture tolérante de `_comsol/reglages.json` (entrées incomplètes ignorées). */
export function lireReglagesComsol(raw: unknown): ReglagesComsol {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : []);
  return {
    format: REGLAGES_COMSOL_FORMAT,
    correspondances: liste(r.correspondances)
      .filter((c) => typeof c.de === "string" && typeof c.vers === "string")
      .map((c) => ({ de: c.de as string, vers: c.vers as string })),
    interfaces: liste(r.interfaces)
      .filter((i) => typeof i.z === "number" && Number.isFinite(i.z))
      .map((i) => ({ z: i.z as number, texte: typeof i.texte === "string" ? i.texte : "" })),
  };
}
