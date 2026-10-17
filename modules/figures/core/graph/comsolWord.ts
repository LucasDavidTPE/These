/**
 * Rapport COMSOL en Word : le rapport LaTeX (`rapportLatex`) relu et converti en blocs .docx — sections en
 * titres, phrases chiffrées en paragraphes (ε, indices, exposants, ×10ⁿ), tableaux booktabs en tableaux Word
 * (cases fusionnées des \multicolumn), figures de l'étude en images PNG, légendes numérotées par Word. Le
 * sous-ensemble de LaTeX lu est celui que produit `rapportLatex`, pas du LaTeX quelconque.
 */
import type { Bloc, Case, Morceau } from "@noyau/formats/docx-ecriture";

const SYMBOLES: Record<string, string> = {
  varepsilon: "ε",
  epsilon: "ε",
  sigma: "σ",
  Delta: "Δ",
  cdot: "·",
  times: "×",
  leq: "≤",
  geq: "≥",
  rightarrow: "→",
  textmu: "µ",
  textasciitilde: "~",
  textasciicircum: "^",
  ldots: "…",
};

/** Lit un groupe `{…}` à partir de `i` (sur l'accolade ouvrante) ; renvoie son contenu et la position après. */
function groupe(s: string, i: number): [string, number] {
  if (s[i] !== "{") return [s[i] ?? "", i + 1];
  let prof = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") prof++;
    else if (s[j] === "}" && --prof === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

/** Texte LaTeX (sous-ensemble du rapport) → morceaux Word. */
export function latexEnMorceaux(
  s: string,
  base: Omit<Morceau, "texte"> = {},
  math = false,
): Morceau[] {
  const out: Morceau[] = [];
  const pousser = (texte: string, style: Omit<Morceau, "texte"> = base) => {
    if (!texte) return;
    const der = out.at(-1);
    const meme =
      der &&
      (["gras", "italique", "indice", "exposant", "fixe"] as const).every(
        (k) => Boolean(der[k]) === Boolean(style[k]),
      );
    if (meme) der.texte += texte;
    else out.push({ ...style, texte });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "$") {
      const fin = s.indexOf("$", i + 1);
      const corps = s.slice(i + 1, fin < 0 ? s.length : fin);
      for (const m of latexEnMorceaux(corps, base, true)) pousser(m.texte, m);
      i = fin < 0 ? s.length : fin + 1;
    } else if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))!;
      const nom = m[1]!;
      i += m[0].length;
      if (nom === ",") pousser(" ");
      else if (
        nom === "%" ||
        nom === "&" ||
        nom === "#" ||
        nom === "_" ||
        nom === "$" ||
        nom === "{" ||
        nom === "}"
      )
        pousser(nom);
      else if (nom === "\\") pousser(" ");
      else if (SYMBOLES[nom] !== undefined) {
        if (s[i] === "{" && s[i + 1] === "}") i += 2;
        pousser(
          SYMBOLES[nom]!,
          math && /^[a-zA-Z]+$/.test(nom) && nom !== "cdot" && nom !== "times"
            ? { ...base, italique: false }
            : base,
        );
      } else if (
        [
          "textsuperscript",
          "textsubscript",
          "texttt",
          "textbf",
          "textit",
          "emph",
          "ensuremath",
          "mathrm",
          "text",
        ].includes(nom)
      ) {
        const [contenu, j] = groupe(s, i);
        i = j;
        const style: Omit<Morceau, "texte"> =
          nom === "textsuperscript"
            ? { ...base, exposant: true }
            : nom === "textsubscript"
              ? { ...base, indice: true }
              : nom === "texttt"
                ? { ...base, fixe: true }
                : nom === "textbf"
                  ? { ...base, gras: true }
                  : nom === "textit" || nom === "emph"
                    ? { ...base, italique: true }
                    : base;
        for (const x of latexEnMorceaux(
          contenu,
          style,
          nom === "ensuremath"
            ? true
            : nom === "mathrm" || nom === "text"
              ? false
              : math,
        ))
          pousser(x.texte, x);
      } else if (nom === "label" || nom === "ref") i = groupe(s, i)[1];
      // commande inconnue : ignorée, son argument éventuel est lu comme du texte
    } else if (math && (c === "_" || c === "^")) {
      const [contenu, j] = groupe(s, i + 1);
      i = j;
      for (const x of latexEnMorceaux(
        contenu,
        c === "_" ? { ...base, indice: true } : { ...base, exposant: true },
        true,
      ))
        pousser(x.texte, x);
    } else if (c === "{" || c === "}") {
      // « {,} » : la virgule décimale en mode math
      if (s.startsWith("{,}", i)) {
        pousser(",");
        i += 3;
      } else i++;
    } else if (c === "~") {
      pousser(" ");
      i++;
    } else if (!math && s.startsWith("--", i)) {
      pousser("–");
      i += 2;
    } else if (math) {
      if (c === " ") {
        // les espaces du mode math ne comptent pas, sauf autour de = et des opérateurs, rendus avec un espace
        i++;
        continue;
      }
      if (c === "=" || c === "<" || c === ">") pousser(` ${c} `);
      else if (c === "-") pousser("−");
      else if (/[A-Za-z]/.test(c))
        pousser(
          c,
          base.indice || base.exposant ? base : { ...base, italique: true },
        );
      else pousser(c);
      i++;
    } else {
      pousser(c);
      i++;
    }
  }
  // « · » et « × » du mode math : espacés comme en typographie
  return out.map((m) => ({
    ...m,
    texte: m.texte.replace(/ ?([·×]) ?/g, (_x, o: string) =>
      m.exposant || m.indice ? o : ` ${o} `,
    ),
  }));
}

