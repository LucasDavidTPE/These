import { describe, expect, it } from "vitest";
import { exportGraphSvg, exportPgfplots } from "./export";
import { fitCorner, fitInverse, fitLabel, fitPoints, fitSample, fitSeries, fitValue, parseFit, texNumber, type FitKind, type SeriesFit } from "./fit";
import { fitRows, graphFits, scales } from "./layout";
import { graphTheme } from "./style";
import { emptyGraph, validateGraph } from "./model";

describe("régressions", () => {
  it("droite, droite par l'origine, loi puissance", () => {
    const x = [1, 2, 3, 4];
    const l = fitSeries(x, [3, 5, 7, 9], "lineaire")!;
    expect([l.a, l.b, l.r2]).toEqual([2, 1, 1]);
    const o = fitSeries(x, [2, 4.2, 5.8, 8], "origine")!;
    expect(o.b).toBe(0);
    expect(o.a).toBeCloseTo((2 + 8.4 + 17.4 + 32) / 30);
    const p = fitSeries(x, x.map((v) => 3 * v ** 1.5), "puissance")!;
    expect(p.a).toBeCloseTo(3);
    expect(p.b).toBeCloseTo(1.5);
    expect(p.r2).toBeCloseTo(1);
    expect(fitSeries([1, 1], [1, 2], "lineaire")).toBeNull();
    expect(fitSeries([-1, -2], [1, 2], "puissance")).toBeNull();
  });

  it("R² d'un nuage bruité", () => {
    const r = fitSeries([0, 1, 2, 3], [0, 1, 1, 3], "lineaire")!;
    // Pente 0,9, ordonnée −0,1 ; SSres = 0,7 ; SStot = 4,75.
    expect(r.a).toBeCloseTo(0.9);
    expect(r.b).toBeCloseTo(-0.1);
    expect(r.r2).toBeCloseTo(1 - 0.7 / 4.75);
  });

  it("équation en TeX à la française", () => {
    expect(texNumber(1234.567)).toBe("1235");
    expect(texNumber(0.0012346)).toBe("1{,}235 \\times 10^{-3}");
    expect(texNumber(-2.5)).toBe("-2{,}5");
    expect(texNumber(123456)).toBe("1{,}235 \\times 10^{5}");
    expect(fitLabel({ kind: "lineaire", a: 2, b: -1.5, r2: 0.99876, n: 4 })).toBe("$y = 2\\,x - 1{,}5 \\quad R^2 = 0{,}9988$");
    expect(fitLabel({ kind: "origine", a: 0.5, b: 0, r2: 1, n: 4 })).toBe("$y = 0{,}5\\,x \\quad R^2 = 1$");
    expect(fitLabel({ kind: "puissance", a: 3, b: 1.5, r2: 1, n: 4 })).toBe("$y = 3\\,x^{1{,}5} \\quad R^2 = 1$");
  });

  it("points : deux pour une droite, échantillonnés sinon", () => {
    const l = fitSeries([1, 10], [1, 10], "lineaire")!;
    expect(fitPoints(l, [1, 10], false, false)).toEqual([[1, 1], [10, 10]]);
    expect(fitPoints(l, [1, 10], true, false)).toHaveLength(61);
  });

  it("coin des équations", () => {
    expect(fitCorner(undefined, "north east")).toBe("north west");
    expect(fitCorner(undefined, "north west")).toBe("north east");
    expect(fitCorner("south east", "north east")).toBe("south east");
  });

  it("validation, SVG et pgfplots", () => {
    const raw = { ...emptyGraph(), fit_pos: "south east", series: [{ name: "Essai", type: "points", x: [1, 2, 3], y: [2, 4, 6.1], legend: true, fit: { kind: "lineaire", label: true } }] };
    const v = validateGraph(raw);
    expect(v.ok && v.doc.series[0]!.fit).toEqual({ kind: "lineaire", label: true });
    expect(v.ok && v.doc.fit_pos).toBe("south east");
    expect(validateGraph({ ...raw, series: [{ ...raw.series[0], fit: { kind: "?" } }] })).toMatchObject({ ok: true, doc: { series: [{ name: "Essai" }] } });
    const svg = exportGraphSvg(raw);
    expect(svg).toContain("stroke-dasharray");
    const tex = exportPgfplots(raw).tex;
    expect(tex).toContain("% Régression de la série 1");
    expect(tex).toContain("forget plot] coordinates {(1,");
    expect(tex).toContain("\\node[anchor=south east");
    expect(tex).toContain("R^2 = 0{,}9998");
    expect(tex).toContain("\\tikz[baseline=-0.5ex]\\draw[");
  });

  it("polynôme : retrouve un polynôme exact, même loin de l'origine", () => {
    const x = Array.from({ length: 12 }, (_, i) => 1000 + i);
    const p = (v: number) => 2 - 0.5 * (v - 1000) + 0.25 * (v - 1000) ** 2 - 0.01 * (v - 1000) ** 3;
    const f = fitSeries(x, x.map(p), "polynome", 3)!;
    expect(f.r2).toBeCloseTo(1, 10);
    for (const v of [1000, 1003.5, 1011]) expect(fitValue(f, v)).toBeCloseTo(p(v), 6);
    expect(f.coefs).toHaveLength(4);
    // Pas assez de x distincts pour le degré demandé.
    expect(fitSeries([1, 1, 2, 2], [1, 2, 3, 4], "polynome", 2)).toBeNull();
    const q = fitSeries([-1, 0, 1, 2], [1, 0, 1, 4], "polynome", 2)!;
    expect(q.coefs!.map((c) => Number(c.toFixed(10)))).toEqual([0, 0, 1]);
    expect(fitLabel(q)).toBe("$y = 1\\,x^{2} \\quad R^2 = 1$");
  });

  it("exponentielle et logarithme", () => {
    const x = [0, 1, 2, 3, 4];
    const e = fitSeries(x, x.map((v) => 2 * Math.exp(-0.3 * v)), "exponentielle")!;
    expect(e.a).toBeCloseTo(2);
    expect(e.b).toBeCloseTo(-0.3);
    expect(fitLabel(e)).toBe("$y = 2\\,e^{-0{,}3\\,x} \\quad R^2 = 1$");
    const xl = [1, 2, 5, 10, 20];
    const l = fitSeries([-1, ...xl], [7, ...xl.map((v) => 3 * Math.log(v) - 1)], "logarithmique")!;
    expect(l.n).toBe(5); // x ≤ 0 écarté
    expect(l.a).toBeCloseTo(3);
    expect(l.b).toBeCloseTo(-1);
    expect(fitLabel(l)).toBe("$y = 3\\,\\ln x - 1 \\quad R^2 = 1$");
  });

  it("plage : seuls les points retenus comptent, la courbe s'y limite sauf si prolongée", () => {
    const x = [0, 1, 2, 3, 4, 5, 6];
    const y = [0, 1, 2, 3, 10, 20, 30]; // droite y = x jusqu'à 3, puis rupture
    expect(fitSample(x, y, { xmin: 3, xmax: 0 })).toEqual({ x: [0, 1, 2, 3], y: [0, 1, 2, 3] });
    const doc = { ...emptyGraph(), series: [{ name: "a", type: "points" as const, x, y, legend: true, fit: { kind: "lineaire", label: true, xmax: 3 } as SeriesFit }] };
    const { xs, ys } = scales(doc);
    const [f] = graphFits(doc, xs, ys);
    expect(f!.result.a).toBeCloseTo(1);
    expect(f!.result.b).toBeCloseTo(0);
    expect(f!.points.map((p) => p[0])).toEqual([0, 3]);
    doc.series[0]!.fit = { ...doc.series[0]!.fit, prolonger: true };
    expect(graphFits(doc, xs, ys)[0]!.points.map((p) => p[0])).toEqual([0, 6]);
  });

  it("lecture : degré borné, plage et prolongement gardés", () => {
    expect(parseFit({ kind: "polynome", degre: 9, xmin: 1, xmax: "x", prolonger: true })).toEqual({ kind: "polynome", label: true, degre: 6, xmin: 1, prolonger: true });
    expect(parseFit({ kind: "exponentielle", label: false })).toEqual({ kind: "exponentielle", label: false });
    expect(parseFit({ kind: "polynome" })).toEqual({ kind: "polynome", label: true, degre: 2 });
  });

  it("équation trop large pour le graphe : R² passe à la ligne", () => {
    const f = { i: 0, result: { kind: "lineaire" as const, a: 1, b: 0, r2: 1, n: 2 }, points: [], label: "$y = 1\\,x \\quad R^2 = 1$" };
    const theme = graphTheme(emptyGraph());
    expect(fitRows([f], theme, 200)).toEqual([{ i: 0, text: f.label, trait: true }]);
    expect(fitRows([f], theme, 12)).toEqual([
      { i: 0, text: "$y = 1\\,x$", trait: true },
      { i: 0, text: "$R^2 = 1$", trait: false },
    ]);
  });

  it("inverse : retrouve x pour un y, sur chaque forme", () => {
    const x = [1, 2, 3, 4, 5, 6];
    const cas: [FitKind, (v: number) => number][] = [
      ["lineaire", (v) => 3 * v + 2],
      ["puissance", (v) => 2 * v ** 1.5],
      ["exponentielle", (v) => 0.5 * Math.exp(0.4 * v)],
      ["logarithmique", (v) => 2 * Math.log(v) + 1],
    ];
    for (const [kind, g] of cas) {
      const f = fitSeries(x, x.map(g), kind)!;
      const r = fitInverse(f, g(3.7), [1, 6]);
      expect(r).toHaveLength(1);
      expect(r[0]).toBeCloseTo(3.7, 6);
    }
    // Extrapolation : au-delà de la plage de la série.
    const d = fitSeries(x, x.map((v) => 3 * v + 2), "lineaire")!;
    expect(fitInverse(d, 62, [1, 6])[0]).toBeCloseTo(20, 8);
    // Sans solution : y négatif pour une exponentielle.
    expect(fitInverse(fitSeries(x, x.map((v) => Math.exp(v)), "exponentielle")!, -1, [1, 6])).toEqual([]);
    // Polynôme : deux racines pour y = 1 sur x² (−1 et 1).
    const q = fitSeries([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4], "polynome", 2)!;
    const rs = fitInverse(q, 1, [-2, 2]);
    expect(rs).toHaveLength(2);
    expect(rs[0]).toBeCloseTo(-1, 6);
    expect(rs[1]).toBeCloseTo(1, 6);
    expect(fitInverse(q, 10, [-2, 2])).toEqual([]);
  });
});
