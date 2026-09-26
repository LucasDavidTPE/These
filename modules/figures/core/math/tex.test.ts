import { describe, expect, it } from "vitest";
import { hasMath, labelToSvg, labelToTex, measureLabel } from "./tex";

describe("maths des étiquettes", () => {
  it("détecte les maths", () => {
    expect(hasMath("$E_1$")).toBe(true);
    expect(hasMath("50 %")).toBe(false);
    expect(hasMath("prix 5 $")).toBe(false);
  });

  it("mélange texte et maths", () => {
    expect(labelToTex("$q = 0{,}662$ MPa")).toBe("q = 0{,}662\\text{ MPa}");
    expect(labelToTex("BB (8 cm) & $h_1$")).toBe("\\text{BB (8 cm) \\& }h_1");
    expect(labelToTex("a_b")).toBe("\\text{a\\_b}");
    expect(labelToTex("Fréquence $f$")).toBe("\\text{Fr\\'{e}quence }f");
    expect(labelToTex("10 °C, µm")).toBe("\\text{10 $^{\\circ}$C, $\\mu$m}");
  });

  it("produit des chemins, sans police requise, de façon déterministe", () => {
    const a = labelToSvg("$\\eta_1$");
    expect(a.error).toBeNull();
    expect(a.body).toContain("<path");
    expect(a.body).not.toContain("<text");
    expect(a.viewBox[2]).toBeGreaterThan(0);
    expect(labelToSvg("$\\eta_1$")).toBe(a);
    expect(labelToSvg("$E_{00}$").body).toBe(labelToSvg("$E_{00}$").body);
  });

  it("accents composés en chemins (aucun <text>)", () => {
    const m = labelToSvg("Modèle $\\varepsilon$ à 10 °C, déformation (µm/m)");
    expect(m.error).toBeNull();
    expect(m.body).not.toContain("<text");
  });

  it("signale une formule invalide sans planter", () => {
    const r = labelToSvg("$\\frac{1}$");
    expect(r.error).not.toBeNull();
  });

  it("mesure : une formule plus longue est plus large", () => {
    expect(measureLabel("$E_0 - E_{00}$", 3).w).toBeGreaterThan(measureLabel("$E$", 3).w);
  });
});