/** Une ligne de tabular (`a & \multicolumn{2}{c}{b} & c \\`) → cases. */
function ligneTabular(l: string): Case[] {
  const corps = l.replace(/\\\\\s*$/, "").trim();
  const cellules: string[] = [];
  let prof = 0;
  let debut = 0;
  for (let i = 0; i < corps.length; i++) {
    if (corps[i] === "{") prof++;
    else if (corps[i] === "}") prof--;
    else if (corps[i] === "&" && corps[i - 1] !== "\\" && prof === 0) {
      cellules.push(corps.slice(debut, i));
      debut = i + 1;
    }
  }
  cellules.push(corps.slice(debut));
  return cellules.map((c) => {
    const m = /^\s*\\multicolumn\{(\d+)\}\{[^}]*\}/.exec(c);
    if (!m) return { morceaux: latexEnMorceaux(c.trim()) };
    const [contenu] = groupe(c, m.index + m[0].length);
    return {
      morceaux: latexEnMorceaux(contenu.trim()),
      colonnes: Number(m[1]),
    };
  });
}

export interface ImageFigure {
  png: Uint8Array;
  largeur: number;
  hauteur: number;
}

/**
 * Rapport LaTeX → blocs Word. `image(dossier)` donne le PNG d'une figure de la bibliothèque (null : la figure
 * est citée par sa légende, avec une note).
 */
export function rapportEnBlocs(
  tex: string,
  o: { anglais: boolean; image: (dossier: string) => ImageFigure | null },
): Bloc[] {
  const blocs: Bloc[] = [];
  const lignes = tex.split("\n");
  const genreTableau = o.anglais ? "Table" : "Tableau";
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]!.trim();
    if (
      !l ||
      l.startsWith("%") ||
      l.startsWith("\\providecommand") ||
      l.startsWith("\\label")
    )
      continue;
    const titre = /^\\(sub)?section\{(.*)\}$/.exec(l);
    if (titre) {
      blocs.push({
        type: "titre",
        niveau: titre[1] ? 2 : 1,
        morceaux: latexEnMorceaux(titre[2]!),
      });
      continue;
    }
    if (l.startsWith("\\begin{table}") || l.startsWith("\\begin{figure}")) {
      const figure = l.startsWith("\\begin{figure}");
      const fin = figure ? "\\end{figure}" : "\\end{table}";
      const contenu: string[] = [];
      while (i + 1 < lignes.length && lignes[i + 1]!.trim() !== fin)
        contenu.push(lignes[++i]!.trim());
      i++;
      const cap = contenu.find((x) => x.startsWith("\\caption{"));
      const legende = cap
        ? latexEnMorceaux(groupe(cap, "\\caption".length)[0].replace(/\.$/, ""))
        : [];
      if (figure) {
        const inp = contenu.find((x) => x.startsWith("\\input{"));
        const dossier = inp
          ? /\\cheminFigures\/(.+)\/export\.tex\}/.exec(inp)?.[1]
          : undefined;
        const img = dossier ? o.image(dossier) : null;
        if (img) blocs.push({ type: "image", ...img });
        else
          blocs.push({
            type: "paragraphe",
            morceaux: [
              {
                texte: o.anglais
                  ? `[Figure not found in the library: ${dossier ?? "?"}]`
                  : `[Figure introuvable dans la bibliothèque : ${dossier ?? "?"}]`,
                italique: true,
              },
            ],
          });
        blocs.push({ type: "legende", genre: "Figure", morceaux: legende });
        continue;
      }
      // tableau : en-têtes entre \toprule et \midrule, corps jusqu'à \bottomrule
      const t = contenu.findIndex((x) => x.startsWith("\\toprule"));
      const m = contenu.findIndex((x) => x.startsWith("\\midrule"));
      const b = contenu.findIndex((x) => x.startsWith("\\bottomrule"));
      const rangs = (a: number, z: number) =>
        contenu
          .slice(a + 1, z)
          .filter(
            (x) =>
              x &&
              !x.startsWith("\\cmidrule") &&
              !x.startsWith("\\midrule") &&
              !x.startsWith("\\addlinespace"),
          )
          .map((x) =>
            ligneTabular(x.replace(/\\cmidrule(\([^)]*\))?\{[^}]*\}/g, "")),
          )
          .filter((r) => r.some((c) => c.morceaux.length));
      blocs.push({ type: "legende", genre: genreTableau, morceaux: legende });
      blocs.push({
        type: "tableau",
        entetes: t >= 0 && m > t ? rangs(t, m) : [],
        lignes: m >= 0 && b > m ? rangs(m, b) : [],
      });
      continue;
    }
    if (
      l.startsWith("\\begin{") ||
      l.startsWith("\\end{") ||
      l === "\\centering"
    )
      continue;
    // paragraphe : jusqu'à la ligne vide
    const texte = [l];
    while (
      i + 1 < lignes.length &&
      lignes[i + 1]!.trim() &&
      !lignes[i + 1]!.trim().startsWith("\\")
    )
      texte.push(lignes[++i]!.trim());
    blocs.push({
      type: "paragraphe",
      morceaux: latexEnMorceaux(texte.join(" ")),
    });
  }
  return blocs;
}
