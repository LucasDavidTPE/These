/**
 * Exports d'un graphe : SVG (même rendu que les schémas) et pgfplots (bornes, graduations
 * et libellés imposés pour que le PDF corresponde au SVG). Déterministes.
 */
import { formatNumber } from "../format/number";
import { escapeXml, primitiveSvg } from "../schema/export/svg";
import { THEMES } from "../schema/theme";
import { latexText } from "../schema/export/tikz";
import { generateSty } from "../schema/export/sty";
import { bornesCarte, couleursCarte, isoligne, placeEtiquette } from "./carte";
import { fitCorner } from "./fit";
import { decimales, fitRows, graphFits, graphLayout, legendRow } from "./layout";
import { GRAPH_FORMAT, validateGraph, type GraphDoc, type GraphError } from "./model";
import { graphTheme, isPlain } from "./style";
import { formatTick, type AxisScale } from "./ticks";

const n = (v: number) => formatNumber(v, 2);

export class GraphExportError extends Error {
  constructor(readonly errors: GraphError[]) {
    super(errors.map((e) => `${e.path} : ${e.message}`).join("\n"));
  }
}

function prepare(raw: unknown): GraphDoc {
  const v = validateGraph(raw);
  if (!v.ok) throw new GraphExportError(v.errors);
  if (v.doc.series.length === 0 && !v.doc.carte) throw new GraphExportError([{ path: "series", message: "aucune série à tracer." }]);
  return v.doc;
}

export function exportGraphSvg(raw: unknown): string {
  const doc = prepare(raw);
  const theme = graphTheme(doc);
  const { primitives } = graphLayout(doc);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(doc.width)}mm" height="${n(doc.height)}mm" viewBox="0 0 ${n(doc.width)} ${n(doc.height)}" font-family="${escapeXml(theme.text.svgFamily)}" font-size="${n(theme.text.sizeMm)}" stroke-linecap="round" stroke-linejoin="round">`,
    `  <!-- Graphe généré par Figurine (${GRAPH_FORMAT}, thème « ${doc.theme} ») -->`,
    ...primitives.map((p) => `  ${primitiveSvg(theme, p)}`),
    "</svg>",
    "",
  ].join("\n");
}

/** Valeur de donnée : précision complète utile, sans bruit binaire. */
export function formatData(v: number): string {
  return String(Number(v.toPrecision(12)));
}

/** Libellé de graduation pour LaTeX : « −12 500,5 » → « $-12\,500{,}5$ ». */
export function texTickLabel(label: string): string {
  if (label.startsWith("$")) return label;
  // nom de catégorie (diagramme en barres) : du texte, pas un nombre
  if (/[A-Za-zÀ-ÿ]/.test(label)) return latexText(label);
  // Virgule décimale d'abord (sinon on casserait le « \, » des milliers).
  return `$${label.replace(/,/g, "{,}").replace(/\u2212/g, "-").replace(/\u2009/g, "\\,")}$`;
}

function axisOptions(axis: "x" | "y", s: AxisScale, label: string, inverse = false): string[] {
  const o = [
    `${axis}min=${formatData(s.min)}, ${axis}max=${formatData(s.max)}`,
    `${axis}tick={${s.ticks.map(formatData).join(",")}}`,
    `${axis}ticklabels={${s.labels.map((l) => `{${texTickLabel(l)}}`).join(",")}}`,
  ];
  if (s.log) o.push(`${axis}mode=log`);
  if (inverse) o.push(`${axis} dir=reverse`);
  if (label) o.push(`${axis}label={${latexText(label)}}`);
  return o;
}

const TIKZ_MARK: Record<string, string> = { o: "o", square: "square", triangle: "triangle", x: "x", diamond: "diamond", "+": "+" };

/** Police LaTeX la plus proche d'une taille relative au \footnotesize (8 pt) du thème. */
function texFont(scale: number): string | null {
  const tailles: [number, string][] = [
    [7, "\\scriptsize"],
    [8, ""],
    [9, "\\small"],
    [10, "\\normalsize"],
    [12, "\\large"],
    [14.4, "\\Large"],
  ];
  const cible = 8 * scale;
  const [, f] = tailles.reduce((a, b) => (Math.abs(b[0] - cible) < Math.abs(a[0] - cible) ? b : a));
  return f || null;
}

