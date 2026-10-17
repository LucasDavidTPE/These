import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { executerTrace, traceVide, type TraceCarte } from "./comsolEtude";
import { ciblesDeclinaison, decliner, motsVariables, plancheMatrice, ranger } from "./comsolLot";
import { miseEnPage, plancheSvg, planchePgfplots } from "./planche";

const lire = (n: string, nom = n) => lireComsol(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"), nom);

describe("déclinaison d'une recette sur tous les cas", () => {
  const noms = ["coupeXZ_R1_EL_het.txt", "coupeXZ_R1_VE_het.txt", "coupeXZ_R1_EL_rect.txt", "coupeXZ_R1_VE_rect.txt", "coupeXZ_R1_EL-fin_het.txt"];

  it("cibles : les plans réguliers qui ont la grandeur ; une recette par plan", () => {
    const es = [lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_het.txt"), lire("table_temps_VE.txt"), lire("verticale_max_std_el_lc3_het.txt")];
    const t = { ...traceVide("carte"), expression: "1e6*solid.eZZ" } as TraceCarte;
    expect(ciblesDeclinaison(t, es).map((e) => e.nom)).toEqual(["grille_XZ_EL_het.txt", "grille_XZ_VE_het.txt"]);
    const d = decliner(t, ["grille_XZ_VE_het.txt"]);
    expect(d[0]!.trace).toMatchObject({ mode: "carte", plan: "grille_XZ_VE_het.txt", expression: "1e6*solid.eZZ" });
    const r = executerTrace(d[0]!.trace, { exports: es, cadre: { longueur: "mm", couches: false, source: "auto" }, noms: {}, correspondances: [], interfaces: [] })!;
    expect(r.doc.carte!.v[0]![0]).toBeCloseTo(-193.5, 9);
  });

  it("mots qui varient et rangement en matrice matériau × empreinte, case vide comprise", () => {
    expect(motsVariables(noms)).toEqual([
      { k: 2, valeurs: ["EL", "VE", "EL-fin"] },
      { k: 3, valeurs: ["het", "rect"] },
    ]);
    const m = ranger(noms, 2, 3);
    expect(m.lignes).toEqual(["EL", "VE", "EL-fin"]);
    expect(m.colonnes).toEqual(["het", "rect"]);
    expect(m.cases).toEqual([
      ["coupeXZ_R1_EL_het.txt", "coupeXZ_R1_EL_rect.txt"],
      ["coupeXZ_R1_VE_het.txt", "coupeXZ_R1_VE_rect.txt"],
      ["coupeXZ_R1_EL-fin_het.txt", null],
    ]);
    expect(() => ranger(noms, 0, 1)).toThrow(/même case/);
    expect(ranger(noms.slice(0, 2), null, 2)).toMatchObject({ lignes: [""], colonnes: ["EL", "VE"] });
  });

  it("planche en matrice : titres traduits, cases vides gardées, SVG et pgfplots", () => {
    const m = ranger(noms, 2, 3);
    const dossiers = new Map(noms.map((n, i) => [n, `FIG-000${i + 1}_x`]));
    const p = plancheMatrice(m, dossiers, { correspondances: [{ de: "het", vers: "Hétérogène" }, { de: "VE", vers: "Viscoélastique" }] });
    expect(p.colonnes).toBe(2);
    expect(p.memeEchelle).toBe(true);
    expect(p.entetes).toEqual({ lignes: ["EL", "Viscoélastique", "EL-fin"], colonnes: ["Hétérogène", "rect"] });
    expect(p.panneaux.map((x) => x.dossier)).toEqual(["FIG-0001_x", "FIG-0003_x", "FIG-0002_x", "FIG-0004_x", "FIG-0005_x", ""]);
    const es = [lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_het.txt")];
    const doc = executerTrace(traceVide("carte"), { exports: es, cadre: { longueur: "mm", couches: false, source: "auto" }, noms: {}, correspondances: [], interfaces: [] })!.doc;
    const docs = [doc, doc, doc, doc, doc, null];
    const mp = miseEnPage(p, docs);
    expect(mp.titres.map((t) => t.texte)).toEqual(["Hétérogène", "rect", "EL", "Viscoélastique", "EL-fin"]);
    expect(mp.cases.map((c) => c.etiquette)).toEqual(["(a)", "(b)", "(c)", "(d)", "(e)", ""]);
    expect(mp.cases[0]!.x).toBeGreaterThan(0); // place des titres de lignes
    const svg = plancheSvg(p, docs);
    expect(svg).toContain(">Viscoélastique</text>");
    expect(svg).toContain('rotate(-90');
    expect(planchePgfplots(p, docs)).toContain("rotate=90] at");
  });
});
