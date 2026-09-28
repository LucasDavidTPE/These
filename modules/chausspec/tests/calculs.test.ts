/**
 * Conformité au code Python d'origine (chausspec v0.4) de toute la chaîne : lois, transformées
 * des empreintes, solveur grille (statique, roulant 2S2P1D, harmonique KVG, efforts
 * tangentiels, carte de pression, empreinte De Beer filtrée) et solveur axisymétrique.
 * Référence : tests/reference/calculs.json, produite par le Python (voir README du module).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { solveAxisym, type AxisymOutput } from "../core/axisym";
import { CArray } from "../core/carray";
import { solveGrid } from "../core/grid";
import { caseFromDict, gridSettings, loadMapCsv, type CaseJSON } from "../core/io";
import { Box1D, GaussianPairs1D, HalfEllipse1D, PressureMap, Separable, Tabulated1D, UniformCircle, UniformRect } from "../core/loads";
import { Elastic, GeneralizedKelvinVoigt, GeneralizedMaxwell, TwoS2P1D } from "../core/materials";
import { Harmonic } from "../core/regimes";
import { Layer, Structure } from "../core/structure";

type Cx = [number, number][];
const ref = JSON.parse(readFileSync(new URL("./reference/calculs.json", import.meta.url), "utf8")) as {
  lois: { omega: number[]; "2s2p1d": { E: Cx; nu: Cx }; kvg: { E: Cx }; maxwell: { E: Cx } };
  empreintes: { k1: number[]; k2: number[]; ft: Record<string, Cx>; force: Record<string, number> };
  grilles: Record<string, { cas: CaseJSON; x: number[]; y: number[]; champs: Record<string, Cx>; noeuds: [number, number] }>;
  axisym: { statique: Record<string, Cx>; harmonique: Record<string, Cx> };
};
const csv = readFileSync(new URL("./reference/carte_exemple.csv", import.meta.url), "utf8");

/** Écart maximal rapporté à la plus grande valeur de référence (ou à une échelle donnée). */
function gap(got: CArray, expected: Cx, scale = 0): number {
  const m = Math.max(scale, ...expected.map((v) => Math.hypot(...v)), 1e-300);
  return Math.max(...expected.map((v, i) => Math.hypot(got.re[i]! - v[0], got.im[i]! - v[1]))) / m;
}

describe("lois de comportement", () => {
  it("2S2P1D (WLF, β fini, ν complexe), KVG, Maxwell généralisé", () => {
    const w = Float64Array.from(ref.lois.omega);
    const m1 = new TwoS2P1D({ E00: 65, E0: 30000, k: 0.25, h: 0.787, delta: 1.58, tau_ref: 1.22, beta: 300, T_ref: 9.3, C1: 30, C2: 210, T: 20, nu00: 0.2, nu0: 0.45 });
    const m2 = new GeneralizedKelvinVoigt(3.0e4, [2.96e5, 1.35e5, 2.58e4, 1.16e3], [2.06e-5, 3.44e-3, 5.74e-1, 95.7], 0.3);
    const m3 = new GeneralizedMaxwell(80, [15000, 9000, 5000], [1e-4, 1e-2, 1.0], 0.4);
    expect(gap(m1.young(w), ref.lois["2s2p1d"].E)).toBeLessThan(1e-13);
    expect(gap(m1.poisson(w), ref.lois["2s2p1d"].nu)).toBeLessThan(1e-13);
    expect(gap(m2.young(w), ref.lois.kvg.E)).toBeLessThan(1e-13);
    expect(gap(m3.young(w), ref.lois.maxwell.E)).toBeLessThan(1e-13);
  });
});

