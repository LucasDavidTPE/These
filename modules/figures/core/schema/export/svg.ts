/**
 * Export SVG déterministe (SPEC §7) : taille en mm, fond transparent, un groupe commenté
 * par élément, hachures en <pattern>. Les maths `$…$` restent en texte brut ici ; leur
 * conversion en chemins (MathJax) arrive avec les annotations (S7).
 */
import type { Fill, Primitive, Seg, StrokeRole, TextAnchor } from "../geometry";
import { along, stealthHead, zigzagPoints } from "../geometry";
import { hasMath, labelToSvg } from "../../math/tex";
import { THEMES, type Hatch, type Theme } from "../theme";
import { n, prepare, usedHatches } from "./common";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function comment(s: string): string {
  return `<!-- ${s.replace(/--/g, "- -")} -->`;
}

function hatchId(name: string): string {
  return `fig-hachure-${name}`;
}

export function patternDef(name: string, h: Hatch, color: string): string {
  const id = hatchId(name);
  if (h.kind === "dots") {
    const s = h.spacing;
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(s)}" height="${n(s)}"><circle cx="${n(s / 2)}" cy="${n(s / 2)}" r="${n(h.radius)}" fill="${color}"/></pattern>`;
  }
  const s = h.spacing;
  const line = `<line x1="0" y1="${n(s / 2)}" x2="${n(s)}" y2="${n(s / 2)}" stroke="${color}" stroke-width="${n(h.width)}"/>`;
  const cross = h.kind === "cross" ? `<line x1="${n(s / 2)}" y1="0" x2="${n(s / 2)}" y2="${n(s)}" stroke="${color}" stroke-width="${n(h.width)}"/>` : "";
  // Angle TikZ (sens trigonométrique, y vers le haut) → rotation SVG (y vers le bas).
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(s)}" height="${n(s)}" patternTransform="rotate(${n(-h.angle)})">${line}${cross}</pattern>`;
}

function paint(theme: Theme, stroke: StrokeRole | null, fill: Fill, color?: string, fillColor?: string): string {
  let fillAttr = fillColor ?? "none";
  if (fillColor) {
    // Couleur imposée (graphes) : prioritaire.
  } else if (fill === "blanc") fillAttr = "white";
  else if (fill === "gris") fillAttr = theme.fills.gris;
  else if (fill.startsWith("hachure ")) fillAttr = `url(#${hatchId(fill.slice(8))})`;
  const strokeAttr = stroke ? ` stroke="${color ?? theme.strokes[stroke].color}" stroke-width="${n(theme.strokes[stroke].width)}"` : "";
  return `fill="${fillAttr}"${strokeAttr}`;
}

