import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportGraphSvg } from "./export";
import { validateGraph } from "./model";
import { grapheCarte, coinLibre, lecturesPossibles, descriptionGeometrie, estComsol, extraireProfil, geometrie, grapheProfils, legendes, libelleExpression, lireComsol, lireTitres } from "./comsol";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const el = () => lireComsol(fixture("verticale_max_std_el_lc3_het.txt"), "verticale_max_std_el_lc3_het.txt");
const ve = () => lireComsol(fixture("verticale_max_std_ve_lc3_het.txt"), "verticale_max_std_ve_lc3_het.txt");
const coupe = () => lireComsol(fixture("coupe_yz_extrait.txt"), "coupe_yz_max_std_el_lc3_het.txt");

describe("exports COMSOL", () => {
  it("reconnaît et lit un export (en-tête, colonnes, paramètres de l'étude)", () => {
    expect(estComsol(fixture("verticale_max_std_el_lc3_het.txt"))).toBe(true);
    expect(estComsol("x;y\n1;2")).toBe(false);
    const e = el();
    expect(e.meta.Model).toBe("tfeversion3.mph");
    expect(e.coordonnees).toEqual(["X", "Y", "Z"]);
    expect(e.uniteLongueur).toBe("m");
    expect(e.lignes).toBe(21);
    expect(e.colonnes.map((c) => c.expression)).toEqual(["1e6*solid.eXZ", "1e6*solid.eYZ", "1e6*solid.ep1", "1e6*solid.ep3", "1e6*solid.eXX", "1e6*solid.eYY", "1e6*solid.eZZ"]);
    expect(e.colonnes[0]).toMatchObject({ unite: "1", solution: "303", parametres: { Temps: "10 s", lc: "3", VE: "0", mod_f: "0" } });
    expect(e.valeurs[2]![0]).toBeCloseTo(-0.3199, 6);
    expect(e.valeurs[2]![20]).toBeCloseTo(-1e-5, 8);
    expect(e.valeurs[9]![0]).toBeCloseTo(-176.44490938491936, 9);
  });

  it("titres sans « @ » ni paramètres, nombre de colonnes incohérent", () => {
    expect(lireTitres("u (m) solid.mises (Pa)", 2)).toEqual([
      { expression: "u", unite: "m", solution: "", parametres: {} },
      { expression: "solid.mises", unite: "Pa", solution: "", parametres: {} },
    ]);
    expect(lireTitres("a b c", 2).map((c) => c.expression)).toEqual(["Colonne 1", "Colonne 2"]);
  });

  it("libellés : déformations ×1e6 en µdef, contraintes, principales", () => {
    expect(libelleExpression({ expression: "1e6*solid.eZZ", unite: "1" })).toEqual({ grandeur: "$\\varepsilon_{zz}$", unite: "µdef", court: "εzz" });
    expect(libelleExpression({ expression: "1e6*solid.ep3", unite: "1" })).toMatchObject({ grandeur: "$\\varepsilon_{3}$", court: "ε3" });
    expect(libelleExpression({ expression: "1e-6*solid.sXX", unite: "Pa" })).toMatchObject({ grandeur: "$\\sigma_{xx}$", unite: "MPa" });
    expect(libelleExpression({ expression: "w", unite: "m" })).toMatchObject({ court: "uz", unite: "m" });
    expect(libelleExpression({ expression: "T", unite: "K" })).toMatchObject({ court: "T", unite: "K" });
  });

  it("géométrie : profil vertical, coupe régulière", () => {
    expect(geometrie(el())).toMatchObject({ genre: "profil", varient: [2] });
    expect(descriptionGeometrie(el())).toBe("profil vertical (Z), 21 points");
    const g = geometrie(coupe());
    expect(g).toMatchObject({ genre: "coupe", varient: [1, 2], reguliere: true });
    expect(descriptionGeometrie(coupe())).toBe("coupe YZ, 9 × 9 points");
  });

  it("légendes : les mots qui diffèrent dans les noms, sinon les paramètres qui diffèrent", () => {
    expect(legendes([el(), ve()])).toEqual(["el", "ve"]);
    expect(legendes([el()])).toEqual(["verticale_max_std_el_lc3_het"]);
    const a = { ...el(), nom: "export.txt" };
    const b = { ...ve(), nom: "export.txt" };
    expect(legendes([a, b])).toEqual(["VE=0", "VE=1"]);
    expect(legendes([a, { ...a }])).toEqual(["export", "export"]);
  });

  it("légende du graphe dans le coin le plus vide", () => {
    expect(coinLibre([{ x: [0, 1, 2], y: [0, 1, 2] }])).toBe("north west");
    expect(coinLibre([{ x: [0, 1, 2], y: [2, 1, 0] }])).toBe("north east");
  });

  it("profils superposés → graphe valide (valeur en abscisse, cote en mm en ordonnée)", () => {
    const d = grapheProfils([el(), ve()], { expressions: ["1e6*solid.eZZ"], longueur: "mm" });
    expect(validateGraph(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    expect(d.series.map((s) => s.name)).toEqual(["el", "ve"]);
    expect(d.y.min).toBe(-320);
    expect(d.x.label).toBe("$\\varepsilon_{zz}$ (µdef)");
    expect(d.y.label).toBe("$z$ (mm)");
    expect(d.y.max).toBe(0);
    expect(d.series[0]!.y[0]).toBeCloseTo(-319.9, 6);
    expect(d.series[0]!.x[0]).toBeCloseTo(-176.44490938491936, 6);
    // plusieurs expressions d'un même fichier ; profondeur positive
    const p = grapheProfils([el()], { expressions: ["1e6*solid.eXX", "1e6*solid.eYY"], longueur: "cm", profondeur: true });
    expect(p.series.map((s) => s.name)).toEqual(["$\\varepsilon_{xx}$", "$\\varepsilon_{yy}$"]);
    expect(p.y.label).toBe("Profondeur (cm)");
    expect(Math.min(...p.series[0]!.y)).toBeCloseTo(0.001, 6);
    expect(Math.max(...p.series[0]!.y)).toBeCloseTo(31.99, 6);
    expect(p.series[0]!.y[0]).toBeLessThan(p.series[0]!.y.at(-1)!);
    expect(() => grapheProfils([coupe()], { expressions: ["1e6*solid.eZZ"], longueur: "mm" })).toThrow("Aucun profil");
  });

  it("coupe : profil extrait à la ligne la plus proche, carte en SVG", () => {
    const c = coupe();
    const ys = geometrie(c).grilles[0]!;
    const p = extraireProfil(c, 1, ys[3]! + 0.001);
    expect(geometrie(p)).toMatchObject({ genre: "profil", varient: [2] });
    expect(p.lignes).toBe(9);
    expect(p.nom).toContain(`Y = ${ys[3]}`);
    const d = grapheCarte(c, "1e6*solid.eZZ", "mm");
    expect(validateGraph(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    expect(d.carte!.x).toHaveLength(9);
    expect(d.carte!.y).toHaveLength(9);
    expect(d.carte!.y[0]).toBeCloseTo(-319.9, 6);
    expect(d.carte!.v.flat().every((v) => v !== null)).toBe(true);
    expect(d.carte).toMatchObject({ palette: "divergente", legende: "$\\varepsilon_{zz}$ (µdef)" });
    expect(d.x).toMatchObject({ label: "$y$ (mm)", min: d.carte!.x[0] });
    expect(d.y.label).toBe("$z$ (mm)");
    expect(exportGraphSvg(d)).not.toMatch(/NaN|undefined/);
  });

  it("lecture imposée : profil selon une autre coordonnée, coupe aux axes échangés, orientation du tracé", () => {
    const c = coupe();
    expect(lecturesPossibles(c).map((l) => l.libelle).slice(0, 4)).toEqual(["Profil selon X", "Profil selon Y", "Profil selon Z", "Coupe X (horizontal) × Y (vertical)"]);
    const t = { ...c, forcer: [2, 1] };
    expect(geometrie(t)).toMatchObject({ genre: "coupe", varient: [2, 1], reguliere: true });
    const d = grapheCarte(t, "1e6*solid.eZZ", "mm");
    expect(d.x.label).toBe("$z$ (mm)");
    expect(d.carte!.v[0]![3]).toBe(grapheCarte(c, "1e6*solid.eZZ", "mm").carte!.v[3]![0]);
    // un profil vertical tracé « horizontalement » : la cote en abscisse
    const h = grapheProfils([el()], { expressions: ["1e6*solid.eZZ"], longueur: "mm", orientation: "horizontale" });
    expect(h.x.label).toBe("$z$ (mm)");
    expect(h.series[0]!.x[0]).toBeCloseTo(-319.9, 6);
    // un profil forcé selon Z d'un fichier mal reconnu
    expect(geometrie({ ...el(), forcer: [2] })).toMatchObject({ genre: "profil", varient: [2] });
  });
});

