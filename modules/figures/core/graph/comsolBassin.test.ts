import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import {
  bassin,
  bassinsLatex,
  ecartMesure,
  expressionDeflexion,
  grapheBassins,
  lireMesure,
  ligneSurface,
  versMetre,
} from "./comsolBassin";
import {
  comparerMaillages,
  grapheMaillage,
  maillageLatex,
  pairesMaillage,
} from "./comsolMaillage";
import { validateGraph } from "./model";

// bassin gaussien : w(x) = −0,5 exp(−((x − 0,1) / 0,6)²) mm, centre en x = 0,1 m, pas de 1 cm
const w = (x: number) => -0.5 * Math.exp(-(((x - 0.1) / 0.6) ** 2));
const D = (r: number) => -w(0.1 + r);
function surface(pas = 0.01, nom = "surface_VE_het.txt") {
  const lignes = [
    "% Model: x.mph",
    "% Dimension: 3",
    "% Length unit: m",
    "% X Y Z 1e3*w (m)",
  ];
  for (let i = 0; i <= Math.round(4 / pas); i++) {
    const x = -1.9 + i * pas;
    lignes.push(`${x.toFixed(4)} 6.5 0 ${w(x)}`);
  }
  return lireComsol(lignes.join("\n"), nom);
}
const lire = (n: string) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    n,
  );

describe("bassin de déflexion", () => {
  it("déflexion trouvée, centre au pic, indices SCI, BDI, BCI, AREA, R", () => {
    const e = surface();
    expect(expressionDeflexion(e)).toBe("1e3*w");
    expect(versMetre("mm")).toBe(1e-3);
    const b = bassin(e, {
      expression: "1e3*w",
      capteurs: [0, 0.3, 0.6, 0.9, 1.2],
      rayon: 0.2,
      legende: "VE het",
    });
    expect(b.unite).toBe("mm");
    expect(b.centre).toBeCloseTo(0.1, 9);
    expect(b.indices.D0).toBeCloseTo(0.5, 9);
    expect(b.capteurs.map((c) => Number(c.d!.toFixed(3)))).toEqual(
      [0, 0.3, 0.6, 0.9, 1.2].map((r) => Number(D(r).toFixed(3))),
    );
    expect(b.indices.SCI).toBeCloseTo(D(0) - D(0.3), 3);
    expect(b.indices.BDI).toBeCloseTo(D(0.3) - D(0.6), 3);
    expect(b.indices.BCI).toBeCloseTo(D(0.6) - D(0.9), 3);
    expect(b.indices.AREA).toBeCloseTo(
      (150 * (D(0) + 2 * D(0.3) + 2 * D(0.6) + D(0.9))) / D(0),
      0,
    );
    // R = r² / (2 (D0 − Dr)), D en m
    expect(b.indices.R! / (0.04 / (2 * (D(0) - D(0.2)) * 1e-3))).toBeCloseTo(
      1,
      2,
    );
    // centre imposé
    expect(
      bassin(e, {
        expression: "1e3*w",
        centre: 0,
        capteurs: [0],
        rayon: 0.2,
        legende: "",
      }).indices.D0,
    ).toBeCloseTo(D(0.1), 3);
  });

  it("surface d'une coupe x-z (ligne du haut), mesure collée et écart, graphe et tableau", () => {
    const c = lire("grille_XZ_EL_het.txt");
    const l = ligneSurface(c)!;
    expect(l.ligne.valeurs[2]![0]).toBe(0);
    expect(expressionDeflexion(c)).toBe("1e3*w");
    const e = surface();
    const b = bassin(e, {
      expression: "1e3*w",
      capteurs: [0, 0.3, 0.6],
      rayon: 0.2,
      legende: "VE het",
    });
    // mesure en mm et µm : 500 µm au centre (calcul exact), 400 à 300 mm (calcul 389)
    const m = lireMesure(
      "0 500\n300;400\n600\t" + (D(0.6) * 1000).toFixed(1) + "\n",
      { distance: "mm", deflexion: "µm" },
    );
    expect(m.r).toEqual([0, 0.3, 0.6]);
    const x = ecartMesure(b, m)!;
    expect(x.d0).toBeCloseTo(0, 3);
    expect(x.rms).toBeCloseTo(Math.sqrt((0.4 - D(0.3)) ** 2 / 3), 3);
    const g = grapheBassins([b], {
      longueur: "mm",
      mesure: m,
      capteurs: [0, 0.3, 0.6],
    });
    expect(validateGraph(g).ok).toBe(true);
    expect(g.y.inverse).toBe(true);
    expect(g.series.map((s) => s.name)).toEqual(["VE het", "Mesure"]);
    expect(g.series[1]!.y).toEqual([0.5, 0.4, Number(D(0.6).toFixed(4))]);
    expect(g.reperes!.map((r) => r.texte)).toEqual(["$D_{300}$", "$D_{600}$"]);
    const tex = bassinsLatex([b], { virgule: true, ecarts: [x] });
    expect(tex).toContain(
      "Cas & $D_0$ & SCI & BDI & BCI & AREA & $R$ & RMS \\\\",
    );
    expect(tex).toContain("VE het & $0{,}5$ & ");
    expect(() =>
      bassin(lire("table_temps_VE.txt"), {
        expression: "x",
        capteurs: [],
        rayon: 0.2,
        legende: "",
      }),
    ).toThrow(/ni ligne horizontale/);
  });
});

