/**
 * Planches : plusieurs graphes de la bibliothèque assemblés en une figure (grille, étiquettes (a), (b)…),
 * stockées dans `planche.json` (kind = planche) par référence aux graphes : modifier un graphe puis
 * « Mettre à jour » refait la planche. Exports SVG et pgfplots (une seule tikzpicture, un axe par graphe,
 * placés au millimètre comme dans le SVG).
 */
import { escapeXml, primitiveSvg } from "../schema/export/svg";
import { exportPgfplots } from "./export";
import { bornesCarte } from "./carte";
import { graphLayout, hauteurEgale } from "./layout";
import type { GraphDoc } from "./model";
import { graphTheme } from "./style";

export const PLANCHE_FORMAT = "these-planche/1";
export const ETIQUETTES = ["(a)", "a)", "(A)", "aucune"] as const;
export type StyleEtiquette = (typeof ETIQUETTES)[number];

export interface PlancheDoc {
  format: typeof PLANCHE_FORMAT;
  /** Graphes par ligne (1 à 6). */
  colonnes: number;
  /** Espace entre graphes (mm). */
  espacement: number;
  etiquettes: StyleEtiquette;
  /** Taille commune imposée à chaque graphe (mm) ; null : chacun garde la sienne. */
  taille: { largeur: number; hauteur: number } | null;
  /** Graphes, dans l'ordre de lecture (dossier de la figure dans la bibliothèque). */
  panneaux: { dossier: string }[];
  /** Même échelle de couleurs pour toutes les cartes de la planche (bornes communes). */
  memeEchelle?: boolean;
}

export function plancheVide(): PlancheDoc {
  return { format: PLANCHE_FORMAT, colonnes: 2, espacement: 6, etiquettes: "(a)", taille: null, panneaux: [] };
}

const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

export function lirePlanche(raw: unknown): PlancheDoc {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const t = b.taille as Record<string, unknown> | null | undefined;
  return {
    format: PLANCHE_FORMAT,
    colonnes: Math.round(num(b.colonnes, 1, 6, 2)),
    espacement: num(b.espacement, 0, 50, 6),
    etiquettes: ETIQUETTES.includes(b.etiquettes as StyleEtiquette) ? (b.etiquettes as StyleEtiquette) : "(a)",
    taille: t && typeof t === "object" ? { largeur: num(t.largeur, 20, 1000, 80), hauteur: num(t.hauteur, 20, 1000, 60) } : null,
    ...(b.memeEchelle === true ? { memeEchelle: true } : {}),
    panneaux: (Array.isArray(b.panneaux) ? b.panneaux : []).filter((p): p is { dossier: string } => typeof (p as { dossier?: unknown })?.dossier === "string").map((p) => ({ dossier: p.dossier })),
  };
}

/** « (a) », « b) », « (C) » ; vide sans étiquettes. */
export function etiquette(i: number, style: StyleEtiquette): string {
  const l = String.fromCharCode(97 + (i % 26));
  return style === "(a)" ? `(${l})` : style === "a)" ? `${l})` : style === "(A)" ? `(${l.toUpperCase()})` : "";
}

/** Hauteur réservée à l'étiquette au-dessus de chaque graphe (mm). */
const H_ETIQUETTE = 5;

export interface MisePage {
  largeur: number;
  hauteur: number;
  /** Coin haut gauche de chaque graphe (mm) et le graphe à sa taille de planche. */
  cases: { x: number; y: number; doc: GraphDoc; etiquette: string }[];
}

/** Grille : colonnes à la largeur du plus large graphe de la colonne, lignes à la hauteur du plus haut. */
/**
 * Bornes de couleurs communes aux cartes d'une planche : la plus petite et la plus grande des bornes de chaque
 * carte (symétriques autour de 0 si toutes sont en rouge-bleu) ; null s'il y a moins de deux cartes.
 */
export function echelleCommune(docs: readonly GraphDoc[]): [number, number] | null {
  const cartes = docs.map((d) => d.carte).filter((c): c is NonNullable<GraphDoc["carte"]> => !!c);
  if (cartes.length < 2) return null;
  const b = cartes.map(bornesCarte);
  const lo = Math.min(...b.map((x) => x[0]));
  const hi = Math.max(...b.map((x) => x[1]));
  if (cartes.every((c) => c.palette === "divergente")) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m, m];
  }
  return [lo, hi];
}

