/**
 * Rapport automatique d'une étude COMSOL : un fichier LaTeX à `\input` dans l'article ou la thèse — cas étudiés,
 * figures de l'étude (pgfplots de la bibliothèque, légende = titre de la figure), tableaux booktabs (valeurs
 * extrêmes, critères de dimensionnement) et **phrases chiffrées** qui comparent les cas entre eux et à un cas de
 * référence, en français ou en anglais. C'est un premier jet exact, à relire et à réécrire, pas un texte final.
 */
import { syntheseLatex, type LigneSynthese } from "./comsolCalcul";
import {
  critereDimensionnant,
  criteresLatex,
  type TableauCriteres,
} from "./comsolCriteres";
import { nombreLatex, texteLatex } from "./comsolLatex";
import { bassinsLatex, type Bassin, type ecartMesure } from "./comsolBassin";
import { maillageLatex, type LigneMaillage } from "./comsolMaillage";

export type Langue = "fr" | "en";

export interface CasRapport {
  fichier: string;
  legende: string;
  /** « Plan x–z (coupe), grille 263 × 65 ». */
  description: string;
}
export interface FigureRapport {
  id: string;
  /** Dossier de la figure dans la bibliothèque (relatif à sa racine). */
  dossier: string;
  titre: string;
  planche?: boolean;
}
export interface DonneesRapport {
  titre: string;
  /** Identifiant de l'étude (étiquettes \label). */
  id: string;
  date: string;
  cas: CasRapport[];
  figures: FigureRapport[];
  synthese: LigneSynthese[];
  /** Unité des longueurs (positions des extrema). */
  longueur: string;
  criteres: TableauCriteres | null;
  trafic: number | null;
  /** Instant ou enveloppe des exports à plusieurs instants (« |max| sur t »), écrit dans le texte. */
  etape?: string;
  /** Bassins de déflexion (et écarts à un bassin mesuré). */
  bassins?: { liste: Bassin[]; ecarts?: (ReturnType<typeof ecartMesure> | null)[] } | null;
  /** Convergence du maillage. */
  maillage?: LigneMaillage[] | null;
}
export interface OptionsRapport {
  langue: Langue;
  virgule: boolean;
  /** Fichier du cas de référence (le cas élastique…) pour les comparaisons ; null : sans. */
  reference: string | null;
  sections: {
    cas: boolean;
    figures: boolean;
    extrema: boolean;
    criteres: boolean;
    bassin?: boolean;
    maillage?: boolean;
  };
}

const pourcent = (x: number, o: { virgule: boolean; langue: Langue }) =>
  `$${x >= 0 ? "+" : "-"}${nombreLatex(Math.abs(x), { virgule: o.virgule, chiffres: 2 }).slice(1, -1)}$\\,\\%`;

