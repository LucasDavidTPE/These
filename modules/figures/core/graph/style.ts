/**
 * Apparence d'un graphe : style (cadre, épaisseurs, marques, taille du texte), palette de
 * couleurs et réglages propres à une série (couleur, marque, tirets). Sans style, le graphe
 * garde le rendu du thème (noir et gris, pour une thèse imprimée) : les graphes déjà
 * enregistrés ne changent pas.
 *
 * Le rendu passe par un thème dérivé (graphTheme) : le SVG et pgfplots lisent les mêmes
 * valeurs, comme pour les schémas.
 */
import { THEMES, type GraphMark, type Theme } from "../schema/theme";

export type SeriesDash = "solid" | "dashed" | "dotted";
export type SeriesMark = GraphMark | "none";

export interface GraphStyle {
  /** Nom affiché (préréglage ou style enregistré). */
  name: string;
  /** Couleurs des séries, dans l'ordre (#rrggbb). */
  palette: string[];
  /** Cadre complet ou seulement les axes gauche et bas. */
  frame: "box" | "axes";
  /** Épaisseur des courbes (mm). */
  lineWidth: number;
  /** Taille des marques (mm). */
  markSize: number;
  /** Taille du texte, relative au thème (1 = \footnotesize d'une thèse). */
  fontScale: number;
  /** Une marque différente par série (sinon des ronds). */
  marks: boolean;
  /** Des tirets différents par série (lisible en noir et blanc). */
  dashes: boolean;
  /** Marques pleines (sinon évidées, fond blanc). */
  filledMarks: boolean;
}

export const MARKS: GraphMark[] = ["o", "square", "triangle", "diamond", "x", "+"];
const DASHES: (SeriesDash)[] = ["solid", "dashed", "dotted"];

export interface NamedPalette {
  id: string;
  name: string;
  colors: string[];
  /** Pourquoi elle marche bien. */
  note: string;
}

