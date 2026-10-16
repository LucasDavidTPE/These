/** Texte et nombres pour LaTeX (pdflatex) : tableaux et rapports tirés des exports COMSOL. */

const EXPOSANTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * Texte libre (titres, légendes) pour LaTeX compilé avec pdflatex : `$…$` gardé tel quel ; ailleurs, caractères
 * spéciaux protégés, lettres grecques des grandeurs (εzz, σ1, Δ), µ, signe moins, ·, ×, exposants convertis.
 */
export function texteLatex(s: string): string {
  return s
    .split(/(\$[^$]*\$)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/([%&#_])/g, "\\$1")
            .replace(/~/g, "\\textasciitilde{}")
            .replace(/\^/g, "\\textasciicircum{}")
            .replace(
              /([εσ])(eq|VM|[xyz]{2}|[123]|[tzrθ](?![A-Za-z]))?/g,
              (_, g: string, k: string | undefined) =>
                `\\ensuremath{${g === "ε" ? "\\varepsilon" : "\\sigma"}${k ? `_{${k}}` : ""}}`,
            )
            .replace(/Δ/g, "\\ensuremath{\\Delta}")
            .replace(/[µμ]/g, "\\textmu{}")
            .replace(/−/g, "\\ensuremath{-}")
            .replace(/·/g, "\\ensuremath{\\cdot}")
            .replace(/×/g, "\\ensuremath{\\times}")
            .replace(/≤/g, "\\ensuremath{\\leq}")
            .replace(/≥/g, "\\ensuremath{\\geq}")
            .replace(/→/g, "\\ensuremath{\\rightarrow}")
            .replace(
              /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g,
              (m) =>
                `\\textsuperscript{${[...m].map((c) => (c === "⁻" ? "-" : String(EXPOSANTS.indexOf(c)))).join("")}}`,
            ),
    )
    .join("");
}

/** Nombre en mode math : `$-129$`, `$1{,}5$`, `$5{,}8 \cdot 10^{4}$` (grands et petits nombres). */
export function nombreLatex(
  v: number,
  o: { virgule: boolean; chiffres?: number },
): string {
  if (!Number.isFinite(v)) return "--";
  const ch = o.chiffres ?? 3;
  const dec = (t: string) => (o.virgule ? t.replace(".", "{,}") : t);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) {
    const e = Math.floor(Math.log10(a));
    const m = Number((v / 10 ** e).toPrecision(ch));
    return `$${m === 1 ? "" : `${dec(String(m))} \\cdot `}10^{${e}}$`;
  }
  return `$${dec(String(Number(v.toPrecision(ch))))}$`;
}
