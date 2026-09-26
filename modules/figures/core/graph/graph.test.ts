import { describe, expect, it } from "vitest";
import { clipSegment, graphLayout } from "./layout";
import { emptyGraph, validateGraph } from "./model";
import { exportGraphSvg, exportPgfplots, formatData, texTickLabel } from "./export";
import { formatTick, linearScale, logScale, niceStep, project } from "./ticks";

describe("graduations", () => {
  it("pas ronds", () => {
    expect(niceStep(10)).toBe(2);
    expect(niceStep(12)).toBe(2.5);
    expect(niceStep(0.9)).toBeCloseTo(0.2);
    expect(niceStep(45000)).toBe(10000);
  });

  it("bornes rondes englobant les données, libellés à la française", () => {
    const s = linearScale(0.3, 4.6);
    expect([s.min, s.max]).toEqual([0, 5]);
    expect(s.labels).toEqual(["0", "1", "2", "3", "4", "5"]);
    const t = linearScale(-0.12, 0.37);
    expect(t.labels[0]).toBe("−0,2");
    expect(t.labels).toContain("0,4");
    const big = linearScale(3100, 25000.5);
    // 25 000,5 dépasse 25 000 : la borne ronde suivante (pas de 5 000) est 30 000.
    expect(big.labels.at(-1)).toBe("30\u2009000");
  });

  it("bornes imposées et données constantes", () => {
    expect(linearScale(2, 3, { min: 0, max: 10 })).toMatchObject({ min: 0, max: 10 });
    const c = linearScale(5, 5);
    expect(c.max).toBeGreaterThan(c.min);
  });

  it("échelle log : décades", () => {
    const s = logScale(0.1, 30);
    expect([s.min, s.max]).toEqual([0.1, 100]);
    expect(s.labels).toEqual(["$10^{-1}$", "$10^{0}$", "$10^{1}$", "$10^{2}$"]);
    expect(project(s, 1)).toBeCloseTo(1 / 3);
    expect(() => logScale(0, 10)).toThrow(RangeError);
  });

  it("libellés LaTeX", () => {
    expect(texTickLabel("−12 500,5")).toBe("$-12\\,500{,}5$");
    expect(texTickLabel("$10^{2}$")).toBe("$10^{2}$");
    expect(formatTick(-0.0000001, 1, false)).toBe("0,0");
    expect(formatData(0.1 + 0.2)).toBe("0.3");
  });
});

describe("modèle", () => {
  it("valide et complète", () => {
    const r = validateGraph({ ...emptyGraph(), series: [{ x: [1, 2], y: [3, 4] }] });
    expect(r.ok && r.doc.series[0]).toMatchObject({ name: "Série 1", type: "linepoints", legend: true });
  });

  it("erreurs claires", () => {
    const r = validateGraph({ ...emptyGraph(), x: { log: true }, series: [{ x: [0, 1], y: [1] }, { x: [0, 1], y: [1, 2] }] });
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(["series[0]", "x.log"]);
    expect(validateGraph({ format: "autre" }).ok).toBe(false);
  });
});

describe("mise en page", () => {
  it("découpe les segments à la boîte", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(clipSegment([-5, 5], [5, 5], box)).toEqual([[0, 5], [5, 5]]);
    expect(clipSegment([-5, -5], [-1, -1], box)).toBeNull();
  });

  it("barres autour de 0, légende présente", () => {
    const doc = { ...emptyGraph(), series: [{ name: "A", type: "bar" as const, x: [1, 2], y: [3, -1], legend: true }] };
    const l = graphLayout(doc);
    expect(l.ys.min).toBeLessThanOrEqual(-1);
    expect(l.primitives.some((p) => p.kind === "text" && p.text === "A")).toBe(true);
  });

  it("exports déterministes", () => {
    const doc = { ...emptyGraph(), series: [{ name: "$E^*$", type: "line", x: [0.1, 1, 10], y: [100, 1000, 10000] }], x: { label: "$f$ (Hz)", log: true }, y: { label: "", log: true } };
    expect(exportGraphSvg(doc)).toBe(exportGraphSvg(doc));
    const a = exportPgfplots(doc, { dataFiles: true });
    expect(a.tex).toContain("\\figurinedatadir export-1.dat");
    expect(a.files["export-1.dat"]).toBe("x y\n0.1 100\n1 1000\n10 10000\n");
    expect(() => exportPgfplots({ ...emptyGraph() })).toThrow("aucune série");
  });
});
