import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { grilleCoupe, lireComsol } from "./comsol";
import { animationBeamer, imagesInstants } from "./comsolAnimation";
import {
  executerTrace,
  lireTrace,
  traceVide,
  type TraceCarte,
  type TraceCoupeProfils,
} from "./comsolEtude";
import { affinerCarte, parametresVariables } from "./comsolInstants";
import { grapheSegments, profilSegment } from "./comsolSegments";
import { validateGraph } from "./model";

const lire = (n: string) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    n,
  );
const ctx = (
  exports = [lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_instants.txt")],
) => ({
  exports,
  cadre: { longueur: "mm" as const, couches: false, source: "auto" as const },
  noms: {},
  correspondances: [],
  interfaces: [],
});

describe("profils le long d'un segment", () => {
  it("valeurs interpolées le long de AB, distance depuis A ; recette « segments »", () => {
    const e = lire("grille_XZ_EL_het.txt");
    const g = grilleCoupe(e, "1e6*solid.eXX", "mm");
    // exx = 100 x − 50 z (x, z en m) : linéaire, l'interpolation le retrouve exactement
    const p = profilSegment(g, { x0: 700, y0: -320, x1: 900, y1: 0 }, 4);
    expect(p.s.map((s) => Number(s.toFixed(3)))).toEqual([
      0, 94.34, 188.68, 283.019, 377.359,
    ]);
    expect(p.v.map((v) => Number(v!.toFixed(6)))).toEqual(
      [0, 1, 2, 3, 4].map((i) =>
        Number((100 * (0.7 + i * 0.05) - 50 * (-0.32 + i * 0.08)).toFixed(6)),
      ),
    );
    const doc = grapheSegments(
      e,
      "1e6*solid.eXX",
      [{ x0: 700, y0: -320, x1: 900, y1: 0 }],
      "mm",
    );
    expect(validateGraph(doc).ok).toBe(true);
    expect(doc.series[0]!.name).toBe("a. (700 ; −320) → (900 ; 0)");
    expect(() =>
      grapheSegments(
        e,
        "1e6*solid.eXX",
        [{ x0: 5000, y0: 0, x1: 6000, y1: 0 }],
        "mm",
      ),
    ).toThrow(/hors de la carte/);
    const t: TraceCoupeProfils = {
      ...(traceVide("coupe-profils") as TraceCoupeProfils),
      plan: e.nom,
      expression: "1e6*solid.eXX",
      sens: "segments",
      segments: [{ x0: 700, y0: -320, x1: 900, y1: 0 }],
    };
    expect(executerTrace(t, ctx([e]))!.titre).toMatch(/le long d'un segment/);
    expect(
      lireTrace({
        mode: "coupe-profils",
        sens: "segments",
        segments: [{ x0: 1, y0: 2, x1: 3, y1: 4 }, { x0: "a" }],
      }),
    ).toMatchObject({
      sens: "segments",
      segments: [{ x0: 1, y0: 2, x1: 3, y1: 4 }],
    });
  });
});

describe("lissage et animation de la carte", () => {
  it("carte affinée : nœuds d'origine gardés, valeurs interpolées entre eux", () => {
    const g = grilleCoupe(lire("grille_XZ_EL_het.txt"), "1e6*solid.eXX", "mm");
    const f = affinerCarte(g, 2);
    expect(f.x).toEqual([700, 750, 800, 850, 900]);
    expect(f.y).toHaveLength(5);
    expect(f.v[0]![0]).toBe(g.v[0]![0]);
    expect(f.v[0]![1]).toBeCloseTo((g.v[0]![0]! + g.v[0]![1]!) / 2, 9);
    expect(affinerCarte(g, 1)).toBe(g);
    const t: TraceCarte = {
      ...(traceVide("carte") as TraceCarte),
      plan: "grille_XZ_EL_het.txt",
      expression: "1e6*solid.eXX",
      lissage: 4,
    };
    expect(executerTrace(t, ctx())!.doc.carte!.x).toHaveLength(9);
  });

  it("une image par instant, même échelle de couleurs, instant sous l'axe ; code animate", () => {
    const c = ctx();
    const ve = c.exports[1]!;
    const p = parametresVariables(ve)[0]!;
    const t: TraceCarte = {
      ...(traceVide("carte") as TraceCarte),
      plan: ve.nom,
      expression: "1e6*solid.eXX",
    };
    const im = imagesInstants(t, c, p, ["9", "10", "11"]);
    expect(im.map((x) => x.valeur)).toEqual(["9", "10", "11"]);
    expect(
      new Set(im.map((x) => `${x.doc.carte!.min}|${x.doc.carte!.max}`)).size,
    ).toBe(1);
    expect(im[1]!.doc.x.label).toMatch(/— \$t\$ = 10$/);
    expect(
      animationBeamer({ n: 3, parSeconde: 2, prefixe: "carte-" }),
    ).toContain(
      "\\animategraphics[controls, loop, autoplay, width=\\linewidth]{2}{carte-}{0}{2}",
    );
  });
});
