/**
 * Maths `$…$` des étiquettes → chemins SVG (MathJax 3, polices TeX), pour l'export SVG et
 * l'éditeur (SPEC §7). Le TikZ garde le LaTeX brut. Sortie déterministe (pas de cache de
 * glyphes partagé : chaque formule contient ses chemins).
 */
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

export interface MathSvg {
  /** Contenu SVG (chemins), dans un repère où 1000 unités = 1 em, ligne de base en y = 0. */
  body: string;
  /** viewBox de MathJax : [minX, minY, largeur, hauteur] (minY = −hauteur au-dessus de la ligne de base). */
  viewBox: [number, number, number, number];
  /** Erreur de syntaxe TeX (la formule est alors rendue en rouge par MathJax). */
  error: string | null;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "textmacros"], formatError: (_jax: unknown, err: { message: string }) => { throw new Error(err.message); } }),
  OutputJax: new SVG({ fontCache: "none" }),
});

const cache = new Map<string, MathSvg>();

/** Une étiquette contient-elle des maths ? */
export function hasMath(label: string): boolean {
  return /\$[^$]+\$/.test(label);
}

/**
 * Lettres accentuées → accents TeX (`é` → `\'{e}`) : les polices TeX de MathJax n'ont pas
 * les caractères précomposés ; l'extension textmacros compose l'accent comme LaTeX.
 */
const ACCENTS: Record<string, string> = { "\u0301": "'", "\u0300": "`", "\u0302": "^", "\u0308": '"', "\u0303": "~" };
const SPECIAL: Record<string, string> = {
  ç: "\\c{c}",
  Ç: "\\c{C}",
  œ: "\\oe{}",
  Œ: "\\OE{}",
  æ: "\\ae{}",
  ß: "\\ss{}",
  µ: "$\\mu$",
  "°": "$^{\\circ}$",
  "’": "'",
  "\u00a0": "~",
  "\u202f": "\\,",
  "\u2009": "\\,",
  "–": "--",
  "—": "---",
  "«": "\\guillemotleft{}",
  "»": "\\guillemotright{}",
};

function textToTex(part: string): string {
  let out = "";
  for (const ch of part) {
    if (SPECIAL[ch]) {
      out += SPECIAL[ch];
      continue;
    }
    const d = ch.normalize("NFD");
    if (d.length === 2 && ACCENTS[d[1]!]) out += `\\${ACCENTS[d[1]!]}{${d[0] === "i" ? "\\i" : d[0]}}`;
    else if ("\\{}%&#_$".includes(ch)) out += ch === "\\" ? "\\textbackslash{}" : `\\${ch}`;
    else if (ch === "~") out += "\\textasciitilde{}";
    else out += ch;
  }
  return out;
}

/** Texte hors maths → `\text{…}` (accents et caractères spéciaux convertis) ; maths gardées. */
export function labelToTex(label: string): string {
  return label
    .split(/(\$[^$]*\$)/)
    .map((part, i) => {
      if (i % 2 === 1) return part.slice(1, -1);
      if (part === "") return "";
      return `\\text{${textToTex(part)}}`;
    })
    .join("");
}

/** Convertit une étiquette (texte + `$…$`) en SVG. Mise en cache. */
export function labelToSvg(label: string): MathSvg {
  const hit = cache.get(label);
  if (hit) return hit;
  const tex = labelToTex(label);
  let result: MathSvg;
  try {
    const node = document.convert(tex, { display: false });
    const svg = adaptor.firstChild(node) as Parameters<typeof adaptor.getAttribute>[0];
    const vb = (adaptor.getAttribute(svg, "viewBox") ?? "0 0 0 0").split(/\s+/).map(Number) as [number, number, number, number];
    result = { body: adaptor.innerHTML(svg), viewBox: vb, error: null };
  } catch (e) {
    // Formule invalide : on retombe sur le texte brut (l'erreur est remontée à l'interface).
    result = { body: "", viewBox: [0, 0, 0, 0], error: e instanceof Error ? e.message : String(e) };
  }
  if (cache.size > 2000) cache.clear();
  cache.set(label, result);
  return result;
}

/** Taille d'une étiquette en mm pour une taille de police `sizeMm` (maths : exacte ; texte : estimée). */
export function measureLabel(label: string, sizeMm: number): { w: number; h: number } {
  if (hasMath(label)) {
    const m = labelToSvg(label);
    if (!m.error) return { w: (m.viewBox[2] * sizeMm) / 1000, h: (m.viewBox[3] * sizeMm) / 1000 };
  }
  return { w: Math.max(1, label.length) * sizeMm * 0.5, h: sizeMm * 1.2 };
}
