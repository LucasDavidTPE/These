/**
 * Modèle d'un graphe (SPEC §10), stocké dans `graph.json` (kind = graph).
 */
import { parseCarte, type CarteDoc } from "./carte";
import { parseFit, type SeriesFit } from "./fit";
import { parseSeriesLook, parseStyle, type GraphStyle, type SeriesLook } from "./style";

export const GRAPH_FORMAT = "figurine-graph/1";

export type SeriesType = "line" | "points" | "linepoints" | "bar";
export type LegendPos = "north east" | "north west" | "south east" | "south west" | "none";

export interface Series extends SeriesLook {
  name: string;
  type: SeriesType;
  x: number[];
  y: number[];
  /** Apparaît dans la légende. */
  legend: boolean;
  /** Régression tracée par-dessus la série. */
  fit?: SeriesFit;
}

export interface AxisSpec {
  label: string;
  log: boolean;
  /** Bornes imposées ; sinon calculées (valeurs « rondes »). */
  min?: number;
  max?: number;
  /** Sens inversé (profondeur croissante vers le bas). */
  inverse?: boolean;
  /** Noms des catégories d'un diagramme en barres : x = 1, 2, 3… prend le nom n° 1, 2, 3… */
  categories?: string[];
}

export type Trait = "solid" | "dashed" | "dotted";
export const TRAITS: Trait[] = ["solid", "dashed", "dotted"];

/** Ligne de repère sur toute la largeur (axe y : valeur constante) ou la hauteur (axe x) de la boîte. */
export interface Repere {
  axe: "x" | "y";
  valeur: number;
  texte: string;
  trait: Trait;
}

export type Coin = Exclude<LegendPos, "none">;

/** Point marqué et commenté (pic d'un signal…) ; le texte est placé du côté `position` du point. */
export interface Annotation {
  x: number;
  y: number;
  texte: string;
  position: Coin;
}

export interface GraphDoc {
  format: typeof GRAPH_FORMAT;
  /** Taille totale en mm (axes, graduations et titres compris). */
  width: number;
  height: number;
  theme: string;
  x: AxisSpec;
  y: AxisSpec;
  legend: LegendPos;
  grid: boolean;
  /** Largeur des barres (mm). */
  bar_width: number;
  /** Apparence (palette, cadre, épaisseurs) ; absent : rendu du thème. */
  style?: GraphStyle;
  /** Coin des équations de régression ; absent : opposé à la légende. */
  fit_pos?: Exclude<LegendPos, "none">;
  /** Carte en couleurs sous les courbes (coupe 2D) ; absente : graphe ordinaire. */
  carte?: CarteDoc;
  /** Même échelle sur les deux axes (1 m = 1 m) : la hauteur suit la largeur. */
  egalite?: boolean;
  reperes?: Repere[];
  annotations?: Annotation[];
  series: Series[];
}

export interface GraphError {
  path: string;
  message: string;
}

export function emptyGraph(): GraphDoc {
  return {
    format: GRAPH_FORMAT,
    width: 120,
    height: 80,
    theme: "these",
    x: { label: "", log: false },
    y: { label: "", log: false },
    legend: "north east",
    grid: false,
    bar_width: 3,
    series: [],
  };
}

