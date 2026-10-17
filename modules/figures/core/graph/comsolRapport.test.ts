import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { synthese } from "./comsolCalcul";
import { tableauCriteres, type Critere } from "./comsolCriteres";
import { nombreLatex, texteLatex } from "./comsolLatex";
import {
  phrasesCriteres,
  phrasesExtrema,
  rapportLatex,
  type DonneesRapport,
} from "./comsolRapport";

const lire = (n: string) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    n,
  );
const EL = lire("grille_XZ_EL_het.txt");
const VE = lire("grille_XZ_VE_het.txt");
const legendes: Record<string, string> = {
  [EL.nom]: "EL het",
  [VE.nom]: "VE het",
};
const lignes = () =>
  synthese([EL, VE], ["1e6*solid.eZZ"], { longueur: "mm" }).map((l) => ({
    ...l,
    legende: legendes[l.fichier]!,
  }));
const et: Critere = {
  id: "et",
  nom: "εt base GB",
  genre: "traction",
  z: -0.32,
  cote: "dessus",
  decalage: 0,
  variables: ["exx"],
  loi: { genre: "fatigue", epsilon6: 100, b: -0.2, k: 1 },
};

describe("texte et nombres LaTeX", () => {
  it("grec, µ, signe moins, exposants ; $…$ gardé ; caractères spéciaux protégés", () => {
    expect(texteLatex("VE het — εzz (µdef) (t = 10)")).toBe(
      "VE het — \\ensuremath{\\varepsilon_{zz}} (\\textmu{}def) (t = 10)",
    );
    expect(texteLatex("εt base GB, σ1, Δt")).toBe(
      "\\ensuremath{\\varepsilon_{t}} base GB, \\ensuremath{\\sigma_{1}}, \\ensuremath{\\Delta}t",
    );
    expect(texteLatex("a. $x$ = −700 mm_1 & 5 %")).toBe(
      "a. $x$ = \\ensuremath{-}700 mm\\_1 \\& 5 \\%",
    );
    expect(texteLatex("1,2·10⁶")).toBe(
      "1,2\\ensuremath{\\cdot}10\\textsuperscript{6}",
    );
    expect(nombreLatex(-129.04, { virgule: true })).toBe("$-129$");
    expect(nombreLatex(1.5, { virgule: true })).toBe("$1{,}5$");
    expect(nombreLatex(58123, { virgule: false })).toBe("$58100$");
    expect(nombreLatex(441000, { virgule: true })).toBe(
      "$4{,}41 \\cdot 10^{5}$",
    );
    expect(nombreLatex(1e6, { virgule: true })).toBe("$10^{6}$");
  });
});

describe("phrases chiffrées", () => {
  it("extrema : étendue, position du plus fort, écart à la référence (fr, en)", () => {
    const [fr] = phrasesExtrema(lignes(), {
      langue: "fr",
      virgule: true,
      reference: EL.nom,
      longueur: "mm",
    });
    // |εzz| maxi : EL −193 (z = 0, x = 0,7), VE 1,5 fois plus
    expect(fr).toContain(
      "Pour $\\varepsilon_{zz}$, la valeur extrême (en valeur absolue) va de $-193$~\\textmu{}def (EL het) à $-290$~\\textmu{}def (VE het)",
    );
    expect(fr).toContain(
      "la plus forte est atteinte en $x = 700$~mm, $z = 0$~mm.",
    );
    expect(fr).toContain(
      "Rapportée au cas EL het ($-193$~\\textmu{}def), elle varie de $+50$\\,\\% pour VE het.",
    );
    const [en] = phrasesExtrema(lignes(), {
      langue: "en",
      virgule: false,
      reference: EL.nom,
      longueur: "mm",
    });
    expect(en).toContain(
      "For $\\varepsilon_{zz}$, the peak (absolute) value ranges from $-193$~\\textmu{}def (EL het) to $-290$~\\textmu{}def (VE het)",
    );
    expect(en).toContain(
      "Relative to EL het ($-193$~\\textmu{}def), it changes by $+50$\\,\\% for VE het.",
    );
    expect(
      phrasesExtrema(lignes().slice(0, 1), {
        langue: "fr",
        virgule: true,
        reference: null,
        longueur: "mm",
      })[0],
    ).toMatch(/^Pour \$\\varepsilon_\{zz\}\$, la valeur extrême vaut \$-193\$/);
  });

  it("critères : dimensionnant, cycles rapportés à la référence, dommage pour un trafic", () => {
    const t = tableauCriteres([EL, VE], [et], {
      longueur: "mm",
      trafic: 1e6,
      legende: (e) => legendes[e.nom]!,
    });
    const fr = phrasesCriteres(t, {
      langue: "fr",
      virgule: true,
      reference: EL.nom,
      trafic: 1e6,
    });
    expect(fr[0]).toBe(
      "Le critère dimensionnant est \\ensuremath{\\varepsilon_{t}} base GB pour tous les cas.",
    );
    // εt : EL 106, VE 159 µdef → N rapport (159/106)^5 = 7,59
    expect(fr[1]).toMatch(
      /^Par rapport au cas EL het \(\$N = 7\{,\}47 \\cdot 10\^\{5\}\$ cycles admissibles\), le nombre de cycles admissibles du critère dimensionnant est divisé par \$7\{,\}59\$ pour VE het/,
    );
    expect(fr[2]).toMatch(
      /^Pour un trafic de \$10\^\{6\}\$ cycles, le dommage de Miner dépasse 1 pour EL het \(\$D = 1\{,\}34\$\) et VE het \(\$D = 10\{,\}2\$\) \(structure non vérifiée\)\.$/,
    );
    const en = phrasesCriteres(t, {
      langue: "en",
      virgule: false,
      reference: EL.nom,
      trafic: null,
    });
    expect(en).toHaveLength(2);
    expect(en[0]).toBe(
      "The governing criterion is \\ensuremath{\\varepsilon_{t}} base GB for all cases.",
    );
  });
});

