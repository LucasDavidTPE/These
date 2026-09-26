import { describe, expect, it } from "vitest";
import { parseExpr } from "./expr";

describe("parseExpr", () => {
  it("arithmétique et priorités", () => {
    expect(parseExpr("1 + 2 * 3")(0)).toBe(7);
    expect(parseExpr("(1 + 2) * 3")(0)).toBe(9);
    expect(parseExpr("2 ^ 3 ^ 2")(0)).toBe(512);
    expect(parseExpr("-y^2")(3)).toBe(-9);
    expect(parseExpr("10 / 4 - 1")(0)).toBe(1.5);
  });

  it("virgule décimale, notation scientifique, multiplication implicite", () => {
    expect(parseExpr("0,5 y")(4)).toBe(2);
    expect(parseExpr("1.5e-2 * 100")(0)).toBeCloseTo(1.5);
    expect(parseExpr("2(y+1)")(1)).toBe(4);
    expect(parseExpr("3 × y")(2)).toBe(6);
  });

  it("fonctions et constantes", () => {
    const g = parseExpr("1.8*exp(-(y-0.16)^2/(2*0.0315^2))");
    expect(g(0.16)).toBeCloseTo(1.8);
    expect(g(0)).toBeLessThan(1e-3);
    expect(parseExpr("cos(pi)")(0)).toBeCloseTo(-1);
    expect(parseExpr("sqrt(abs(y))")(-9)).toBe(3);
    expect(parseExpr("log(100) + ln(e)")(0)).toBeCloseTo(3);
  });

  it("erreurs claires", () => {
    expect(() => parseExpr("")).toThrow("expression vide");
    expect(() => parseExpr("2 +")).toThrow("incomplète");
    expect(() => parseExpr("(y")).toThrow("« ) » attendu");
    expect(() => parseExpr("x + 1")).toThrow("« x » inconnu");
    expect(() => parseExpr("y ; 2")).toThrow("caractère inattendu");
    expect(() => parseExpr("exp y")).toThrow("« ( » attendu");
  });
});