const TYPES: SeriesType[] = ["line", "points", "linepoints", "bar"];
const LEGENDS: LegendPos[] = ["north east", "north west", "south east", "south west", "none"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validation de `graph.json` (valeurs par défaut pour les champs facultatifs). */
export function validateGraph(raw: unknown): { ok: true; doc: GraphDoc } | { ok: false; errors: GraphError[] } {
  const errors: GraphError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  if (!isRecord(raw)) return { ok: false, errors: [{ path: "", message: "graph.json doit contenir un objet JSON." }] };
  if (raw.format !== GRAPH_FORMAT) err("format", `format « ${String(raw.format)} » inconnu (attendu ${GRAPH_FORMAT}).`);
  const d = emptyGraph();
  const num = (k: string, min: number, max: number): number => {
    const v = raw[k] ?? (d as unknown as Record<string, unknown>)[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      err(k, `doit être un nombre entre ${min} et ${max}.`);
      return min;
    }
    return v;
  };
  const axis = (k: "x" | "y"): AxisSpec => {
    const a = raw[k] ?? {};
    if (!isRecord(a)) {
      err(k, "doit être un objet.");
      return d[k];
    }
    const out: AxisSpec = { label: typeof a.label === "string" ? a.label : "", log: a.log === true };
    if (a.inverse === true) out.inverse = true;
    if (Array.isArray(a.categories) && a.categories.length && a.categories.every((c) => typeof c === "string")) out.categories = [...(a.categories as string[])];
    for (const b of ["min", "max"] as const) {
      if (a[b] === undefined || a[b] === null) continue;
      if (typeof a[b] !== "number" || !Number.isFinite(a[b])) err(`${k}.${b}`, "doit être un nombre.");
      else out[b] = a[b] as number;
    }
    if (out.min !== undefined && out.max !== undefined && !(out.min < out.max)) err(k, "min doit être inférieur à max.");
    if (out.log && out.min !== undefined && out.min <= 0) err(`${k}.min`, "doit être > 0 en échelle logarithmique.");
    return out;
  };
  const doc: GraphDoc = {
    format: GRAPH_FORMAT,
    width: num("width", 20, 1000),
    height: num("height", 20, 1000),
    theme: typeof raw.theme === "string" ? raw.theme : "these",
    x: axis("x"),
    y: axis("y"),
    legend: LEGENDS.includes(raw.legend as LegendPos) ? (raw.legend as LegendPos) : raw.legend === undefined ? d.legend : (err("legend", "position inconnue."), d.legend),
    grid: raw.grid === true,
    bar_width: num("bar_width", 0.2, 100),
    series: [],
  };
  const style = parseStyle(raw.style);
  if (style) doc.style = style;
  if (LEGENDS.includes(raw.fit_pos as LegendPos) && raw.fit_pos !== "none") doc.fit_pos = raw.fit_pos as Exclude<LegendPos, "none">;
  const carte = parseCarte(raw.carte, err);
  if (carte) doc.carte = carte;
  if (raw.egalite === true) doc.egalite = true;
  const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (Array.isArray(raw.reperes)) {
    const r = raw.reperes.filter((x): x is Record<string, unknown> => isRecord(x) && (x.axe === "x" || x.axe === "y") && fini(x.valeur));
    if (r.length) doc.reperes = r.map((x) => ({ axe: x.axe as "x" | "y", valeur: x.valeur as number, texte: typeof x.texte === "string" ? x.texte : "", trait: TRAITS.includes(x.trait as Trait) ? (x.trait as Trait) : "dashed" }));
  }
  if (Array.isArray(raw.annotations)) {
    const a = raw.annotations.filter((x): x is Record<string, unknown> => isRecord(x) && fini(x.x) && fini(x.y));
    if (a.length)
      doc.annotations = a.map((x) => ({ x: x.x as number, y: x.y as number, texte: typeof x.texte === "string" ? x.texte : "", position: LEGENDS.includes(x.position as LegendPos) && x.position !== "none" ? (x.position as Coin) : "north east" }));
  }
  if (!Array.isArray(raw.series)) err("series", "doit être une liste.");
  (Array.isArray(raw.series) ? raw.series : []).forEach((s: unknown, i) => {
    const p = `series[${i}]`;
    if (!isRecord(s)) return err(p, "doit être un objet.");
    const x = s.x;
    const y = s.y;
    const nums = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));
    if (!nums(x) || !nums(y)) return err(p, "x et y doivent être des listes de nombres.");
    if ((x as number[]).length !== (y as number[]).length) return err(p, "x et y doivent avoir la même longueur.");
    const type = TYPES.includes(s.type as SeriesType) ? (s.type as SeriesType) : "linepoints";
    doc.series.push({ name: typeof s.name === "string" ? s.name : `Série ${i + 1}`, type, x: [...(x as number[])], y: [...(y as number[])], legend: s.legend !== false, ...parseSeriesLook(s) });
    const fit = parseFit(s.fit);
    if (fit) doc.series.at(-1)!.fit = fit;
  });
  for (const [k, a] of [["x", doc.x], ["y", doc.y]] as const) {
    if (a.log && doc.series.some((s) => (k === "x" ? s.x : s.y).some((v) => v <= 0))) err(`${k}.log`, "échelle logarithmique impossible : des valeurs sont ≤ 0.");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, doc };
}
