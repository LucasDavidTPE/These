import { describe, expect, it } from "vitest";
import { couleurTemperature, disposer, grapheSvg, nb, plusProche, puissance, type SpecGraphe } from "./graphe";

const spec: SpecGraphe = {
  xLog: true,
  yLog: true,
  xTitre: "f·a_T (Hz)",
  yTitre: "|E*| (MPa)",
  series: [
    { mode: "points", couleur: "#2f7fb5", libelle: "15 °C", points: [[0.01, 800, { T: 15 }], [1, 5000], [100, 20000]] },
    { mode: "ligne", couleur: "#b03a2b", points: [[1e-3, 300], [1e3, 30000], [-1, 5]] },
  ],
};

describe("graphe XY", () => {
  it("nombres à la française", () => {
    expect(nb(1234.5)).toBe("1235");
    expect(nb(0.5)).toBe("0,500");
    expect(nb(5e-5)).toBe("5,00·10⁻⁵");
    expect(nb(NaN)).toBe("—");
    expect(puissance(-3)).toBe("10⁻³");
  });

  it("échelles logarithmiques : décades entières, points invalides écartés", () => {
    const d = disposer(spec, 600, 300);
    expect(d.vide).toBe(false);
    expect(d.gx.every(Number.isInteger)).toBe(true);
    expect(d.valide([-1, 5])).toBe(false);
    expect(d.px(1)).toBeGreaterThan(d.px(0.01));
    expect(d.py(20000)).toBeLessThan(d.py(800));
  });

  it("survol : le point de mesure le plus proche, jamais la courbe", () => {
    const d = disposer(spec, 600, 300);
    const p = plusProche(spec, d, d.px(1) + 3, d.py(5000) - 2);
    expect(p?.point[0]).toBe(1);
    expect(p?.serie.libelle).toBe("15 °C");
    expect(plusProche(spec, d, 5, 5)).toBeNull();
  });

  it("SVG déterministe, sans valeur manquante", () => {
    const svg = grapheSvg(spec, { largeur: 600, hauteur: 300, titre: "Courbe maîtresse", legende: [["15 °C", "#2f7fb5"]] });
    expect(svg).toBe(grapheSvg(spec, { largeur: 600, hauteur: 300, titre: "Courbe maîtresse", legende: [["15 °C", "#2f7fb5"]] }));
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg).toContain("10³");
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(grapheSvg({ series: [] }, { largeur: 300, hauteur: 200 })).toContain("aucune donnée");
  });

  it("rampe de températures", () => {
    expect(couleurTemperature(0, 1)).toBe("#79a53f");
    expect(couleurTemperature(0, 3)).toBe("rgb(39,64,143)");
  });
});

describe("étiquettes des axes linéaires", () => {
  it("les décimales suivent le pas : 1 ; 1,5 ; 2 et non 1 ; 2 ; 2", () => {
    const d = disposer({ series: [{ mode: "points", couleur: "#000", points: [[1, 0], [3, 1]] }] }, 600, 300);
    const libelles = d.gx.map((t) => d.etiquetteX(t));
    expect(new Set(libelles).size).toBe(libelles.length);
    expect(libelles).toContain("1,5");
  });
});
