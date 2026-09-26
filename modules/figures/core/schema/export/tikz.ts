/**
 * Export TikZ déterministe et retouchable (SPEC §7) : s'appuie sur `\usepackage{figurine}`,
 * un commentaire par élément, styles nommés, coordonnées en mm arrondies au centième,
 * y vers le haut (origine en bas à gauche de la planche).
 */
import type { Fill, Primitive, Seg, StrokeRole } from "../geometry";
import { THEMES } from "../theme";
import type { Pt } from "../types";
import { n, prepare } from "./common";
import { generateSty } from "./sty";

export interface TikzOptions {
  /** Document compilable seul (classe standalone, figurine.sty inclus). */
  standalone?: boolean;
}

/**
 * Texte d'étiquette pour LaTeX : les parties `$…$` sont laissées brutes ; ailleurs on
 * protège les caractères spéciaux courants (% & # _ ~ ^) mais on garde \commandes et {}.
 */
export function latexText(s: string): string {
  return s
    .split(/(\$[^$]*\$)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/([%&#_])/g, "\\$1")
            .replace(/~/g, "\\textasciitilde{}")
            .replace(/\^/g, "\\textasciicircum{}"),
    )
    .join("");
}

export function tikzPicture(raw: unknown): string {
  const { doc, layout } = prepare(raw);
  const theme = THEMES[doc.theme]!;
  const H = doc.canvas.height;
  const c = (p: Pt) => `(${n(p[0])},${n(H - p[1])})`;

  const opts = (stroke: StrokeRole | null, fill: Fill): string => {
    const o: string[] = [];
    if (stroke) o.push(`fig/${stroke}`);
    if (fill === "blanc") o.push("fig/fond blanc");
    else if (fill === "gris") o.push("fig/fond gris");
    else if (fill !== "none") o.push(`fig/${fill}`);
    return o.join(", ");
  };
  const cmd = (stroke: StrokeRole | null, fill: Fill) => (stroke && fill !== "none" ? "\\filldraw" : fill !== "none" ? "\\fill" : "\\draw");

  const pathTikz = (segs: Seg[]): string => {
    let start: Pt | null = null;
    return segs
      .map((s, i) => {
        switch (s.op) {
          case "M":
            start = s.p;
            return (i === 0 ? "" : " ") + c(s.p);
          case "L":
            return ` -- ${c(s.p)}`;
          case "C":
            return ` .. controls ${c(s.c1)} and ${c(s.c2)} .. ${c(s.p)}`;
          case "Z":
            return start ? " -- cycle" : "";
        }
      })
      .join("");
  };

  const prim = (p: Primitive): string => {
    switch (p.kind) {
      case "path":
        return `${cmd(p.stroke, p.fill)}[${opts(p.stroke, p.fill)}${p.dash === "dotted" ? ", dotted" : p.dash ? ", dashed" : ""}] ${pathTikz(p.segs)};`;
      case "rect":
        return `${cmd(p.stroke, p.fill)}[${opts(p.stroke, p.fill)}] ${c([p.x, p.y + p.h])} rectangle ${c([p.x + p.w, p.y])};`;
      case "circle":
        return `${cmd(p.stroke, p.fill)}[${opts(p.stroke, p.fill)}] ${c(p.c)} circle[radius=${n(p.r)}];`;
      case "zigzag":
        return (
          `\\draw[fig/${p.stroke}, decorate, decoration={zigzag, segment length=${n(p.segment)}mm, ` +
          `amplitude=${n(p.amplitude)}mm, pre length=${n(p.pre)}mm, post length=${n(p.post)}mm}] ${c(p.from)} -- ${c(p.to)};`
        );
      case "arrow": {
        const style = p.head === "both" ? "fig/double fleche" : "fig/fleche";
        const [a, b] = p.head === "start" ? [p.to, p.from] : [p.from, p.to];
        return `\\draw[fig/${p.stroke}, ${style}] ${c(a)} -- ${c(b)};`;
      }
      case "text": {
        const font = (p.size && p.size !== "normal" ? `, font=${theme.text.sizes[p.size].tikzFont}` : "") + (p.rotate ? `, rotate=${n(p.rotate)}` : "");
        return `\\node[${p.halo ? "fig/etiquette" : "fig/texte"}, anchor=${p.anchor}${font}] at ${c(p.at)} {${latexText(p.text)}};`;
      }
    }
  };

  const out: string[] = [
    `% Figure générée par Figurine -- format ${doc.format}, thème « ${doc.theme} ».`,
    "% Nécessite \\usepackage{figurine} (figurine.sty, copiable depuis l'appli).",
    `% Unités : mm ; origine en bas à gauche de la planche (${n(doc.canvas.width)} × ${n(H)} mm).`,
    "\\begin{tikzpicture}[figurine]",
    `\\useasboundingbox (0,0) rectangle (${n(doc.canvas.width)},${n(H)});`,
  ];
  for (const p of layout.placed) {
    out.push("");
    out.push(`% ${p.item.id} : ${p.def.label} -- ${p.def.summary(p.item.params, p.ctx)}`);
    for (const pr of p.primitives) out.push(prim(pr));
  }
  out.push("\\end{tikzpicture}");
  return out.join("\n") + "\n";
}

/** Export TikZ : l'environnement seul, ou un document standalone avec figurine.sty inclus. */
export function exportTikz(raw: unknown, options: TikzOptions = {}): string {
  const picture = tikzPicture(raw);
  if (!options.standalone) return picture;
  const { doc } = prepare(raw);
  return [
    "\\begin{filecontents*}[overwrite]{figurine.sty}",
    generateSty(THEMES[doc.theme]!).trimEnd(),
    "\\end{filecontents*}",
    "\\documentclass[tikz, border=1mm]{standalone}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{lmodern}",
    "\\usepackage{figurine}",
    "\\begin{document}",
    picture.trimEnd(),
    "\\end{document}",
    "",
  ].join("\n");
}
