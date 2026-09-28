/**
 * Exports d'un graphe : SVG (même rendu que les schémas) et pgfplots (bornes, graduations
 * et libellés imposés pour que le PDF corresponde au SVG). Déterministes.
 */
import { formatNumber } from "../format/number";
import { escapeXml, primitiveSvg } from "../schema/export/svg";
import { THEMES } from "../schema/theme";
import { latexText } from "../schema/export/tikz";
import { generateSty } from "../schema/export/sty";
import { graphLayout } from "./layout";
import { GRAPH_FORMAT, validateGraph, type GraphDoc, type GraphError } from "./model";
import { graphTheme, isPlain } from "./style";
import type { AxisScale } from "./ticks";

const n = (v: number) => formatNumber(v, 2);

export class GraphExportError extends Error {
  constructor(readonly errors: GraphError[]) {
    super(errors.map((e) => `${e.path} : ${e.message}`).join("\n"));
  }
}

function prepare(raw: unknown): GraphDoc {
  const v = validateGraph(raw);
  if (!v.ok) throw new GraphExportError(v.errors);
  if (v.doc.series.length === 0) throw new GraphExportError([{ path: "series", message: "aucune série à tracer." }]);
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
  // Virgule décimale d'abord (sinon on casserait le « \, » des milliers).
  return `$${label.replace(/,/g, "{,}").replace(/\u2212/g, "-").replace(/\u2009/g, "\\,")}$`;
}

function axisOptions(axis: "x" | "y", s: AxisScale, label: string): string[] {
  const o = [
    `${axis}min=${formatData(s.min)}, ${axis}max=${formatData(s.max)}`,
    `${axis}tick={${s.ticks.map(formatData).join(",")}}`,
    `${axis}ticklabels={${s.labels.map((l) => `{${texTickLabel(l)}}`).join(",")}}`,
  ];
  if (s.log) o.push(`${axis}mode=log`);
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
  const lines: string[] = [
    `% Graphe généré par Figurine -- format ${GRAPH_FORMAT}, thème « ${doc.theme} ».`,
    "% Nécessite \\usepackage{figurine} (charge pgfplots). Taille de la zone des axes imposée.",
    "\\begin{tikzpicture}",
    `\\begin{axis}[fig/graphe, width=${n(box.w)}mm, height=${n(box.h)}mm,`,
    `  ${[...axisOptions("x", xs, doc.x.label), ...axisOptions("y", ys, doc.y.label)].join(",\n  ")},`,
    `  legend pos=${doc.legend === "none" ? "north east" : doc.legend}${doc.grid ? ", grid=major" : ""}${extraAxis.length ? `,\n  ${extraAxis.join(",\n  ")}` : ""}]`,
  ];
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