export interface PgfplotsOptions {
  /** Document compilable seul. */
  standalone?: boolean;
  /** Données dans des fichiers .dat séparés (noms `export-<i>.dat`), lus depuis \figurinedatadir. */
  dataFiles?: boolean;
}

export interface PgfplotsExport {
  tex: string;
  /** Fichiers .dat (nom → contenu) si `dataFiles`. */
  files: Record<string, string>;
}

export function exportPgfplots(raw: unknown, options: PgfplotsOptions = {}): PgfplotsExport {
  const doc = prepare(raw);
  const { box, xs, ys } = graphLayout(doc);
  const files: Record<string, string> = {};
  // Apparence personnalisée : chaque série porte ses options (couleur, marque, tirets)
  // au lieu des styles fig/serie i du thème, communs à toutes les figures.
  const perso = !isPlain(doc);
  const theme = graphTheme(doc);
  const extraAxis: string[] = [];
  if (doc.style?.frame === "axes") extraAxis.push("axis lines=left, axis line style={-}");
  const police = doc.style ? texFont(doc.style.fontScale) : null;
  if (police) extraAxis.push(`font=${police}, label style={font=${police}}, legend style={font=${police}}`);
  const barSeries = doc.series.map((s, i) => ({ s, i })).filter(({ s }) => s.type === "bar");
  // carte : barre de couleurs à paliers, mêmes couleurs et mêmes bornes que le SVG
  const c = doc.carte;
  if (c) {
    const [lo, hi] = bornesCarte(c);
    const rgb = couleursCarte(c).map((h) => `rgb255=(${[0, 1, 2].map((k) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16)).join(",")})`);
    extraAxis.push(
      `colormap={carte}{${rgb.join(" ")}}, colormap access=piecewise constant`,
      `point meta min=${formatData(lo)}, point meta max=${formatData(hi)}`,
      `colorbar, colorbar style={width=3.5mm${c.legende ? `, ylabel={${latexText(c.legende)}}` : ""}}`,
      "unbounded coords=jump",
    );
  }
  const lines: string[] = [
    `% Graphe généré par Figurine -- format ${GRAPH_FORMAT}, thème « ${doc.theme} ».`,
    "% Nécessite \\usepackage{figurine} (charge pgfplots). Taille de la zone des axes imposée.",
    "\\begin{tikzpicture}",
    `\\begin{axis}[fig/graphe, width=${n(box.w)}mm, height=${n(box.h)}mm,`,
    `  ${[...axisOptions("x", xs, doc.x.label, doc.x.inverse), ...axisOptions("y", ys, doc.y.label, doc.y.inverse)].join(",\n  ")},`,
    `  legend pos=${doc.legend === "none" ? "north east" : doc.legend}${doc.grid ? ", grid=major" : ""}${extraAxis.length ? `,\n  ${extraAxis.join(",\n  ")}` : ""}]`,
  ];
  if (c) {
    lines.push("");
    lines.push(`% Carte : ${c.x.length} × ${c.y.length} valeurs (cellules centrées sur les nœuds)`);
    const rows: string[] = [];
    c.y.forEach((y, j) => c.x.forEach((x, i) => rows.push(`${formatData(x)} ${formatData(y)} ${c.v[j]![i] === null ? "nan" : formatData(c.v[j]![i]!)}`)));
    const style = `matrix plot*, mesh/cols=${c.x.length}, mesh/rows=${c.y.length}, point meta=explicit, forget plot`;
    if (options.dataFiles) {
      files["export-carte.dat"] = ["x y c", ...rows].join("\n") + "\n";
      lines.push(`\\addplot[${style}] table[meta=c] {\\figurinedatadir export-carte.dat};`);
    } else {
      lines.push(`\\addplot[${style}] table[meta=c, row sep=\\\\] {`);
      lines.push("x y c \\\\");
      for (const r of rows) lines.push(`${r} \\\\`);
      lines.push("};");
    }
  }
  doc.series.forEach((s, i) => {
    const k = barSeries.findIndex((b) => b.i === i);
    const st = theme.graph.series[i]!;
    const lw = n(theme.strokes.trait.width);
    const marque = st.noMark || s.type === "line" ? "mark=none" : `mark=${TIKZ_MARK[st.mark]}, mark size=${n(theme.graph.markSize / 2)}mm, mark options={solid, fill=${st.filled ? st.tikz : "white"}}`;
    const style = perso
      ? s.type === "bar"
        ? `ybar, area legend, draw=black, line width=${n(theme.strokes["trait fin"].width)}mm, fill=${st.barTikz}, mark=none, bar width=${n(doc.bar_width)}mm, bar shift=${n((k - (barSeries.length - 1) / 2) * doc.bar_width)}mm`
        : `draw=${st.tikz}, line width=${lw}mm, ${st.dash ?? "solid"}, ${marque}${s.type === "points" ? ", only marks" : ""}`
      : s.type === "bar"
        ? `fig/barres ${(i % 6) + 1}, bar width=${n(doc.bar_width)}mm, bar shift=${n((k - (barSeries.length - 1) / 2) * doc.bar_width)}mm`
        : `fig/serie ${(i % 6) + 1}${s.type === "line" ? ", mark=none" : s.type === "points" ? ", only marks" : ""}`;
    const legendOff = !s.legend || doc.legend === "none" ? ", forget plot" : "";
    lines.push("");
    lines.push(`% Série ${i + 1} : ${s.name} (${s.x.length} points)`);
    const rows = s.x.map((x, j) => `${formatData(x)} ${formatData(s.y[j]!)}`);
    if (options.dataFiles) {
      const name = `export-${i + 1}.dat`;
      files[name] = ["x y", ...rows].join("\n") + "\n";
      lines.push(`\\addplot[${style}${legendOff}] table {\\figurinedatadir ${name}};`);
    } else {
      lines.push(`\\addplot[${style}${legendOff}] table[row sep=\\\\] {`);
      lines.push("x y \\\\");
      for (const r of rows) lines.push(`${r} \\\\`);
      lines.push("};");
    }
    if (s.legend && doc.legend !== "none") lines.push(`\\addlegendentry{${latexText(s.name)}}`);
  });
  // Isolignes de la carte : polylignes calculées comme pour le SVG, valeur au milieu de la plus longue.
  if (c?.isolignes?.length) {
    const fin = n(theme.strokes["trait fin"].width);
    for (const niveau of c.isolignes) {
      const polys = isoligne(c, niveau);
      if (!polys.length) continue;
      lines.push("");
      lines.push(`% Isoligne ${formatData(niveau)}`);
      for (const l of polys) lines.push(`\\addplot[black, line width=${fin}mm, mark=none, forget plot] coordinates {${l.map(([x, y]) => `(${formatData(x)},${formatData(y)})`).join(" ")}};`);
      const at = placeEtiquette(polys);
      if (at) lines.push(`\\node[fill=white, inner sep=0.4pt, font=\\scriptsize] at (axis cs:${formatData(at[0])},${formatData(at[1])}) {${texTickLabel(formatTick(niveau, decimales(niveau), false))}};`);
    }
  }
  // Repères et annotations.
  const encre = n(theme.strokes["trait fin"].width);
  for (const r of doc.reperes ?? []) {
    const ax = r.axe === "x" ? xs : ys;
    if (!(r.valeur >= Math.min(ax.min, ax.max) && r.valeur <= Math.max(ax.min, ax.max))) continue;
    const v = formatData(r.valeur);
    const de = r.axe === "y" ? `${formatData(xs.min)},${v}` : `${v},${formatData(ys.min)}`;
    const a = r.axe === "y" ? `${formatData(xs.max)},${v}` : `${v},${formatData(ys.max)}`;
    const etiquette = r.texte
      ? r.axe === "y"
        ? ` node[pos=${doc.x.inverse ? 0 : 1}, anchor=south east, font=\\scriptsize, fill=white, fill opacity=0.8, text opacity=1, inner sep=0.5pt] {${latexText(r.texte)}}`
        : ` node[pos=${doc.y.inverse ? 0 : 1}, anchor=north west, font=\\scriptsize, fill=white, fill opacity=0.8, text opacity=1, inner sep=0.5pt, xshift=0.5mm, yshift=-0.5mm] {${latexText(r.texte)}}`
      : "";
    lines.push(`\\draw[line width=${encre}mm, ${r.trait}] (axis cs:${de}) -- (axis cs:${a})${etiquette};`);
  }
  for (const an of doc.annotations ?? []) {
    const p = `(axis cs:${formatData(an.x)},${formatData(an.y)})`;
    lines.push(`\\fill ${p} circle[radius=0.6mm];`);
    if (an.texte) {
      const est = an.position.includes("east");
      const nord = an.position.includes("north");
      lines.push(`\\node[anchor=${nord ? "south" : "north"} ${est ? "west" : "east"}, xshift=${est ? "" : "-"}1.2mm, yshift=${nord ? "" : "-"}1.2mm, font=\\scriptsize, fill=white, fill opacity=0.8, text opacity=1, inner sep=0.5pt] at ${p} {${latexText(an.texte)}};`);
    }
  }
  // Régressions : mêmes points que le SVG, puis l'encadré des équations.
  const fits = graphFits(doc, xs, ys);
  const fitDraw = (i: number) => {
    const st = theme.graph.series[i % theme.graph.series.length]!;
    return `draw=${st.tikz}, line width=${n(theme.strokes.trait.width)}mm, ${st.dash === "dashed" ? "dotted" : "dashed"}`;
  };
  for (const f of fits) {
    lines.push("");
    lines.push(`% Régression de la série ${f.i + 1} (${f.result.kind}, R² = ${formatData(f.result.r2)})`);
    lines.push(`\\addplot[${fitDraw(f.i)}, mark=none, forget plot] coordinates {${f.points.map(([x, y]) => `(${formatData(x)},${formatData(y)})`).join(" ")}};`);
  }
  const labels = fits.filter((f) => f.label);
  if (labels.length > 0) {
    const corner = fitCorner(doc.fit_pos, doc.legend);
    const east = corner.includes("east");
    const south = corner.includes("south");
    const legendH = corner === doc.legend ? legendRow(theme) * doc.series.filter((s) => s.legend).length + 2.5 : 0;
    const rows = fitRows(labels, theme, box.w).map((r) => (r.trait ? `\\tikz[baseline=-0.5ex]\\draw[${fitDraw(r.i)}] (0,0) -- (6mm,0);~${r.text}` : `\\hspace*{6mm}~${r.text}`));
    lines.push("");
    lines.push(
      `\\node[anchor=${corner}, draw, fill=white, line width=${n(theme.strokes["trait fin"].width)}mm, inner sep=1mm, align=left, xshift=${east ? "-" : ""}1.5mm, yshift=${south ? "" : "-"}${n(1.5 + legendH)}mm] at (rel axis cs:${east ? 1 : 0},${south ? 0 : 1}) {${rows.join(" \\\\ ")}};`,
    );
  }
  if (doc.legend === "none") lines.splice(5, 1, lines[5]!.replace(/legend pos=[a-z ]+/, "legend style={draw=none}"));
  lines.push("\\end{axis}");
  lines.push("\\end{tikzpicture}");
  let tex = lines.join("\n") + "\n";
  if (options.standalone) {
    const base = THEMES[doc.theme] ?? THEMES.these!;
    tex = [
      "\\begin{filecontents*}[overwrite]{figurine.sty}",
      generateSty(base).trimEnd(),
      "\\end{filecontents*}",
      "\\documentclass[tikz, border=1mm]{standalone}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage[utf8]{inputenc}",
      "\\usepackage{lmodern}",
      "\\usepackage{figurine}",
      "\\pgfplotsset{compat=1.16}",
      "\\begin{document}",
      tex.trimEnd(),
      "\\end{document}",
      "",
    ].join("\n");
  }
  return { tex, files };
}