/** « A, B et C » / « A, B and C ». */
function liste(xs: readonly string[], langue: Langue): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${langue === "fr" ? "et" : "and"} ${xs.at(-1)}`;
}

// ---- Phrases chiffrées ----

interface Pic {
  ligne: LigneSynthese;
  valeur: number;
  position: Record<string, number>;
}
const picDe = (l: LigneSynthese): Pic =>
  Math.abs(l.max) >= Math.abs(l.min)
    ? { ligne: l, valeur: l.max, position: l.posMax }
    : { ligne: l, valeur: l.min, position: l.posMin };

/**
 * Phrases sur les valeurs extrêmes, une par grandeur : étendue entre cas, position du plus fort, et écarts
 * relatifs au cas de référence (en valeur absolue).
 */
export function phrasesExtrema(
  lignes: readonly LigneSynthese[],
  o: {
    langue: Langue;
    virgule: boolean;
    reference: string | null;
    longueur: string;
  },
): string[] {
  const fr = o.langue === "fr";
  const parGrandeur = new Map<string, LigneSynthese[]>();
  for (const l of lignes)
    parGrandeur.set(l.expression, [
      ...(parGrandeur.get(l.expression) ?? []),
      l,
    ]);
  // coordonnées utiles : celles qui changent d'un extremum à l'autre (pas la coordonnée fixe du plan)
  const coords = lignes.length
    ? Object.keys(lignes[0]!.posMax).filter((k) =>
        lignes.some(
          (l) =>
            l.posMax[k] !== lignes[0]!.posMax[k] ||
            l.posMin[k] !== lignes[0]!.posMax[k],
        ),
      )
    : [];
  const ou = (p: Record<string, number>) =>
    coords
      .map(
        (k) =>
          `$${k.toLowerCase()} = ${nombreLatex(p[k]!, { virgule: o.virgule, chiffres: 4 }).slice(1, -1)}$~${texteLatex(o.longueur)}`,
      )
      .join(", ");
  const n = (v: number) => nombreLatex(v, { virgule: o.virgule });
  const out: string[] = [];
  for (const ls of parGrandeur.values()) {
    const lib = ls[0]!.libelle;
    const G = lib.grandeur.includes("$")
      ? lib.grandeur
      : texteLatex(lib.grandeur);
    const U = lib.unite === "-" ? "" : `~${texteLatex(lib.unite)}`;
    const pics = ls
      .map(picDe)
      .sort((a, b) => Math.abs(a.valeur) - Math.abs(b.valeur));
    const fort = pics.at(-1)!;
    const cas = (p: Pic) => texteLatex(p.ligne.legende);
    let s: string;
    if (pics.length === 1)
      s = fr
        ? `Pour ${G}, la valeur extrême vaut ${n(fort.valeur)}${U} (${cas(fort)})`
        : `For ${G}, the peak value is ${n(fort.valeur)}${U} (${cas(fort)})`;
    else {
      const faible = pics[0]!;
      s = fr
        ? `Pour ${G}, la valeur extrême (en valeur absolue) va de ${n(faible.valeur)}${U} (${cas(faible)}) à ${n(fort.valeur)}${U} (${cas(fort)})`
        : `For ${G}, the peak (absolute) value ranges from ${n(faible.valeur)}${U} (${cas(faible)}) to ${n(fort.valeur)}${U} (${cas(fort)})`;
    }
    if (coords.length)
      s += fr
        ? `${pics.length > 1 ? " ; la plus forte est atteinte" : ","} en ${ou(fort.position)}`
        : `${pics.length > 1 ? "; the largest occurs" : ","} at ${ou(fort.position)}`;
    s += ".";
    const ref = o.reference
      ? pics.find((p) => p.ligne.fichier === o.reference)
      : undefined;
    if (ref && Math.abs(ref.valeur) > 0 && pics.length > 1) {
      const ecarts = pics
        .filter((p) => p !== ref)
        .map((p) => ({
          p,
          e:
            ((Math.abs(p.valeur) - Math.abs(ref.valeur)) /
              Math.abs(ref.valeur)) *
            100,
        }))
        .sort((a, b) => b.e - a.e);
      // moins de 0,5 % d'écart : même valeur que la référence
      const varie = ecarts
        .filter((x) => Math.abs(x.e) >= 0.5)
        .map(
          ({ p, e }) => `${pourcent(e, o)} ${fr ? "pour" : "for"} ${cas(p)}`,
        );
      const memes = ecarts
        .filter((x) => Math.abs(x.e) < 0.5)
        .map(({ p }) => cas(p));
      const debut = fr
        ? ` Rapportée au cas ${cas(ref)} (${n(ref.valeur)}${U}), elle`
        : ` Relative to ${cas(ref)} (${n(ref.valeur)}${U}), it`;
      if (varie.length)
        s += fr
          ? `${debut} varie de ${liste(varie, "fr")}${memes.length ? ` et reste la même pour ${liste(memes, "fr")}` : ""}.`
          : `${debut} changes by ${liste(varie, "en")}${memes.length ? ` and is unchanged for ${liste(memes, "en")}` : ""}.`;
      else
        s += fr
          ? `${debut} est la même pour ${liste(memes, "fr")}.`
          : `${debut} is unchanged for ${liste(memes, "en")}.`;
    }
    out.push(s);
  }
  return out;
}

/** Phrases sur les critères : critère dimensionnant, cycles admissibles rapportés à la référence, dommage. */
export function phrasesCriteres(
  t: TableauCriteres,
  o: {
    langue: Langue;
    virgule: boolean;
    reference: string | null;
    trafic: number | null;
  },
): string[] {
  const fr = o.langue === "fr";
  const n = (v: number) => nombreLatex(v, { virgule: o.virgule });
  const dims = t.lignes
    .map((l) => ({ l, d: critereDimensionnant(l, t.criteres) }))
    .filter(
      (
        x,
      ): x is {
        l: (typeof t.lignes)[number];
        d: NonNullable<ReturnType<typeof critereDimensionnant>>;
      } => x.d !== null,
    );
  if (!dims.length) return [];
  const out: string[] = [];
  const cas = (l: { legende: string }) => texteLatex(l.legende);
  const parCritere = new Map<string, string[]>();
  for (const { l, d } of dims)
    parCritere.set(d.critere.nom, [
      ...(parCritere.get(d.critere.nom) ?? []),
      cas(l),
    ]);
  if (parCritere.size === 1) {
    const nom = texteLatex([...parCritere.keys()][0]!);
    out.push(
      fr
        ? `Le critère dimensionnant est ${nom} pour ${dims.length > 1 ? "tous les cas" : dims.map((x) => cas(x.l))[0]}.`
        : `The governing criterion is ${nom} for ${dims.length > 1 ? "all cases" : dims.map((x) => cas(x.l))[0]}.`,
    );
  } else {
    const parts = [...parCritere].map(
      ([nom, ls]) =>
        `${texteLatex(nom)} ${fr ? "pour" : "for"} ${liste(ls, o.langue)}`,
    );
    out.push(
      fr
        ? `Le critère dimensionnant est ${liste(parts, "fr")}.`
        : `The governing criterion is ${liste(parts, "en")}.`,
    );
  }
  const ref = o.reference
    ? dims.find((x) => x.l.fichier === o.reference)
    : undefined;
  if (ref && dims.length > 1) {
    const rapports = dims
      .filter((x) => x !== ref)
      .map((x) => ({ x, r: ref.d.cycles / x.d.cycles }))
      .sort((a, b) => b.r - a.r)
      .map(({ x, r }) =>
        Math.abs(r - 1) < 0.005
          ? `${fr ? "inchangé pour" : "unchanged for"} ${cas(x.l)}`
          : r >= 1
            ? `${fr ? "divisé par" : "divided by"} ${n(r)} ${fr ? "pour" : "for"} ${cas(x.l)} ($N = ${n(x.d.cycles).slice(1, -1)}$)`
            : `${fr ? "multiplié par" : "multiplied by"} ${n(1 / r)} ${fr ? "pour" : "for"} ${cas(x.l)} ($N = ${n(x.d.cycles).slice(1, -1)}$)`,
      );
    out.push(
      fr
        ? `Par rapport au cas ${cas(ref.l)} ($N = ${n(ref.d.cycles).slice(1, -1)}$ cycles admissibles), le nombre de cycles admissibles du critère dimensionnant est ${liste(rapports, "fr")}.`
        : `Compared with ${cas(ref.l)} ($N = ${n(ref.d.cycles).slice(1, -1)}$ allowable load cycles), the allowable number of cycles for the governing criterion is ${liste(rapports, "en")}.`,
    );
  }
  if (o.trafic) {
    const D = (x: (typeof dims)[number]) => o.trafic! / x.d.cycles;
    const ko = dims.filter((x) => D(x) > 1);
    const okk = dims.filter((x) => D(x) <= 1);
    const T = n(o.trafic);
    const avec = (xs: typeof dims) =>
      xs.map((x) => `${cas(x.l)} ($D = ${n(D(x)).slice(1, -1)}$)`);
    if (fr)
      out.push(
        `Pour un trafic de ${T} cycles, ${ko.length ? `le dommage de Miner dépasse 1 pour ${liste(avec(ko), "fr")} (structure non vérifiée)` : "le dommage de Miner reste inférieur à 1 pour tous les cas"}${ko.length && okk.length ? ` ; il reste inférieur à 1 pour ${liste(avec(okk), "fr")}` : ""}.`,
      );
    else
      out.push(
        `For a design traffic of ${T} cycles, ${ko.length ? `Miner's damage exceeds 1 for ${liste(avec(ko), "en")} (not verified)` : "Miner's damage remains below 1 for all cases"}${ko.length && okk.length ? `; it remains below 1 for ${liste(avec(okk), "en")}` : ""}.`,
      );
  }
  return out;
}

/** Phrases sur les bassins : étendue de D0, du SCI et du rayon de courbure ; écart à la mesure. */
export function phrasesBassins(bs: readonly Bassin[], o: { langue: Langue; virgule: boolean; ecarts?: (ReturnType<typeof ecartMesure> | null)[] }): string[] {
  const fr = o.langue === "fr";
  if (!bs.length) return [];
  const n = (v: number) => nombreLatex(v, { virgule: o.virgule });
  const U = `~${texteLatex(bs[0]!.unite)}`;
  const cas = (b: Bassin) => texteLatex(b.legende);
  const etendue = (k: "D0" | "SCI" | "R", unite: string, nomFr: string, nomEn: string) => {
    const xs = bs.filter((b) => b.indices[k] !== null).sort((a, b) => a.indices[k]! - b.indices[k]!);
    if (!xs.length) return "";
    const a = xs[0]!;
    const b = xs.at(-1)!;
    return xs.length === 1
      ? `${fr ? nomFr : nomEn} ${fr ? "vaut" : "is"} ${n(a.indices[k]!)}${unite} (${cas(a)})`
      : `${fr ? nomFr : nomEn} ${fr ? "va de" : "ranges from"} ${n(a.indices[k]!)}${unite} (${cas(a)}) ${fr ? "à" : "to"} ${n(b.indices[k]!)}${unite} (${cas(b)})`;
  };
  const out: string[] = [];
  const morceaux = [etendue("D0", U, "La déflexion sous la charge $D_0$", "The deflection under the load $D_0$"), etendue("SCI", U, "le SCI", "the SCI"), etendue("R", "~m", "le rayon de courbure", "the radius of curvature")].filter(Boolean);
  if (morceaux.length) out.push(`${morceaux.join(fr ? " ; " : "; ")}.`);
  const ec = (o.ecarts ?? []).flatMap((e, i) => (e ? [{ b: bs[i]!, e }] : []));
  if (ec.length) {
    const meilleur = ec.reduce((a, b) => (b.e.relatif < a.e.relatif ? b : a));
    const liste = ec.map((x) => `${n(x.e.relatif)}\\,\\% (${cas(x.b)})`).join(", ");
    out.push(
      fr
        ? `Comparé au bassin mesuré, l'écart quadratique moyen est de ${liste} ; le cas le plus proche de la mesure est ${cas(meilleur.b)}.`
        : `Compared with the measured basin, the root-mean-square difference is ${liste}; the closest case is ${cas(meilleur.b)}.`,
    );
  }
  return out;
}