describe("transformées des empreintes", () => {
  const c = loadMapCsv(csv);
  const fps = {
    rect: new UniformRect(0.9e6, 0.56, 0.4),
    circle: new UniformCircle(0.7e6, 0.15),
    debeer: new Separable(new HalfEllipse1D(0.277), new GaussianPairs1D([1.32, 0.8, 0.822], [0.14846, 0.08804, 0.02864], [0.02824, 0.01695, 0.01741])).scaledTo(370e3),
    tab: new Separable(new Tabulated1D([-0.2, -0.1, 0.0, 0.12, 0.2], [0, 1, 2, 1.5, 0]), new Box1D(0.15), 1e6),
    map: new PressureMap(c.x, c.y, c.P.map((l) => l.map((v) => v * 1e6))).scaledTo(1e5),
  };
  for (const [name, fp] of Object.entries(fps)) {
    it(name, () => {
      const k1 = Float64Array.from(ref.empreintes.k1);
      const k2 = Float64Array.from(ref.empreintes.k2);
      // Bessel J1 : approximation à ~1e-8 (disque, demi-ellipse)
      expect(gap(fp.ft(k1, k2), ref.empreintes.ft[name]!)).toBeLessThan(name === "circle" || name === "debeer" ? 1e-7 : 1e-12);
      expect(Math.abs(fp.force() / ref.empreintes.force[name]! - 1)).toBeLessThan(1e-9);
      // transformée sur grille = transformée point par point
      const g = fp.ftGrid(k1, k2);
      const p = fp.ft(Float64Array.of(k1[3]!), Float64Array.of(k2[2]!));
      const o = 2 * k1.length + 3;
      expect(Math.hypot(g.re[o]! - p.re[0]!, g.im[o]! - p.im[0]!)).toBeLessThan(1e-9 * Math.max(1, Math.hypot(p.re[0]!, p.im[0]!)));
    });
  }
});

describe("solveur grille : conformité au Python", () => {
  for (const [name, R] of Object.entries(ref.grilles)) {
    it(name, () => {
      const { structure, loading, regime } = caseFromDict(R.cas, () => csv);
      const { depths, comps, options } = gridSettings(R.cas);
      const res = solveGrid(structure, loading, regime, depths, { ...options, comps });
      expect(Array.from(res.x)).toEqual(R.x.map((v) => expect.closeTo(v, 12)));
      expect([...res.meta.nBandNodes]).toEqual(R.noeuds);
      // échelle d'une famille (u, e, s) : un champ nul par nature (εxz en surface sous charge
      // normale) ne vaut que du bruit numérique, qu'on compare à l'échelle de la famille
      const family = (c: string) => Math.max(...Object.entries(R.champs).filter(([k]) => k[0] === c[0]).flatMap(([, v]) => v.map((x) => Math.hypot(...x))));
      for (const [key, expected] of Object.entries(R.champs)) {
        const [comp, z] = key.split("@");
        const e = gap(res.get(comp!, Number(z)), expected, 1e-6 * family(comp!));
        expect(e, `${name} ${key}`).toBeLessThan(name === "harmonique" || name === "debeer" ? 1e-7 : 1e-9);
      }
    }, 60000);
  }
});

describe("solveur axisymétrique", () => {
  it("statique et harmonique", () => {
    const st = new Structure([new Layer(new Elastic(6000, 0.35), 0.15), new Layer(new Elastic(200, 0.35), 0.4), new Layer(new Elastic(50, 0.4), 1)], "halfspace");
    const a = solveAxisym(st, 0.7e6, 0.15, [0, 0.25, 0.6], [0.05, 0.15, 0.4]);
    for (const [k, v] of Object.entries(ref.axisym.statique)) expect(gap(a[k as AxisymOutput], v), k).toBeLessThan(1e-7);
    const kvg = new GeneralizedKelvinVoigt(3.0e4, [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2], [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900]);
    const st2 = new Structure([new Layer(kvg, 0.2), new Layer(new Elastic(100, 0.4), 1)], "rigid_smooth");
    const h = solveAxisym(st2, 0.7e6, 0.15, [0, 0.3], [0, 0.2], { regime: new Harmonic(5) });
    for (const [k, v] of Object.entries(ref.axisym.harmonique)) expect(gap(h[k as AxisymOutput], v), k).toBeLessThan(1e-7);
  });
});