export function miseEnPage(p: PlancheDoc, docs: readonly GraphDoc[]): MisePage {
  const commune = p.memeEchelle ? echelleCommune(docs) : null;
  const sized = docs.map((d0) => {
    let d = commune && d0.carte ? { ...d0, carte: { ...d0.carte, min: commune[0], max: commune[1] } } : d0;
    if (p.taille) d = { ...d, width: p.taille.largeur, height: p.taille.hauteur };
    // échelles égales : la hauteur suit la largeur imposée
    return d.egalite ? { ...d, height: hauteurEgale(d) } : d;
  });
  const n = sized.length;
  const cols = Math.max(1, Math.min(p.colonnes, n || 1));
  const lignes = Math.ceil(n / cols);
  const hEt = p.etiquettes === "aucune" ? 0 : H_ETIQUETTE;
  const lc = Array.from({ length: cols }, (_, c) => Math.max(0, ...sized.filter((_, i) => i % cols === c).map((d) => d.width)));
  const hl = Array.from({ length: lignes }, (_, l) => Math.max(0, ...sized.slice(l * cols, (l + 1) * cols).map((d) => d.height)));
  const xCol = lc.map((_, c) => lc.slice(0, c).reduce((s, w) => s + w + p.espacement, 0));
  const yLig = hl.map((_, l) => hl.slice(0, l).reduce((s, h) => s + h + hEt + p.espacement, 0) + hEt);
  return {
    largeur: lc.reduce((s, w) => s + w, 0) + p.espacement * Math.max(0, cols - 1),
    hauteur: hl.reduce((s, h) => s + h + hEt, 0) + p.espacement * Math.max(0, lignes - 1),
    cases: sized.map((doc, i) => ({ x: xCol[i % cols]!, y: yLig[Math.floor(i / cols)]!, doc, etiquette: etiquette(i, p.etiquettes) })),
  };
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/** La planche en SVG autonome (mm), chaque graphe rendu comme dans la page Graphes. */
export function plancheSvg(p: PlancheDoc, docs: readonly GraphDoc[]): string {
  if (!docs.length) throw new Error("La planche est vide : ajoutez des graphes.");
  const m = miseEnPage(p, docs);
  const t0 = graphTheme(m.cases[0]!.doc);
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(m.largeur)}mm" height="${n2(m.hauteur)}mm" viewBox="0 0 ${n2(m.largeur)} ${n2(m.hauteur)}" stroke-linecap="round" stroke-linejoin="round">`,
    `  <!-- Planche générée par Thèse (${PLANCHE_FORMAT}) -->`,
  ];
  for (const c of m.cases) {
    const theme = graphTheme(c.doc);
    out.push(`  <g transform="translate(${n2(c.x)} ${n2(c.y)})" font-family="${escapeXml(theme.text.svgFamily)}" font-size="${n2(theme.text.sizeMm)}">`);
    for (const prim of graphLayout(c.doc).primitives) out.push(`    ${primitiveSvg(theme, prim)}`);
    out.push("  </g>");
    if (c.etiquette) out.push(`  <text x="${n2(c.x + 1)}" y="${n2(c.y - 1.2)}" font-family="${escapeXml(t0.text.svgFamily)}" font-size="${n2(t0.text.sizeMm * 1.1)}" font-weight="bold" fill="${t0.ink}">${escapeXml(c.etiquette)}</text>`);
  }
  out.push("</svg>", "");
  return out.join("\n");
}

/**
 * La planche en pgfplots : une tikzpicture, l'axe de chaque graphe placé (`at`, ancre `north west` = coin
 * haut gauche de sa boîte d'axes) à la même position qu'en SVG ; étiquettes en gras au-dessus.
 */
export function planchePgfplots(p: PlancheDoc, docs: readonly GraphDoc[]): string {
  if (!docs.length) throw new Error("La planche est vide : ajoutez des graphes.");
  const m = miseEnPage(p, docs);
  const out = [`% Planche générée par Thèse (${PLANCHE_FORMAT}), ${docs.length} graphes. Nécessite \\usepackage{figurine}.`, "\\begin{tikzpicture}"];
  m.cases.forEach((c, i) => {
    const { box } = graphLayout(c.doc);
    const tex = exportPgfplots(c.doc).tex.split("\n");
    const debut = tex.findIndex((l) => l.startsWith("\\begin{axis}["));
    const fin = tex.findIndex((l) => l === "\\end{axis}");
    if (debut < 0 || fin < 0) throw new Error(`Graphe ${i + 1} : export pgfplots inattendu.`);
    out.push(`% ${c.etiquette || `Graphe ${i + 1}`}`);
    out.push(tex[debut]!.replace("\\begin{axis}[", `\\begin{axis}[at={(${n2(c.x + box.x)}mm,${n2(-(c.y + box.y))}mm)}, anchor=north west, `));
    out.push(...tex.slice(debut + 1, fin + 1));
    if (c.etiquette) out.push(`\\node[anchor=south west, inner sep=0pt, font=\\bfseries] at (${n2(c.x + 1)}mm,${n2(-(c.y - 1.2))}mm) {${c.etiquette}};`);
  });
  out.push("\\end{tikzpicture}", "");
  return out.join("\n");
}
