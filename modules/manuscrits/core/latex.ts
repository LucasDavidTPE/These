/**
 * Index des sources LaTeX des manuscrits (portage de `lgcb/tex.py`, these-lgcb) : on ne
 * déplace rien, on parcourt la racine « latex » du poste et on classe chaque `.tex` :
 * - figure : classe `standalone`, compilable seule (la plupart des schémas TikZ) ;
 * - document : `article`, `report`, `beamer`… avec `\begin{document}` ;
 * - fragment : pas de `\documentclass`, un chapitre inclus par un fichier maître.
 * En plus de tex.py : ce que chaque fichier inclut (`\input`, `\include`,
 * `\includegraphics`), qui utilise chaque figure, et les figures introuvables.
 * Pur : la lecture des fichiers est faite par l'interface.
 */

export type Nature = "figure" | "document" | "fragment";

export interface Classement {
  nature: Nature;
  documentclass: string;
  titre: string;
}

/** Retire les commentaires (`%` non échappé jusqu'à la fin de la ligne). */
export function sansCommentaires(texte: string): string {
  return texte
    .split(/\r?\n/)
    .map((l) => l.replace(/(?<!\\)%.*$/, ""))
    .join("\n");
}

const DOCUMENTCLASS = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/;
/** Contenu du premier `\commande{…}` (accolades équilibrées), ou null. */
function argument(texte: string, commande: string): string | null {
  const m = new RegExp(`\\\\${commande}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(texte);
  if (!m) return null;
  let profondeur = 1;
  for (let i = m.index + m[0].length; i < texte.length; i++) {
    if (texte[i] === "{" && texte[i - 1] !== "\\") profondeur++;
    else if (texte[i] === "}" && texte[i - 1] !== "\\" && --profondeur === 0) return texte.slice(m.index + m[0].length, i);
  }
  return null;
}

/** classify() de tex.py. */
export function classer(texte: string): Classement {
  const actif = sansCommentaires(texte);
  const documentclass = DOCUMENTCLASS.exec(actif)?.[1]?.trim() ?? "";
  let titre = "";
  // Comme tex.py, sans son défaut : `\title{A \emph{B}}` donne « A B », pas « A {B ».
  const t = argument(actif, "title") ?? argument(actif, "caption");
  if (t) titre = t.replace(/\\[a-zA-Z]+\*?\s*/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  if (!documentclass || !actif.includes("\\begin{document}")) return { nature: "fragment", documentclass, titre };
  return { nature: documentclass === "standalone" ? "figure" : "document", documentclass, titre };
}

/** « schema_2S2P1D » → « schema 2S2P1D » : un titre à défaut de mieux (_humanize). */
export const humaniser = (nom: string) => nom.replace(/[_-]+/g, " ").trim();

export interface Inclusions {
  /** Cibles de \input et \include, telles qu'écrites. */
  entrees: string[];
  /** Cibles de \includegraphics, telles qu'écrites. */
  graphiques: string[];
}

export function inclusions(texte: string): Inclusions {
  const actif = sansCommentaires(texte);
  const tous = (re: RegExp) => [...actif.matchAll(re)].map((m) => m[1]!.trim()).filter(Boolean);
  return {
    entrees: tous(/\\(?:input|include|subfile)\s*\{([^}]+)\}/g),
    graphiques: tous(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g),
  };
}

/** Clé de rapprochement : nom de fichier sans dossier ni extension, en minuscules. */
export const cleFichier = (chemin: string) =>
  chemin
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.(tex|pdf|png|jpe?g|eps|svg)$/i, "")
    .toLowerCase();

export interface Source {
  /** Chemin relatif à la racine « latex ». */
  chemin: string;
  texte: string;
  /** Date de modification (ISO), si connue. */
  modifie?: string;
}

export interface EntreeIndex extends Classement {
  chemin: string;
  nom: string;
  modifie: string;
  inclusions: Inclusions;
  /** Fichiers (sources ou images) qui l'utilisent. */
  utilisePar: string[];
  /** \includegraphics et \input sans fichier correspondant sous la racine. */
  introuvables: string[];
  /** PDF de même nom à côté de la source (compilé). */
  pdf: string | null;
}

/**
 * L'index : une entrée par source, triée par chemin. `autres` : les fichiers non-.tex
 * trouvés (images, PDF), pour résoudre les \includegraphics et repérer les PDF compilés.
 */
export function indexer(sources: readonly Source[], autres: readonly string[]): EntreeIndex[] {
  const parCle = new Map<string, string[]>();
  for (const c of [...sources.map((s) => s.chemin), ...autres]) {
    const k = cleFichier(c);
    parCle.set(k, [...(parCle.get(k) ?? []), c]);
  }
  const pdfs = new Set(autres.filter((a) => /\.pdf$/i.test(a)).map((a) => a.toLowerCase()));
  const entrees = sources.map((s) => {
    const c = classer(s.texte);
    const nom = s.chemin.split("/").pop()!.replace(/\.tex$/i, "");
    const inc = inclusions(s.texte);
    const pdf = s.chemin.replace(/\.tex$/i, ".pdf");
    return {
      ...c,
      titre: c.titre || humaniser(nom),
      chemin: s.chemin,
      nom,
      modifie: s.modifie ?? "",
      inclusions: inc,
      utilisePar: [] as string[],
      introuvables: [...inc.entrees, ...inc.graphiques].filter((x) => !parCle.has(cleFichier(x))),
      pdf: pdfs.has(pdf.toLowerCase()) ? pdf : null,
    };
  });
  const parChemin = new Map(entrees.map((e) => [e.chemin, e]));
  for (const e of entrees) {
    for (const cible of [...e.inclusions.entrees, ...e.inclusions.graphiques]) {
      for (const trouve of parCle.get(cleFichier(cible)) ?? []) {
        // Une figure compilée en PDF et incluse par \includegraphics{schema} : c'est la source schema.tex qui est utilisée.
        const source = parChemin.get(trouve) ?? parChemin.get(trouve.replace(/\.[a-z]+$/i, ".tex"));
        if (source && source !== e && !source.utilisePar.includes(e.chemin)) source.utilisePar.push(e.chemin);
      }
    }
  }
  return entrees.sort((a, b) => a.chemin.localeCompare(b.chemin, "fr"));
}

/** Dossiers ignorés au parcours (section [tex] ignore de config.toml). */
export const IGNORES = ["build", "_build", "out", ".git", "texmf", "node_modules"];
