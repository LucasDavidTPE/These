import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { graphiqueVersGraphe, graphiquesDuClasseur, lirePlages } from "./excelGraphiques";
import { validateGraph } from "./model";

const classeur = new Uint8Array(readFileSync(new URL("./fixtures/excel-graphiques.xlsx", import.meta.url)));

describe("graphiques Excel → graphes", () => {
  it("plages : feuille entre apostrophes, cellule seule, plusieurs zones", () => {
    expect(lirePlages("'Mes données'!$A$2:$A$6")).toEqual([{ feuille: "Mes données", c0: 0, r0: 1, c1: 0, r1: 5 }]);
    expect(lirePlages("Feuil1!B1")).toEqual([{ feuille: "Feuil1", c0: 1, r0: 0, c1: 1, r1: 0 }]);
    expect(lirePlages("(F!$A$2:$A$3,F!$A$8:$A$9)")).toHaveLength(2);
    expect(lirePlages("'l''essai'!A1")[0]!.feuille).toBe("l'essai");
  });

  it("nuage de points : séries relues dans les cellules, log, titres, tendance, apparence", () => {
    const g = graphiquesDuClasseur(classeur);
    expect(g.map((x) => [x.feuille, x.nom, x.titre])).toEqual([
      ["Mes données", "Chart 1", "Module complexe"],
      ["Barres", "Chart 1", ""],
      ["Barres", "Chart 2", "Suivi"],
    ]);
    const doc = g[0]!.graphe!;
    expect(validateGraph(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    expect(doc.x).toMatchObject({ label: "Fréquence (Hz)", log: true });
    expect(doc.y).toMatchObject({ label: "|E*| (MPa)", log: true, min: 1000 });
    const [a, b] = doc.series;
    expect(a).toMatchObject({ name: "E 15 °C", type: "points", mark: "triangle", x: [0.1, 1, 3, 10, 30], y: [8200, 11000, 12500, 14000, 15200], fit: { kind: "puissance", label: true } });
    expect(b).toMatchObject({ name: "E 30 °C", type: "line", color: "#c00000", dash: "dashed" });
    expect(doc.legend).toBe("north east");
    expect(g[0]!.avertissements).toEqual([]);
  });

  it("barres sur catégories (sans légende) et courbes sur catégories", () => {
    const [, barres, courbes] = graphiquesDuClasseur(classeur);
    expect(barres!.graphe).toMatchObject({ legend: "none", x: { categories: ["BBSG", "EME2", "BBA"] }, y: { label: "Ornière (mm)" } });
    expect(barres!.graphe!.series[0]).toMatchObject({ name: "Ornière (mm)", type: "bar", x: [1, 2, 3], y: [4.1, 2.7, 5.3] });
    expect(courbes!.graphe!.series[0]!.type).toBe("line"); // openpyxl écrit <symbol val="none"/>
    expect(courbes!.graphe!.x.categories).toEqual(["BBSG", "EME2", "BBA"]);
  });

  it("XML d'Excel (préfixes c:/a:, cache seul, axe secondaire, barres d'erreur, secteurs)", () => {
    const ser = (nom: string, xs: number[], ys: number[], extra = "") => `<c:ser><c:tx><c:strRef><c:f>Absente!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${nom}</c:v></c:pt></c:strCache></c:strRef></c:tx>${extra}
      <c:xVal><c:numRef><c:f>Absente!$A$2:$A$4</c:f><c:numCache><c:ptCount val="${xs.length}"/>${xs.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:xVal>
      <c:yVal><c:numRef><c:f>Absente!$B$2:$B$4</c:f><c:numCache><c:ptCount val="${ys.length}"/>${ys.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:yVal><c:smooth val="0"/></c:ser>`;
    const xml = `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea>
      <c:scatterChart><c:scatterStyle val="lineMarker"/>${ser("Mesure", [1, 2, 3], [2, 4, 9], "<c:errBars><c:errDir val=\"y\"/></c:errBars>")}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>
      <c:scatterChart><c:scatterStyle val="lineMarker"/>${ser("Température", [1, 2, 3], [20, 21, 19])}<c:axId val="1"/><c:axId val="3"/></c:scatterChart>
      <c:pieChart><c:ser><c:val><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>1</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart>
      <c:valAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:title><c:tx><c:rich><a:p><a:r><a:t>Temps (s)</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="maxMin"/><c:max val="10"/></c:scaling><c:axPos val="l"/></c:valAx>
      <c:valAx><c:axId val="3"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="r"/></c:valAx>
      </c:plotArea><c:legend><c:legendPos val="b"/></c:legend></c:chart></c:chartSpace>`;
    const r = graphiqueVersGraphe(xml, []);
    expect(r.titre).toBe("");
    expect(r.graphe!.series.map((s) => [s.name, s.type, s.y])).toEqual([
      ["Mesure", "linepoints", [2, 4, 9]],
      ["Température", "linepoints", [20, 21, 19]],
    ]);
    expect(r.graphe!.x.label).toBe("Temps (s)");
    expect(r.graphe!.y).toMatchObject({ inverse: true, max: 10 });
    expect(r.graphe!.legend).toBe("south east");
    expect(r.avertissements.join("\n")).toMatch(/Barres d'erreur de « Mesure »/);
    expect(r.avertissements.join("\n")).toMatch(/Axe secondaire/);
    expect(r.avertissements.join("\n")).toMatch(/secteurs/);
  });
});