/** Palettes éprouvées (lisibles, distinctes, et pour certaines sûres pour les daltoniens). */
export const PALETTES: NamedPalette[] = [
  { id: "okabe-ito", name: "Okabe-Ito", colors: ["#0072b2", "#e69f00", "#009e73", "#d55e00", "#cc79a7", "#56b4e9", "#f0e442", "#000000"], note: "sûre pour les daltoniens (Nature, Science)" },
  { id: "tol-bright", name: "Paul Tol, vive", colors: ["#4477aa", "#ee6677", "#228833", "#ccbb44", "#66ccee", "#aa3377", "#bbbbbb"], note: "contrastée, sûre pour les daltoniens" },
  { id: "tableau", name: "Tableau 10", colors: ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"], note: "classique des présentations" },
  { id: "dark2", name: "ColorBrewer Dark2", colors: ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"], note: "couleurs sombres, bonnes à l'impression" },
  { id: "viridis", name: "Viridis (séquentielle)", colors: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"], note: "ordonnée : températures, fréquences, cycles" },
  { id: "chaud-froid", name: "Froid → chaud", colors: ["#313695", "#4575b4", "#74add1", "#fdae61", "#f46d43", "#d73027", "#a50026"], note: "isothermes du plus froid au plus chaud" },
  { id: "gris", name: "Noir et gris", colors: ["#000000", "#555555", "#888888", "#aaaaaa"], note: "impression noir et blanc" },
];

const BASE: Omit<GraphStyle, "name" | "palette"> = { frame: "box", lineWidth: 0.3, markSize: 1.3, fontScale: 1, marks: true, dashes: false, filledMarks: false };

/** Préréglages du sélecteur de style. « these » (aucun style) = rendu d'origine du thème. */
export const STYLE_PRESETS: { id: string; style: GraphStyle | null; note: string }[] = [
  { id: "these", style: null, note: "noir et gris, marques et tirets alternés (thèse imprimée)" },
  { id: "couleur", style: { ...BASE, name: "Couleur", palette: PALETTES[0]!.colors }, note: "Okabe-Ito, marques évidées, cadre complet" },
  { id: "article", style: { ...BASE, name: "Article", palette: PALETTES[1]!.colors, frame: "axes", lineWidth: 0.25, markSize: 1.1 }, note: "axes seuls, traits fins" },
  { id: "presentation", style: { ...BASE, name: "Présentation", palette: PALETTES[2]!.colors, lineWidth: 0.45, markSize: 1.8, fontScale: 1.2, filledMarks: true }, note: "traits épais, texte grand, marques pleines" },
  { id: "minimal", style: { ...BASE, name: "Minimal", palette: PALETTES[3]!.colors, frame: "axes", marks: false, markSize: 1 }, note: "axes seuls, ronds discrets" },
  { id: "sequentiel", style: { ...BASE, name: "Séquentiel", palette: PALETTES[4]!.colors, marks: false, filledMarks: true }, note: "Viridis, pour une grandeur ordonnée" },
  { id: "noir-blanc", style: { ...BASE, name: "Noir et blanc", palette: PALETTES[6]!.colors, dashes: true }, note: "gris et tirets, marques alternées" },
];

/** « #ABC », « abc123 » → « #aabbcc » ; null si ce n'est pas une couleur. */
export function normalizeHex(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

/**
 * Palette collée : une adresse coolors.co (« https://coolors.co/264653-2a9d8f-e9c46a »),
 * l'export « CSV » ou « Code » de coolors, une liste de #rrggbb, ou des rgb(…). Les doublons
 * sont retirés, l'ordre gardé.
 */
export function parsePalette(text: string): string[] {
  const out: string[] = [];
  const add = (c: string | null) => c && !out.includes(c) && out.push(c);
  const t = text.trim();
  // adresse coolors : les couleurs sont séparées par des tirets dans le dernier segment
  const url = t.match(/coolors\.co\/(?:palette\/)?([0-9a-f-]{6,})/i);
  if (url) for (const h of url[1]!.split("-")) add(normalizeHex(h));
  for (const m of t.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    add("#" + [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join(""));
  }
  if (!url) for (const m of t.matchAll(/(?:#|\b)([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) if (!/rgba?\(/i.test(t) || m[0].startsWith("#")) add(normalizeHex(m[1]!));
  return out;
}

/** Lecture tolérante d'un style (graph.json, style enregistré) ; null si inexploitable. */
export function parseStyle(raw: unknown): GraphStyle | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const palette = Array.isArray(r.palette) ? r.palette.map((c) => (typeof c === "string" ? normalizeHex(c) : null)).filter((c): c is string => !!c) : [];
  if (!palette.length) return null;
  const num = (k: string, lo: number, hi: number, d: number) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? Math.min(hi, Math.max(lo, r[k] as number)) : d);
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Style",
    palette,
    frame: r.frame === "axes" ? "axes" : "box",
    lineWidth: num("lineWidth", 0.05, 2, BASE.lineWidth),
    markSize: num("markSize", 0.3, 5, BASE.markSize),
    fontScale: num("fontScale", 0.6, 2.5, 1),
    marks: r.marks !== false,
    dashes: r.dashes === true,
    filledMarks: r.filledMarks === true,
  };
}

export interface SeriesLook {
  color?: string;
  mark?: SeriesMark;
  dash?: SeriesDash;
}

/** Réglages propres à une série, validés (les valeurs inconnues sont ignorées). */
export function parseSeriesLook(r: Record<string, unknown>): SeriesLook {
  const out: SeriesLook = {};
  if (typeof r.color === "string" && normalizeHex(r.color)) out.color = normalizeHex(r.color)!;
  if (r.mark === "none" || MARKS.includes(r.mark as GraphMark)) out.mark = r.mark as SeriesMark;
  if (DASHES.includes(r.dash as SeriesDash)) out.dash = r.dash as SeriesDash;
  return out;
}

/** Couleur xcolor d'un #rrggbb (pgfplots). */
export function tikzColor(hex: string): string {
  const h = normalizeHex(hex);
  if (!h) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

/** Même teinte, éclaircie vers le blanc (remplissage des barres). */
function lighten(hex: string, k: number): string {
  const h = normalizeHex(hex) ?? "#000000";
  return "#" + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) + (255 - parseInt(h.slice(i, i + 2), 16)) * k).toString(16).padStart(2, "0")).join("");
}

interface Styled {
  theme: string;
  style?: GraphStyle;
  series: (SeriesLook & object)[];
}

/** Rien à personnaliser : le thème tel quel (rendu d'origine). */
export function isPlain(doc: Styled): boolean {
  return !doc.style && doc.series.every((s) => s.color === undefined && s.mark === undefined && s.dash === undefined);
}

/**
 * Thème dérivé d'un graphe : une entrée de série par série du graphe, épaisseurs et taille du
 * texte du style. `graph.series[i]` décrit donc exactement la série i.
 */
export function graphTheme(doc: Styled): Theme {
  const base = THEMES[doc.theme] ?? THEMES.these!;
  if (isPlain(doc)) return base;
  const st = doc.style;
  const series = doc.series.map((s, i) => {
    const legacy = base.graph.series[i % base.graph.series.length]!;
    const color = s.color ?? (st ? st.palette[i % st.palette.length]! : null);
    const dash = s.dash ? (s.dash === "solid" ? null : s.dash) : st ? (st.dashes ? [null, "dashed", "dotted"][i % 3] as "dashed" | "dotted" | null : null) : legacy.dash;
    const mark = s.mark && s.mark !== "none" ? s.mark : st ? (st.marks ? MARKS[i % MARKS.length]! : "o") : legacy.mark;
    return {
      svg: color ?? legacy.svg,
      tikz: color ? tikzColor(color) : legacy.tikz,
      dash,
      mark,
      noMark: s.mark === "none",
      filled: st?.filledMarks ?? false,
      barSvg: color ? lighten(color, 0.35) : legacy.barSvg,
      barTikz: color ? tikzColor(lighten(color, 0.35)) : legacy.barTikz,
    };
  });
  const scale = st?.fontScale ?? 1;
  return {
    ...base,
    strokes: st ? { ...base.strokes, trait: { ...base.strokes.trait, width: st.lineWidth } } : base.strokes,
    text: { ...base.text, sizeMm: base.text.sizeMm * scale },
    graph: { ...base.graph, series, markSize: st?.markSize ?? base.graph.markSize },
  };
}

/** Nom de fichier d'un style enregistré (dossier `_styles-graphes/` de la bibliothèque). */
export const STYLES_DIR = "_styles-graphes";
export function styleFileName(name: string): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "style";
  return `${slug}.json`;
}
