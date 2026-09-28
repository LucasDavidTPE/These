import { describe, expect, it } from "vitest";
import { exportGraphSvg, exportPgfplots } from "./export";
import { fitCorner, fitLabel, fitPoints, fitSeries, texNumber } from "./fit";
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
});
