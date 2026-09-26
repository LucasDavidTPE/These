import { describe, expect, it } from "vitest";
import { formatNumber } from "./number";

describe("formatNumber", () => {
  it("arrondit à 2 décimales par défaut", () => {
    expect(formatNumber(3.14159)).toBe("3.14");
    expect(formatNumber(2.675)).toBe("2.68");
    expect(formatNumber(1.005)).toBe("1.01");
  });

  it("supprime les zéros inutiles", () => {
    expect(formatNumber(10)).toBe("10");
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(1.1)).toBe("1.1");
    expect(formatNumber(100.0)).toBe("100");
  });

  it("n'écrit jamais -0", () => {
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(-0.001)).toBe("0");
    expect(formatNumber(0.004)).toBe("0");
  });

  it("est symétrique pour les négatifs", () => {
    expect(formatNumber(-2.675)).toBe("-2.68");
    expect(formatNumber(-0.16)).toBe("-0.16");
  });

  it("n'utilise jamais la notation exponentielle", () => {
    expect(formatNumber(3.5e10)).toBe("35000000000");
    expect(formatNumber(1e-7, 8)).toBe("0.0000001");
    expect(() => formatNumber(1e21)).toThrow(RangeError);
  });

  it("respecte le nombre de décimales demandé", () => {
    expect(formatNumber(0.031_5, 4)).toBe("0.0315");
    expect(formatNumber(12.6, 0)).toBe("13");
  });

  it("refuse les valeurs non finies", () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