/** Phrase sur la convergence du maillage : le plus grand écart sur le pic, et si le maillage grossier suffit. */
export function phrasesMaillage(lignes: readonly LigneMaillage[], o: { langue: Langue; virgule: boolean; legende: (fichier: string) => string; seuil?: number }): string[] {
  if (!lignes.length) return [];
  const fr = o.langue === "fr";
  const seuil = o.seuil ?? 2;
  const pire = lignes.reduce((a, b) => (Math.abs(b.ecartPic) > Math.abs(a.ecartPic) ? b : a));
  const G = pire.libelle.grandeur.includes("$") ? pire.libelle.grandeur : texteLatex(pire.libelle.grandeur);
  const v = nombreLatex(Math.abs(pire.ecartPic), { virgule: o.virgule, chiffres: 2 });
  const l2 = nombreLatex(Math.max(...lignes.map((l) => l.l2)), { virgule: o.virgule, chiffres: 2 });
  const ok = Math.abs(pire.ecartPic) <= seuil;
  const s = nombreLatex(seuil, { virgule: o.virgule });
  const cas = texteLatex(o.legende(pire.paire.grossier));
  return [
    fr
      ? `Entre le maillage grossier et le maillage raffiné, l'écart sur le pic ne dépasse pas ${v}\\,\\% (${G}, ${cas}) et l'écart en norme $L_2$ ne dépasse pas ${l2}\\,\\% ; ${ok ? `le maillage grossier est suffisant (écart inférieur à ${s}\\,\\%)` : `le maillage grossier n'est pas convergé pour cette grandeur (écart supérieur à ${s}\\,\\%)`}.`
      : `Between the coarse and the refined mesh, the peak difference does not exceed ${v}\\,\\% (${G}, ${cas}) and the $L_2$ difference does not exceed ${l2}\\,\\%; ${ok ? `the coarse mesh is sufficient (difference below ${s}\\,\\%)` : `the coarse mesh is not converged for this quantity (difference above ${s}\\,\\%)`}.`,
  ];
}

