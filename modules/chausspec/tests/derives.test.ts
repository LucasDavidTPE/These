import { describe, expect, it } from "vitest";
import { analyserCombinaison, calculerDerive, classeCombinaison, combiner, derivesPossibles } from "../core/derives";
import type { GridResult } from "../core/grid";
import { CArray } from "../core/carray";
import { STRAIN, STRESS } from "../core/spectral";

/** Faux résultat : quelques points avec des tenseurs connus. */
function faux(champs: Record<string, number[]>, complex = false): GridResult {
  return {
    meta: { complex },
    get: (c: string) => {
      const v = champs[c];
      if (!v) throw new Error(`Champ ${c} non calculé.`);
      return { re: Float64Array.from(v) } as unknown as CArray;
    },
  } as unknown as GridResult;
}

const TOUT = (o: Record<string, number[]>) => {
  const n = Math.max(1, ...Object.values(o).map((v) => v.length));
  const zeros = () => new Array<number>(n).fill(0);
  return Object.fromEntries([...STRAIN, ...STRESS].map((c) => [c, o[c] ?? zeros()]));
};

describe("champs dérivés", () => {
  it("principales : tenseur diagonal et cisaillement pur", () => {
    const r = faux(TOUT({ exx: [3, 0], eyy: [-1, 0], ezz: [2, 0], exy: [0, 1] }));
    const proche = (d: "e1" | "e2" | "e3" | "evol", v: number[]) => calculerDerive(r, d, 0).forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 12));
    proche("e1", [3, 1]);
    proche("e2", [2, 0]);
    proche("e3", [-1, -1]);
    proche("evol", [4, 0]);
  });

  it("contraintes : cisaillement maximal et von Mises", () => {
    // Traction uniaxiale de 100 : σ1 = 100, τmax = 50, von Mises = 100.
    const uni = faux(TOUT({ sxx: [100] }));
    expect(calculerDerive(uni, "s1", 0)[0]).toBeCloseTo(100, 9);
    expect(calculerDerive(uni, "tmax", 0)[0]).toBeCloseTo(50, 9);
    expect(calculerDerive(uni, "svm", 0)[0]).toBeCloseTo(100, 9);
    // Cisaillement pur τ : σ1 = τ, σ3 = −τ, von Mises = √3 τ.
    const cis = faux(TOUT({ sxy: [40] }));
    expect(calculerDerive(cis, "s1", 0)[0]).toBeCloseTo(40, 9);
    expect(calculerDerive(cis, "s3", 0)[0]).toBeCloseTo(-40, 9);
    expect(calculerDerive(cis, "svm", 0)[0]).toBeCloseTo(40 * Math.sqrt(3), 9);
  });

  it("refuse les champs complexes", () => {
    expect(() => calculerDerive(faux(TOUT({}), true), "e1", 0)).toThrow(/complexes/);
  });

  it("ne propose que ce qui est calculable", () => {
    expect(derivesPossibles(new Set(["uz", "exx", "eyy", "ezz"]))).toEqual(["evol"]);
    expect(derivesPossibles(new Set(["exx", "eyy", "ezz", "exy", "exz", "eyz"]))).toEqual(["e1", "e2", "e3", "evol"]);
    expect(derivesPossibles(new Set(["uz"]))).toEqual([]);
  });
});

describe("combinaisons linéaires", () => {
  const dispo = new Set(["exx", "eyy", "exy", "uz"]);

  it("lit coefficients, signes, virgules, ·, × et −", () => {
    expect(analyserCombinaison("exx - eyy", dispo)).toEqual({ ok: true, termes: [{ comp: "exx", coef: 1 }, { comp: "eyy", coef: -1 }] });
    expect(analyserCombinaison("0,5·exx + 0.5*eyy − 2 exy", dispo)).toEqual({
      ok: true,
      termes: [{ comp: "exx", coef: 0.5 }, { comp: "eyy", coef: 0.5 }, { comp: "exy", coef: -2 }],
    });
    expect(analyserCombinaison("-exx", dispo)).toEqual({ ok: true, termes: [{ comp: "exx", coef: -1 }] });
  });

  it("messages clairs", () => {
    expect(analyserCombinaison("", dispo)).toMatchObject({ ok: false });
    expect(analyserCombinaison("exx + zzz", dispo)).toMatchObject({ ok: false, message: expect.stringContaining("inconnue") });
    expect(analyserCombinaison("sxx", dispo)).toMatchObject({ ok: false, message: expect.stringContaining("pas été calculée") });
    expect(analyserCombinaison("exx * * eyy", dispo)).toMatchObject({ ok: false });
  });

  it("combine point par point ; classe physique", () => {
    const r = faux({ exx: [1, 2], eyy: [0.5, 1], exy: [0, 0], uz: [0, 0] });
    const t = analyserCombinaison("exx - 2 eyy", dispo);
    if (!t.ok) throw new Error();
    expect([...combiner(r, t.termes, 0)]).toEqual([0, 0]);
    expect(classeCombinaison(t.termes)).toBe("e");
    expect(classeCombinaison([{ comp: "exx", coef: 1 }, { comp: "uz", coef: 1 }])).toBeNull();
  });
});
