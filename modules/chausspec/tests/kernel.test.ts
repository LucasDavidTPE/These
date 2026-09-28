/**
 * Conformité du noyau spectral au code Python d'origine (chausspec v0.4, StiffnessKernel) :
 * mêmes λ, μ injectés, amplitudes P-SV (charges normale et tangentielle) et SH comparées à
 * chaque cote. Référence produite par tests/reference/generer/ref_noyau.py.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CArray } from "../core/carray";
import { StiffnessKernel } from "../core/kernel";
import { Elastic } from "../core/materials";
import { Layer, Structure, type Bottom, type InterfaceKind } from "../core/structure";

type Cx = [number, number][];
interface Case {
  bottom: Bottom;
  interfaces: InterfaceKind[];
  h: number[];
  lam: Cx[];
  mu: Cx[];
  depths: { z: number; side: "above" | "below"; layer: number; n: Cx[]; t: Cx[]; sh: Cx[] }[];
}
const ref = JSON.parse(readFileSync(new URL("./reference/noyau.json", import.meta.url), "utf8")) as { xi: number[]; cas: Case[] };

describe("noyau spectral : conformité au Python", () => {
  for (const c of ref.cas) {
    it(`${c.bottom}, interfaces ${c.interfaces.join("/")}`, () => {
      const st = new Structure(
        c.h.map((h) => new Layer(new Elastic(1), h)),
        c.bottom,
        c.interfaces,
      );
      const xi = Float64Array.from(ref.xi);
      const K = new StiffnessKernel(st, xi, c.lam.map(CArray.fromPairs), c.mu.map(CArray.fromPairs), true);
      // échelle : amplitude maximale en surface, pour chaque nombre d'onde
      const scale = (k: "n" | "t" | "sh") => ref.xi.map((_, m) => Math.max(...c.depths[0]![k].map((v) => Math.hypot(...v[m]!)), 1e-300));
      const scales = { n: scale("n"), t: scale("t"), sh: scale("sh") };
      let worst = 0;
      for (const d of c.depths) {
        const amp = K.atDepth(d.z, d.side);
        expect(amp.layer).toBe(d.layer);
        for (const k of ["n", "t", "sh"] as const) {
          d[k].forEach((expected, i) => {
            const got = amp[k]![i]!;
            expected.forEach((v, m) => {
              const err = Math.hypot(got.re[m]! - v[0], got.im[m]! - v[1]) / scales[k][m]!;
              worst = Math.max(worst, err);
            });
          });
        }
      }
      expect(worst).toBeLessThan(1e-9);
    });
  }
});