describe("convergence du maillage", () => {
  it("paires d'après les noms (EL / EL-fin), écarts sur mêmes points et interpolés", () => {
    const a = surface(0.02, "surface_EL_het.txt");
    const fin = surface(0.01, "surface_EL-fin_het.txt");
    const autre = surface(0.01, "surface_VE_het.txt");
    expect(pairesMaillage([a, fin, autre])).toEqual([
      { grossier: "surface_EL_het.txt", fin: "surface_EL-fin_het.txt" },
    ]);
    // même fonction, grilles différentes : écart d'interpolation seulement
    const l = comparerMaillages(a, fin, "1e3*w", "mm");
    expect(l.methode).toBe("interpolation");
    expect(Math.abs(l.ecartPic)).toBeLessThan(0.1);
    expect(l.l2).toBeLessThan(0.1);
    // même grille, valeurs différentes : point à point
    const g2 = lireComsol(
      readFileSync(
        new URL("./fixtures/grille_XZ_VE_het.txt", import.meta.url),
        "utf8",
      ),
      "coupe_VE_het.txt",
    );
    const f2 = lireComsol(
      readFileSync(
        new URL("./fixtures/grille_XZ_EL_het.txt", import.meta.url),
        "utf8",
      ),
      "coupe_VE-fin_het.txt",
    );
    const m = comparerMaillages(g2, f2, "1e6*solid.eZZ", "mm");
    expect(m.methode).toBe("points");
    expect(m.picFin).toBe(-193);
    expect(m.ecartPic).toBeCloseTo(50, 6); // VE = 1,5 × EL dans les fichiers d'exemple
    expect(m.ecartMax).toBeCloseTo(96.5, 6);
    expect(m.position).toEqual({ X: 700, Y: 6500, Z: 0 });
    expect(m.l2).toBeCloseTo(50, 6);
    const leg = (n: string) => n.replace(".txt", "");
    expect(validateGraph(grapheMaillage([l, m], leg)).ok).toBe(true);
    expect(maillageLatex([m], leg, { virgule: true })).toContain(
      "coupe\\_VE\\_het & $\\varepsilon_{zz}$ (\\textmu{}def) & $-290$ & $-193$ & $50$ & $50$ & $50$ \\\\",
    );
  });
});

describe("légendes avec un mot à tiret", () => {
  it("« EL » / « EL-fin » : les mots entiers, pas le nom complet", async () => {
    const { legendes } = await import("./comsol");
    const a = surface(0.02, "coupeXZ_R1_EL_het.txt");
    const b = surface(0.02, "coupeXZ_R1_EL-fin_het.txt");
    expect(legendes([a, b])).toEqual(["EL", "EL-fin"]);
    // le découpage aux tirets reste le premier choix quand il distingue les fichiers
    expect(
      legendes([
        surface(0.02, "a_VE-1_het.txt"),
        surface(0.02, "a_VE-2_het.txt"),
      ]),
    ).toEqual(["1", "2"]);
  });
});

describe("rapport : bassin et maillage", () => {
  it("phrases chiffrées et sections du rapport", async () => {
    const { phrasesBassins, phrasesMaillage, rapportLatex } =
      await import("./comsolRapport");
    const a = bassin(surface(0.01, "s_EL.txt"), {
      expression: "1e3*w",
      capteurs: [0, 0.3, 0.6, 0.9],
      rayon: 0.2,
      legende: "EL",
    });
    const [p] = phrasesBassins([a], { langue: "fr", virgule: true });
    expect(p).toMatch(
      /^La déflexion sous la charge \$D_0\$ vaut \$0\{,\}5\$~mm \(EL\) ; le SCI vaut \$0\{,\}11\d?\$~mm \(EL\) ; le rayon de courbure vaut \$3\d\d\$~m \(EL\)\.$/,
    );
    const g2 = lireComsol(
      readFileSync(
        new URL("./fixtures/grille_XZ_VE_het.txt", import.meta.url),
        "utf8",
      ),
      "c_VE_het.txt",
    );
    const f2 = lireComsol(
      readFileSync(
        new URL("./fixtures/grille_XZ_EL_het.txt", import.meta.url),
        "utf8",
      ),
      "c_VE-fin_het.txt",
    );
    const m = comparerMaillages(g2, f2, "1e6*solid.eZZ", "mm");
    const [q] = phrasesMaillage([m], {
      langue: "en",
      virgule: false,
      legende: () => "VE het",
    });
    expect(q).toBe(
      "Between the coarse and the refined mesh, the peak difference does not exceed $50$\\,\\% ($\\varepsilon_{zz}$, VE het) and the $L_2$ difference does not exceed $50$\\,\\%; the coarse mesh is not converged for this quantity (difference above $2$\\,\\%).",
    );
    const tex = rapportLatex(
      {
        titre: "T",
        id: "t",
        date: "",
        cas: [],
        figures: [],
        synthese: [],
        longueur: "mm",
        criteres: null,
        trafic: null,
        bassins: { liste: [a] },
        maillage: [m],
      },
      {
        langue: "fr",
        virgule: true,
        reference: null,
        sections: {
          cas: true,
          figures: true,
          extrema: true,
          criteres: true,
          bassin: true,
          maillage: true,
        },
      },
    );
    expect(tex).toContain("\\subsection{Bassin de déflexion}");
    expect(tex).toContain("\\label{tab:t-bassin}");
    expect(tex).toContain("\\subsection{Convergence du maillage}");
    expect(tex).toContain("\\label{tab:t-maillage}");
  });
});
