import { describe, expect, it } from "vitest";
import { cadrer, courbesSvg, graduer, type Panneau } from "./courbes";

const p: Panneau = {
  titre: "Température",
  unite: "°C",
  traces: [
    { nom: "Enceinte", x: [0, 1, 2, 3, 4], y: [20, 10, 0, -10, -20] },
    { nom: "Surface <1>", x: [0, 1, 2, 3, 4], y: [21, 11, 1, -9, NaN] },
  ],
};

describe("traceur de courbes", () => {
  it("graduations rondes", () => {
    expect(graduer(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(graduer(-0.3, 0.3, 4)).toEqual([-0.2, 0, 0.2]);
  });

  it("cadre la plage zoomée et ignore les voies masquées pour l'échelle", () => {
    const c = cadrer(p, { masquees: ["Surface <1>"], plage: [1, 3] });
    expect([c.x0, c.x1]).toEqual([1, 3]);
    expect(c.traces[0]!.x).toEqual([1, 2, 3]);
    expect(c.y1).toBeCloseTo(11); // 10 + 5 % de 20
  });

  it("SVG autonome, déterministe, voies masquées absentes, textes échappés", () => {
    const vue = { masquees: ["Enceinte"], plage: null };
    const svg = courbesSvg([p], { titre: "B2C4 — Essai1", xLibelle: "temps (h)", vue });
    expect(svg).toBe(courbesSvg([p], { titre: "B2C4 — Essai1", xLibelle: "temps (h)", vue }));
    expect(svg).toContain("Surface &lt;1&gt;");
    expect(svg).not.toContain(">Enceinte<");
    expect(svg.match(/<polyline/g)).toHaveLength(1);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("régressions sur les courbes", () => {
  const tsrst: Panneau = { titre: "Température", unite: "°C", traces: [{ nom: "Enceinte", x: [0, 1, 2, 3, 4], y: [20, 10, 0, -10, -10] }] };

  it("pente dans l'unité du panneau par unité de temps", async () => {
    const { calculerRegressions, libelleRegression } = await import("./courbes");
    const [r] = calculerRegressions([tsrst], [{ panneau: "Température", trace: "Enceinte", de: 0, a: 3 }], "temps (h)");
    expect(r!.droite.pente).toBeCloseTo(-10);
    expect(r!.unite).toBe("°C/h");
    expect(libelleRegression(r!)).toBe("Température (Enceinte) : -10 °C/h · R² 1,0000 · 0 → 3");
    expect(calculerRegressions([tsrst], [{ panneau: "Force", trace: "x", de: 0, a: 1 }], "temps (h)")).toEqual([]);
  });

  it("dessinées dans le SVG exporté, avec la pente", () => {
    const svg = courbesSvg([tsrst], { xLibelle: "temps (h)", vue: { masquees: [], plage: null, regressions: [{ panneau: "Température", trace: "Enceinte", de: 0, a: 3 }] } });
    expect(svg).toContain('stroke-dasharray="6 3"');
    expect(svg).toContain("-10 °C/h (R² 1,000)");
  });
});