export function pathData(segs: Seg[]): string {
  return segs
    .map((s) => {
      switch (s.op) {
        case "M":
          return `M${n(s.p[0])} ${n(s.p[1])}`;
        case "L":
          return `L${n(s.p[0])} ${n(s.p[1])}`;
        case "C":
          return `C${n(s.c1[0])} ${n(s.c1[1])} ${n(s.c2[0])} ${n(s.c2[1])} ${n(s.p[0])} ${n(s.p[1])}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

const H_ANCHOR: Record<string, string> = { west: "start", east: "end" };
function textAttrs(anchor: TextAnchor): string {
  const h = anchor.split(" ").find((w) => w === "west" || w === "east");
  const v = anchor.split(" ").find((w) => w === "north" || w === "south");
  const ta = h ? H_ANCHOR[h] : "middle";
  const db = v === "north" ? "hanging" : v === "south" ? "alphabetic" : "central";
  return `text-anchor="${ta}" dominant-baseline="${db}"`;
}

/** Une primitive en SVG (utilisé aussi par l'éditeur, pour un rendu identique à l'export). */
export function primitiveSvg(theme: Theme, p: Primitive): string {
  switch (p.kind) {
    case "path": {
      const w = theme.strokes[p.stroke ?? "trait"].width;
      const dash = p.dash === "dotted" ? ` stroke-dasharray="${n(w)} ${n(w * 3)}"` : p.dash ? ` stroke-dasharray="${n(w * 6)} ${n(w * 4)}"` : "";
      return `<path d="${pathData(p.segs)}" ${paint(theme, p.stroke, p.fill, p.color, p.fillColor)}${dash}/>`;
    }
    case "rect":
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" ${paint(theme, p.stroke, p.fill, p.color, p.fillColor)}/>`;
    case "circle":
      return `<circle cx="${n(p.c[0])}" cy="${n(p.c[1])}" r="${n(p.r)}" ${paint(theme, p.stroke, p.fill, p.color, p.fillColor)}/>`;
    case "zigzag": {
      const pts = zigzagPoints(p).map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
      return `<polyline points="${pts}" ${paint(theme, p.stroke, "none")}/>`;
    }
    case "arrow": {
      const { length, width } = theme.arrow;
      const color = theme.strokes[p.stroke].color;
      // Le trait s'arrête sous la pointe pour ne pas dépasser (comme TikZ).
      const a = p.head === "start" || p.head === "both" ? along(p.from, p.to, length * 0.75) : p.from;
      const b = p.head === "end" || p.head === "both" ? along(p.to, p.from, length * 0.75) : p.to;
      const head = (from: typeof p.from, tip: typeof p.to) =>
        `<path d="M${stealthHead(from, tip, length, width).map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z" fill="${color}"/>`;
      const parts = [`<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" ${paint(theme, p.stroke, "none")}/>`];
      if (p.head !== "start") parts.push(head(p.from, p.to));
      if (p.head !== "end") parts.push(head(p.to, p.from));
      return parts.join("");
    }
    case "text": {
      const size = theme.text.sizeMm * (p.size && p.size !== "normal" ? theme.text.sizes[p.size].factor : 1);
      let out: string;
      const m = hasMath(p.text) ? labelToSvg(p.text) : null;
      if (m && !m.error) out = mathSvg(theme, p.at, p.anchor, size, m, p.halo);
      else {
        const sizeAttr = size !== theme.text.sizeMm ? ` font-size="${n(size)}"` : "";
        const halo = p.halo ? ` stroke="white" stroke-width="0.8" paint-order="stroke"` : "";
        out = `<text x="${n(p.at[0])}" y="${n(p.at[1])}" ${textAttrs(p.anchor)}${sizeAttr} fill="${theme.ink}"${halo}>${escapeXml(p.text)}</text>`;
      }
      // Rotation (sens trigonométrique visuel, comme TikZ) autour du point d'accroche.
      return p.rotate ? `<g transform="rotate(${n(-p.rotate)} ${n(p.at[0])} ${n(p.at[1])})">${out}</g>` : out;
    }
  }
}

/**
 * Étiquette avec maths : chemins MathJax placés selon l'ancre (même convention que TikZ),
 * avec un fond blanc si `halo`.
 */
function mathSvg(theme: Theme, at: [number, number], anchor: TextAnchor, size: number, m: ReturnType<typeof labelToSvg>, halo: boolean): string {
  const k = size / 1000;
  const [minX, minY, vw, vh] = m.viewBox;
  const w = vw * k;
  const h = vh * k;
  const words = anchor.split(" ");
  const x0 = words.includes("west") ? at[0] : words.includes("east") ? at[0] - w : at[0] - w / 2;
  const y0 = words.includes("north") ? at[1] : words.includes("south") ? at[1] - h : at[1] - h / 2;
  const body = m.body.replace(/currentColor/g, theme.ink);
  const pad = 0.5;
  const bg = halo ? `<rect x="${n(x0 - pad)}" y="${n(y0 - pad)}" width="${n(w + 2 * pad)}" height="${n(h + 2 * pad)}" fill="white"/>` : "";
  return `${bg}<g transform="translate(${n(x0 - minX * k)} ${n(y0 - minY * k)}) scale(${formatScale(k)})">${body}</g>`;
}

/** Échelle MathJax : plus de décimales que les coordonnées (1 unité = 1/1000 em). */
function formatScale(k: number): string {
  return String(Math.round(k * 1e6) / 1e6);
}

/** Figure (format pivot, brut ou déjà validé) → document SVG. */
export function exportSvg(raw: unknown): string {
  const { doc, layout } = prepare(raw);
  const theme = THEMES[doc.theme]!;
  const { width: W, height: H } = doc.canvas;
  const out: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}" font-family="${escapeXml(theme.text.svgFamily)}" font-size="${n(theme.text.sizeMm)}" stroke-linecap="round" stroke-linejoin="round">`,
    `  ${comment(`Figure générée par Figurine (${doc.format}, thème « ${doc.theme} »)`)}`,
  ];
  const hatches = usedHatches(layout);
  if (hatches.length > 0) {
    out.push("  <defs>");
    for (const h of hatches) out.push(`    ${patternDef(h, theme.hatches[h]!, theme.hatchColor.svg)}`);
    out.push("  </defs>");
  }
  for (const p of layout.placed) {
    out.push(`  ${comment(`${p.item.id} : ${p.def.label} — ${p.def.summary(p.item.params, p.ctx)}`)}`);
    out.push(`  <g id="${escapeXml(p.item.id)}" data-type="${escapeXml(p.item.type)}">`);
    for (const prim of p.primitives) out.push(`    ${primitiveSvg(theme, prim)}`);
    out.push("  </g>");
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}
