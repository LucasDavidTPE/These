/**
 * Animation d'une carte au cours des instants d'un export (charge roulante, pulse) : une image par instant, à la
 * même échelle de couleurs, l'instant écrit sous l'axe ; puis un GIF animé (PowerPoint, Word, courriel) ou des
 * images avec le code LaTeX `\animategraphics` (paquet animate, pour Beamer).
 */
import { bornesCarte } from "./carte";
import {
  executerTrace,
  type ContexteTrace,
  type TraceCarte,
} from "./comsolEtude";
import type { Parametre } from "./comsolInstants";
import type { GraphDoc } from "./model";

/** Les cartes de chaque instant, bornes de couleurs communes (celles de l'ensemble des instants). */
export function imagesInstants(
  t: TraceCarte,
  c: ContexteTrace,
  p: Parametre,
  valeurs: readonly string[],
): { valeur: string; doc: GraphDoc }[] {
  const docs = valeurs.flatMap((v) => {
    const r = executerTrace(
      { ...t, etape: { ...(t.etape ?? {}), [p.nom]: { valeur: v } } },
      c,
    );
    return r?.doc.carte ? [{ valeur: v, doc: r.doc }] : [];
  });
  if (!docs.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const { doc } of docs) {
    const [a, b] = bornesCarte(doc.carte!);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  const u = p.unite ? ` ${p.unite}` : "";
  return docs.map(({ valeur, doc }) => ({
    valeur,
    doc: {
      ...doc,
      carte: { ...doc.carte!, min: lo, max: hi },
      x: {
        ...doc.x,
        label: `${doc.x.label} — $${p.nom}$ = ${valeur.replace(/\s.*$/, "")}${u}`,
      },
    },
  }));
}

/** Code LaTeX d'une animation (paquet `animate`) : images `prefixe0.png` … `prefixe{n−1}.png`. */
export function animationBeamer(o: {
  n: number;
  parSeconde: number;
  prefixe: string;
  largeur?: string;
}): string {
  const ips = Math.max(0.1, Number(o.parSeconde.toPrecision(3)));
  return [
    "% Animation générée par Thèse (cartes COMSOL au cours du temps). Préambule : \\usepackage{animate}.",
    "% Les images sont dans le même dossier que ce fichier (ou adapter le chemin du préfixe).",
    `\\animategraphics[controls, loop, autoplay, width=${o.largeur ?? "\\linewidth"}]{${ips}}{${o.prefixe}}{0}{${o.n - 1}}`,
    "",
  ].join("\n");
}
