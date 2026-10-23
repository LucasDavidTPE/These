import { describe, expect, it } from "vitest";
import { cadreUtile } from "./pdfEnPng";

describe("marges blanches de l'aspect Excel", () => {
  it("cadre des pixels non blancs, avec un bord", () => {
    const l = 20;
    const h = 10;
    const d = new Uint8ClampedArray(l * h * 4).fill(255);
    for (const [x, y] of [
      [5, 3],
      [12, 6],
    ]) d.set([0, 0, 0, 255], (y! * l + x!) * 4);
    expect(cadreUtile(d, l, h, 1)).toEqual({ x: 4, y: 2, l: 10, h: 6 });
    expect(cadreUtile(new Uint8ClampedArray(16).fill(255), 2, 2)).toBeNull();
  });
});
