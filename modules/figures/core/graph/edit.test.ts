import { describe, expect, it } from "vitest";
import { decimate, eraseBox, parseXY, smooth, sortByX, swapXY, toTsv, transform, xRange } from "./edit";
import type { Series } from "./model";

const s = (x: number[], y: number[]): Series => ({ name: "A", type: "linepoints", x, y, legend: true, color: "#ff0000" });

describe("retouches des données", () => {
  const a = s([0, 1, 2, 3, 4], [10, 11, 50, 13, 14]);

  it("unités, signe, origine ; la série reçue n'est pas modifiée", () => {
    const b = transform(a, null, { scale: 1e-3, offset: 0 });
    expect(b.y).toEqual([0.01, 0.011, 0.05, 0.013, 0.014]);
    expect(a.y[0]).toBe(10);
    expect(transform(a, { scale: -1, offset: 5 }, null).x).toEqual([5, 4, 3, 2, 1]);
    expect(b.color).toBe("#ff0000");
  });

  it("gomme : retire les points du rectangle, dans n'importe quel sens de tracé", () => {
    const r = eraseBox(a, { x0: 2.5, x1: 1.5, y0: 60, y1: 40 });
    expect(r.removed).toBe(1);
    expect(r.series.x).toEqual([0, 1, 3, 4]);
    expect(eraseBox(a, { x0: 10, x1: 11, y0: 0, y1: 1 }).series).toBe(a);
  });

  it("plage de x gardée ou retirée", () => {
    expect(xRange(a, 3, 1).x).toEqual([1, 2, 3]);
    expect(xRange(a, 1, 3, false).x).toEqual([0, 4]);
  });

  it("lissage, allègement, tri, échange des axes", () => {
    expect(smooth(a, 3).y[1]).toBeCloseTo((10 + 11 + 50) / 3, 12);
    expect(smooth(a, 1)).toBe(a);
    expect(decimate(s([0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]), 3).x).toEqual([0, 3, 6]);
    expect(sortByX(s([2, 0, 1], [20, 0, 10])).y).toEqual([0, 10, 20]);
    expect(swapXY(a).x).toEqual(a.y);
  });

  it("tableau collé depuis Excel (virgule décimale, en-tête, point-virgule)", () => {
    expect(parseXY("x\ty\n0,1\t8 200\n1;11000\n2 12000\n\n")).toEqual({ x: [0.1, 1, 2], y: [8200, 11000, 12000], skipped: 1 });
    expect(toTsv(s([0.5], [2]))).toBe("x\ty\n0,5\t2");
  });
});
