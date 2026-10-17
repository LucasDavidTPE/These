/**
 * Planches : plusieurs graphes de la bibliothèque assemblés en une figure (grille, étiquettes (a), (b)…),
 * stockées dans `planche.json` (kind = planche) par référence aux graphes : modifier un graphe puis
 * « Mettre à jour » refait la planche. Exports SVG et pgfplots (une seule tikzpicture, un axe par graphe,
 * placés au millimètre comme dans le SVG).
 */
import { escapeXml, primitiveSvg } from "../schema/export/svg";
import { latexText } from "../schema/export/tikz";
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
  /** Planche en matrice : titres des lignes (à gauche) et des colonnes (en haut). */
  entetes?: { lignes: string[]; colonnes: string[] };
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
    ...(typeof b.entetes === "object" && b.entetes !== null
      ? (() => {
          const e = b.entetes as Record<string, unknown>;
          const l = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
          return { entetes: { lignes: l(e.lignes), colonnes: l(e.colonnes) } };
        })()
      : {}),
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
  /** Coin haut gauche de chaque graphe (mm) et le graphe à sa taille de planche ; null : case vide. */
  cases: { x: number; y: number; doc: GraphDoc | null; etiquette: string }[];
  /** Titres de lignes (centre vertical) et de colonnes (centre horizontal), en mm. */
  titres: { texte: string; x: number; y: number; vertical: boolean }[];
}

/**
 * Bornes de couleurs communes aux cartes d'une planche : la plus petite et la plus grande des bornes de chaque
 * carte (symétriques autour de 0 si toutes sont en rouge-bleu) ; null s'il y a moins de deux cartes.
 */
export function echelleCommune(docs: readonly (GraphDoc | null)[]): [number, number] | null {
  const cartes = docs.map((d) => d?.carte).filter((c): c is NonNullable<GraphDoc["carte"]> => !!c);
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

/** Place réservée aux titres d'une planche en matrice (mm). */
const H_TITRE = 6;

/**
 * Grille : colonnes à la largeur du plus large graphe de la colonne, lignes à la hauteur du plus haut ; une case
 * vide (null) garde sa place. Étiquettes (a), (b)… dans l'ordre de lecture, cases vides sautées.
 */
export function miseEnPage(p: PlancheDoc, docs: readonly (GraphDoc | null)[]): MisePage {
  const commune = p.memeEchelle ? echelleCommune(docs) : null;
  const sized = docs.map((d0) => {
    if (!d0) return null;
    let d = commune && d0.carte ? { ...d0, carte: { ...d0.carte, min: commune[0], max: commune[1] } } : d0;
    if (p.taille) d = { ...d, width: p.taille.largeur, height: p.taille.hauteur };
    // échelles égales : la hauteur suit la largeur imposée
    return d.egalite ? { ...d, height: hauteurEgale(d) } : d;
  });
  const n = sized.length;
  const cols = Math.max(1, Math.min(p.colonnes, n || 1));
  const lignes = Math.ceil(n / cols);
  const hEt = p.etiquettes === "aucune" ? 0 : H_ETIQUETTE;
  const gauche = p.entetes?.lignes.some(Boolean) ? H_TITRE : 0;
  const haut = p.entetes?.colonnes.some(Boolean) ? H_TITRE : 0;
  const lc = Array.from({ length: cols }, (_, c) => Math.max(0, ...sized.filter((_, i) => i % cols === c).map((d) => d?.width ?? 0)));
  const hl = Array.from({ length: lignes }, (_, l) => Math.max(0, ...sized.slice(l * cols, (l + 1) * cols).map((d) => d?.height ?? 0)));
  const xCol = lc.map((_, c) => gauche + lc.slice(0, c).reduce((s, w) => s + w + p.espacement, 0));
  const yLig = hl.map((_, l) => haut + hl.slice(0, l).reduce((s, h) => s + h + hEt + p.espacement, 0) + hEt);
  let k = 0;
  const cases = sized.map((doc, i) => ({ x: xCol[i % cols]!, y: yLig[Math.floor(i / cols)]!, doc, etiquette: doc ? etiquette(k++, p.etiquettes) : "" }));
  const titres: MisePage["titres"] = [
    ...(p.entetes?.colonnes ?? []).slice(0, cols).map((t, c) => ({ texte: t, x: xCol[c]! + lc[c]! / 2, y: H_TITRE / 2, vertical: false })),
    ...(p.entetes?.lignes ?? []).slice(0, lignes).map((t, l) => ({ texte: t, x: H_TITRE / 2, y: yLig[l]! + hl[l]! / 2, vertical: true })),
  ].filter((t) => t.texte);
  return {
    largeur: gauche + lc.reduce((s, w) => s + w, 0) + p.espacement * Math.max(0, cols - 1),
    hauteur: haut + hl.reduce((s, h) => s + h + hEt, 0) + p.espacement * Math.max(0, lignes - 1),
    cases,
    titres,
  };
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/** La planche en SVG autonome (mm), chaque graphe rendu comme dans la page Graphes. */
export function plancheSvg(p: PlancheDoc, docs: readonly (GraphDoc | null)[]): string {
  const premier = docs.find((d): d is GraphDoc => !!d);
  if (!premier) throw new Error("La planche est vide : ajoutez des graphes.");
  const m = miseEnPage(p, docs);
  const t0 = graphTheme(premier);
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(m.largeur)}mm" height="${n2(m.hauteur)}mm" viewBox="0 0 ${n2(m.largeur)} ${n2(m.hauteur)}" stroke-linecap="round" stroke-linejoin="round">`,
    `  <!-- Planche générée par Thèse (${PLANCHE_FORMAT}) -->`,
  ];
  for (const t of m.titres) {
    const tr = t.vertical ? ` transform="rotate(-90 ${n2(t.x)} ${n2(t.y)})"` : "";
    out.push(`  <text x="${n2(t.x)}" y="${n2(t.y)}"${tr} text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(t0.text.svgFamily)}" font-size="${n2(t0.text.sizeMm * 1.1)}" font-weight="bold" fill="${t0.ink}">${escapeXml(t.texte)}</text>`);
  }
  for (const c of m.cases) {
    if (!c.doc) continue;
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
export function planchePgfplots(p: PlancheDoc, docs: readonly (GraphDoc | null)[]): string {
  const n = docs.filter(Boolean).length;
  if (!n) throw new Error("La planche est vide : ajoutez des graphes.");
  const m = miseEnPage(p, docs);
  const out = [`% Planche générée par Thèse (${PLANCHE_FORMAT}), ${n} graphes. Nécessite \\usepackage{figurine}.`, "\\begin{tikzpicture}"];
  for (const t of m.titres) out.push(`\\node[font=\\bfseries${t.vertical ? ", rotate=90" : ""}] at (${n2(t.x)}mm,${n2(-t.y)}mm) {${latexText(t.texte)}};`);
  m.cases.forEach((c, i) => {
    if (!c.doc) return;
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