// ---- Document ----

const etiquette = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Le rapport complet : sections cochées, prêt à `\input` (préambule : booktabs, figurine). */
export function rapportLatex(d: DonneesRapport, o: OptionsRapport): string {
  const fr = o.langue === "fr";
  const id = etiquette(d.id) || "comsol";
  const out: string[] = [
    `% ${fr ? "Rapport généré par Thèse" : "Report generated by Thèse"} (${d.date}) — ${fr ? "étude" : "study"} « ${d.titre} ».`,
    `% ${fr ? "Premier jet à relire. Préambule : \\usepackage{booktabs} et, pour les figures, \\usepackage{figurine} (pgfplots)." : "First draft, to be checked. Preamble: \\usepackage{booktabs} and, for figures, \\usepackage{figurine} (pgfplots)."}`,
    `% \\cheminFigures : ${fr ? "dossier de la bibliothèque de figures vu depuis ce document (à adapter)." : "folder of the figure library, as seen from this document (to adapt)."}`,
    "\\providecommand{\\cheminFigures}{figures}",
    "",
    `\\section{${fr ? "Résultats COMSOL" : "COMSOL results"} : ${texteLatex(d.titre)}}`,
    `\\label{sec:${id}}`,
    "",
  ];
  if (d.etape)
    out.push(
      fr
        ? `% Exports à plusieurs instants : ${texteLatex(d.etape)}.`
        : `% Multi-instant exports: ${texteLatex(d.etape)}.`,
      "",
    );
  if (o.sections.cas && d.cas.length) {
    out.push(
      `\\subsection{${fr ? "Cas étudiés" : "Cases"}}`,
      "\\begin{table}[htbp]",
      "\\centering",
      `\\caption{${fr ? "Cas calculés et fichiers COMSOL exportés." : "Computed cases and exported COMSOL files."}}`,
      `\\label{tab:${id}-cas}`,
      "\\begin{tabular}{lll}",
      "\\toprule",
      fr ? "Cas & Fichier & Export \\\\" : "Case & File & Export \\\\",
      "\\midrule",
      ...d.cas.map(
        (c) =>
          `${texteLatex(c.legende)} & \\texttt{${texteLatex(c.fichier)}} & ${texteLatex(c.description)} \\\\`,
      ),
      "\\bottomrule",
      "\\end{tabular}",
      "\\end{table}",
      "",
    );
  }
  if (o.sections.figures && d.figures.length) {
    out.push(`\\subsection{${fr ? "Figures" : "Figures"}}`, "");
    for (const f of d.figures)
      out.push(
        "\\begin{figure}[htbp]",
        "\\centering",
        `\\input{\\cheminFigures/${f.dossier}/export.tex}`,
        `\\caption{${texteLatex(f.titre)}.}`,
        `\\label{fig:${etiquette(f.id)}}`,
        "\\end{figure}",
        "",
      );
  }
  if (o.sections.extrema && d.synthese.length) {
    out.push(
      `\\subsection{${fr ? "Valeurs extrêmes" : "Peak values"}}`,
      "",
      ...phrasesExtrema(d.synthese, {
        langue: o.langue,
        virgule: o.virgule,
        reference: o.reference,
        longueur: d.longueur,
      }).map((p) => `${p}\n`),
    );
    out.push(
      syntheseLatex(d.synthese, {
        longueur: d.longueur,
        virgule: o.virgule,
        anglais: !fr,
        legende: fr
          ? "Valeurs extrêmes et positions, par cas (exports COMSOL)."
          : "Peak values and their locations, per case (COMSOL exports).",
      }).replace(
        "\\end{tabular}",
        `\\end{tabular}\n\\label{tab:${id}-extrema}`,
      ),
    );
  }
  if (o.sections.criteres && d.criteres && d.criteres.lignes.length) {
    out.push(
      `\\subsection{${fr ? "Critères de dimensionnement" : "Design criteria"}}`,
      "",
      ...phrasesCriteres(d.criteres, {
        langue: o.langue,
        virgule: o.virgule,
        reference: o.reference,
        trafic: d.trafic,
      }).map((p) => `${p}\n`),
    );
    out.push(
      criteresLatex(d.criteres, {
        virgule: o.virgule,
        trafic: d.trafic,
        anglais: !fr,
        legende: fr
          ? "Déformations critiques et nombres de cycles admissibles."
          : "Critical strains and allowable numbers of load cycles.",
      }).replace(
        "\\end{tabular}",
        `\\end{tabular}\n\\label{tab:${id}-criteres}`,
      ),
    );
  }
  if (o.sections.bassin && d.bassins?.liste.length) {
    const ecarts = d.bassins.ecarts ? { ecarts: d.bassins.ecarts } : {};
    out.push(`\\subsection{${fr ? "Bassin de déflexion" : "Deflection basin"}}`, "", ...phrasesBassins(d.bassins.liste, { langue: o.langue, virgule: o.virgule, ...ecarts }).map((p) => `${p}\n`));
    out.push(bassinsLatex(d.bassins.liste, { virgule: o.virgule, ...ecarts }).replace("\\end{tabular}", `\\end{tabular}\n\\label{tab:${id}-bassin}`));
  }
  if (o.sections.maillage && d.maillage?.length) {
    const nom = (f: string) => d.cas.find((c) => c.fichier === f)?.legende ?? f.replace(/\.(txt|csv|dat)$/i, "");
    out.push(`\\subsection{${fr ? "Convergence du maillage" : "Mesh convergence"}}`, "", ...phrasesMaillage(d.maillage, { langue: o.langue, virgule: o.virgule, legende: nom }).map((p) => `${p}\n`));
    out.push(maillageLatex(d.maillage, nom, { virgule: o.virgule, anglais: !fr }).replace("\\end{tabular}", `\\end{tabular}\n\\label{tab:${id}-maillage}`));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