describe("document", () => {
  it("sections cochées, figures en \\input, tableaux booktabs avec étiquettes", () => {
    const d: DonneesRapport = {
      titre: "Article empreintes",
      id: "article-empreintes",
      date: "16/10/2026",
      cas: [
        {
          fichier: "coupeXZ_R1_EL_het.txt",
          legende: "EL het",
          description: "Plan x–z (coupe)",
        },
      ],
      figures: [
        {
          id: "FIG-0007",
          dossier: "FIG-0007_carte",
          titre: "VE het — εzz (µdef)",
        },
      ],
      synthese: lignes(),
      longueur: "mm",
      criteres: tableauCriteres([EL, VE], [et], {
        longueur: "mm",
        legende: (e) => legendes[e.nom]!,
      }),
      trafic: null,
    };
    const tex = rapportLatex(d, {
      langue: "fr",
      virgule: true,
      reference: EL.nom,
      sections: { cas: true, figures: true, extrema: true, criteres: true },
    });
    expect(tex).toContain("\\providecommand{\\cheminFigures}{figures}");
    expect(tex).toContain(
      "\\section{Résultats COMSOL : Article empreintes}\n\\label{sec:article-empreintes}",
    );
    expect(tex).toContain("\\texttt{coupeXZ\\_R1\\_EL\\_het.txt}");
    expect(tex).toContain(
      "\\input{\\cheminFigures/FIG-0007_carte/export.tex}\n\\caption{VE het — \\ensuremath{\\varepsilon_{zz}} (\\textmu{}def).}\n\\label{fig:FIG-0007}",
    );
    expect(tex).toContain(
      "\\end{tabular}\n\\label{tab:article-empreintes-extrema}",
    );
    expect(tex).toContain("\\label{tab:article-empreintes-criteres}");
    expect(tex).not.toMatch(/\n{3,}/);
    const en = rapportLatex(d, {
      langue: "en",
      virgule: false,
      reference: null,
      sections: { cas: false, figures: false, extrema: true, criteres: false },
    });
    expect(en).toContain("\\section{COMSOL results : Article empreintes}");
    expect(en).toContain("Case & Quantity & Value");
    expect(en).not.toContain("\\subsection{Cases}");
    expect(en).not.toContain("Design criteria");
  });
});

describe("cas identiques à la référence", () => {
  it("écart nul dit en mots, pas « +0 % » ni « divisé par 1 »", () => {
    const EL2 = { ...EL, nom: "coupeXZ_R1_EL_rect.txt" };
    const leg = { ...legendes, [EL2.nom]: "EL rect" };
    const l = synthese([EL, VE, EL2], ["1e6*solid.eZZ"], {
      longueur: "mm",
    }).map((x) => ({ ...x, legende: leg[x.fichier]! }));
    const [fr] = phrasesExtrema(l, {
      langue: "fr",
      virgule: true,
      reference: EL.nom,
      longueur: "mm",
    });
    expect(fr).toContain(
      "elle varie de $+50$\\,\\% pour VE het et reste la même pour EL rect.",
    );
    const t = tableauCriteres([EL, VE, EL2], [et], {
      longueur: "mm",
      legende: (e) => leg[e.nom]!,
    });
    expect(
      phrasesCriteres(t, {
        langue: "fr",
        virgule: true,
        reference: EL.nom,
        trafic: null,
      })[1],
    ).toMatch(
      /divisé par \$7\{,\}59\$ pour VE het \(\$N = 98400\$\) et inchangé pour EL rect\.$/,
    );
  });
});
