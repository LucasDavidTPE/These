/**
 * Génération de `tex/figurine.sty` depuis le thème. Le fichier livré doit être identique
 * à cette sortie (test golden) : SVG et TikZ partagent ainsi les mêmes valeurs.
 */
import type { Hatch, Theme } from "../theme";
import { n } from "./common";

export const STY_VERSION = "2026/09/25 v1.0";

function hatchTikz(h: Hatch, color: string): string {
  switch (h.kind) {
    case "lines":
      return `pattern={Lines[angle=${n(h.angle)}, distance=${n(h.spacing)}mm, line width=${n(h.width)}mm]}, pattern color=${color}`;
    case "cross":
      return `pattern={Hatch[angle=${n(h.angle)}, distance=${n(h.spacing)}mm, line width=${n(h.width)}mm]}, pattern color=${color}`;
    case "dots":
      return `pattern={Dots[distance=${n(h.spacing)}mm, radius=${n(h.radius)}mm]}, pattern color=${color}`;
  }
}

export function generateSty(theme: Theme): string {
  const gris = theme.fills.gris.replace("#", "").toUpperCase();
  const lines = [
    "% figurine.sty -- styles TikZ partagés par tous les exports de Figurine.",
    `% FICHIER GÉNÉRÉ depuis le thème « ${theme.name} » (src/core/schema/theme.ts) :`,
    "% ne pas le modifier à la main, il serait réécrit.",
    "\\NeedsTeXFormat{LaTeX2e}",
    `\\ProvidesPackage{figurine}[${STY_VERSION} Styles TikZ de Figurine]`,
    "\\RequirePackage{tikz}",
    "\\usetikzlibrary{patterns.meta, decorations.pathmorphing, arrows.meta}",
    `\\definecolor{figgris}{HTML}{${gris}}`,
    "\\tikzset{",
    `  figurine/.style={x=1mm, y=1mm, line cap=round, line join=round, font=${theme.text.tikzFont}},`,
  ];
  for (const [role, s] of Object.entries(theme.strokes)) {
    lines.push(`  fig/${role}/.style={draw=${s.color}, line width=${n(s.width)}mm},`);
  }
  lines.push("  fig/fond blanc/.style={fill=white},");
  lines.push("  fig/fond gris/.style={fill=figgris},");
  for (const [name, h] of Object.entries(theme.hatches)) {
    lines.push(`  fig/hachure ${name}/.style={${hatchTikz(h, theme.hatchColor.tikz)}},`);
  }
  lines.push(`  fig/fleche/.style={-{Stealth[length=${n(theme.arrow.length)}mm, width=${n(theme.arrow.width)}mm]}},`);
  lines.push(`  fig/double fleche/.style={{Stealth[length=${n(theme.arrow.length)}mm, width=${n(theme.arrow.width)}mm]}-{Stealth[length=${n(theme.arrow.length)}mm, width=${n(theme.arrow.width)}mm]}},`);
  lines.push("  fig/texte/.style={inner sep=0.5mm},");
  lines.push("  fig/etiquette/.style={fig/texte, fill=white},");
  lines.push("}");
  // Graphes (pgfplots) : chargé ici pour que \usepackage{figurine} suffise.
  lines.push("\\RequirePackage{pgfplots}");
  lines.push("\\providecommand{\\figurinedatadir}{}");
  lines.push("\\pgfplotsset{");
  lines.push(
    `  fig/graphe/.style={scale only axis, axis line style={line width=${n(theme.strokes["trait fin"].width)}mm}, tick style={line width=${n(theme.strokes["trait fin"].width)}mm}, ` +
      `tick align=inside, tick pos=left, font=${theme.text.tikzFont}, label style={font=${theme.text.tikzFont}}, ` +
      `legend style={font=${theme.text.tikzFont}, draw=black, line width=${n(theme.strokes["trait fin"].width)}mm, fill=white, legend cell align=left}, ` +
      `major grid style={line width=${n(theme.strokes["trait fin"].width)}mm, draw=${theme.graph.gridTikz}}, scaled ticks=false},`,
  );
  const tikzMark: Record<string, string> = { o: "o", square: "square", triangle: "triangle", x: "x", diamond: "diamond", "+": "+" };
  theme.graph.series.forEach((sr, i) => {
    const dash = sr.dash ? `, ${sr.dash}` : ", solid";
    lines.push(
      `  fig/serie ${i + 1}/.style={draw=${sr.tikz}, line width=${n(theme.strokes.trait.width)}mm${dash}, mark=${tikzMark[sr.mark]}, mark size=${n(theme.graph.markSize / 2)}mm, mark options={solid, fill=white}},`,
    );
    lines.push(`  fig/barres ${i + 1}/.style={ybar, area legend, draw=black, line width=${n(theme.strokes["trait fin"].width)}mm, fill=${sr.barTikz}, mark=none},`);
  });
  lines.push("}");
  lines.push("\\endinput");
  return lines.join("\n") + "\n";
}
