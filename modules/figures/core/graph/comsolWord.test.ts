import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ecrireDocx,
  type Bloc,
  type Morceau,
} from "@noyau/formats/docx-ecriture";
import { lireComsol } from "./comsol";
import { synthese } from "./comsolCalcul";
import { tableauCriteres, type Critere } from "./comsolCriteres";
import { rapportLatex, type DonneesRapport } from "./comsolRapport";
import { latexEnMorceaux, rapportEnBlocs } from "./comsolWord";

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
const texte = (ms: Morceau[]) => ms.map((m) => m.texte).join("");

describe("LaTeX du rapport → morceaux Word", () => {
  it("grec et indices, µ, virgule décimale, puissances de dix, variables en italique", () => {
    const g = latexEnMorceaux(
      "\\ensuremath{\\varepsilon_{zz}} (\\textmu{}def)",
    );
    expect(texte(g)).toBe("εzz (µdef)");
    expect(g.find((m) => m.texte === "zz")?.indice).toBe(true);
    const n = latexEnMorceaux("$4{,}41 \\cdot 10^{5}$ et $-129$\\,\\%");
    expect(texte(n)).toBe("4,41 · 105 et −129 %");
    expect(n.find((m) => m.texte === "5")?.exposant).toBe(true);
    const d = latexEnMorceaux("($D = 1{,}2$), \\texttt{coupe\\_EL.txt}~mm");
    expect(texte(d)).toBe("(D = 1,2), coupe_EL.txt mm");
    expect(d.find((m) => m.texte === "D")?.italique).toBe(true);
    expect(d.find((m) => m.texte === "coupe_EL.txt")?.fixe).toBe(true);
    expect(
      texte(latexEnMorceaux("$L_2$ et $D_0$ -- 1\\textsuperscript{er}")),
    ).toBe("L2 et D0 – 1er");
  });

  it("le rapport entier : titres, paragraphes sans LaTeX, tableaux à cases fusionnées, figures, .docx lisible", () => {
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
        { id: "FIG-0008", dossier: "FIG-0008_absente", titre: "Absente" },
      ],
      synthese: synthese([EL, VE], ["1e6*solid.eZZ"], { longueur: "mm" }).map(
        (l) => ({ ...l, legende: legendes[l.fichier]! }),
      ),
      longueur: "mm",
      criteres: tableauCriteres([EL, VE], [et], {
        longueur: "mm",
        legende: (e) => legendes[e.nom]!,
      }),
      trafic: 2e6,
    };
    const tex = rapportLatex(d, {
      langue: "fr",
      virgule: true,
      reference: EL.nom,
      sections: { cas: true, figures: true, extrema: true, criteres: true },
    });
    const png = new Uint8Array([137, 80, 78, 71]);
    const blocs = rapportEnBlocs(tex, {
      anglais: false,
      image: (dossier) =>
        dossier === "FIG-0007_carte"
          ? { png, largeur: 800, hauteur: 500 }
          : null,
    });
    const titres = blocs.filter(
      (b): b is Extract<Bloc, { type: "titre" }> => b.type === "titre",
    );
    expect(titres.map((t) => `${t.niveau} ${texte(t.morceaux)}`)).toEqual([
      "1 Résultats COMSOL : Article empreintes",
      "2 Cas étudiés",
      "2 Figures",
      "2 Valeurs extrêmes",
      "2 Critères de dimensionnement",
    ]);
    for (const b of blocs)
      if (b.type === "paragraphe" || b.type === "titre" || b.type === "legende")
        expect(texte(b.morceaux)).not.toMatch(/[\\$]|\{|\}/);
    const tableaux = blocs.filter(
      (b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau",
    );
    expect(tableaux).toHaveLength(3);
    for (const t of tableaux)
      for (const l of [...t.entetes, ...t.lignes])
        for (const c of l) expect(texte(c.morceaux)).not.toMatch(/[\\$]/);
    // le tableau des extrema : « Maximum » et « Minimum » couvrent plusieurs colonnes, chaque ligne a la même largeur
    const ext = tableaux[1]!;
    expect(
      ext.entetes[0]!.some(
        (c) => texte(c.morceaux) === "Maximum" && (c.colonnes ?? 1) > 1,
      ),
    ).toBe(true);
    const largeur = (l: { colonnes?: number }[]) =>
      l.reduce((s, c) => s + (c.colonnes ?? 1), 0);
    for (const l of [...ext.entetes, ...ext.lignes])
      expect(largeur(l)).toBe(largeur(ext.lignes[0]!));
    expect(blocs.filter((b) => b.type === "image")).toHaveLength(1);
    expect(
      blocs.some(
        (b) =>
          b.type === "paragraphe" &&
          texte(b.morceaux).includes("FIG-0008_absente"),
      ),
    ).toBe(true);
    expect(
      blocs
        .filter((b) => b.type === "legende")
        .map((b) => (b as { genre: string }).genre),
    ).toEqual(["Tableau", "Figure", "Figure", "Tableau", "Tableau"]);

    const docx = ecrireDocx(blocs);
    expect(ecrireDocx(blocs)).toEqual(docx);
    const z = unzipSync(docx);
    expect(Object.keys(z).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/media/image1.png",
      "word/styles.xml",
    ]);
    const doc = strFromU8(z["word/document.xml"]!);
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('w:instr=" SEQ Tableau \\* ARABIC "');
    expect(doc).toContain('SEQ Figure \\* ARABIC "><w:r><w:t>2</w:t>');
    expect(doc).toContain('<w:gridSpan w:val="');
    expect(doc).toContain('r:embed="rIdImage1"');
    expect(doc).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
    expect(strFromU8(z["word/styles.xml"]!)).toContain(
      '<w:name w:val="caption"/>',
    );
  });
});
