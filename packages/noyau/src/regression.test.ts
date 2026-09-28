import { describe, expect, it } from "vitest";
import { regressionLineaire } from "./regression";

describe("régression linéaire", () => {
  it("retrouve une droite exacte sur le domaine choisi", () => {
    const x = [0, 1, 2, 3, 4, 5, 6];
    const y = x.map((v) => (v <= 3 ? 20 - 10 * v : 999));
    const d = regressionLineaire(x, y, 0, 3)!;
    expect(d.pente).toBeCloseTo(-10);
    expect(d.ordonnee).toBeCloseTo(20);
    expect(d.r2).toBeCloseTo(1);
    expect([d.n, d.x0, d.x1]).toEqual([4, 0, 3]);
  });

  it("bornes dans n'importe quel ordre, points invalides ignorés, R² < 1 si bruit", () => {
    const d = regressionLineaire([0, 1, 2, NaN, 3], [0, 1.2, 1.8, 5, 3.1], 3, 0)!;
    expect(d.n).toBe(4);
    expect(d.r2).toBeGreaterThan(0.95);
    expect(d.r2).toBeLessThan(1);
    expect(regressionLineaire([1, 1], [2, 3])).toBeNull();
    expect(regressionLineaire([1], [2])).toBeNull();
  });
});
