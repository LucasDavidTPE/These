import { describe, expect, it } from "vitest";
import { emptyGraph, type GraphDoc } from "./model";
import { etiquette, lirePlanche, miseEnPage, plancheSvg, planchePgfplots, plancheVide } from "./planche";

const g = (w: number, h: number, nom = "s"): GraphDoc => ({ ...emptyGraph(), width: w, height: h, x: { label: "x", log: false }, y: { label: "y", log: false }, series: [{ name: nom, type: "line", x: [0, 1, 2], y: [0, 1, 4], legend: true }] });

describe("planches", () => {
  it("lecture tolérante, étiquettes", () => {
    expect(lirePlanche(null)).toEqual(plancheVide());
    expect(lirePlanche({ colonnes: 9, espacement: -2, etiquettes: "??", taille: { largeur: 70, hauteur: 50 }, panneaux: [{ dossier: "FIG-0001_a" }, { x: 1 }] })).toMatchObject({
      colonnes: 6,
      espacement: 0,
      etiquettes: "(a)",
      taille: { largeur: 70, hauteur: 50 },
      panneaux: [{ dossier: "FIG-0001_a" }],
    });
    expect([etiquette(0, "(a)"), etiquette(1, "a)"), etiquette(2, "(A)"), etiquette(3, "aucune")]).toEqual(["(a)", "b)", "(C)", ""]);
  });

  it("mise en page en grille : colonnes au plus large, lignes au plus haut, place des étiquettes", () => {
    const p = { ...plancheVide(), colonnes: 2, espacement: 5 };
    const m = miseEnPage(p, [g(80, 60), g(100, 50), g(90, 70)]);
    expect(m.cases.map((c) => [c.x, c.y])).toEqual([
      [0, 5],
      [95, 5],
      [0, 75],
    ]);
    expect([m.largeur, m.hauteur]).toEqual([195, 145]);
    // taille commune imposée, sans étiquettes
    const t = miseEnPage({ ...p, taille: { largeur: 70, hauteur: 40 }, etiquettes: "aucune" }, [g(80, 60), g(100, 50)]);
    expect(t.cases.map((c) => [c.x, c.y, c.doc.width, c.doc.height])).toEqual([
      [0, 0, 70, 40],
      [75, 0, 70, 40],
    ]);
  });

  it("SVG : un groupe par graphe, étiquettes ; pgfplots : un axe placé par graphe dans une seule tikzpicture", () => {
    const p = plancheVide();
    const docs = [g(80, 60, "A"), g(80, 60, "B"), g(80, 60, "C")];
    const svg = plancheSvg(p, docs);
    expect(svg.match(/<g transform="translate\(/g)).toHaveLength(3);
    expect(svg).toContain(">(a)</text>");
    expect(svg).toContain(">(c)</text>");
    expect(svg).not.toMatch(/NaN|undefined/);
    const tex = planchePgfplots(p, docs);
    expect(tex.match(/\\begin\{tikzpicture\}/g)).toHaveLength(1);
    expect(tex.match(/\\begin\{axis\}\[at=\{\(/g)).toHaveLength(3);
    expect(tex.match(/\\end\{axis\}/g)).toHaveLength(3);
    expect(tex).toContain("{(b)};");
    expect(() => plancheSvg(p, [])).toThrow("vide");
  });
});
